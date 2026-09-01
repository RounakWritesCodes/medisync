import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db/index.js";
import { records, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import {
  hasPatientAccess,
  recordMatchesScope,
  getActiveGrant,
  getActiveGuardianLink,
  guardedPatientIds,
  grantedPatientIds,
} from "../lib/access.js";
import { auditEntry } from "../lib/audit.js";
import { s3 } from "../lib/s3.js";
import { config } from "../config.js";

/** Upload allowlist — documents and images only. */
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const VALID_RECORD_TYPES = ["prescription", "lab_result", "checkup", "surgery", "imaging", "other"];
const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes

/**
 * New uploads store the bare S3 object key in attachment_url.
 * Legacy rows may still hold a full public URL — those are returned as-is
 * (they predate presigned access).
 */
async function attachmentForView(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("http")) return stored;
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: config.s3Bucket, Key: stored }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS }
    );
  } catch (err) {
    console.error("Failed to presign attachment:", err);
    return null;
  }
}

/** Flatten any path components and unsafe characters out of a client-supplied filename. */
function safeFilename(original: string): string {
  const base = original.split(/[\\/]/).pop() || "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return `${randomBytes(8).toString("hex")}-${cleaned}`;
}

export async function recordsRoutes(app: FastifyInstance) {
  /**
   * List records. Owner sees everything; active guardians see their
   * dependent's records (scope-gated by the link); doctors see only what a
   * live, unexpired grant allows — scope is ENFORCED here on every request,
   * not just checked once at approval. Every delegated listing is audited.
   */
  app.get("/api/records", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;
    const role = request.userRole;

    // 1) Own records.
    const own = await db.select().from(records).where(eq(records.patientId, uid));

    // 2) Guardianship reads (records scope always permits record listing).
    //    NOTE: guardians are ordinary accounts (role "patient"), so this must
    //      be evaluated regardless of role.
    const guardedIds = await guardedPatientIds(uid);
    let guardianRecords: (typeof records.$inferSelect)[] = [];
    if (guardedIds.length > 0) {
      guardianRecords = await db.select().from(records).where(inArray(records.patientId, guardedIds));
      for (const pid of guardedIds) {
        await auditEntry({
          actorId: uid,
          actorRole: role,
          actionType: "record.list_viewed_by_guardian",
          targetPatientId: pid,
          details: { count: guardianRecords.filter((r) => r.patientId === pid).length },
        });
      }
    }

    // 3) Doctor/admin consent-backed grants — scope enforced per record, NOW.
    let grantedRecords: (typeof records.$inferSelect)[] = [];
    if (role === "doctor" || role === "admin") {
      const grants = await grantedPatientIds(uid);
      for (const [pid, scope] of grants) {
        const rows = await db.select().from(records).where(eq(records.patientId, pid));
        const visible = rows.filter((r) => recordMatchesScope(r, scope));
        grantedRecords.push(...visible);
        await auditEntry({
          actorId: uid,
          actorRole: role,
          actionType: "record.list_viewed_by_doctor",
          targetPatientId: pid,
          details: { count: visible.length },
        });
      }
    }

    const combined = [...own, ...guardianRecords, ...grantedRecords];
    const seen = new Set<string>();
    const unique = combined.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

    // Attach the owning patient's identity so doctors/guardians can tell
    // whose chart they are viewing, plus an `owner` flag for the UI.
    const otherIds = [...new Set(unique.filter((r) => r.patientId !== uid).map((r) => r.patientId))];
    const patientRows = otherIds.length
      ? await db.select({ id: users.id, username: users.username, email: users.email }).from(users).where(inArray(users.id, otherIds))
      : [];
    const patientMap = new Map(patientRows.map((p) => [p.id, p]));

    const withMeta = unique.map((r) => {
      if (r.patientId === uid) return { ...r, owner: true };
      const p = patientMap.get(r.patientId);
      return { ...r, owner: false, patient_name: p?.username ?? null, patient_email: p?.email ?? null };
    });

    const withAttachments = await Promise.all(
      withMeta.map(async (r) => ({ ...r, attachmentUrl: await attachmentForView(r.attachmentUrl) }))
    );
    return reply.send({ records: withAttachments });
  });

  app.get("/api/records/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [record] = await db.select().from(records).where(eq(records.id, id)).limit(1);
    if (!record) return reply.status(404).send({ error: "Record not found" });

    const uid = request.userId!;
    const isOwner = record.patientId === uid;
    if (!isOwner && !(await hasPatientAccess(uid, request.userRole, record.patientId))) {
      return reply.status(403).send({ error: "Access denied" });
    }

    if (!isOwner) {
      const guardianLink = await getActiveGuardianLink(uid, record.patientId);
      if (guardianLink) {
        // Guardian read — audited like any other delegated access.
        await auditEntry({
          actorId: uid,
          actorRole: request.userRole,
          actionType: "record.viewed_by_guardian",
          targetPatientId: record.patientId,
          recordId: record.id,
          details: { guardianLinkId: guardianLink.id },
        });
      } else {
        // Doctor/admin path: hasPatientAccess already confirmed SOME live
        // authorization (consent grant or unexpired emergency). Now enforce
        // the consent-grant's scope against THIS record — re-checked on every
        // request so expiry/revocation take effect immediately.
        const grant = await getActiveGrant(uid, record.patientId);
        const viaEmergency = !grant;
        if (grant && !recordMatchesScope(record, grant.scope)) {
          return reply.status(403).send({ error: "Access denied for this record type or date range" });
        }
        await auditEntry({
          actorId: uid,
          actorRole: request.userRole,
          actionType: viaEmergency ? "record.viewed_by_emergency" : "record.viewed_by_delegate",
          targetPatientId: record.patientId,
          recordId: record.id,
          details: grant ? { grantedScope: grant.scope } : { source: "emergency_access" },
        });
      }
    }

    return reply.send({ record: { ...record, attachmentUrl: await attachmentForView(record.attachmentUrl) } });
  });

  app.post("/api/records", { preHandler: [requireAuth] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;

    const type = typeof body.type === "string" ? body.type : "";
    if (!VALID_RECORD_TYPES.includes(type)) {
      return reply.status(400).send({ error: `Invalid record type. Allowed: ${VALID_RECORD_TYPES.join(", ")}` });
    }
    if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return reply.status(400).send({ error: "date must be an ISO date string (YYYY-MM-DD)" });
    }

    const [record] = await db
      .insert(records)
      .values({
        patientId: request.userId!,
        type,
        date: body.date,
        doctorName: (body.doctor_name as string) || null,
        hospitalName: (body.hospital_name as string) || null,
        details: body.details || {},
        attachmentUrl: null, // set exclusively via the upload endpoint
        contentType: null,
        fileSize: null,
      })
      .returning();
    return reply.status(201).send({ record });
  });

  app.delete("/api/records/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [record] = await db.select().from(records).where(eq(records.id, id)).limit(1);
    if (!record) return reply.status(404).send({ error: "Record not found" });
    if (record.patientId !== request.userId) {
      return reply.status(403).send({ error: "Access denied" });
    }

    // Remove the stored object so PHI doesn't outlive the record.
    if (record.attachmentUrl && !record.attachmentUrl.startsWith("http")) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: record.attachmentUrl }));
      } catch (err) {
        console.error("Failed to delete attachment object:", err);
      }
    }

    await db.delete(records).where(eq(records.id, id));
    await auditEntry({
      actorId: request.userId!,
      actorRole: request.userRole,
      actionType: "record.deleted",
      targetPatientId: record.patientId,
      recordId: record.id,
    });
    return reply.send({ ok: true });
  });

  app.post("/api/records/:id/upload", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [record] = await db.select().from(records).where(eq(records.id, id)).limit(1);
    if (!record) return reply.status(404).send({ error: "Record not found" });

    // Ownership check — previously missing (IDOR): any user could write files into any record.
    if (record.patientId !== request.userId) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const file = await request.file();
    if (!file) return reply.status(400).send({ error: "No file provided" });

    if (!ALLOWED_UPLOAD_TYPES.has(file.mimetype)) {
      return reply.status(415).send({
        error: `Unsupported file type. Allowed: ${[...ALLOWED_UPLOAD_TYPES].join(", ")}`,
      });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) return reply.status(400).send({ error: "Empty file" });

    const key = `records/${id}/${safeFilename(file.filename)}`;
    await s3.send(
      new (await import("@aws-sdk/client-s3")).PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: file.mimetype,
      })
    );

    // Store the object KEY; downloads go through short-lived presigned URLs.
    await db
      .update(records)
      .set({
        attachmentUrl: key,
        contentType: file.mimetype,
        fileSize: buffer.length,
        updatedAt: new Date(),
      })
      .where(eq(records.id, id));

    const attachmentUrl = await attachmentForView(key);
    await auditEntry({
      actorId: request.userId!,
      actorRole: request.userRole,
      actionType: "record.uploaded",
      targetPatientId: record.patientId,
      recordId: record.id,
      details: { contentType: file.mimetype, size: buffer.length },
    });

    return reply.send({ attachmentUrl });
  });
}

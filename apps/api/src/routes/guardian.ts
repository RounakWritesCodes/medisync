import type { FastifyInstance } from "fastify";
import { eq, or, and, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { guardianLinks, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { auditEntry } from "../lib/audit.js";

const VALID_TRIGGER_TYPES = ["minor", "advance_directive", "emergency_incapacity"] as const;
/** D6: the patient granting the link decides what the guardian can read. */
const VALID_GUARDIAN_SCOPES = ["records", "records_and_diagnoses"] as const;

export async function guardianRoutes(app: FastifyInstance) {
  app.get("/api/guardian-links", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;
    const data = await db
      .select({
        id: guardianLinks.id,
        patientId: guardianLinks.patientId,
        guardianId: guardianLinks.guardianId,
        triggerType: guardianLinks.triggerType,
        status: guardianLinks.status,
        scope: guardianLinks.scope,
        authorityDocumentRef: guardianLinks.authorityDocumentRef,
        createdAt: guardianLinks.createdAt,
        updatedAt: guardianLinks.updatedAt,
      })
      .from(guardianLinks)
      .where(or(eq(guardianLinks.patientId, uid), eq(guardianLinks.guardianId, uid)));

    // Resolve both parties properly instead of joining only one side.
    const otherIds = [...new Set(data.flatMap((r) => [r.patientId, r.guardianId]))];
    const userRows = otherIds.length
      ? await db.select({ id: users.id, username: users.username, email: users.email }).from(users).where(inArray(users.id, otherIds))
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const merged = data.map((row) => {
      const patient = userMap.get(row.patientId);
      const guardian = userMap.get(row.guardianId);
      return {
        ...row,
        patientName: patient?.username ?? null,
        patientEmail: patient?.email ?? null,
        guardianName: guardian?.username ?? null,
        guardianEmail: guardian?.email ?? null,
      };
    });

    return reply.send({ guardianLinks: merged });
  });

  app.post("/api/guardian-links", { preHandler: [requireAuth] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const guardianEmail = typeof body.guardian_email === "string" ? body.guardian_email.trim().toLowerCase() : "";
    if (!guardianEmail) {
      return reply.status(400).send({ error: "guardian_email is required" });
    }

    const triggerType = body.trigger_type as string;
    if (!VALID_TRIGGER_TYPES.includes(triggerType as (typeof VALID_TRIGGER_TYPES)[number])) {
      return reply.status(400).send({ error: `Invalid trigger_type. Allowed: ${VALID_TRIGGER_TYPES.join(", ")}` });
    }

    const scope = typeof body.scope === "string" && body.scope ? body.scope : "records";
    if (!(VALID_GUARDIAN_SCOPES as readonly string[]).includes(scope)) {
      return reply.status(400).send({ error: `Invalid scope. Allowed: ${VALID_GUARDIAN_SCOPES.join(", ")}` });
    }

    const [guardian] = await db.select().from(users).where(eq(users.email, guardianEmail)).limit(1);
    if (!guardian) return reply.status(404).send({ error: "Guardian not found" });
    if (guardian.id === request.userId) {
      return reply.status(400).send({ error: "You cannot be your own guardian" });
    }

    // One pending link per pair; one ACTIVE guardianship per patient overall.
    const existingLinks = await db
      .select({ id: guardianLinks.id, guardianId: guardianLinks.guardianId, status: guardianLinks.status })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.patientId, request.userId!),
          inArray(guardianLinks.status, ["pending_guardian", "active_shared_control"])
        )
      );
    if (existingLinks.some((l) => l.guardianId === guardian.id && l.status === "pending_guardian")) {
      return reply.status(409).send({ error: "A pending guardian link already exists for this guardian" });
    }
    if (existingLinks.length > 0) {
      // An active guardianship or another pending link exists — consent
      // authority must stay unambiguous, so block stacking links.
      return reply.status(409).send({
        error: "This account already has a guardian link pending or active. Revoke it before adding another.",
        code: "GUARDIAN_LINK_EXISTS",
      });
    }

    const [gl] = await db
      .insert(guardianLinks)
      .values({
        patientId: request.userId!,
        guardianId: guardian.id,
        triggerType,
        status: "pending_guardian",
        scope,
        authorityDocumentRef: (body.authority_document_ref as string) || null,
      })
      .returning();

    await auditEntry({
      actorId: request.userId!,
      actorRole: request.userRole,
      actionType: "guardian_link.created",
      details: { guardianLinkId: gl.id, guardianId: guardian.id },
    });

    return reply.status(201).send({ guardianLink: gl });
  });

  /**
   * Consent model: the named GUARDIAN accepts or declines the link
   * (pending_guardian -> active_shared_control | denied); both parties may
   * revoke an active link. Previously anyone involved could set any status,
   * letting a guardian self-approve access to the patient's data.
   */
  app.patch("/api/guardian-links/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status?: string };
    const uid = request.userId!;

    const VALID_STATUSES = [
      "active_shared_control",
      "denied",
      "revoked",
    ];
    if (!status || !VALID_STATUSES.includes(status)) {
      return reply.status(400).send({ error: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}` });
    }

    const [existing] = await db.select().from(guardianLinks).where(eq(guardianLinks.id, id)).limit(1);
    if (!existing) return reply.status(404).send({ error: "Guardian link not found" });

    const isPatient = existing.patientId === uid;
    const isGuardian = existing.guardianId === uid;
    if (!isPatient && !isGuardian) {
      return reply.status(403).send({ error: "Access denied" });
    }

    let actionType: string;
    if ((status === "active_shared_control" || status === "denied") && existing.status === "pending_guardian") {
      // Consent belongs to the guardian alone.
      if (!isGuardian) {
        return reply.status(403).send({ error: "Only the guardian can accept or decline this link" });
      }
      if (status === "active_shared_control") {
        // Belt-and-braces with the DB partial unique index: consent authority
        // must be unambiguous — never two active guardians.
        const others = await db
          .select({ id: guardianLinks.id })
          .from(guardianLinks)
          .where(
            and(
              eq(guardianLinks.patientId, existing.patientId),
              eq(guardianLinks.status, "active_shared_control")
            )
          );
        if (others.length > 0) {
          return reply.status(409).send({
            error: "Patient already has an active guardian. Revoke it first.",
            code: "ACTIVE_GUARDIAN_EXISTS",
          });
        }
      }
      actionType = status === "denied" ? "guardian_link.declined" : "guardian_link.activated";
    } else if (status === "revoked" && existing.status !== "revoked") {
      actionType = "guardian_link.revoked";
    } else {
      return reply.status(409).send({ error: `Cannot change status from '${existing.status}' to '${status}'` });
    }

    const [updated] = await db
      .update(guardianLinks)
      .set({ status, updatedAt: new Date() })
      .where(eq(guardianLinks.id, id))
      .returning();

    await auditEntry({
      actorId: uid,
      actorRole: request.userRole,
      actionType,
      targetPatientId: existing.patientId,
      details: { guardianLinkId: id },
    });

    return reply.send({ guardianLink: updated });
  });
}

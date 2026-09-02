import type { FastifyInstance } from "fastify";
import { eq, or, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { emergencyAccess, users } from "../db/schema.js";
import { requireAuth, requireVerifiedDoctor } from "../middleware/auth.js";
import { auditEntry } from "../lib/audit.js";

const VALID_REASON_CODES = [
  "cardiac_arrest",
  "stroke",
  "trauma",
  "unconscious",
  "severe_bleeding",
  "respiratory_failure",
  "sepsis",
  "other",
] as const;

const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function emergencyAccessRoutes(app: FastifyInstance) {
  /** List emergency access where user is doctor or patient. */
  app.get("/api/emergency-access", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;
    const rows = await db
      .select()
      .from(emergencyAccess)
      .where(or(eq(emergencyAccess.doctorId, uid), eq(emergencyAccess.patientId, uid)));

    // Resolve names for doctor and patient
    const allIds = [...new Set(rows.flatMap(r => [r.doctorId, r.patientId]))];
    const userRows = allIds.length
      ? await db.select({ id: users.id, username: users.username, email: users.email }).from(users).where(inArray(users.id, allIds))
      : [];
    const userMap = new Map(userRows.map(u => [u.id, u]));

    const data = rows.map(r => ({
      ...r,
      doctor_name: userMap.get(r.doctorId)?.username ?? null,
      doctor_email: userMap.get(r.doctorId)?.email ?? null,
      patient_name: userMap.get(r.patientId)?.username ?? null,
      patient_email: userMap.get(r.patientId)?.email ?? null,
    }));

    return reply.send({ emergencyAccess: data });
  });

  /**
   * Patient-created emergency request (status: pending).
   * Also supports the legacy doctor-invoke path (status: active) for backward
   * compatibility — doctors who POST get immediate active status.
   */
  app.post("/api/emergency-access", { preHandler: [requireAuth] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const uid = request.userId!;
    const userRole = request.userRole;

    const doctorEmail = typeof body.doctor_email === "string" ? body.doctor_email.trim().toLowerCase() : "";
    const patientEmail = typeof body.patient_email === "string" ? body.patient_email.trim().toLowerCase() : "";

    const reasonCode = body.reason_code as string;
    if (!VALID_REASON_CODES.includes(reasonCode as (typeof VALID_REASON_CODES)[number])) {
      return reply.status(400).send({ error: `Invalid reason_code. Allowed: ${VALID_REASON_CODES.join(", ")}` });
    }

    const reasonText = typeof body.reason_text === "string" ? body.reason_text.trim() : "";
    if (!reasonText) {
      return reply.status(400).send({ error: "reason_text is required" });
    }
    if (reasonText.length > 1000) {
      return reply.status(400).send({ error: "reason_text must be at most 1000 characters" });
    }

    // Determine doctor and patient based on who is creating
    let doctorId: string;
    let patientId: string;
    let initialStatus: string;

    if (userRole === "doctor") {
      // Doctor invoking emergency access — immediate active (legacy path)
      if (!patientEmail) {
        return reply.status(400).send({ error: "patient_email is required" });
      }
      const [patient] = await db.select().from(users).where(eq(users.email, patientEmail)).limit(1);
      if (!patient) return reply.status(404).send({ error: "Patient not found" });
      if (patient.id === uid) {
        return reply.status(400).send({ error: "Cannot grant emergency access to yourself" });
      }
      doctorId = uid;
      patientId = patient.id;
      initialStatus = "active";
    } else {
      // Patient requesting emergency access from a doctor — pending
      if (!doctorEmail) {
        return reply.status(400).send({ error: "doctor_email is required" });
      }
      const [doctor] = await db.select().from(users).where(eq(users.email, doctorEmail)).limit(1);
      if (!doctor) return reply.status(404).send({ error: "Doctor not found" });
      if (doctor.id === uid) {
        return reply.status(400).send({ error: "Cannot request emergency access from yourself" });
      }
      doctorId = doctor.id;
      patientId = uid;
      initialStatus = "pending";
    }

    let expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);
    if (body.expires_at !== undefined && body.expires_at !== null) {
      const parsed = new Date(body.expires_at as string);
      if (Number.isNaN(parsed.getTime())) {
        return reply.status(400).send({ error: "expires_at must be a valid date" });
      }
      expiresAt = parsed;
    }
    if (expiresAt.getTime() <= Date.now()) {
      return reply.status(400).send({ error: "expires_at must be in the future" });
    }
    if (expiresAt.getTime() > Date.now() + MAX_TTL_MS) {
      return reply.status(400).send({ error: "expires_at cannot be more than 7 days out" });
    }

    const [ea] = await db
      .insert(emergencyAccess)
      .values({
        doctorId,
        patientId,
        reasonCode,
        reasonText,
        status: initialStatus,
        expiresAt,
      })
      .returning();

    await auditEntry({
      actorId: uid,
      actorRole: userRole,
      actionType: initialStatus === "active" ? "emergency_access.granted" : "emergency_access.requested",
      targetPatientId: patientId,
      details: { emergencyAccessId: ea.id, reasonCode, expiresAt: ea.expiresAt },
    });

    return reply.status(201).send({ emergencyAccess: ea });
  });

  /**
   * PATCH /api/emergency-access/:id
   * - Doctor: approve (pending → active) or deny (pending → denied)
   * - Patient or Doctor: revoke (active → revoked)
   */
  app.patch("/api/emergency-access/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status?: string };
    const uid = request.userId!;
    const userRole = request.userRole;

    const [existing] = await db.select().from(emergencyAccess).where(eq(emergencyAccess.id, id)).limit(1);
    if (!existing) return reply.status(404).send({ error: "Emergency access not found" });

    if (existing.doctorId !== uid && existing.patientId !== uid) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const isDoctor = existing.doctorId === uid;
    const isPatient = existing.patientId === uid;

    if (status === "active" && isDoctor && existing.status === "pending") {
      // Doctor approving a pending request
      let expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);
      const [updated] = await db
        .update(emergencyAccess)
        .set({ status: "active", grantedAt: new Date(), expiresAt })
        .where(eq(emergencyAccess.id, id))
        .returning();

      await auditEntry({
        actorId: uid,
        actorRole: userRole,
        actionType: "emergency_access.approved",
        targetPatientId: existing.patientId,
        details: { emergencyAccessId: id, expiresAt },
      });

      return reply.send({ emergencyAccess: updated });
    }

    if (status === "denied" && isDoctor && existing.status === "pending") {
      // Doctor denying a pending request
      const [updated] = await db
        .update(emergencyAccess)
        .set({ status: "denied" })
        .where(eq(emergencyAccess.id, id))
        .returning();

      await auditEntry({
        actorId: uid,
        actorRole: userRole,
        actionType: "emergency_access.denied",
        targetPatientId: existing.patientId,
        details: { emergencyAccessId: id },
      });

      return reply.send({ emergencyAccess: updated });
    }

    if (status === "revoked" && (isDoctor || isPatient)) {
      // Revoke (idempotent)
      if (existing.status === "revoked") {
        return reply.send({ emergencyAccess: existing });
      }
      const [updated] = await db
        .update(emergencyAccess)
        .set({ status: "revoked" })
        .where(eq(emergencyAccess.id, id))
        .returning();

      await auditEntry({
        actorId: uid,
        actorRole: userRole,
        actionType: "emergency_access.revoked",
        targetPatientId: existing.patientId,
        details: { emergencyAccessId: id, revokedByDoctor: isDoctor },
      });

      return reply.send({ emergencyAccess: updated });
    }

    return reply.status(400).send({ error: "Invalid status transition" });
  });

  /**
   * DELETE /api/emergency-access/:id
   * Remove an old emergency access entry from history. Only non-active requests
   * can be deleted (pending, denied, revoked, expired).
   */
  app.delete("/api/emergency-access/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = request.userId!;

    const [existing] = await db.select().from(emergencyAccess).where(eq(emergencyAccess.id, id)).limit(1);
    if (!existing) return reply.status(404).send({ error: "Emergency access not found" });

    // Only the patient or doctor involved can delete
    if (existing.patientId !== uid && existing.doctorId !== uid) {
      return reply.status(403).send({ error: "Access denied" });
    }

    // Only allow deleting non-active requests
    if (existing.status === "active") {
      return reply.status(400).send({ error: "Cannot delete an active emergency access — revoke it first" });
    }

    await db.delete(emergencyAccess).where(eq(emergencyAccess.id, id));

    await auditEntry({
      actorId: uid,
      actorRole: request.userRole,
      actionType: "emergency_access.deleted",
      targetPatientId: existing.patientId,
      details: { emergencyAccessId: id, previousStatus: existing.status },
    });

    return reply.send({ ok: true });
  });
}

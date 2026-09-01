import type { FastifyInstance } from "fastify";
import { eq, or } from "drizzle-orm";
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
const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000; // break-glass grants are short-lived by design

export async function emergencyAccessRoutes(app: FastifyInstance) {
  app.get("/api/emergency-access", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;
    const data = await db
      .select()
      .from(emergencyAccess)
      .where(or(eq(emergencyAccess.doctorId, uid), eq(emergencyAccess.patientId, uid)));
    return reply.send({ emergencyAccess: data });
  });

  /**
   * Doctor-only break-glass grant. Previously ANY authenticated user could
   * declare emergency access over any account — now restricted to VERIFIED
   * doctors (D1), with validated inputs and a bounded expiry.
   */
  app.post(
    "/api/emergency-access",
    { preHandler: [requireAuth, requireVerifiedDoctor()] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
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

      const [patient] = await db.select().from(users).where(eq(users.email, patientEmail)).limit(1);
      if (!patient) return reply.status(404).send({ error: "Patient not found" });
      if (patient.id === request.userId) {
        return reply.status(400).send({ error: "Cannot grant emergency access to yourself" });
      }

      const [ea] = await db
        .insert(emergencyAccess)
        .values({
          doctorId: request.userId!,
          patientId: patient.id,
          reasonCode,
          reasonText,
          status: "active",
          expiresAt,
        })
        .returning();

      await auditEntry({
        actorId: request.userId!,
        actorRole: request.userRole,
        actionType: "emergency_access.granted",
        targetPatientId: patient.id,
        details: { emergencyAccessId: ea.id, reasonCode, expiresAt: ea.expiresAt },
      });

      return reply.status(201).send({ emergencyAccess: ea });
    }
  );

  /**
   * Revocation only — grants activate on creation and can be revoked by the
   * patient or the granting doctor. Reactivation is intentionally not allowed.
   */
  app.patch("/api/emergency-access/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status?: string };
    const uid = request.userId!;

    if (status !== "revoked") {
      return reply.status(400).send({ error: "Only 'revoked' is accepted here; create a new grant instead" });
    }

    const [existing] = await db.select().from(emergencyAccess).where(eq(emergencyAccess.id, id)).limit(1);
    if (!existing) return reply.status(404).send({ error: "Emergency access not found" });

    if (existing.doctorId !== uid && existing.patientId !== uid) {
      return reply.status(403).send({ error: "Access denied" });
    }
    if (existing.status === "revoked") {
      return reply.send({ emergencyAccess: existing }); // idempotent
    }

    const [updated] = await db
      .update(emergencyAccess)
      .set({ status: "revoked" })
      .where(eq(emergencyAccess.id, id))
      .returning();

    await auditEntry({
      actorId: uid,
      actorRole: request.userRole,
      actionType: "emergency_access.revoked",
      targetPatientId: existing.patientId,
      details: { emergencyAccessId: id, revokedByDoctor: existing.doctorId === uid },
    });

    return reply.send({ emergencyAccess: updated });
  });
}

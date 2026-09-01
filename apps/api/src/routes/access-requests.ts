import type { FastifyInstance } from "fastify";
import { eq, or, and, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessRequests, users, guardianLinks } from "../db/schema.js";
import { requireAuth, requireVerifiedDoctor } from "../middleware/auth.js";
import { auditEntry } from "../lib/audit.js";
import {
  resolveConsentModel,
  getActiveGuardiansOf,
  type RecordScope,
} from "../lib/access.js";

/** Grant duration bounds (D2): default 30 days, hard cap 2 years. */
const DEFAULT_GRANT_DAYS = 30;
const MAX_GRANT_DAYS = 730;

const VALID_RECORD_TYPES = ["prescription", "lab_result", "checkup", "surgery", "imaging", "other"];

/** Light structural validation for the scope JSON blob. */
function validateScope(scope: unknown): { ok: true; value: RecordScope } | { ok: false; error: string } {
  if (scope === undefined || scope === null) return { ok: true, value: {} };
  if (typeof scope !== "object" || Array.isArray(scope)) {
    return { ok: false, error: "scope must be an object" };
  }
  const s = scope as Record<string, unknown>;

  if (s.categories !== undefined && s.categories !== null) {
    if (
      !Array.isArray(s.categories) ||
      s.categories.some((c) => typeof c !== "string") ||
      s.categories.length > 50
    ) {
      return { ok: false, error: "scope.categories must be an array of strings (max 50)" };
    }
    const invalid = s.categories.filter((c) => !VALID_RECORD_TYPES.includes(String(c)));
    if (invalid.length > 0) {
      return { ok: false, error: `scope.categories contains unknown record types: ${invalid.join(", ")}` };
    }
  }
  for (const key of ["dateFrom", "dateTo"] as const) {
    const v = s[key];
    if (v !== undefined && v !== null && (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))) {
      return { ok: false, error: `scope.${key} must be an ISO date string (YYYY-MM-DD)` };
    }
  }
  if (s.dateFrom && s.dateTo && String(s.dateFrom) > String(s.dateTo)) {
    return { ok: false, error: "scope.dateFrom must not be after scope.dateTo" };
  }

  const value: RecordScope = {};
  if (Array.isArray(s.categories)) value.categories = s.categories.map(String);
  if (typeof s.dateFrom === "string") value.dateFrom = s.dateFrom;
  if (typeof s.dateTo === "string") value.dateTo = s.dateTo;
  return { ok: true, value };
}

/**
 * Is the proposed granted scope a subset of what was requested?
 * The approver may narrow the grant (D6) but never widen it.
 */
function isSubsetOf(granted: RecordScope, requested: RecordScope): boolean {
  if (granted.categories) {
    if (!requested.categories) return true; // requested full -> any subset OK
    if (!granted.categories.every((c) => requested.categories!.includes(c))) return false;
  }
  if (granted.dateFrom && (!requested.dateFrom || granted.dateFrom < requested.dateFrom)) return false;
  if (granted.dateTo && (!requested.dateTo || granted.dateTo > requested.dateTo)) return false;
  return true;
}

export async function accessRequestsRoutes(app: FastifyInstance) {
  /**
   * Listing is visible to: the doctor who filed it, the patient it targets,
   * AND active guardians of that patient (they act as consent authority).
   */
  app.get("/api/access-requests", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;

    // Patients also see requests filed against patients they actively guard.
    const guarded = await db
      .select({ patientId: guardianLinks.patientId })
      .from(guardianLinks)
      .where(and(eq(guardianLinks.guardianId, uid), eq(guardianLinks.status, "active_shared_control")));
    const visiblePatientIds = [uid, ...guarded.map((g) => g.patientId)];

    const rows = await db
      .select({
        id: accessRequests.id,
        doctorId: accessRequests.doctorId,
        patientId: accessRequests.patientId,
        reason: accessRequests.reason,
        scope: accessRequests.scope,
        grantedScope: accessRequests.grantedScope,
        status: accessRequests.status,
        consentModel: accessRequests.consentModel,
        patientApprovedAt: accessRequests.patientApprovedAt,
        guardianApprovedAt: accessRequests.guardianApprovedAt,
        respondedBy: accessRequests.respondedBy,
        respondedAt: accessRequests.respondedAt,
        expiresAt: accessRequests.expiresAt,
        createdAt: accessRequests.createdAt,
        updatedAt: accessRequests.updatedAt,
        doctorName: users.username,
        doctorEmail: users.email,
      })
      .from(accessRequests)
      .innerJoin(users, eq(accessRequests.doctorId, users.id))
      .where(
        or(
          eq(accessRequests.doctorId, uid),
          inArray(accessRequests.patientId, visiblePatientIds)
        )
      );

    // Resolve each row's actual patient identity.
    const patientIds = [...new Set(rows.map((r) => r.patientId))];
    const patientRows = patientIds.length
      ? await db
          .select({ id: users.id, username: users.username, email: users.email })
          .from(users)
          .where(inArray(users.id, patientIds))
      : [];
    const patientMap = new Map(patientRows.map((p) => [p.id, p]));

    const now = Date.now();
    const merged = rows.map((row) => {
      const patient = patientMap.get(row.patientId);
      const expired = row.expiresAt ? new Date(row.expiresAt).getTime() <= now : false;
      return {
        ...row,
        patientName: patient?.username ?? null,
        patientEmail: patient?.email ?? null,
        // Expired grants are surfaced as expired even though status stays approved.
        effectivelyExpired: Boolean(row.expiresAt) && expired,
      };
    });

    return reply.send({ accessRequests: merged });
  });

  /**
   * Doctor-only (and only VERIFIED doctors — signup alone grants no clinical
   * authority). Files a pending request; no access is granted by requesting.
   */
  app.post(
    "/api/access-requests",
    { preHandler: [requireAuth, requireVerifiedDoctor()] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const patientEmail = typeof body.patient_email === "string" ? body.patient_email.trim().toLowerCase() : "";
      if (!patientEmail) {
        return reply.status(400).send({ error: "patient_email is required" });
      }

      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) {
        return reply.status(400).send({ error: "reason is required" });
      }
      if (reason.length > 1000) {
        return reply.status(400).send({ error: "reason must be at most 1000 characters" });
      }

      const scopeResult = validateScope(body.scope);
      if (!scopeResult.ok) {
        return reply.status(400).send({ error: scopeResult.error });
      }

      const [patient] = await db.select().from(users).where(eq(users.email, patientEmail)).limit(1);
      if (!patient) return reply.status(404).send({ error: "Patient not found" });
      if (patient.id === request.userId) {
        return reply.status(400).send({ error: "Cannot request access to your own account" });
      }

      // One live request per doctor/patient pair — prevents spam harassment.
      const [existing] = await db
        .select({ id: accessRequests.id })
        .from(accessRequests)
        .where(
          and(
            eq(accessRequests.doctorId, request.userId!),
            eq(accessRequests.patientId, patient.id),
            eq(accessRequests.status, "pending")
          )
        )
        .limit(1);
      if (existing) {
        return reply.status(409).send({ error: "A pending access request already exists for this patient" });
      }

      const [ar] = await db
        .insert(accessRequests)
        .values({
          doctorId: request.userId!,
          patientId: patient.id,
          reason,
          scope: scopeResult.value,
          status: "pending",
        })
        .returning();

      await auditEntry({
        actorId: request.userId!,
        actorRole: request.userRole,
        actionType: "access_request.created",
        targetPatientId: patient.id,
        details: { accessRequestId: ar.id, reason, scope: scopeResult.value },
      });

      return reply.status(201).send({ accessRequest: ar });
    }
  );

  /**
   * Decision endpoint. Consent authority is resolved LIVE at decision time:
   *   - no active guardian                          -> patient decides alone
   *   - guardian trigger minor/emergency_incapacity -> guardian ONLY
   *   - guardian trigger advance_directive          -> BOTH must approve ("dual")
   * Denial by any authorized party denies immediately. Revocation available to
   * requester, patient, and authorized guardians at any time.
   * On approval the approver sets the grant duration (default 30d, max 730d)
   * and may narrow (never widen) the scope.
   */
  app.patch("/api/access-requests/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; duration_days?: number | string; scope?: unknown };
    const uid = request.userId!;
    const role = request.userRole!;

    const [existing] = await db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
    if (!existing) return reply.status(404).send({ error: "Access request not found" });

    const isPatient = existing.patientId === uid;
    const isDoctor = existing.doctorId === uid;

    // Who are this patient's active guardians right now?
    const guardians = await getActiveGuardiansOf(existing.patientId);
    const activeGuardianLink = guardians[0] ?? null;
    const isGuardian = activeGuardianLink?.guardianId === uid;
    if (!isPatient && !isDoctor && !isGuardian) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const consentModel = await resolveConsentModel(existing.patientId);

    const status = body.status;
    if (!status || !["approved", "denied", "revoked"].includes(status)) {
      return reply.status(400).send({ error: "status must be one of: approved, denied, revoked" });
    }

    const now = new Date();
    let actionType: string;
    let updateValues: Partial<typeof accessRequests.$inferInsert> = { updatedAt: now };

    if (status === "revoked") {
      if (!["pending", "partially_approved", "approved"].includes(existing.status)) {
        return reply.status(409).send({
          error: `Cannot change status from '${existing.status}' to 'revoked'`,
        });
      }
      actionType = "access_request.revoked";
      updateValues.status = "revoked";
      updateValues.respondedBy = uid;
      updateValues.respondedAt = now;
    } else if (existing.status === "approved" || existing.status === "denied" || existing.status === "revoked") {
      return reply.status(409).send({ error: `Cannot change status from '${existing.status}' to '${status}'` });
    } else if (consentModel === "guardian" && !isGuardian) {
      // A minor / incapacitated patient cannot consent — the guardian decides.
      return reply.status(403).send({
        error: `A guardian manages this account (${activeGuardianLink?.triggerType}). Only the guardian can approve or deny this request.`,
        code: "GUARDIAN_CONSENT_REQUIRED",
      });
    } else if (consentModel === "patient" && !isPatient) {
      // No guardianship on file: the patient always holds consent authority.
      return reply.status(403).send({ error: "Only the patient can approve or deny access requests" });
    } else if (consentModel === "dual" && !isPatient && !isGuardian) {
      return reply.status(403).send({ error: "Only the patient or their guardian can act on this request" });
    } else if (status === "denied") {
      actionType = "access_request.denied";
      updateValues.status = "denied";
      updateValues.consentModel = consentModel;
      updateValues.respondedBy = uid;
      updateValues.respondedAt = now;
    } else {
      // --- Approval path ---
      let expiresAt: Date;
      if (body.duration_days !== undefined && body.duration_days !== null && body.duration_days !== "") {
        const days = Number(body.duration_days);
        if (!Number.isInteger(days) || days < 1 || days > MAX_GRANT_DAYS) {
          return reply.status(400).send({ error: `duration_days must be an integer between 1 and ${MAX_GRANT_DAYS}` });
        }
        expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      } else {
        expiresAt = new Date(now.getTime() + DEFAULT_GRANT_DAYS * 24 * 60 * 60 * 1000);
      }

      // Optional narrowing of the requested scope (never widening).
      let grantedScope = existing.scope ?? {};
      if (body.scope !== undefined) {
        const narrowedResult = validateScope(body.scope);
        if (!narrowedResult.ok) return reply.status(400).send({ error: narrowedResult.error });
        if (!isSubsetOf(narrowedResult.value, (existing.scope as RecordScope) ?? {})) {
          return reply.status(400).send({ error: "Granted scope cannot exceed the requested scope" });
        }
        grantedScope = narrowedResult.value;
      }

      if (consentModel === "dual") {
        // Both parties must approve before access activates.
        const patientOk = existing.patientApprovedAt !== null || isPatient;
        const guardianOk = existing.guardianApprovedAt !== null || isGuardian;
        if (!(patientOk && guardianOk)) {
          const [partial] = await db
            .update(accessRequests)
            .set({
              status: "partially_approved",
              consentModel,
              ...(isPatient ? { patientApprovedAt: now } : {}),
              ...(isGuardian ? { guardianApprovedAt: now } : {}),
              respondedBy: uid,
              respondedAt: now,
              updatedAt: now,
            })
            .where(eq(accessRequests.id, id))
            .returning();

          await auditEntry({
            actorId: uid,
            actorRole: role,
            actionType: "access_request.partially_approved",
            targetPatientId: existing.patientId,
            details: { accessRequestId: id, awaiting: isPatient ? "guardian" : "patient" },
          });
          return reply.send({ accessRequest: partial, awaitingSecondConsent: true });
        }
      }

      actionType = "access_request.approved";
      updateValues.status = "approved";
      updateValues.consentModel = consentModel;
      updateValues.expiresAt = expiresAt;
      updateValues.grantedScope = grantedScope;
      updateValues.respondedBy = uid;
      updateValues.respondedAt = now;
      if (isPatient) updateValues.patientApprovedAt = now;
      if (isGuardian) updateValues.guardianApprovedAt = now;
    }

    const [updated] = await db.update(accessRequests).set(updateValues).where(eq(accessRequests.id, id)).returning();

    await auditEntry({
      actorId: uid,
      actorRole: role,
      actionType,
      targetPatientId: existing.patientId,
      details: {
        accessRequestId: id,
        decidedAsGuardian: isGuardian && !isPatient,
        consentModel,
        ...(actionType === "access_request.approved"
          ? {
              durationDays: Math.round((updateValues.expiresAt!.getTime() - now.getTime()) / 86400000),
              expiresAt: updateValues.expiresAt,
              grantedScope: updateValues.grantedScope,
            }
          : {}),
      },
    });

    return reply.send({ accessRequest: updated });
  });
}

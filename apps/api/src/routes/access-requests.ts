import type { FastifyInstance } from "fastify";
import { eq, or, and, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessRequests, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { auditEntry } from "../lib/audit.js";
import { type RecordScope } from "../lib/access.js";

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
   * Listing is visible to: the doctor who is invited, and the patient who
   * created the request.
   */
  app.get("/api/access-requests", { preHandler: [requireAuth] }, async (request, reply) => {
    const uid = request.userId!;

    const rows = await db
      .select({
        id: accessRequests.id,
        doctorId: accessRequests.doctorId,
        patientId: accessRequests.patientId,
        reason: accessRequests.reason,
        scope: accessRequests.scope,
        grantedScope: accessRequests.grantedScope,
        status: accessRequests.status,
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
          eq(accessRequests.patientId, uid)
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
   * Patient-only access requests. A patient invites a doctor to view their
   * medical records. The doctor receives the request and can accept or decline.
   */
  app.post(
    "/api/access-requests",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const role = request.userRole!;
      const uid = request.userId!;

      if (role !== "patient") {
        return reply.status(403).send({ error: "Only patients can create access requests" });
      }

      const doctorEmail = typeof body.doctor_email === "string" ? body.doctor_email.trim().toLowerCase() : "";
      if (!doctorEmail) {
        return reply.status(400).send({ error: "doctor_email is required" });
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

      const [doctor] = await db.select().from(users).where(eq(users.email, doctorEmail)).limit(1);
      if (!doctor) return reply.status(404).send({ error: "Doctor not found" });
      if (doctor.id === uid) {
        return reply.status(400).send({ error: "Cannot request access to your own account" });
      }
      if (doctor.role !== "doctor" && doctor.role !== "admin") {
        return reply.status(400).send({ error: "The email provided does not belong to a doctor" });
      }

      // One live request per doctor/patient pair — prevents spam harassment.
      const [existing] = await db
        .select({ id: accessRequests.id })
        .from(accessRequests)
        .where(
          and(
            eq(accessRequests.doctorId, doctor.id),
            eq(accessRequests.patientId, uid),
            eq(accessRequests.status, "pending")
          )
        )
        .limit(1);
      if (existing) {
        return reply.status(409).send({ error: "A pending access request already exists for this doctor" });
      }

      // Validate profile_ids — must be an array of strings (profile UUIDs) or empty
      const profileIds = Array.isArray(body.profile_ids)
        ? body.profile_ids.filter((p: unknown) => typeof p === "string")
        : [];

      const [ar] = await db
        .insert(accessRequests)
        .values({
          doctorId: doctor.id,
          patientId: uid,
          reason,
          scope: scopeResult.value,
          profileIds,
          status: "pending",
        })
        .returning();

      await auditEntry({
        actorId: uid,
        actorRole: role,
        actionType: "access_request.created",
        targetPatientId: uid,
        details: { accessRequestId: ar.id, reason, scope: scopeResult.value },
      });

      return reply.status(201).send({ accessRequest: ar });
    }
  );

  /**
   * Decision endpoint:
   *  - Only the invited doctor can approve or deny.
   *  - The patient who created the request (or an active guardian) can revoke.
   * On approval the doctor sets the grant duration (default 30d, max 730d)
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

    if (!isPatient && !isDoctor) {
      return reply.status(403).send({ error: "Access denied" });
    }

    const status = body.status;
    if (!status || !["approved", "denied", "revoked"].includes(status)) {
      return reply.status(400).send({ error: "status must be one of: approved, denied, revoked" });
    }

    const now = new Date();
    let actionType: string;
    let updateValues: Partial<typeof accessRequests.$inferInsert> = { updatedAt: now };

    if (status === "revoked") {
      // Patient can revoke their own request. Doctor can revoke an approved grant.
      if (!isPatient && !isDoctor) {
        return reply.status(403).send({ error: "Only the patient or the doctor can revoke" });
      }
      if (!["pending", "approved"].includes(existing.status)) {
        return reply.status(409).send({ error: `Cannot revoke from status '${existing.status}'` });
      }
      actionType = "access_request.revoked";
      updateValues.status = "revoked";
      updateValues.respondedBy = uid;
      updateValues.respondedAt = now;
    } else if (existing.status === "approved" || existing.status === "denied" || existing.status === "revoked") {
      return reply.status(409).send({ error: `Cannot change status from '${existing.status}' to '${status}'` });
    } else if (status === "denied") {
      // Only the invited doctor can deny.
      if (!isDoctor) {
        return reply.status(403).send({ error: "Only the invited doctor can approve or deny this request" });
      }
      actionType = "access_request.denied";
      updateValues.status = "denied";
      updateValues.respondedBy = uid;
      updateValues.respondedAt = now;
    } else {
      // --- Approval path: only the invited doctor ---
      if (!isDoctor) {
        return reply.status(403).send({ error: "Only the invited doctor can approve this request" });
      }

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

      actionType = "access_request.approved";
      updateValues.status = "approved";
      updateValues.expiresAt = expiresAt;
      updateValues.grantedScope = grantedScope;
      updateValues.respondedBy = uid;
      updateValues.respondedAt = now;
    }

    const [updated] = await db.update(accessRequests).set(updateValues).where(eq(accessRequests.id, id)).returning();

    await auditEntry({
      actorId: uid,
      actorRole: role,
      actionType,
      targetPatientId: existing.patientId,
      details: {
        accessRequestId: id,
        decidedAs: isDoctor ? "doctor" : "patient",
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

  /**
   * DELETE /api/access-requests/:id
   * Remove an old access request from history. Only the patient or doctor
   * involved can delete, and only non-pending requests (denied, revoked, expired).
   */
  app.delete("/api/access-requests/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = request.userId!;

    const [existing] = await db.select().from(accessRequests).where(eq(accessRequests.id, id)).limit(1);
    if (!existing) return reply.status(404).send({ error: "Access request not found" });

    // Only the patient or doctor involved can delete
    if (existing.patientId !== uid && existing.doctorId !== uid) {
      return reply.status(403).send({ error: "Access denied" });
    }

    // Only allow deleting non-pending requests
    if (existing.status === "pending") {
      return reply.status(400).send({ error: "Cannot delete a pending request — deny or revoke it instead" });
    }

    await db.delete(accessRequests).where(eq(accessRequests.id, id));

    await auditEntry({
      actorId: uid,
      actorRole: request.userRole,
      actionType: "access_request.deleted",
      targetPatientId: existing.patientId,
      details: { accessRequestId: id, previousStatus: existing.status },
    });

    return reply.send({ ok: true });
  });
}

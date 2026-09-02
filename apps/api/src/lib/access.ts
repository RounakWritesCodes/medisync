import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessRequests, emergencyAccess, guardianLinks } from "../db/schema.js";

/**
 * Central authorization matrix for patient-owned data.
 *
 * A principal may access a patient's medical data when ANY of these hold:
 *   1. They are the patient (owner).
 *   2. They are a guardian with an ACTIVE guardian link to the patient
 *      (scope-gated: "records" vs "records_and_diagnoses").
 *   3. They are a doctor/admin with an APPROVED access request that has NOT
 *      expired (expiry checked against wall-clock time on EVERY call).
 *   4. They are a doctor/admin with an ACTIVE, unexpired emergency grant.
 *
 * Nothing here is cached — every call hits current DB state, so revocation,
 * denial and expiry take effect immediately on the read path.
 */

export interface RecordScope {
  categories?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export type ConsentModel = "patient" | "guardian" | "dual";

/** Normalized scope shape; `{}` means full history. */
function normalizeScope(raw: unknown): RecordScope {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const s = raw as Record<string, unknown>;
  const out: RecordScope = {};
  if (Array.isArray(s.categories)) out.categories = s.categories.map(String);
  if (typeof s.dateFrom === "string") out.dateFrom = s.dateFrom;
  if (typeof s.dateTo === "string") out.dateTo = s.dateTo;
  return out;
}

/**
 * The doctor's currently-live consent-backed grant for a patient.
 * Returns null unless an approved request exists whose expiresAt is in the
 * future AT THIS MOMENT. Expired grants never surface here.
 */
export async function getActiveGrant(
  doctorId: string,
  patientId: string
): Promise<{ scope: RecordScope; expiresAt: Date; profileIds: string[] } | null> {
  const [grant] = await db
    .select({ grantedScope: accessRequests.grantedScope, expiresAt: accessRequests.expiresAt, profileIds: accessRequests.profileIds })
    .from(accessRequests)
    .where(
      and(
        eq(accessRequests.doctorId, doctorId),
        eq(accessRequests.patientId, patientId),
        eq(accessRequests.status, "approved"),
        gt(accessRequests.expiresAt, new Date())
      )
    )
    .orderBy(sql`${accessRequests.expiresAt} DESC`)
    .limit(1);

  if (!grant) return null;
  // Grants approved before scoped-grant columns existed fall back to requested scope.
  const pids = Array.isArray(grant.profileIds) ? (grant.profileIds as string[]) : [];
  return { scope: normalizeScope(grant.grantedScope ?? {}), expiresAt: grant.expiresAt!, profileIds: pids };
}

/** Active guardianship link between a specific guardian and patient, if any. */
export async function getActiveGuardianLink(guardianId: string, patientId: string) {
  const [link] = await db
    .select()
    .from(guardianLinks)
    .where(
      and(
        eq(guardianLinks.guardianId, guardianId),
        eq(guardianLinks.patientId, patientId),
        eq(guardianLinks.status, "active_shared_control")
      )
    )
    .limit(1);
  return link ?? null;
}

/** All currently-active guardians of a patient. */
export async function getActiveGuardiansOf(patientId: string) {
  return db
    .select()
    .from(guardianLinks)
    .where(
      and(eq(guardianLinks.patientId, patientId), eq(guardianLinks.status, "active_shared_control"))
    );
}

/**
 * Who may approve/deny a doctor's access request for this patient (D4):
 *  - no active guardian            -> "patient"
 *  - guardian trigger minor /
 *    emergency_incapacity          -> "guardian" only (patient cannot consent)
 *  - guardian trigger advance_directive -> "dual": BOTH must approve
 */
export async function resolveConsentModel(patientId: string): Promise<ConsentModel> {
  const guardians = await getActiveGuardiansOf(patientId);
  if (guardians.length === 0) return "patient";
  const t = guardians[0].triggerType;
  if (t === "minor" || t === "emergency_incapacity") return "guardian";
  return "dual";
}

/** Does one medical record satisfy a granted scope? Empty scope = full history. */
export function recordMatchesScope(
  record: { type: string; date: string },
  scope: RecordScope | null
): boolean {
  if (!scope) return true;
  if (scope.categories && scope.categories.length > 0 && !scope.categories.includes(record.type)) {
    return false;
  }
  if (scope.dateFrom && record.date < scope.dateFrom) return false;
  if (scope.dateTo && record.date > scope.dateTo) return false;
  return true;
}

/** Coarse check used for detail endpoints (record-level scope checked by caller). */
export async function hasPatientAccess(
  userId: string,
  role: string | undefined,
  patientId: string
): Promise<boolean> {
  if (userId === patientId) return true;

  // Guardian path (any role value — guardians are ordinary user accounts).
  if (await getActiveGuardianLink(userId, patientId)) return true;

  if (role !== "doctor" && role !== "admin") return false;

  if (await getActiveGrant(userId, patientId)) return true;

  const [emergency] = await db
    .select({ id: emergencyAccess.id })
    .from(emergencyAccess)
    .where(
      and(
        eq(emergencyAccess.doctorId, userId),
        eq(emergencyAccess.patientId, patientId),
        eq(emergencyAccess.status, "active"),
        gt(emergencyAccess.expiresAt, new Date())
      )
    )
    .limit(1);

  return Boolean(emergency);
}

/** Batch variant for list endpoints: patients where `userId` is active guardian. */
export async function guardedPatientIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ patientId: guardianLinks.patientId })
    .from(guardianLinks)
    .where(
      and(eq(guardianLinks.guardianId, userId), eq(guardianLinks.status, "active_shared_control"))
    );
  return rows.map((r) => r.patientId);
}

/** Batch variant: unexpired approved grants held by a doctor. */
export async function grantedPatientIds(doctorId: string): Promise<Map<string, { scope: RecordScope; profileIds: string[] }>> {
  const rows = await db
    .select({ patientId: accessRequests.patientId, grantedScope: accessRequests.grantedScope, expiresAt: accessRequests.expiresAt, profileIds: accessRequests.profileIds })
    .from(accessRequests)
    .where(
      and(
        eq(accessRequests.doctorId, doctorId),
        eq(accessRequests.status, "approved"),
        gt(accessRequests.expiresAt, new Date())
      )
    );
  const map = new Map<string, { scope: RecordScope; profileIds: string[] }>();
  for (const r of rows) {
    const pids = Array.isArray(r.profileIds) ? (r.profileIds as string[]) : [];
    map.set(r.patientId, { scope: normalizeScope(r.grantedScope ?? {}), profileIds: pids });
  }
  return map;
}

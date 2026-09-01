/**
 * Integration tests for the access-control and onboarding flows.
 *
 * Covers:
 *   1. Signup role selection (patient/doctor), doctor credential capture,
 *      pending-verification gating, admin review, uniqueness regression.
 *   2. Doctor record-access flow: request -> pending -> patient approval with
 *      time-bound grant -> scope-enforced reads -> expiry revokes access.
 *   3. Guardian flow: link -> guardian-only verification -> scoped reads;
 *      proxy consent (guardian-only for minor/emergency_incapacity; dual for
 *      advance_directive); audit logging.
 *
 * Requires a running Postgres (docker compose up postgres) and DATABASE_URL.
 * Run with:  npx tsx src/__tests__/access-flows.test.ts
 */

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, like, or, sql } from "drizzle-orm";
import { buildApp } from "../app.js";
import type { FastifyInstance } from "fastify";
import { users, doctorVerifications, auditLog } from "../db/schema.js";

// NOTE: ESM imports are hoisted, so config.ts evaluates BEFORE these lines —
// set DATABASE_URL / AI_MOCK / MEDISYNC_DISABLE_RATE_LIMIT in the invoking
// shell, e.g.:
//   DATABASE_URL=... AI_MOCK=true MEDISYNC_DISABLE_RATE_LIMIT=true \
//     npx tsx src/__tests__/access-flows.test.ts
process.env.MEDISYNC_DISABLE_RATE_LIMIT = "true";
process.env.AI_MOCK = "true";

const STAMP = `${Date.now()}`.slice(-8);
const PASSWORD = "TestPassword123!";
const PATIENT_EMAIL = `t-pat-${STAMP}@test.local`;
const DOCTOR_EMAIL = `t-doc-${STAMP}@test.local`;
const GUARDIAN_EMAIL = `t-grd-${STAMP}@test.local`;
const GUARDIAN2_EMAIL = `t-grd2-${STAMP}@test.local`;
const ADMIN_EMAIL = `t-admin-${STAMP}@test.local`;

let pool: pg.Pool;
let db: ReturnType<typeof drizzle>;
let app: FastifyInstance;

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, extra = "") {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${extra ? ` — ${extra}` : ""}`);
    failed++;
  }
}

/** Register via HTTP and return the session cookie value. */
async function register(email: string, bodyExtra: Record<string, unknown> = {}): Promise<string | null> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: PASSWORD, username: email.split("@")[0].replace(/-/g, "_"), ...bodyExtra },
  });
  if (res.statusCode !== 201) {
    console.error(`    [setup] register ${email} failed: ${res.statusCode} ${res.body}`);
    return null;
  }
  const cookie = res.cookies.find((c) => c.name === "medisync-session");
  return cookie?.value ?? null;
}

function auth(cookie: string | null) {
  return cookie ? { cookies: { "medisync-session": cookie } } : {};
}

async function api(
  method: "GET" | "POST" | "PATCH",
  url: string,
  cookie: string | null,
  payload?: Record<string, unknown>
) {
  const res = await app.inject({
    method,
    url,
    ...auth(cookie),
    ...(payload ? { payload } : {}),
  });
  let json: any = null;
  try { json = JSON.parse(res.body); } catch { /* non-JSON */ }
  return { status: res.statusCode, json };
}

// ============================ 1. SIGNUP / ROLES ============================

async function test_signup_role_selection() {
  console.log("\n--- Signup role selection ---");

  const patientCookie = await register(PATIENT_EMAIL);
  assert(patientCookie !== null, "patient signup succeeds");
  const mePat = await api("GET", "/api/auth/me", patientCookie);
  assert(mePat.json?.user?.role === "patient", "patient role persists as 'patient'");
  assert(mePat.json?.user?.verificationStatus == null, "patient has no verification status");

  // Doctor signup without credential fields -> rejected
  const noFields = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: `t-nofields-${STAMP}@test.local`, password: PASSWORD, role: "doctor" },
  });
  assert(noFields.statusCode === 400, "doctor signup without credentials is rejected (400)");

  // Invalid council -> rejected
  const badCouncil = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email: `t-badcouncil-${STAMP}@test.local`, password: PASSWORD, role: "doctor",
      full_name: "Dr T", registration_number: "IMR/123456", council: "not_a_council", qualification: "MBBS",
    },
  });
  assert(badCouncil.statusCode === 400, "invalid medical council rejected (400)");

  const docCookie = await register(DOCTOR_EMAIL, {
    role: "doctor",
    full_name: "Dr Test Singh",
    registration_number: `DMC/${STAMP}/999`,
    council: "delhi",
    qualification: "MBBS, MD (General Medicine)",
    year_of_registration: 2019,
  });
  assert(docCookie !== null, "doctor signup with credentials succeeds");
  const meDoc = await api("GET", "/api/auth/me", docCookie);
  assert(meDoc.json?.user?.role === "doctor", "doctor role persists as 'doctor'");
  assert(meDoc.json?.user?.verificationStatus === "pending_verification", "doctor starts pending_verification");

  const [submission] = await db.select().from(doctorVerifications).where(eq(doctorVerifications.registrationNumber, `DMC/${STAMP}/999`));
  assert(submission !== undefined && submission.council === "delhi" && submission.yearOfRegistration === 2019, "credential submission stored (NMC/State Council data)");

  // Uniqueness constraints unaffected by role field
  const dupEmail = await app.inject({
    method: "POST", url: "/api/auth/register",
    payload: { email: PATIENT_EMAIL, password: PASSWORD, username: `other_${STAMP}`, role: "patient" },
  });
  assert(dupEmail.statusCode === 409, "duplicate email still 409 regardless of role");
  const dupUser = await app.inject({
    method: "POST", url: "/api/auth/register",
    payload: { email: `t-x-${STAMP}@test.local`, password: PASSWORD, username: `t_pat_${STAMP}`, role: "patient" },
  });
  assert(dupUser.statusCode === 409, "duplicate username still 409 regardless of role");

  return { patientCookie, docCookie };
}

// ==================== 2. DOCTOR VERIFICATION GATE ====================

async function test_verification_gate(docCookie: string) {
  console.log("\n--- Doctor verification gating + admin review ---");

  const early = await api("POST", "/api/access-requests", docCookie, {
    patient_email: PATIENT_EMAIL, reason: "too early", scope: {},
  });
  assert(early.status === 403, "UNVERIFIED doctor cannot file access requests (403)");

  const earlyEmergency = await api("POST", "/api/emergency-access", docCookie, {
    patient_email: PATIENT_EMAIL, reason_code: "trauma", reason_text: "test",
  });
  assert(earlyEmergency.status === 403, "UNVERIFIED doctor cannot break-glass (403)");

  // Admin reviews and approves. Bootstrap an admin by registering normally
  // then flipping the role in the DB (no admin exists yet in a fresh DB).
  const adminCookie = await register(`${ADMIN_EMAIL}x`, {});
  const meAdmin = await api("GET", "/api/auth/me", adminCookie);
  await db.update(users).set({ role: "admin" }).where(eq(users.id, meAdmin.json.user.id));

  const list = await api("GET", "/api/admin/verifications", adminCookie);
  assert(list.status === 200 && list.json.verifications.some((v: any) => v.registration_number === `DMC/${STAMP}/999` || v.registrationNumber === `DMC/${STAMP}/999`), "admin can list pending submissions");

  const target = list.json.verifications.find((v: any) => (v.registrationNumber ?? v.registration_number) === `DMC/${STAMP}/999`);
  assert(target !== undefined, "our doctor's submission is in the review queue");
  if (target) {
    const r2 = await api("POST", `/api/admin/verifications/${target.id}/review`, adminCookie, { decision: "verified" });
    assert(r2.status === 200, "admin approves doctor submission");
    const rejected = await api("POST", `/api/admin/verifications/${target.id}/review`, adminCookie, { decision: "verified" });
    assert(rejected.status === 409, "double-review rejected (409)");
  }

  const meAfter = await api("GET", "/api/auth/me", docCookie);
  assert(meAfter.json?.user?.verificationStatus === "verified", "doctor becomes verified after admin approval");

  const audits = await db.select().from(auditLog).where(eq(auditLog.actionType, "doctor_verification.verified"));
  assert(audits.length >= 1, "approval written to audit log");
}

// ==================== 3. DOCTOR ACCESS-REQUEST FLOW ====================

async function test_doctor_request_flow(patientCookie: string, docCookie: string) {
  console.log("\n--- Doctor request -> approval -> scope/expiry enforcement ---");

  // Patient's records
  const r1 = await api("POST", "/api/records", patientCookie, { type: "lab_result", date: "2026-01-10", doctor_name: "Dr A" });
  const r2 = await api("POST", "/api/records", patientCookie, { type: "prescription", date: "2026-02-10", doctor_name: "Dr B" });
  const labId = r1.json.record.id as string;
  const rxId = r2.json.record.id as string;
  assert(!!labId && !!rxId, "patient owns two records of different types");

  const reqRes = await api("POST", "/api/access-requests", docCookie, {
    patient_email: PATIENT_EMAIL,
    reason: "Review recent labs before follow-up",
    scope: { categories: ["lab_result"] },
  });
  assert(reqRes.status === 201 && reqRes.json.accessRequest.status === "pending", "request enters pending state (no auto-access)");
  assert(reqRes.json.accessRequest.reason === "Review recent labs before follow-up", "reason captured on request");
  const arId = reqRes.json.accessRequest.id as string;

  const peekList = await api("GET", "/api/records", docCookie);
  assert((peekList.json.records ?? []).length === 0, "pending request grants NO record access");

  // Approval with duration (D2)
  const approve = await api("PATCH", `/api/access-requests/${arId}`, patientCookie, { status: "approved", duration_days: 30 });
  assert(approve.json.accessRequest?.status === "approved", "patient approves with duration");
  const exp = new Date(approve.json.accessRequest.expiresAt);
  const days = Math.round((exp.getTime() - Date.now()) / 86400000);
  assert(days >= 29 && days <= 31, `grant expires in ~30 days (got ${days})`);

  // Scope enforcement at read time (D3)
  const list = await api("GET", "/api/records", docCookie);
  assert(list.json.records.length === 1 && list.json.records[0].type === "lab_result", "scoped listing returns ONLY lab_result");
  const deniedDetail = await api("GET", `/api/records/${rxId}`, docCookie);
  assert(deniedDetail.status === 403, "out-of-scope detail read denied (403)");
  const okDetail = await api("GET", `/api/records/${labId}`, docCookie);
  assert(okDetail.status === 200, "in-scope detail read allowed (200)");
  const audited = await db.select().from(auditLog).where(eq(auditLog.actionType, "record.viewed_by_delegate"));
  assert(audited.some((a) => a.recordId === labId), "in-scope read logged to audit trail");

  // Diagnostic history is part of an approved grant
  const diagCreate = await api("POST", "/api/diagnoses", patientCookie, {
    patientInfo: { name: "Grant Test", age: 30, gender: "male" },
    symptoms: ["cough"], existingConditions: [], symptomDuration: "3 days", severity: "mild",
  });
  assert(diagCreate.status === 201, "patient has a diagnosis while grant is live");
  const diagId = diagCreate.json.diagnosis.id as string;
  const diagList = await api("GET", "/api/diagnoses", docCookie);
  const delegated = (diagList.json?.diagnoses ?? []).filter((d: any) => d.owner === false);
  assert(delegated.length >= 1, "approved doctor sees patient's diagnostic history");
  const diagDetail = await api("GET", `/api/diagnoses/${diagId}`, docCookie);
  assert(diagDetail.status === 200 && diagDetail.json?.diagnosis?.owner === false, "doctor reads diagnosis detail via grant");
  const diagAudited = await db.select().from(auditLog).where(eq(auditLog.actionType, "diagnosis.list_viewed_by_doctor"));
  assert(diagAudited.length >= 1, "delegated diagnosis listing audited");

  // Expiry actually revokes — read path re-checks every request
  await db.execute(sql`UPDATE access_requests SET expires_at = now() - interval '1 hour' WHERE id = ${arId}`);
  const afterExpiryDetail = await api("GET", `/api/records/${labId}`, docCookie);
  assert(afterExpiryDetail.status === 403, "EXPIRED grant denies record detail read (403)");
  const afterExpiryList = await api("GET", "/api/records", docCookie);
  assert((afterExpiryList.json.records ?? []).length === 0, "EXPIRED grant hides records from listing");
  const diagAfterExpiry = await api("GET", "/api/diagnoses", docCookie);
  assert((diagAfterExpiry.json?.diagnoses ?? []).every((d: any) => d.owner !== false), "EXPIRED grant hides diagnoses from listing");
  const diagDeniedAfterExpiry = await api("GET", `/api/diagnoses/${diagId}`, docCookie);
  assert(diagDeniedAfterExpiry.status === 403, "EXPIRED grant denies diagnosis detail (403)");

  // Revocation path still works from pending/denied side
  const req2 = await api("POST", "/api/access-requests", docCookie, {
    patient_email: PATIENT_EMAIL, reason: "Second consult", scope: {},
  });
  const deny = await api("PATCH", `/api/access-requests/${req2.json.accessRequest.id}`, patientCookie, { status: "denied" });
  assert(deny.json.accessRequest?.status === "denied", "denial works");
  const afterDeny = await api("GET", "/api/records", docCookie);
  assert((afterDeny.json.records ?? []).length === 0, "denied doctor has no access");

  return { arId };
}

// ==================== 4. GUARDIAN FLOW ====================

async function test_guardian_flow(patientCookie: string, docCookie: string) {
  console.log("\n--- Guardian link -> verification -> scoped access + proxy consent ---");

  // Link creation requires the GUARDIAN to accept
  const create = await api("POST", "/api/guardian-links", patientCookie, {
    guardian_email: GUARDIAN_EMAIL, trigger_type: "minor", scope: "records_and_diagnoses",
  });
  assert(create.status === 201 && create.json.guardianLink.status === "pending_guardian", "link created pending_guardian");
  const linkId = create.json.guardianLink.id as string;

  const selfApprove = await api("PATCH", `/api/guardian-links/${linkId}`, patientCookie, { status: "active_shared_control" });
  assert(selfApprove.status === 403, "patient CANNOT self-activate the guardianship");
  const accept = await api("PATCH", `/api/guardian-links/${linkId}`, GUARDIAN_COOKIE!, { status: "active_shared_control" });
  assert(accept.json.guardianLink?.status === "active_shared_control", "named guardian activates the link (verification step)");

  // Second simultaneous active guardian blocked
  const second = await api("POST", "/api/guardian-links", patientCookie, {
    guardian_email: GUARDIAN2_EMAIL, trigger_type: "minor",
  });
  assert(second.status === 409, "creating another link while one is active/pending blocked (409)");

  // Guardian reads records (scope includes records)
  const recs = await api("GET", "/api/records", GUARDIAN_COOKIE!);
  assert((recs.json.records ?? []).length >= 2, "active guardian sees dependent's records");
  const viewedByGuardian = await db.select().from(auditLog).where(eq(auditLog.actionType, "record.list_viewed_by_guardian"));
  assert(viewedByGuardian.length >= 1, "guardian record listing audited");

  // Diagnoses visible only when link scope allows
  const diagCreate = await api("POST", "/api/diagnoses", patientCookie, {
    patientInfo: { name: "Test Kid", age: 7, gender: "male" },
    symptoms: ["fever"], existingConditions: [], symptomDuration: "2 days", severity: "mild",
  });
  assert(diagCreate.status === 201, "patient diagnosis exists (AI mock)");
  const diagOk = await api("GET", "/api/diagnoses", GUARDIAN_COOKIE!);
  assert((diagOk.json.diagnoses ?? []).length >= 1, "records_and_diagnoses scope exposes dependent's diagnoses");

  // --- minor trigger: GUARDIAN-ONLY consent ---
  const reqMinor = await api("POST", "/api/access-requests", docCookie, {
    patient_email: PATIENT_EMAIL, reason: "Pediatric follow-up", scope: {},
  });
  const minorReqId = reqMinor.json.accessRequest.id as string;
  const patientTry = await api("PATCH", `/api/access-requests/${minorReqId}`, patientCookie, { status: "approved", duration_days: 30 });
  assert(patientTry.status === 403, "minor patient CANNOT self-consent (guardian decides)");
  const guardianApprove = await api("PATCH", `/api/access-requests/${minorReqId}`, GUARDIAN_COOKIE!, { status: "approved", duration_days: 30 });
  assert(guardianApprove.json.accessRequest?.status === "approved" && guardianApprove.json.accessRequest?.consentModel === "guardian", "guardian approves on behalf of minor");
  const revokeByGuardian = await api("PATCH", `/api/access-requests/${minorReqId}`, GUARDIAN_COOKIE!, { status: "revoked" });
  assert(revokeByGuardian.json.accessRequest?.status === "revoked", "guardian can also revoke");

  // --- advance_directive: DUAL consent ---
  await api("PATCH", `/api/guardian-links/${linkId}`, GUARDIAN_COOKIE!, { status: "revoked" });
  const adLink = await api("POST", "/api/guardian-links", patientCookie, {
    guardian_email: GUARDIAN_EMAIL, trigger_type: "advance_directive", scope: "records",
  });
  const adId = adLink.json.guardianLink.id as string;
  await api("PATCH", `/api/guardian-links/${adId}`, GUARDIAN_COOKIE!, { status: "active_shared_control" });

  const reqDual = await api("POST", "/api/access-requests", docCookie, {
    patient_email: PATIENT_EMAIL, reason: "Chronic care consult", scope: {},
  });
  const dualId = reqDual.json.accessRequest.id as string;
  const first = await api("PATCH", `/api/access-requests/${dualId}`, patientCookie, { status: "approved", duration_days: 90 });
  assert(first.json.accessRequest?.status === "partially_approved", "first dual approval -> partially_approved (no access yet)");
  const midList = await api("GET", "/api/records", docCookie);
  assert((midList.json.records ?? []).length === 0, "partially-approved grant must NOT expose any records");
  const secondApproval = await api("PATCH", `/api/access-requests/${dualId}`, GUARDIAN_COOKIE!, { status: "approved", duration_days: 90 });
  assert(secondApproval.json.accessRequest?.status === "approved", "second dual approval completes -> approved");
  const dualExpDays = Math.round((new Date(secondApproval.json.accessRequest.expiresAt).getTime() - Date.now()) / 86400000);
  assert(dualExpDays >= 89 && dualExpDays <= 91, `dual-approved grant honors requested duration (~90d, got ${dualExpDays})`);
}

let GUARDIAN_COOKIE: string | null = null;

// ==================== RUNNER ====================

async function main() {
  console.log("=== MediSync Access-Control Flow Tests ===\n");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL must be set");

  pool = new pg.Pool({ connectionString: databaseUrl });
  db = drizzle(pool);

  try {
    app = await buildApp();
    GUARDIAN_COOKIE = await register(GUARDIAN_EMAIL);
    await register(GUARDIAN2_EMAIL);

    const { patientCookie, docCookie } = await test_signup_role_selection();
    await test_verification_gate(docCookie!);
    await test_doctor_request_flow(patientCookie!, docCookie!);
    await test_guardian_flow(patientCookie!, docCookie!);
  } catch (err) {
    console.error("\nUnexpected error during tests:", err);
    failed++;
  } finally {
    // Cleanup: users cascade to profiles/verifications/links/requests/records;
    // audit_log has no FKs so purge by actor/target emails' ids first.
    try {
      const rows = await db.select({ id: users.id }).from(users).where(
        or(
          like(users.email, `%${STAMP}@test.local`),
          like(users.email, `${ADMIN_EMAIL}%`)
        )
      );
      for (const r of rows) {
        await db.delete(auditLog).where(or(eq(auditLog.actorId, r.id), eq(auditLog.targetPatientId, r.id)));
      }
      await db.delete(users).where(or(
        like(users.email, `t-%-${STAMP}@test.local`),
        like(users.email, `t-%-${STAMP}@test.localx`)
      ));
    } catch (e) {
      console.error("Cleanup failed (test data may remain):", e);
    }
    await app?.close();
    await pool.end();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();

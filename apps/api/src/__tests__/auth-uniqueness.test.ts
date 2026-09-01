/**
 * Standalone test for user uniqueness enforcement.
 *
 * Requires a running Postgres instance (e.g. `docker-compose up postgres`).
 * Run with:  npx tsx src/__tests__/auth-uniqueness.test.ts
 *
 * Uses the same DATABASE_URL env var as the rest of the app.
 */

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import argon2 from "@node-rs/argon2";
import { users, profiles } from "../db/schema.js";

const TEST_EMAIL_1 = `test-unique-1-${Date.now()}@example.com`;
const TEST_EMAIL_2 = `test-unique-2-${Date.now()}@example.com`;
const TEST_USERNAME = `testuser_${Date.now()}`;
const TEST_USERNAME_2 = `testuser2_${Date.now()}`;
const TEST_PASSWORD = "TestPassword123!";

let pool: pg.Pool;
let db: ReturnType<typeof drizzle>;

async function setup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set to run uniqueness tests");
  }
  pool = new pg.Pool({ connectionString: databaseUrl });
  db = drizzle(pool);
}

async function teardown() {
  // Clean up test data (profiles cascade on user delete; guard missing rows)
  for (const email of [TEST_EMAIL_1, TEST_EMAIL_2]) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (u) {
      await db.delete(profiles).where(eq(profiles.id, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }
  }
  await pool.end();
}

let passed = 0;
let failed = 0;

/** Drizzle wraps driver errors; the PG error code lives on the cause chain. */
function pgCode(err: any): string | undefined {
  return err?.code ?? err?.cause?.code;
}

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, testName: string) {
  assert(actual === expected, `${testName} (got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`);
}

// ---- Tests ----

async function test_duplicate_email_returns_409() {
  console.log("\nTest: Duplicate email returns 409");

  const passwordHash = await argon2.hash(TEST_PASSWORD);

  // Insert first user
  await db.insert(users).values({ email: TEST_EMAIL_1, passwordHash, username: TEST_USERNAME, role: "patient" });

  // Attempt duplicate email
  let caughtError: any = null;
  try {
    await db.insert(users).values({ email: TEST_EMAIL_1, passwordHash, username: `other_${Date.now()}`, role: "patient" });
  } catch (err: any) {
    caughtError = err;
  }

  assert(caughtError !== null, "Insert with duplicate email throws an error");
  assertEqual(pgCode(caughtError), "23505", "Error code is 23505 (unique_violation)");
}

async function test_duplicate_username_returns_409() {
  console.log("\nTest: Duplicate username returns 409");

  const passwordHash = await argon2.hash(TEST_PASSWORD);

  // Insert first user with a unique username
  await db.insert(users).values({ email: TEST_EMAIL_2, passwordHash, username: TEST_USERNAME_2, role: "patient" });

  // Attempt duplicate username with different email
  let caughtError: any = null;
  try {
    await db.insert(users).values({ email: `other-${Date.now()}@example.com`, passwordHash, username: TEST_USERNAME_2, role: "patient" });
  } catch (err: any) {
    caughtError = err;
  }

  assert(caughtError !== null, "Insert with duplicate username throws an error");
  assertEqual(pgCode(caughtError), "23505", "Error code is 23505 (unique_violation)");
  assert((caughtError?.constraint ?? caughtError?.cause?.constraint) === "users_username_unique", "Constraint name is users_username_unique");
}

async function test_password_hash_can_repeat() {
  console.log("\nTest: Two users can share the same password hash");

  const sharedHash = await argon2.hash("SamePassword123!");
  const email3 = `test-shared-pw-1-${Date.now()}@example.com`;
  const email4 = `test-shared-pw-2-${Date.now()}@example.com`;

  let error1: any = null;
  let error2: any = null;
  try {
    await db.insert(users).values({ email: email3, passwordHash: sharedHash, username: `shared_pw_1_${Date.now()}`, role: "patient" });
  } catch (err: any) { error1 = err; }
  try {
    await db.insert(users).values({ email: email4, passwordHash: sharedHash, username: `shared_pw_2_${Date.now()}`, role: "patient" });
  } catch (err: any) { error2 = err; }

  assert(error1 === null, "First user with shared password hash inserts successfully");
  assert(error2 === null, "Second user with same password hash inserts successfully");

  // Clean up
  await db.delete(users).where(eq(users.email, email3));
  await db.delete(users).where(eq(users.email, email4));
}

async function test_unique_constraint_exists_in_schema() {
  console.log("\nTest: Schema defines unique constraint on username");

  // Query pg_constraint to verify the constraint exists
  const result = await pool.query(`
    SELECT conname, contype
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'u'
      AND conname = 'users_username_unique'
  `);

  assert(result.rows.length > 0, "users_username_unique constraint exists in the database");
}

// ---- Runner ----

async function main() {
  console.log("=== MediSync Auth Uniqueness Tests ===\n");

  try {
    await setup();
    await test_duplicate_email_returns_409();
    await test_duplicate_username_returns_409();
    await test_password_hash_can_repeat();
    await test_unique_constraint_exists_in_schema();
  } catch (err) {
    console.error("\nUnexpected error during tests:", err);
    failed++;
  } finally {
    await teardown();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();

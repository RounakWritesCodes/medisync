import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import argon2 from "@node-rs/argon2";
import { Resend } from "resend";
import { db } from "../db/index.js";
import { users, profiles, verificationTokens, doctorVerifications } from "../db/schema.js";
import { createUserSession, revokeToken } from "../lib/session.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { auditEntry } from "../lib/audit.js";
import { config } from "../config.js";

/** Roles that can never be self-assigned at signup beyond the explicit choice below. */
const ASSIGNABLE_ROLES = ["patient", "doctor", "admin"] as const;
const SIGNUP_ROLES = ["patient", "doctor"] as const;

/**
 * Issuing authorities for medical registration in India (D1): the National
 * Medical Commission maintains the Indian Medical Register; doctors register
 * with their State Medical Council, which feeds the IMR. Admins verify the
 * supplied registration number against the relevant council's public register.
 */
const MEDICAL_COUNCILS = [
  "nmc",
  "andhra_pradesh", "assam", "bihar", "chhattisgarh", "delhi", "goa", "gujarat",
  "haryana", "himachal_pradesh", "jammu_kashmir", "jharkhand", "karnataka",
  "kerala", "madhya_pradesh", "maharashtra", "manipur", "meghalaya", "mizoram",
  "odisha", "puducherry", "punjab", "rajasthan", "sikkim", "tamil_nadu",
  "telangana", "tripura", "uttar_pradesh", "uttarakhand", "west_bengal",
] as const;

/**
 * Map Postgres unique-violation (23505) to per-field 409 messages.
 * Handles the race-condition fallback when two concurrent requests
 * pass the app-level check but collide on the DB constraint.
 */
function mapPgUniqueViolation(err: unknown): { status: number; body: Record<string, string> } | null {
  const pgErr = err as { code?: string; constraint?: string; detail?: string };
  if (pgErr.code !== "23505") return null;

  const constraint = pgErr.constraint ?? "";
  if (constraint === "users_email_unique") {
    return { status: 409, body: { error: "Email already registered", field: "email" } };
  }
  if (constraint === "users_username_unique") {
    return { status: 409, body: { error: "Username already taken", field: "username" } };
  }
  // Unknown unique constraint — generic message, no internals leaked.
  return { status: 409, body: { error: "A record with the same value already exists" } };
}

function validatePassword(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain at least one letter and one number";
  }
  return null;
}

async function sendVerificationEmail(email: string, userId: string): Promise<void> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + config.verificationTokenExpiryMinutes * 60 * 1000);

  await db.insert(verificationTokens).values({
    userId,
    tokenHash,
    type: "email_verify",
    expiresAt,
  });

  const resend = new Resend(config.resendApiKey!);
  const verifyUrl = `${config.appUrl}/verify?token=${raw}`;

  await resend.emails.send({
    from: config.resendFromEmail,
    to: email,
    subject: "Verify your MediSync account",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #3525cd; margin-bottom: 16px;">Verify your email</h2>
        <p style="color: #46445a; line-height: 1.6;">
          Thanks for signing up for MediSync Health. Please click the button below to verify your email address.
        </p>
        <a href="${verifyUrl}" style="display: inline-block; padding: 14px 32px; background: #3525cd; color: white; text-decoration: none; border-radius: 9999px; font-weight: 600; margin: 24px 0;">
          Verify Email
        </a>
        <p style="color: #77768a; font-size: 13px;">
          This link expires in ${config.verificationTokenExpiryMinutes} minutes. If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

function setSessionCookie(reply: any, token: string) {
  reply.setCookie("medisync-session", token, {
    path: "/",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // mirrors SESSION_TTL_SECONDS server-side
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const body = request.body as {
      email?: string;
      password?: string;
      username?: string;
      role?: string;
      // Doctor verification fields (D1) — required only when role === "doctor".
      full_name?: string;
      registration_number?: string;
      council?: string;
      qualification?: string;
      year_of_registration?: number | string;
    };

    const email = body.email;
    const password = body.password;
    let { username } = body;

    // --- Input validation ---
    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }

    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      return reply.status(400).send({ error: "Invalid email format", field: "email" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return reply.status(400).send({ error: passwordError });
    }

    let trimmedUsername: string | null = null;
    if (username !== undefined && username !== null && String(username).trim().length > 0) {
      trimmedUsername = String(username).trim();
      if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
        return reply.status(400).send({ error: "Username must be between 3 and 30 characters", field: "username" });
      }
      if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
        return reply.status(400).send({ error: "Username may only contain letters, numbers, and underscores", field: "username" });
      }
    }

    // --- Signup role selection ---
    // Only "patient" | "doctor" are selectable; anything else is ignored.
    // Role is a plain attribute column and never participates in the
    // email/username uniqueness constraints. The very first account still
    // bootstraps as admin regardless of the requested role.
    const requestedRole = SIGNUP_ROLES.includes(body.role as (typeof SIGNUP_ROLES)[number])
      ? (body.role as (typeof SIGNUP_ROLES)[number])
      : "patient";

    // --- Doctor credential fields (D1, India-aligned) ---
    let doctorVerification: {
      fullName: string;
      registrationNumber: string;
      council: string;
      qualification: string;
      yearOfRegistration: number | null;
    } | null = null;

    if (requestedRole === "doctor") {
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const registrationNumber = typeof body.registration_number === "string" ? body.registration_number.trim().toUpperCase() : "";
      const council = typeof body.council === "string" ? body.council.trim().toLowerCase() : "";
      const qualification = typeof body.qualification === "string" ? body.qualification.trim() : "";
      const yearRaw = body.year_of_registration;

      if (!fullName || fullName.length < 3 || fullName.length > 120) {
        return reply.status(400).send({
          error: "Full name (as per council registration) is required (3–120 chars)",
          field: "full_name",
        });
      }
      // IMR registration numbers: alphanumeric with optional slashes/hyphens.
      if (!/^[A-Za-z0-9][A-Za-z0-9/-]{3,24}$/.test(registrationNumber)) {
        return reply.status(400).send({
          error: "A valid NMC / State Medical Council registration number is required",
          field: "registration_number",
        });
      }
      if (!(MEDICAL_COUNCILS as readonly string[]).includes(council)) {
        return reply.status(400).send({
          error: `Invalid medical council. Allowed: ${MEDICAL_COUNCILS.join(", ")}`,
          field: "council",
        });
      }
      if (!qualification || qualification.length > 200) {
        return reply.status(400).send({ error: "Qualification is required (max 200 chars)", field: "qualification" });
      }

      let yearOfRegistration: number | null = null;
      if (yearRaw !== undefined && yearRaw !== null && yearRaw !== "") {
        const year = Number(yearRaw);
        const currentYear = new Date().getFullYear();
        if (!Number.isInteger(year) || year < 1956 || year > currentYear) {
          return reply.status(400).send({
            error: `Year of registration must be an integer between 1956 and ${currentYear}`,
            field: "year_of_registration",
          });
        }
        yearOfRegistration = year;
      }

      doctorVerification = { fullName, registrationNumber, council, qualification, yearOfRegistration };
    }

    // --- Role assignment: first ever account becomes admin, otherwise the chosen role applies ---
    const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
    const effectiveRole = anyUser ? requestedRole : "admin";
    // Doctors start credential-pending; signup alone NEVER grants clinical authority.
    const verificationStatus =
      effectiveRole === "doctor" ? "pending_verification" : null;

    // --- App-level pre-checks (per-field 409s) ---
    const existingEmail = await db.select({ id: users.id }).from(users).where(eq(users.email, emailNorm)).limit(1);
    if (existingEmail.length > 0) {
      return reply.status(409).send({ error: "Email already registered", field: "email" });
    }

    if (trimmedUsername) {
      const existingUsername = await db.select({ id: users.id }).from(users).where(eq(users.username, trimmedUsername)).limit(1);
      if (existingUsername.length > 0) {
        return reply.status(409).send({ error: "Username already taken", field: "username" });
      }
    }

    // --- Insert user + profile (+ verification record) atomically, with 23505 fallback ---
    let user;
    try {
      const passwordHash = await argon2.hash(password);
      user = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({ email: emailNorm, passwordHash, username: trimmedUsername, role: effectiveRole, verificationStatus })
          .returning();
        await tx.insert(profiles).values({
          id: created.id,
          username: trimmedUsername,
          role: effectiveRole,
        });
        if (effectiveRole === "doctor" && doctorVerification) {
          await tx.insert(doctorVerifications).values({
            userId: created.id,
            fullName: doctorVerification.fullName,
            registrationNumber: doctorVerification.registrationNumber,
            council: doctorVerification.council,
            qualification: doctorVerification.qualification,
            yearOfRegistration: doctorVerification.yearOfRegistration,
            status: "pending_verification",
          });
        }
        return created;
      });
    } catch (err) {
      const mapped = mapPgUniqueViolation(err);
      if (mapped) {
        return reply.status(mapped.status).send(mapped.body);
      }
      throw err; // Re-throw unexpected errors
    }

    setSessionCookie(reply, createUserSession(user.id, user.tokenVersion));

    if (effectiveRole === "doctor") {
      await auditEntry({
        actorId: user.id,
        actorRole: user.role,
        actionType: "doctor_verification.submitted",
        details: { council: doctorVerification?.council, registrationNumber: doctorVerification?.registrationNumber },
      });
    }

    // Auto-send verification email if Resend is configured
    if (config.resendApiKey) {
      try {
        await sendVerificationEmail(emailNorm, user.id);
        console.log(`Verification email sent to ${emailNorm}`);
      } catch (err) {
        console.error("Failed to send verification email:", err);
      }
    }

    return reply.status(201).send({
      user: { id: user.id, email: user.email, username: user.username, role: user.role, verificationStatus: user.verificationStatus },
    });
  }

  );

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }

    const emailNorm = email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, emailNorm)).limit(1);

    // Uniform response + dummy hash verify to keep timing consistent whether or not the account exists
    const hash = user?.passwordHash ?? "$argon2id$invalid$invalid$invalidinvalidinvalidinvalidinvalidinvalidinval";
    const valid = await argon2.verify(hash, password).catch(() => false);
    if (!user || !valid) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    setSessionCookie(reply, createUserSession(user.id, user.tokenVersion));

    return reply.send({
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sessionCookie = request.cookies?.["medisync-session"];
    if (sessionCookie) {
      await revokeToken(sessionCookie);
    }
    reply.clearCookie("medisync-session", {
      path: "/",
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
    });
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const [user] = await db.select().from(users).where(eq(users.id, request.userId!)).limit(1);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);

    return reply.send({
      user: { id: user.id, email: user.email, username: user.username, role: user.role, verificationStatus: user.verificationStatus },
      profile: profile || null,
    });
  });

  /**
   * Admin-only: list users and change roles. Roles are never assignable via
   * public registration — this is the only supported promotion path.
   */
  app.get("/api/admin/users", { preHandler: [requireAuth, requireRole("admin")] }, async (_request, reply) => {
    const rows = await db
      .select({ id: users.id, email: users.email, username: users.username, role: users.role, createdAt: users.createdAt })
      .from(users);
    return reply.send({ users: rows });
  });

  app.patch(
    "/api/admin/users/:id/role",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { role } = request.body as { role?: string };

      const normalized = (role || "").toLowerCase();
      if (!(ASSIGNABLE_ROLES as readonly string[]).includes(normalized)) {
        return reply.status(400).send({ error: "Invalid role" });
      }

      const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
      if (!target) return reply.status(404).send({ error: "User not found" });

      // Promoting to doctor still requires credential review — never auto-verify.
      const [current] = await db.select({ v: users.verificationStatus }).from(users).where(eq(users.id, id)).limit(1);
      let verificationStatus = current?.v ?? null;
      if (normalized === "doctor" && !verificationStatus) {
        verificationStatus = "pending_verification";
        await db.insert(doctorVerifications).values({ userId: id, fullName: "", registrationNumber: "", council: "", qualification: "", status: "pending_verification" })
          .onConflictDoNothing();
      }

      const [updated] = await db
        .update(users)
        .set({ role: normalized, verificationStatus, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();

      await db.update(profiles).set({ role: normalized, updatedAt: new Date() }).where(eq(profiles.id, id));

      return reply.send({ user: { id: updated.id, email: updated.email, role: updated.role } });
    }
  );

  /**
   * Admin: list doctor credential submissions for review (D1).
   * Admins verify the registration number against the NMC Indian Medical
   * Register / the relevant State Medical Council's public register.
   */
  app.get("/api/admin/verifications", { preHandler: [requireAuth, requireRole("admin")] }, async (_request, reply) => {
    const rows = await db
      .select({
        id: doctorVerifications.id,
        userId: doctorVerifications.userId,
        fullName: doctorVerifications.fullName,
        registrationNumber: doctorVerifications.registrationNumber,
        council: doctorVerifications.council,
        qualification: doctorVerifications.qualification,
        yearOfRegistration: doctorVerifications.yearOfRegistration,
        status: doctorVerifications.status,
        rejectionReason: doctorVerifications.rejectionReason,
        reviewedAt: doctorVerifications.reviewedAt,
        createdAt: doctorVerifications.createdAt,
        email: users.email,
        username: users.username,
      })
      .from(doctorVerifications)
      .innerJoin(users, eq(doctorVerifications.userId, users.id));

    return reply.send({ verifications: rows });
  });

  /**
   * Admin: approve or reject a doctor's credentials.
   * "verified" flips users.verification_status and unlocks clinical
   * privileges; anything else keeps them locked. Fully audited.
   */
  app.post(
    "/api/admin/verifications/:id/review",
    { preHandler: [requireAuth, requireRole("admin")], config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { decision?: string; rejection_reason?: string };

      if (body.decision !== "verified" && body.decision !== "rejected") {
        return reply.status(400).send({ error: "decision must be 'verified' or 'rejected'" });
      }
      const rejectionReason =
        body.decision === "rejected"
          ? (typeof body.rejection_reason === "string" ? body.rejection_reason.trim() : "")
          : null;
      if (body.decision === "rejected" && !rejectionReason) {
        return reply.status(400).send({ error: "rejection_reason is required when rejecting" });
      }

      const [submission] = await db.select().from(doctorVerifications).where(eq(doctorVerifications.id, id)).limit(1);
      if (!submission) return reply.status(404).send({ error: "Verification submission not found" });
      if (submission.status !== "pending_verification") {
        return reply.status(409).send({ error: `Submission already reviewed (${submission.status})` });
      }
      // Placeholder rows created via admin role-promotion have no captured
      // details yet — block approval until the doctor resubmits real data.
      if (body.decision === "verified" && !submission.registrationNumber) {
        return reply.status(409).send({ error: "Cannot verify a submission without captured registration details" });
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(doctorVerifications)
          .set({
            status: body.decision,
            rejectionReason,
            reviewedBy: request.userId!,
            reviewedAt: now,
            updatedAt: now,
          })
          .where(eq(doctorVerifications.id, id));
        await tx
          .update(users)
          .set({ verificationStatus: body.decision, updatedAt: now })
          .where(eq(users.id, submission.userId));
      });

      await auditEntry({
        actorId: request.userId!,
        actorRole: request.userRole,
        actionType: `doctor_verification.${body.decision}`,
        details: {
          submissionId: id,
          doctorUserId: submission.userId,
          council: submission.council,
          registrationNumber: submission.registrationNumber,
          rejectionReason,
        },
      });

      return reply.send({ ok: true, status: body.decision });
    }
  );
}

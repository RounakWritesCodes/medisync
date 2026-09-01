import type { FastifyInstance } from "fastify";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import argon2 from "@node-rs/argon2";
import { Resend } from "resend";
import { db } from "../db/index.js";
import { users, verificationTokens } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";

/**
 * Hash a verification token for storage (never store raw tokens).
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a secure, URL-safe verification token and return both
 * the raw token (to send to the user) and its hash (to store in DB).
 */
function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = hashToken(raw);
  return { raw, hash };
}

export async function verificationRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/verify/send
   * Sends a verification email to the authenticated user.
   */
  app.post(
    "/api/auth/verify/send",
    {
      preHandler: [requireAuth],
      config: { rateLimit: { max: 3, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      if (!config.resendApiKey) {
        return reply.status(503).send({ error: "Email verification is not configured" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, request.userId!)).limit(1);
      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      const { raw, hash } = generateToken();
      const expiresAt = new Date(Date.now() + config.verificationTokenExpiryMinutes * 60 * 1000);

      await db.insert(verificationTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: "email_verify",
        expiresAt,
      });

      const resend = new Resend(config.resendApiKey);
      const verifyUrl = `${config.appUrl}/verify?token=${raw}`;

      try {
        await resend.emails.send({
          from: config.resendFromEmail,
          to: user.email,
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
      } catch (err) {
        console.error("Failed to send verification email:", err);
        return reply.status(500).send({ error: "Failed to send verification email" });
      }

      return reply.send({ ok: true, message: "Verification email sent" });
    }
  );

  /**
   * POST /api/auth/verify/confirm
   * Confirms a verification token. Public so users can click links from email.
   */
  app.post(
    "/api/auth/verify/confirm",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { token } = request.body as { token?: string };

      if (!token || typeof token !== "string") {
        return reply.status(400).send({ error: "Token is required" });
      }

      const tokenHash = hashToken(token);

      const [record] = await db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.tokenHash, tokenHash), eq(verificationTokens.type, "email_verify")))
        .limit(1);

      if (!record) {
        return reply.status(400).send({ error: "Invalid or unknown token" });
      }
      if (record.usedAt) {
        return reply.status(400).send({ error: "Token has already been used" });
      }
      if (new Date(record.expiresAt) < new Date()) {
        return reply.status(400).send({ error: "Token has expired" });
      }

      await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, record.id));

      return reply.send({ ok: true, message: "Email verified successfully" });
    }
  );

  /**
   * GET /api/auth/verify/status
   */
  app.get("/api/auth/verify/status", { preHandler: [requireAuth] }, async (request, reply) => {
    const results = await db
      .select({ id: verificationTokens.id })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.userId, request.userId!),
          eq(verificationTokens.type, "email_verify"),
          isNotNull(verificationTokens.usedAt)
        )
      )
      .limit(1);

    return reply.send({ verified: results.length > 0 });
  });

  /**
   * POST /api/auth/password-reset/request
   * Public. Always returns 200 to prevent email enumeration.
   */
  app.post(
    "/api/auth/password-reset/request",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const { email } = request.body as { email?: string };

      if (!email || typeof email !== "string") {
        return reply.status(400).send({ error: "Email is required" });
      }

      const emailNorm = email.trim().toLowerCase();
      const [user] = await db.select().from(users).where(eq(users.email, emailNorm)).limit(1);

      if (!user || !config.resendApiKey) {
        return reply.send({ ok: true, message: "If an account exists, a reset email has been sent" });
      }

      const { raw, hash } = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await db.insert(verificationTokens).values({
        userId: user.id,
        tokenHash: hash,
        type: "password_reset",
        expiresAt,
      });

      const resend = new Resend(config.resendApiKey);
      const resetUrl = `${config.appUrl}/reset-password?token=${raw}`;

      try {
        await resend.emails.send({
          from: config.resendFromEmail,
          to: user.email,
          subject: "Reset your MediSync password",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
              <h2 style="color: #3525cd; margin-bottom: 16px;">Reset your password</h2>
              <p style="color: #46445a; line-height: 1.6;">
                We received a request to reset your password. Click the button below to set a new one.
              </p>
              <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background: #3525cd; color: white; text-decoration: none; border-radius: 9999px; font-weight: 600; margin: 24px 0;">
                Reset Password
              </a>
              <p style="color: #77768a; font-size: 13px;">
                This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          `,
        });
      } catch (err) {
        console.error("Failed to send password reset email:", err);
      }

      return reply.send({ ok: true, message: "If an account exists, a reset email has been sent" });
    }
  );

  /**
   * POST /api/auth/password-reset/confirm
   * Public. Sets the new password AND invalidates every existing session for
   * the user by bumping token_version (sessions embed the version at sign time).
   */
  app.post(
    "/api/auth/password-reset/confirm",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { token, password } = request.body as { token?: string; password?: string };

      if (!token || !password) {
        return reply.status(400).send({ error: "Token and new password are required" });
      }

      if (typeof password !== "string" || password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
        return reply.status(400).send({ error: "Password must be at least 8 characters and contain a letter and a number" });
      }

      const tokenHash = hashToken(token);

      const [record] = await db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.tokenHash, tokenHash), eq(verificationTokens.type, "password_reset")))
        .limit(1);

      if (!record) {
        return reply.status(400).send({ error: "Invalid or unknown token" });
      }
      if (record.usedAt) {
        return reply.status(400).send({ error: "Token has already been used" });
      }
      if (new Date(record.expiresAt) < new Date()) {
        return reply.status(400).send({ error: "Token has expired" });
      }

      const passwordHash = await argon2.hash(password);

      // Set new password + invalidate all previously issued sessions atomically.
      await db
        .update(users)
        .set({
          passwordHash,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, record.userId));

      // Single-use token.
      await db.update(verificationTokens).set({ usedAt: new Date() }).where(eq(verificationTokens.id, record.id));

      return reply.send({ ok: true, message: "Password reset successfully" });
    }
  );
}

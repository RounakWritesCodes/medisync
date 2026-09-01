import type { FastifyRequest, FastifyReply } from "fastify";
import { verifySession, isTokenRevoked } from "../lib/session.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    userRole?: string;
    userVerificationStatus?: string | null;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const sessionCookie = request.cookies?.["medisync-session"];
  if (!sessionCookie) {
    return reply.status(401).send({ error: "Not authenticated" });
  }

  const payload = verifySession(sessionCookie);
  if (!payload?.userId) {
    return reply.status(401).send({ error: "Invalid session" });
  }

  // Individually revoked (e.g. logout)
  if (await isTokenRevoked(sessionCookie)) {
    return reply.status(401).send({ error: "Session expired" });
  }

  const [user] = await db
    .select({ id: users.id, role: users.role, tokenVersion: users.tokenVersion, verificationStatus: users.verificationStatus })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!user) {
    return reply.status(401).send({ error: "Invalid session" });
  }

  // Token predates a password change/reset (stale version) — reject.
  if (typeof payload.ver === "number" && payload.ver !== user.tokenVersion) {
    return reply.status(401).send({ error: "Session expired" });
  }

  request.userId = user.id;
  request.userRole = user.role ?? "patient";
  request.userVerificationStatus = user.verificationStatus ?? null;
}

/** Require an exact role; must run after requireAuth. */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.userRole || !roles.includes(request.userRole)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
  };
}

/**
 * Doctor-only endpoints additionally demand COMPLETED credential verification
 * (D1): a doctor account whose verification is still pending/rejected cannot
 * exercise clinical authority. Admins are platform operators and bypass.
 * Must run after requireAuth.
 */
export function requireVerifiedDoctor() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.userRole || !["doctor", "admin"].includes(request.userRole)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }
    if (
      request.userRole === "doctor" &&
      request.userVerificationStatus !== "verified"
    ) {
      return reply.status(403).send({
        error: "Doctor account is not verified yet. A platform admin must approve your credentials before you can perform this action.",
        code: "DOCTOR_UNVERIFIED",
      });
    }
  };
}

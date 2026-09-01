import { createHmac, randomBytes, timingSafeEqual, createHash } from "crypto";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { revokedTokens } from "../db/schema.js";
import { eq } from "drizzle-orm";

const SECRET = config.sessionSecret;

/** Session lifetime in seconds (30 days) — enforced server-side via the `exp` claim. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionPayload {
  userId: string;
  /** users.token_version at sign time — tokens with a stale version are rejected after password change/reset. */
  ver?: number;
  iat?: number;
  exp?: number;
}

function hmacSign(encoded: string): string {
  return createHmac("sha256", SECRET).update(encoded).digest("base64url");
}

/**
 * Create a signed, expiring session token for a user.
 * Embeds the user's current token_version so a password change/reset
 * invalidates every previously issued token.
 */
export function createUserSession(userId: string, tokenVersion: number): string {
  const now = Math.floor(Date.now() / 1000);
  return signSession({ userId, ver: tokenVersion, iat: now, exp: now + SESSION_TTL_SECONDS });
}

export function signSession(payload: Record<string, unknown>): string {
  const data = JSON.stringify(payload);
  const encoded = Buffer.from(data).toString("base64url");
  return `${encoded}.${hmacSign(encoded)}`;
}

export function verifySession(value: string): SessionPayload | null {
  try {
    const [encoded, sig] = value.split(".");
    if (!encoded || !sig) return null;

    const expected = hmacSign(encoded);
    const sigBuf = Buffer.from(sig, "base64url");
    const expBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

    const data = JSON.parse(Buffer.from(encoded, "base64url").toString()) as SessionPayload;
    if (!data || typeof data.userId !== "string") return null;

    // Tokens without an expiry (legacy format) are rejected — fail closed.
    if (typeof data.exp !== "number") return null;
    if (data.exp * 1000 < Date.now()) return null;

    return data;
  } catch {
    return null;
  }
}

/**
 * Hash a session token for storage in the revoked_tokens table.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Revoke a single session token by inserting its hash into revoked_tokens.
 * Called on logout.
 */
export async function revokeToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  try {
    await db.insert(revokedTokens).values({ tokenHash });
  } catch (err) {
    console.error("Failed to revoke token:", err);
  }
}

/**
 * Check if a token has been revoked.
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const result = await db.select().from(revokedTokens).where(eq(revokedTokens.tokenHash, tokenHash)).limit(1);
  return result.length > 0;
}

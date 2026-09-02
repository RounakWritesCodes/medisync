const isProduction = (process.env.NODE_ENV || "development") === "production";

/**
 * Session secret must never fall back to a known default in production —
 * an attacker who knows the default can forge valid session cookies.
 */
const rawSessionSecret = process.env.SESSION_SECRET;
if (isProduction && (!rawSessionSecret || rawSessionSecret.length < 32 || /change|dev-secret/i.test(rawSessionSecret))) {
  throw new Error(
    "SESSION_SECRET must be set to a strong random value (>= 32 chars) in production. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
  );
}

export const config = {
  databaseUrl: process.env.DATABASE_URL!,
  sessionSecret: rawSessionSecret || "dev-secret-change-in-production",
  get cookieSecure() {
    // Secure-by-default: cookies are HTTPS-only in production unless explicitly disabled.
    if (process.env.COOKIE_SECURE !== undefined) return process.env.COOKIE_SECURE === "true";
    return isProduction;
  },
  corsOrigin: process.env.CORS_ORIGIN?.split(",").map(s => s.trim()).filter(Boolean) ?? ["http://localhost:3000"],
  /** Public base URL of the web app — used to build email links. Do not reuse CORS config for this. */
  appUrl: process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000",
  port: parseInt(process.env.API_PORT || "3001", 10),
  nodeEnv: isProduction ? "production" : "development",
  s3Endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  /** Public-facing URL the browser can reach for MinIO (rewrites presigned URLs). */
  s3PublicEndpoint: process.env.S3_PUBLIC_ENDPOINT || "http://localhost:9000",
  s3AccessKey: process.env.S3_ACCESS_KEY || "medisync",
  s3SecretKey: process.env.S3_SECRET_KEY || "medisync_dev",
  s3Bucket: process.env.S3_BUCKET || "medisync",
  s3Region: process.env.S3_REGION || "us-east-1",
  /** URL of the Python MediSync AI service (local, no OpenRouter). */
  aiBaseUrl: process.env.AI_BASE_URL || "http://ai-service:8000",
  aiMock: process.env.AI_MOCK === "true",
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL || "MediSync <noreply@medisync.local>",
  emailVerificationEnabled: process.env.EMAIL_VERIFICATION_ENABLED === "true",
  verificationTokenExpiryMinutes: parseInt(process.env.VERIFICATION_TOKEN_EXPIRY_MINUTES || "60", 10),
};

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { recordsRoutes } from "./routes/records.js";
import { diagnosesRoutes } from "./routes/diagnoses.js";
import { accessRequestsRoutes } from "./routes/access-requests.js";
import { emergencyAccessRoutes } from "./routes/emergency-access.js";
import { guardianRoutes } from "./routes/guardian.js";
import { verificationRoutes } from "./routes/verification.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    // Hard cap on JSON bodies — request payloads were previously unbounded.
    bodyLimit: 1024 * 1024,
  });

  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await app.register(cookie);

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  await app.register(sensible);

  // Baseline abuse ceiling for every route; sensitive endpoints tighten below.
  // Integration tests disable this (they hammer auth routes by design);
  // production behavior is unchanged.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    ...(process.env.MEDISYNC_DISABLE_RATE_LIMIT === "true" ? { max: 100000 } : {}),
  });

  // Health check
  app.get("/api/health", async () => ({ status: "ok" }));

  // Routes
  await app.register(authRoutes);
  await app.register(recordsRoutes);
  await app.register(diagnosesRoutes);
  await app.register(accessRequestsRoutes);
  await app.register(emergencyAccessRoutes);
  await app.register(guardianRoutes);
  await app.register(verificationRoutes);

  return app;
}

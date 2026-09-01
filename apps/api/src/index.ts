import { buildApp } from "./app.js";
import { config } from "./config.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { s3 } from "./lib/s3.js";
import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import pg from "pg";

// Run migrations
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const db = drizzle(pool);

console.log("Running migrations...");
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}

// Ensure S3 bucket exists
try {
  await s3.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
} catch {
  console.log(`Bucket "${config.s3Bucket}" not found, creating...`);
  await s3.send(new CreateBucketCommand({ Bucket: config.s3Bucket }));
  console.log(`Bucket "${config.s3Bucket}" created`);
}

// Start server
try {
  const app = await buildApp();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Server listening on port ${config.port}`);
  if (!config.aiMock) {
    console.log(
      "[MediSync] AI provider: local Python AI service at " + config.aiBaseUrl
    );
  }
} catch (err) {
  console.error("Failed to start server:", err);
  process.exit(1);
}

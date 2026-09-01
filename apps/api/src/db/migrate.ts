import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { config } from "../config.js";

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

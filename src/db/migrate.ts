import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local" });
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// No top-level await: package.json has no "type": "module", so tsx emits CJS.
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
  await sql.end();
  console.log("migrated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

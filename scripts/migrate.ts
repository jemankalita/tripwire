import { migrate } from "drizzle-orm/libsql/migrator";
import { db, dbReady } from "../src/db/client";

async function main(): Promise<void> {
  await dbReady;
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ database migrated");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});

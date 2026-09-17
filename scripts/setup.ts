import { buildFixtures } from "../lib/fixtures/build";
import { ensureDataDirs } from "../lib/paths";
import { seedIfEmpty, getDb } from "../lib/db";

ensureDataDirs();
getDb();
seedIfEmpty();
await buildFixtures();
console.log("Setup complete: SQLite, sample invoices, and .eml payloads are ready.");

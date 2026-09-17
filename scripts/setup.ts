import { buildFixtures } from "../lib/fixtures/build";
import { ensureDataDirs } from "../lib/paths";
import { seedIfEmpty, getDb } from "../lib/db";
import { ensureCurrentLedger } from "../lib/excel";

ensureDataDirs();
getDb();
seedIfEmpty();
await buildFixtures();
await ensureCurrentLedger();
console.log("Setup complete: SQLite, sample invoices, and .eml payloads are ready.");

import fs from "node:fs";
import path from "node:path";
import { paths } from "@/lib/paths";

/** Early homework filenames → current demo fixtures. */
export const LEGACY_FIXTURE_FILES: Record<string, string> = {
  "invoice-siud.pdf": "invoice-clean.pdf",
  "invoice-broken.pdf": "invoice-mismatch.pdf",
  "invoice-labs.pdf": "invoice-allocation.pdf",
  "invoice-cleaning.pdf": "invoice-scan.pdf",
  "settlement_august.pdf": "settlement-monthly.pdf",
};

export function currentFixtureFilename(filename: string): string {
  const base = filename.replace(/^.*[\\/]/, "").toLowerCase();
  return LEGACY_FIXTURE_FILES[base] ?? base;
}

export function currentFixturePdfPath(filename: string): string | null {
  const dest = path.join(paths.invoices, currentFixtureFilename(filename));
  return fs.existsSync(dest) ? dest : null;
}

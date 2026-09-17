import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();

export const paths = {
  data: path.join(ROOT, "data"),
  db: path.join(ROOT, "data", "goldencare.db"),
  attachments: path.join(ROOT, "data", "attachments"),
  excel: path.join(ROOT, "data", "ledger.xlsx"),
  excelLock: path.join(ROOT, "data", "ledger.lock"),
  fixtures: path.join(ROOT, "fixtures"),
  invoices: path.join(ROOT, "fixtures", "invoices"),
  emails: path.join(ROOT, "fixtures", "emails"),
  fonts: path.join(ROOT, "fixtures", "fonts"),
};

export function ensureDataDirs(): void {
  for (const dir of [paths.data, paths.attachments, paths.invoices, paths.emails, paths.fonts]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

import Database from "better-sqlite3";
import { ensureDataDirs, paths } from "@/lib/paths";
import { DEFAULT_PROMPT, DEFAULT_PROMPT_NAME } from "@/lib/prompts/default";
import { samples } from "@/lib/fixtures/samples";

const globalForDb = globalThis as unknown as { goldencareDb?: Database.Database };

function ensureColumn(db: Database.Database, table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((col) => col.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      version INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      message_id TEXT,
      from_address TEXT,
      to_address TEXT,
      subject TEXT,
      email_date TEXT,
      headers_json TEXT,
      body_text TEXT,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      extracted_text TEXT,
      normalized_text TEXT,
      extraction_method TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_dedupe ON documents (message_id, sha256);
  `);
  ensureColumn(db, "documents", "normalized_text", "TEXT");
  db.exec(`

    CREATE TABLE IF NOT EXISTS extractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      prompt_id INTEGER,
      raw_json TEXT NOT NULL,
      canonical_json TEXT NOT NULL,
      status TEXT NOT NULL,
      issues_json TEXT NOT NULL,
      derived_json TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extraction_id INTEGER NOT NULL,
      document_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      excel_row INTEGER,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      extraction_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      corrections_json TEXT,
      promoted_to_regression INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS regression_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      expected_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS regression_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt_id INTEGER,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      field_accuracy REAL,
      line_item_f1 REAL,
      summary_json TEXT
    );
  `);
}

export function getDb(): Database.Database {
  if (globalForDb.goldencareDb) return globalForDb.goldencareDb;
  ensureDataDirs();
  const db = new Database(paths.db);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  globalForDb.goldencareDb = db;
  return db;
}

export function seedIfEmpty(): void {
  const db = getDb();
  const promptCount = db.prepare("SELECT COUNT(*) AS c FROM prompts").get() as { c: number };
  if (promptCount.c === 0) {
    db.prepare(
      `INSERT INTO prompts (name, body, version, is_active, created_at)
       VALUES (?, ?, 1, 1, datetime('now'))`,
    ).run(DEFAULT_PROMPT_NAME, DEFAULT_PROMPT);
  } else {
    db.prepare(
      `UPDATE prompts SET body = ? WHERE is_active = 1 AND body NOT LIKE '%allocation_number%'`,
    ).run(DEFAULT_PROMPT);
  }

  refreshRegressionCases();
}

function refreshRegressionCases(): void {
  const db = getDb();
  const filenames = samples.map((sample) => sample.filename);
  if (filenames.length === 0) return;
  db.prepare(`DELETE FROM regression_cases WHERE filename NOT IN (${filenames.map(() => "?").join(",")})`).run(
    ...filenames,
  );
  const insert = db.prepare(
    `INSERT INTO regression_cases (name, filename, expected_json, active) VALUES (?, ?, ?, 1)`,
  );
  const update = db.prepare(
    `UPDATE regression_cases SET name = ?, expected_json = ?, active = 1 WHERE filename = ?`,
  );
  for (const sample of samples) {
    const exists = db.prepare(`SELECT id FROM regression_cases WHERE filename = ?`).get(sample.filename);
    if (exists) update.run(sample.title, JSON.stringify(sample.expected), sample.filename);
    else insert.run(sample.title, sample.filename, JSON.stringify(sample.expected));
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function getActivePrompt(): { id: number; name: string; body: string; version: number } {
  const row = getDb()
    .prepare(
      `SELECT id, name, body, version FROM prompts WHERE is_active = 1 ORDER BY version DESC LIMIT 1`,
    )
    .get() as { id: number; name: string; body: string; version: number } | undefined;
  if (!row) throw new Error("No active prompt. Run npm run setup.");
  return row;
}

export function listPrompts() {
  return getDb()
    .prepare(`SELECT id, name, body, version, is_active, created_at FROM prompts ORDER BY version DESC`)
    .all() as Array<{
    id: number;
    name: string;
    body: string;
    version: number;
    is_active: number;
    created_at: string;
  }>;
}

export function saveNewPromptVersion(body: string) {
  const db = getDb();
  const latest = db.prepare(`SELECT MAX(version) AS v FROM prompts`).get() as { v: number | null };
  const version = (latest.v ?? 0) + 1;
  const tx = db.transaction(() => {
    db.prepare(`UPDATE prompts SET is_active = 0`).run();
    const info = db
      .prepare(
        `INSERT INTO prompts (name, body, version, is_active, created_at) VALUES (?, ?, ?, 1, datetime('now'))`,
      )
      .run(DEFAULT_PROMPT_NAME, body, version);
    return Number(info.lastInsertRowid);
  });
  return tx();
}

export function activatePrompt(id: number) {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE prompts SET is_active = 0`).run();
    db.prepare(`UPDATE prompts SET is_active = 1 WHERE id = ?`).run(id);
  });
  tx();
}

export function insertDocument(row: {
  source: string;
  message_id: string | null;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  email_date: string | null;
  headers_json: string | null;
  body_text: string | null;
  filename: string;
  mime_type: string;
  sha256: string;
  storage_path: string;
  extracted_text: string | null;
  normalized_text?: string | null;
  extraction_method: string | null;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO documents (
        source, message_id, from_address, to_address, subject, email_date, headers_json, body_text,
        filename, mime_type, sha256, storage_path, extracted_text, normalized_text, extraction_method, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      row.source,
      row.message_id,
      row.from_address,
      row.to_address,
      row.subject,
      row.email_date,
      row.headers_json,
      row.body_text,
      row.filename,
      row.mime_type,
      row.sha256,
      row.storage_path,
      row.extracted_text,
      row.normalized_text ?? null,
      row.extraction_method,
    );
  return Number(info.lastInsertRowid);
}

export function findDuplicateDocument(messageId: string | null, sha256: string): { id: number } | undefined {
  if (messageId) {
    return getDb()
      .prepare(`SELECT id FROM documents WHERE message_id = ? AND sha256 = ? ORDER BY id DESC LIMIT 1`)
      .get(messageId, sha256) as { id: number } | undefined;
  }
  return undefined;
}

export function insertExtraction(row: {
  document_id: number;
  prompt_id: number | null;
  raw_json: string;
  canonical_json: string;
  status: string;
  issues_json: string;
  derived_json: string | null;
  model: string | null;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO extractions (
        document_id, prompt_id, raw_json, canonical_json, status, issues_json, derived_json, model, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      row.document_id,
      row.prompt_id,
      row.raw_json,
      row.canonical_json,
      row.status,
      row.issues_json,
      row.derived_json,
      row.model,
    );
  return Number(info.lastInsertRowid);
}

export function insertLedgerEvent(row: {
  extraction_id: number;
  document_id: number;
  action: string;
  excel_row: number | null;
  note?: string | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO ledger_events (extraction_id, document_id, action, excel_row, note, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(row.extraction_id, row.document_id, row.action, row.excel_row, row.note ?? null);
}

export function insertReview(extractionId: number): number {
  const info = getDb()
    .prepare(
      `INSERT INTO reviews (extraction_id, status, created_at) VALUES (?, 'pending', datetime('now'))`,
    )
    .run(extractionId);
  return Number(info.lastInsertRowid);
}

export function getExtractionBundle(extractionId: number) {
  return getDb()
    .prepare(
      `SELECT e.*, d.filename, d.extracted_text, d.message_id, d.sha256, d.subject, d.from_address, d.storage_path
       FROM extractions e JOIN documents d ON d.id = e.document_id
       WHERE e.id = ?`,
    )
    .get(extractionId) as
    | {
        id: number;
        document_id: number;
        prompt_id: number | null;
        raw_json: string;
        canonical_json: string;
        status: string;
        issues_json: string;
        derived_json: string | null;
        filename: string;
        extracted_text: string | null;
        message_id: string | null;
        sha256: string;
        subject: string | null;
        from_address: string | null;
        storage_path: string;
      }
    | undefined;
}

export function listRecentExtractions(limit = 50) {
  return getDb()
    .prepare(
      `SELECT e.id, e.status, e.created_at, e.canonical_json, d.filename, d.subject, d.from_address, d.source
       FROM extractions e JOIN documents d ON d.id = e.document_id
       ORDER BY e.id DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    status: string;
    created_at: string;
    canonical_json: string;
    filename: string;
    subject: string | null;
    from_address: string | null;
    source: string;
  }>;
}

export function listPendingReviews() {
  return getDb()
    .prepare(
      `SELECT r.id as review_id, r.extraction_id, r.status as review_status, e.canonical_json, e.issues_json, e.status,
              d.filename, d.subject
       FROM reviews r
       JOIN extractions e ON e.id = r.extraction_id
       JOIN documents d ON d.id = e.document_id
       WHERE r.status = 'pending'
       ORDER BY r.id DESC`,
    )
    .all() as Array<{
    review_id: number;
    extraction_id: number;
    review_status: string;
    canonical_json: string;
    issues_json: string;
    status: string;
    filename: string;
    subject: string | null;
  }>;
}

export function resolveReview(reviewId: number, correctionsJson: string, promote: boolean) {
  getDb()
    .prepare(
      `UPDATE reviews SET status = 'resolved', corrections_json = ?, promoted_to_regression = ?, resolved_at = datetime('now')
       WHERE id = ?`,
    )
    .run(correctionsJson, promote ? 1 : 0, reviewId);
}

export function updateExtractionCanonical(extractionId: number, canonicalJson: string, status: string, issuesJson: string) {
  getDb()
    .prepare(`UPDATE extractions SET canonical_json = ?, status = ?, issues_json = ? WHERE id = ?`)
    .run(canonicalJson, status, issuesJson, extractionId);
}

export function addRegressionCase(name: string, filename: string, expectedJson: string) {
  getDb()
    .prepare(`INSERT INTO regression_cases (name, filename, expected_json, active) VALUES (?, ?, ?, 1)`)
    .run(name, filename, expectedJson);
}

export function listRegressionCases() {
  return getDb()
    .prepare(`SELECT id, name, filename, expected_json, active FROM regression_cases WHERE active = 1 ORDER BY id`)
    .all() as Array<{
    id: number;
    name: string;
    filename: string;
    expected_json: string;
    active: number;
  }>;
}

export function insertRegressionRun(promptId: number | null): number {
  const info = getDb()
    .prepare(`INSERT INTO regression_runs (prompt_id, started_at) VALUES (?, datetime('now'))`)
    .run(promptId);
  return Number(info.lastInsertRowid);
}

export function finishRegressionRun(
  id: number,
  fieldAccuracy: number,
  lineItemF1: number,
  summaryJson: string,
) {
  getDb()
    .prepare(
      `UPDATE regression_runs SET finished_at = datetime('now'), field_accuracy = ?, line_item_f1 = ?, summary_json = ? WHERE id = ?`,
    )
    .run(fieldAccuracy, lineItemF1, summaryJson, id);
}

export function listRegressionRuns(limit = 10) {
  return getDb()
    .prepare(
      `SELECT r.*, p.version as prompt_version
       FROM regression_runs r LEFT JOIN prompts p ON p.id = r.prompt_id
       ORDER BY r.id DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    prompt_id: number | null;
    started_at: string;
    finished_at: string | null;
    field_accuracy: number | null;
    line_item_f1: number | null;
    summary_json: string | null;
    prompt_version: number | null;
  }>;
}

export function documentByFilename(filename: string) {
  return getDb()
    .prepare(`SELECT * FROM documents WHERE filename = ? ORDER BY id DESC LIMIT 1`)
    .get(filename) as { id: number; storage_path: string; extracted_text: string | null; mime_type: string } | undefined;
}

export function updateDocumentText(id: number, text: string, method: string) {
  getDb().prepare(`UPDATE documents SET extracted_text = ?, extraction_method = ? WHERE id = ?`).run(text, method, id);
}

export function listFinanceDocuments() {
  const currentFiles = new Set(samples.map((sample) => sample.filename.toLowerCase()));
  const rows = getDb()
    .prepare(
      `SELECT d.id as document_id, d.filename, d.subject, d.from_address, d.source, d.storage_path, d.mime_type,
              d.extracted_text, d.normalized_text, d.body_text, d.headers_json, d.created_at, d.extraction_method,
              e.id as extraction_id, e.status, e.canonical_json, e.issues_json, e.model
       FROM documents d
       LEFT JOIN extractions e ON e.id = (
         SELECT id FROM extractions WHERE document_id = d.id ORDER BY id DESC LIMIT 1
       )
       WHERE d.filename IN (${samples.map(() => "?").join(",")})
       ORDER BY d.id DESC`,
    )
    .all(...samples.map((sample) => sample.filename)) as Array<{
    document_id: number;
    filename: string;
    subject: string | null;
    from_address: string | null;
    source: string;
    storage_path: string;
    mime_type: string;
    extracted_text: string | null;
    normalized_text: string | null;
    body_text: string | null;
    headers_json: string | null;
    created_at: string;
    extraction_method: string | null;
    extraction_id: number | null;
    status: string | null;
    canonical_json: string | null;
    issues_json: string | null;
    model: string | null;
  }>;

  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.filename.toLowerCase();
    if (!currentFiles.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getFinanceDocument(documentId: number) {
  return getDb()
    .prepare(
      `SELECT d.id as document_id, d.filename, d.subject, d.from_address, d.to_address, d.source, d.storage_path,
              d.mime_type, d.extracted_text, d.normalized_text, d.body_text, d.headers_json, d.email_date, d.created_at, d.message_id,
              d.extraction_method,
              e.id as extraction_id, e.status, e.canonical_json, e.issues_json, e.raw_json, e.model, e.derived_json,
              (SELECT id FROM reviews WHERE extraction_id = e.id AND status = 'pending' ORDER BY id DESC LIMIT 1) as review_id
       FROM documents d
       LEFT JOIN extractions e ON e.id = (
         SELECT id FROM extractions WHERE document_id = d.id ORDER BY id DESC LIMIT 1
       )
       WHERE d.id = ?`,
    )
    .get(documentId) as
    | {
        document_id: number;
        filename: string;
        subject: string | null;
        from_address: string | null;
        to_address: string | null;
        source: string;
        storage_path: string;
        mime_type: string;
        extracted_text: string | null;
        normalized_text: string | null;
        body_text: string | null;
        headers_json: string | null;
        email_date: string | null;
        created_at: string;
        message_id: string | null;
        extraction_method: string | null;
        extraction_id: number | null;
        status: string | null;
        canonical_json: string | null;
        issues_json: string | null;
        raw_json: string | null;
        model: string | null;
        derived_json: string | null;
        review_id: number | null;
      }
    | undefined;
}

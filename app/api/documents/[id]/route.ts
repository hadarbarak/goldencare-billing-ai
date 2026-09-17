import { NextResponse } from "next/server";
import fs from "node:fs";
import type { CanonicalInvoice } from "@/lib/schema";
import { toSettlementForm } from "@/lib/schema";
import { getDb, getFinanceDocument, documentByFilename, seedIfEmpty } from "@/lib/db";
import { formatExtractionMethod } from "@/lib/present";
import { normalizeStatus } from "@/lib/validate";
import { currentFixtureFilename, currentFixturePdfPath } from "@/lib/fixtures/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  getDb();
  seedIfEmpty();
  const { id } = await context.params;
  const row = getFinanceDocument(Number(id));
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const mapped = currentFixtureFilename(row.filename);
  if (mapped.toLowerCase() !== row.filename.toLowerCase()) {
    const current = documentByFilename(mapped);
    if (current && current.id !== row.document_id) {
      return NextResponse.json({ redirectTo: current.id });
    }
  }
  let invoice: CanonicalInvoice | null = null;
  try {
    invoice = row.canonical_json ? (JSON.parse(row.canonical_json) as CanonicalInvoice) : null;
  } catch {
    invoice = null;
  }
  const filePath = currentFixturePdfPath(row.filename) ?? row.storage_path;
  const fileRev = fs.existsSync(filePath) ? Math.floor(fs.statSync(filePath).mtimeMs) : Date.now();
  return NextResponse.json({
    documentId: row.document_id,
    extractionId: row.extraction_id,
    filename: currentFixtureFilename(row.filename),
    mimeType: row.mime_type,
    source: row.source,
    from: row.from_address,
    to: row.to_address,
    subject: row.subject,
    body: row.body_text,
    headers: row.headers_json ? JSON.parse(row.headers_json) : null,
    emailDate: row.email_date,
    extractedText: row.extracted_text,
    normalizedText: row.normalized_text,
    status: row.status ? normalizeStatus(row.status) : "failed",
    issues: row.issues_json ? JSON.parse(row.issues_json) : [],
    invoice,
    settlement: invoice ? toSettlementForm(invoice) : null,
    model: row.model,
    method: formatExtractionMethod(row.extraction_method, row.model),
    reviewId: row.review_id,
    fileRev,
  });
}

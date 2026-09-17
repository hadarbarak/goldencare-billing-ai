import { NextResponse } from "next/server";
import type { CanonicalInvoice } from "@/lib/schema";
import { toSettlementForm } from "@/lib/schema";
import { getDb, getFinanceDocument, seedIfEmpty } from "@/lib/db";
import { formatExtractionMethod } from "@/lib/present";
import { normalizeStatus } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  getDb();
  seedIfEmpty();
  const { id } = await context.params;
  const row = getFinanceDocument(Number(id));
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const invoice = row.canonical_json ? (JSON.parse(row.canonical_json) as CanonicalInvoice) : null;
  return NextResponse.json({
    documentId: row.document_id,
    extractionId: row.extraction_id,
    filename: row.filename,
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
  });
}

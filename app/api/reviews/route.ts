import { NextResponse } from "next/server";
import type { CanonicalInvoice, SettlementForm } from "@/lib/schema";
import { canonicalInvoiceSchema } from "@/lib/schema";
import { fromSettlementForm } from "@/lib/present";
import {
  addRegressionCase,
  getDb,
  getExtractionBundle,
  insertLedgerEvent,
  listPendingReviews,
  resolveReview,
  seedIfEmpty,
  updateExtractionCanonical,
} from "@/lib/db";
import { writeLedger } from "@/lib/excel";
import { validateCanonical } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getDb();
  seedIfEmpty();
  return NextResponse.json({ reviews: listPendingReviews() });
}

export async function POST(request: Request) {
  getDb();
  seedIfEmpty();
  const body = (await request.json()) as {
    reviewId: number;
    extractionId: number;
    invoice?: CanonicalInvoice;
    settlement?: SettlementForm;
    promote?: boolean;
  };
  const bundle = getExtractionBundle(body.extractionId);
  if (!bundle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const previous = JSON.parse(bundle.canonical_json) as CanonicalInvoice;
  const invoice = canonicalInvoiceSchema.parse(
    body.invoice ?? (body.settlement ? fromSettlementForm(body.settlement, previous) : previous),
  );

  const validation = validateCanonical(invoice);
  const approved = validation.status === "processed";
  const status = approved ? "processed" : "needs_review";

  updateExtractionCanonical(body.extractionId, JSON.stringify(invoice), status, JSON.stringify(validation.issues));

  const written = await writeLedger({
    extractionId: body.extractionId,
    documentId: bundle.document_id,
    messageId: bundle.message_id,
    sha256: bundle.sha256,
    filename: bundle.filename,
    receivedAt: new Date().toISOString(),
    invoice,
    status: approved ? "active" : "held_for_review",
  });
  insertLedgerEvent({
    extraction_id: body.extractionId,
    document_id: bundle.document_id,
    action: written.action,
    excel_row: written.excelRow,
    note: approved ? "human_review" : "human_review_rejected",
  });

  if (approved) {
    resolveReview(body.reviewId, JSON.stringify(invoice), Boolean(body.promote));
    if (body.promote) {
      addRegressionCase(`review-${bundle.filename}`, bundle.filename, JSON.stringify(invoice));
    }
  }

  return NextResponse.json({
    ok: approved,
    status,
    issues: validation.issues,
    ledgerAction: written.action,
  });
}

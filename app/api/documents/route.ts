import { NextResponse } from "next/server";
import type { CanonicalInvoice } from "@/lib/schema";
import { financeAmount, toSettlementForm } from "@/lib/schema";
import { getDb, listFinanceDocuments, seedIfEmpty } from "@/lib/db";
import { formatPeriod, formatExtractionMethod } from "@/lib/present";
import { normalizeStatus } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getDb();
  seedIfEmpty();
  const items = listFinanceDocuments().map((row) => {
    let invoice: CanonicalInvoice | null = null;
    try {
      invoice = row.canonical_json ? (JSON.parse(row.canonical_json) as CanonicalInvoice) : null;
    } catch {
      invoice = null;
    }
    const settlement = invoice ? toSettlementForm(invoice) : null;
    return {
      documentId: row.document_id,
      extractionId: row.extraction_id,
      filename: row.filename,
      source: row.source,
      status: row.status ? normalizeStatus(row.status) : "failed",
      documentType: settlement?.documentType ?? null,
      supplier: settlement?.supplierName ?? "—",
      period: settlement
        ? formatPeriod(settlement.servicePeriodStart, settlement.servicePeriodEnd, settlement.documentDate)
        : "—",
      amount: settlement ? financeAmount(settlement) : null,
      currency: settlement?.currency ?? "ILS",
      method: formatExtractionMethod(row.extraction_method, row.model),
      createdAt: row.created_at,
    };
  });
  return NextResponse.json({ items });
}

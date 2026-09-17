import { readActiveLedgerRows } from "@/lib/excel";
import { listPendingReviews, listRecentExtractions, listRegressionRuns } from "@/lib/db";
import { financeAmount, toSettlementForm } from "@/lib/schema";
import { formatPeriod } from "@/lib/present";
import { normalizeStatus } from "@/lib/validate";
import type { CanonicalInvoice } from "@/lib/schema";

export async function dashboardPayload() {
  const rows = await readActiveLedgerRows();
  const active = rows.filter((row) => row.status === "active");
  const held = rows.filter((row) => row.status === "held_for_review");
  const lastRun = listRegressionRuns(1)[0];

  const bySupplier = new Map<string, { name: string; total: number; count: number }>();
  const byMonth = new Map<string, { total: number; count: number }>();

  for (const row of active) {
    const key = row.supplier_key || row.supplier_name || "לא ידוע";
    const supplier = bySupplier.get(key) ?? { name: row.supplier_name || key, total: 0, count: 0 };
    supplier.total += Number.isFinite(row.total_amount) ? row.total_amount : 0;
    supplier.count += 1;
    bySupplier.set(key, supplier);

    const month = (row.document_date || "").slice(0, 7) || "ללא-תאריך";
    const bucket = byMonth.get(month) ?? { total: 0, count: 0 };
    bucket.total += Number.isFinite(row.total_amount) ? row.total_amount : 0;
    bucket.count += 1;
    byMonth.set(month, bucket);
  }

  const recent = listRecentExtractions(20)
    .filter((item) => item.source !== "regression")
    .map((item) => {
      const invoice = JSON.parse(item.canonical_json) as CanonicalInvoice;
      const settlement = toSettlementForm(invoice);
      return {
        id: item.id,
        documentHint: item.filename,
        status: normalizeStatus(item.status),
        created_at: item.created_at,
        filename: item.filename,
        subject: item.subject,
        from: item.from_address,
        source: item.source,
        supplier_name: settlement.supplierName,
        total_amount: financeAmount(settlement),
        period: formatPeriod(settlement.servicePeriodStart, settlement.servicePeriodEnd, settlement.documentDate),
      };
    });

  return {
    totals: {
      processedForms: active.length,
      heldCount: held.length,
      amount: active.reduce((acc, row) => acc + (Number.isFinite(row.total_amount) ? row.total_amount : 0), 0),
      accuracy: lastRun?.field_accuracy ?? null,
    },
    bySupplier: [...bySupplier.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.total - a.total),
    byMonth: [...byMonth.entries()]
      .map(([month, value]) => ({ month, ...value }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    pendingReviews: listPendingReviews(),
    recent,
  };
}

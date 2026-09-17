import type { CanonicalInvoice, SettlementForm } from "@/lib/schema";
import { financeAmount, toSettlementForm } from "@/lib/schema";

export function formatMoney(amount: number | null | undefined, currency = "ILS"): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const formatted = amount.toLocaleString("he-IL", { maximumFractionDigits: 2 });
  if (currency === "USD") return `$${formatted}`;
  if (currency === "EUR") return `€${formatted}`;
  return `₪${formatted}`;
}

export function formatPeriod(from: string | null | undefined, to?: string | null, fallbackDate?: string | null): string {
  const iso = from || fallbackDate;
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 7);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatExtractionMethod(method: string | null | undefined, model?: string | null): string {
  if (model === "mock" || method === "mock" || method === "fixture-text") return "Mock";
  if (method === "vision") return "Vision";
  if (method === "pdf-text" || method === "plain-text") return "PDF Text";
  return method || "—";
}

export function fromSettlementForm(form: SettlementForm, previous: CanonicalInvoice): CanonicalInvoice {
  return {
    ...previous,
    document_type: form.documentType,
    document_number: form.documentNumber,
    document_date: form.documentDate,
    period_start: form.servicePeriodStart,
    period_end: form.servicePeriodEnd,
    supplier_name: form.supplierName,
    supplier_id: form.supplierId,
    supplier_tax_id: form.supplierTaxId,
    customer_name: form.customerName,
    purchase_order_number: form.purchaseOrderNumber,
    contract_number: form.contractNumber,
    reference_number: form.referenceNumber,
    allocation_number: form.allocationNumber,
    currency: form.currency,
    subtotal: form.subtotal,
    vat_rate: form.vatRate,
    vat_amount: form.vatAmount,
    total_amount: form.totalAmount,
    total_charges: form.totalCharges,
    total_payments: form.totalPayments,
    outstanding_balance: form.outstandingBalance,
    payment_terms: form.paymentTerms,
    due_date: form.dueDate,
    notes: form.notes,
    invoice_line_items: form.invoiceLineItems.map((item) => ({
      line_number: item.lineNumber,
      description: item.description || null,
      quantity: item.quantity,
      unit_of_measure: item.unitOfMeasure,
      unit_price: item.unitPrice,
      amount: item.amount,
      vat_rate: item.vatRate,
      vat_amount: item.vatAmount,
    })),
    settlement_line_items: form.settlementLineItems.map((item) => ({
      document_date: item.documentDate,
      document_number: item.documentNumber,
      description: item.description || null,
      charged_amount: item.chargedAmount,
      paid_amount: item.paidAmount,
      outstanding_amount: item.outstandingAmount,
    })),
  };
}

export function invoiceToRow(invoice: CanonicalInvoice): {
  settlement: SettlementForm;
  supplier: string;
  period: string;
  amount: string;
} {
  const settlement = toSettlementForm(invoice);
  return {
    settlement,
    supplier: settlement.supplierName ?? "—",
    period: formatPeriod(settlement.servicePeriodStart, settlement.servicePeriodEnd, settlement.documentDate),
    amount: formatMoney(financeAmount(settlement), settlement.currency ?? "ILS"),
  };
}

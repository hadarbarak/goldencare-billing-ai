import type { CanonicalInvoice, DocumentType, InvoiceLineItem, RawExtraction, StatementLineItem } from "@/lib/schema";
import {
  detectCurrency,
  normalizeSupplierName,
  normalizeText,
  parseAmount,
  parseHebrewDate,
  parseRate,
  parseTaxId,
  supplierKey,
} from "./hebrew";

export interface CanonicalResult {
  invoice: CanonicalInvoice;
  /**
   * Fields that were computed rather than read off the document. Surfaced in
   * the UI and the Excel export so nobody mistakes arithmetic for evidence.
   */
  derived: string[];
  /** Fields the model returned but that could not be parsed at all. */
  unparsed: string[];
  /** Date fields that resolved only to a month, not a day. */
  monthOnly: string[];
}

const ROUNDING = 0.02;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDocumentType(raw: string | null | undefined): DocumentType | null {
  if (!raw) return null;
  const text = normalizeText(raw).toLowerCase();
  if (/זיכוי|credit\s*note/.test(text)) return "credit_note";
  if (/התחשבנות|settlement/.test(text)) return "settlement";
  if (/חשבונית|invoice/.test(text)) return "invoice";
  if (["invoice", "credit_note", "settlement", "other"].includes(text)) return text as DocumentType;
  return "other";
}

function parseAllocationNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = normalizeText(raw).replace(/\D/g, "");
  return digits.length >= 8 ? digits : normalizeText(raw) || null;
}

function looksLikeStatementRow(item: RawExtraction["line_items"][number]): boolean {
  return Boolean(item.charged_amount || item.paid_amount || item.outstanding_amount || item.document_number);
}

/** Convert a raw, model-produced extraction into the canonical record. */
export function canonicalize(raw: RawExtraction): CanonicalResult {
  const derived: string[] = [];
  const unparsed: string[] = [];
  const monthOnly: string[] = [];

  const lastDayOfMonth = (isoDate: string): string => {
    const [year, month] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month, 0));
    return date.toISOString().slice(0, 10);
  };

  const parseDateField = (name: string, value: string | null | undefined) => {
    if (!value) return null;
    const parsed = parseHebrewDate(value);
    if (!parsed) {
      unparsed.push(name);
      return null;
    }
    if (parsed.granularity === "month") {
      monthOnly.push(name);
      if (name === "period_end") return lastDayOfMonth(parsed.iso);
    }
    return parsed.iso;
  };

  const parseAmountField = (name: string, value: string | null | undefined) => {
    if (!value) return null;
    const parsed = parseAmount(value);
    if (parsed === null) unparsed.push(name);
    return parsed;
  };

  const documentType = parseDocumentType(raw.document_type?.value);
  const isSettlement = documentType === "settlement";
  const supplierName = normalizeSupplierName(raw.supplier_name.value);

  const currency =
    detectCurrency(raw.currency.value) ??
    detectCurrency(raw.total_amount.value) ??
    detectCurrency(raw.outstanding_balance?.value) ??
    detectCurrency(raw.total_charges?.value) ??
    detectCurrency(raw.subtotal.value) ??
    null;

  let subtotal = parseAmountField("subtotal", raw.subtotal.value);
  let vatAmount = parseAmountField("vat_amount", raw.vat_amount.value);
  let totalAmount = parseAmountField("total_amount", raw.total_amount.value);
  let vatRate = parseRate(raw.vat_rate.value);
  let totalCharges = parseAmountField("total_charges", raw.total_charges?.value);
  let totalPayments = parseAmountField("total_payments", raw.total_payments?.value);
  let outstandingBalance = parseAmountField("outstanding_balance", raw.outstanding_balance?.value);

  if (!isSettlement) {
    const present = [subtotal, vatAmount, totalAmount].filter((v) => v !== null).length;
    if (present === 2) {
      if (totalAmount === null && subtotal !== null && vatAmount !== null) {
        totalAmount = round2(subtotal + vatAmount);
        derived.push("total_amount");
      } else if (vatAmount === null && subtotal !== null && totalAmount !== null) {
        vatAmount = round2(totalAmount - subtotal);
        derived.push("vat_amount");
      } else if (subtotal === null && totalAmount !== null && vatAmount !== null) {
        subtotal = round2(totalAmount - vatAmount);
        derived.push("subtotal");
      }
    }
    if (vatRate === null && subtotal !== null && vatAmount !== null && Math.abs(subtotal) > ROUNDING) {
      vatRate = round2(vatAmount / subtotal);
      derived.push("vat_rate");
    }
  }

  const invoiceLineItems: InvoiceLineItem[] = [];
  const settlementLineItems: StatementLineItem[] = [];

  for (const [index, item] of raw.line_items.entries()) {
    if (isSettlement || looksLikeStatementRow(item)) {
      let charged = parseAmount(item.charged_amount ?? null);
      let paid = parseAmount(item.paid_amount ?? null);
      let outstanding = parseAmount(item.outstanding_amount ?? null);
      if (outstanding === null && charged !== null && paid !== null) {
        outstanding = round2(charged - paid);
        derived.push(`settlement_line_items[${index}].outstanding_amount`);
      }
      settlementLineItems.push({
        document_date: parseDateField(`settlement_line_items[${index}].document_date`, item.document_date),
        document_number: item.document_number ? normalizeText(item.document_number) : null,
        description: item.description ? normalizeText(item.description) : null,
        charged_amount: charged,
        paid_amount: paid,
        outstanding_amount: outstanding,
      });
      continue;
    }
    invoiceLineItems.push({
      line_number: item.line_number ? normalizeText(item.line_number) : null,
      description: item.description ? normalizeText(item.description) : null,
      quantity: parseAmount(item.quantity ?? null),
      unit_of_measure: item.unit_of_measure ? normalizeText(item.unit_of_measure) : null,
      unit_price: parseAmount(item.unit_price ?? null),
      amount: parseAmount(item.amount ?? null),
      vat_rate: parseRate(item.vat_rate ?? null),
      vat_amount: parseAmount(item.vat_amount ?? null),
    });
  }

  if (isSettlement && settlementLineItems.length > 0) {
    const sumCharged = settlementLineItems.reduce((acc, item) => acc + (item.charged_amount ?? 0), 0);
    const sumPaid = settlementLineItems.reduce((acc, item) => acc + (item.paid_amount ?? 0), 0);
    const sumOutstanding = settlementLineItems.reduce((acc, item) => acc + (item.outstanding_amount ?? 0), 0);
    if (totalCharges === null) {
      totalCharges = round2(sumCharged);
      derived.push("total_charges");
    }
    if (totalPayments === null) {
      totalPayments = round2(sumPaid);
      derived.push("total_payments");
    }
    if (outstandingBalance === null) {
      outstandingBalance = round2(sumOutstanding);
      derived.push("outstanding_balance");
    }
  } else if (isSettlement) {
    const present = [totalCharges, totalPayments, outstandingBalance].filter((v) => v !== null).length;
    if (present === 2) {
      if (outstandingBalance === null && totalCharges !== null && totalPayments !== null) {
        outstandingBalance = round2(totalCharges - totalPayments);
        derived.push("outstanding_balance");
      } else if (totalPayments === null && totalCharges !== null && outstandingBalance !== null) {
        totalPayments = round2(totalCharges - outstandingBalance);
        derived.push("total_payments");
      } else if (totalCharges === null && totalPayments !== null && outstandingBalance !== null) {
        totalCharges = round2(totalPayments + outstandingBalance);
        derived.push("total_charges");
      }
    }
  }

  const invoice: CanonicalInvoice = {
    document_type: documentType,
    document_number: raw.document_number.value ? normalizeText(raw.document_number.value) : null,
    document_date: parseDateField("document_date", raw.document_date.value),
    period_start: parseDateField("period_start", raw.period_start.value),
    period_end: parseDateField("period_end", raw.period_end.value),
    supplier_name: supplierName,
    supplier_key: supplierKey(raw.supplier_name.value),
    supplier_id: raw.supplier_id?.value ? normalizeText(raw.supplier_id.value) : null,
    supplier_tax_id: parseTaxId(raw.supplier_tax_id.value),
    customer_name: normalizeSupplierName(raw.customer_name?.value),
    purchase_order_number: raw.purchase_order_number?.value ? normalizeText(raw.purchase_order_number.value) : null,
    contract_number: raw.contract_number?.value ? normalizeText(raw.contract_number.value) : null,
    reference_number: raw.reference_number?.value ? normalizeText(raw.reference_number.value) : null,
    allocation_number: parseAllocationNumber(raw.allocation_number?.value),
    currency,
    subtotal,
    vat_amount: vatAmount,
    vat_rate: vatRate,
    total_amount: totalAmount,
    total_charges: totalCharges,
    total_payments: totalPayments,
    outstanding_balance: outstandingBalance,
    payment_terms: raw.payment_terms?.value ? normalizeText(raw.payment_terms.value) : null,
    due_date: parseDateField("due_date", raw.due_date?.value ?? null),
    invoice_line_items: invoiceLineItems,
    settlement_line_items: settlementLineItems,
    notes: raw.notes?.value ? normalizeText(raw.notes.value) : null,
  };

  return { invoice, derived, unparsed, monthOnly };
}

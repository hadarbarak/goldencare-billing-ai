import { z } from "zod";

/**
 * Two-layer schema.
 *
 * Layer 1 (`RawExtraction`) is verbatim text from the supplier document.
 * Layer 2 (`CanonicalInvoice` / `SettlementForm`) is produced by deterministic
 * code. Master-data fields used later by an ERP (GL account, cost center,
 * company code, vendor ID) are intentionally absent: they are enrichment,
 * not extraction.
 *
 * A supplier settlement form is not an invoice with a service period. Header
 * fields are shared; line-item shape follows `document_type`.
 */

const emptyRawField = { value: null, source_text: null };

function coerceRawField(val: unknown) {
  if (val == null) return emptyRawField;
  if (typeof val === "string" || typeof val === "number") {
    const text = String(val);
    return { value: text, source_text: text };
  }
  if (typeof val === "object" && "value" in val) {
    const obj = val as { value: unknown; source_text?: unknown };
    return {
      value: obj.value == null ? null : String(obj.value),
      source_text: obj.source_text == null ? null : String(obj.source_text),
    };
  }
  return emptyRawField;
}

const rawField = z.preprocess(
  coerceRawField,
  z.object({
    value: z.string().nullable(),
    source_text: z.string().nullable(),
  }),
);

function coerceRawLineString(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object" && val !== null && "value" in val) {
    const inner = (val as { value: unknown }).value;
    return inner == null ? null : String(inner);
  }
  return null;
}

const rawLineString = z.preprocess(coerceRawLineString, z.string().nullable());

export type RawField = z.infer<typeof rawField>;

export const rawLineItemSchema = z.object({
  line_number: rawLineString.optional(),
  description: rawLineString,
  quantity: rawLineString.optional(),
  unit_of_measure: rawLineString.optional(),
  unit_price: rawLineString.optional(),
  amount: rawLineString.optional(),
  vat_rate: rawLineString.optional(),
  vat_amount: rawLineString.optional(),
  document_date: rawLineString.optional(),
  document_number: rawLineString.optional(),
  charged_amount: rawLineString.optional(),
  paid_amount: rawLineString.optional(),
  outstanding_amount: rawLineString.optional(),
});

export const rawExtractionSchema = z.object({
  document_type: rawField.optional(),
  document_number: rawField,
  document_date: rawField,
  period_start: rawField,
  period_end: rawField,
  supplier_name: rawField,
  supplier_id: rawField.optional(),
  supplier_tax_id: rawField,
  customer_name: rawField.optional(),
  purchase_order_number: rawField.optional(),
  contract_number: rawField.optional(),
  reference_number: rawField.optional(),
  allocation_number: rawField.optional(),
  currency: rawField,
  subtotal: rawField,
  vat_amount: rawField,
  vat_rate: rawField,
  total_amount: rawField,
  total_charges: rawField.optional(),
  total_payments: rawField.optional(),
  outstanding_balance: rawField.optional(),
  payment_terms: rawField.optional(),
  due_date: rawField.optional(),
  line_items: z.array(rawLineItemSchema).catch([]),
  notes: rawField.optional(),
});

export type RawExtraction = z.infer<typeof rawExtractionSchema>;

export const rawExtractionJsonSchema = z.toJSONSchema(rawExtractionSchema, {
  target: "draft-2020-12",
});

export const DOCUMENT_TYPES = ["invoice", "credit_note", "settlement", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const invoiceLineItemSchema = z.object({
  line_number: z.string().nullable().optional(),
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_of_measure: z.string().nullable().optional(),
  unit_price: z.number().nullable(),
  amount: z.number().nullable(),
  vat_rate: z.number().nullable().optional(),
  vat_amount: z.number().nullable().optional(),
});

export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;
/** @deprecated Use InvoiceLineItem. Kept as an alias for scoring helpers. */
export type LineItem = InvoiceLineItem;

export const statementLineItemSchema = z.object({
  document_date: z.string().nullable(),
  document_number: z.string().nullable(),
  description: z.string().nullable(),
  charged_amount: z.number().nullable(),
  paid_amount: z.number().nullable(),
  outstanding_amount: z.number().nullable(),
});

export type StatementLineItem = z.infer<typeof statementLineItemSchema>;

export const canonicalInvoiceSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES).nullable(),
  document_number: z.string().nullable(),
  document_date: z.string().nullable(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  supplier_name: z.string().nullable(),
  supplier_key: z.string().nullable(),
  supplier_id: z.string().nullable(),
  supplier_tax_id: z.string().nullable(),
  customer_name: z.string().nullable(),
  purchase_order_number: z.string().nullable(),
  contract_number: z.string().nullable(),
  reference_number: z.string().nullable(),
  allocation_number: z.string().nullable(),
  currency: z.string().nullable(),
  subtotal: z.number().nullable(),
  vat_amount: z.number().nullable(),
  vat_rate: z.number().nullable(),
  total_amount: z.number().nullable(),
  total_charges: z.number().nullable(),
  total_payments: z.number().nullable(),
  outstanding_balance: z.number().nullable(),
  payment_terms: z.string().nullable(),
  due_date: z.string().nullable(),
  invoice_line_items: z.array(invoiceLineItemSchema),
  settlement_line_items: z.array(statementLineItemSchema),
  notes: z.string().nullable().optional(),
});

export type CanonicalInvoice = z.infer<typeof canonicalInvoiceSchema>;

export const EMPTY_CANONICAL: CanonicalInvoice = {
  document_type: null,
  document_number: null,
  document_date: null,
  period_start: null,
  period_end: null,
  supplier_name: null,
  supplier_key: null,
  supplier_id: null,
  supplier_tax_id: null,
  customer_name: null,
  purchase_order_number: null,
  contract_number: null,
  reference_number: null,
  allocation_number: null,
  currency: null,
  subtotal: null,
  vat_amount: null,
  vat_rate: null,
  total_amount: null,
  total_charges: null,
  total_payments: null,
  outstanding_balance: null,
  payment_terms: null,
  due_date: null,
  invoice_line_items: [],
  settlement_line_items: [],
  notes: null,
};

export function emptyRawExtraction(): RawExtraction {
  const empty = { value: null, source_text: null };
  return {
    document_type: empty,
    document_number: empty,
    document_date: empty,
    period_start: empty,
    period_end: empty,
    supplier_name: empty,
    supplier_id: empty,
    supplier_tax_id: empty,
    customer_name: empty,
    purchase_order_number: empty,
    contract_number: empty,
    reference_number: empty,
    allocation_number: empty,
    currency: empty,
    subtotal: empty,
    vat_amount: empty,
    vat_rate: empty,
    total_amount: empty,
    total_charges: empty,
    total_payments: empty,
    outstanding_balance: empty,
    payment_terms: empty,
    due_date: empty,
    line_items: [],
    notes: empty,
  };
}

/** Fields scored when the ground-truth value is present on that document. */
export const SCORED_FIELDS = [
  "document_type",
  "document_number",
  "document_date",
  "period_start",
  "period_end",
  "supplier_name",
  "supplier_id",
  "supplier_tax_id",
  "customer_name",
  "purchase_order_number",
  "contract_number",
  "allocation_number",
  "currency",
  "subtotal",
  "vat_amount",
  "total_amount",
  "total_charges",
  "total_payments",
  "outstanding_balance",
  "payment_terms",
  "due_date",
] as const;

export type ScoredField = (typeof SCORED_FIELDS)[number];

export const settlementInvoiceLineSchema = z.object({
  lineNumber: z.string().nullable(),
  description: z.string(),
  quantity: z.number().nullable(),
  unitOfMeasure: z.string().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
  vatRate: z.number().nullable(),
  vatAmount: z.number().nullable(),
});

export const settlementStatementLineSchema = z.object({
  documentDate: z.string().nullable(),
  documentNumber: z.string().nullable(),
  description: z.string(),
  chargedAmount: z.number().nullable(),
  paidAmount: z.number().nullable(),
  outstandingAmount: z.number().nullable(),
});

export const settlementFormSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES).nullable(),
  documentNumber: z.string().nullable(),
  documentDate: z.string().nullable(),
  servicePeriodStart: z.string().nullable(),
  servicePeriodEnd: z.string().nullable(),
  supplierName: z.string().nullable(),
  supplierId: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  customerName: z.string().nullable(),
  purchaseOrderNumber: z.string().nullable(),
  contractNumber: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  allocationNumber: z.string().nullable(),
  currency: z.string().nullable(),
  subtotal: z.number().nullable(),
  vatRate: z.number().nullable(),
  vatAmount: z.number().nullable(),
  totalAmount: z.number().nullable(),
  totalCharges: z.number().nullable(),
  totalPayments: z.number().nullable(),
  outstandingBalance: z.number().nullable(),
  paymentTerms: z.string().nullable(),
  dueDate: z.string().nullable(),
  invoiceLineItems: z.array(settlementInvoiceLineSchema),
  settlementLineItems: z.array(settlementStatementLineSchema),
  notes: z.string().nullable(),
});

export type SettlementForm = z.infer<typeof settlementFormSchema>;

export function toSettlementForm(invoice: CanonicalInvoice): SettlementForm {
  return {
    documentType: invoice.document_type,
    documentNumber: invoice.document_number,
    documentDate: invoice.document_date,
    servicePeriodStart: invoice.period_start,
    servicePeriodEnd: invoice.period_end,
    supplierName: invoice.supplier_name,
    supplierId: invoice.supplier_id,
    supplierTaxId: invoice.supplier_tax_id,
    customerName: invoice.customer_name,
    purchaseOrderNumber: invoice.purchase_order_number,
    contractNumber: invoice.contract_number,
    referenceNumber: invoice.reference_number,
    allocationNumber: invoice.allocation_number,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    vatRate: invoice.vat_rate,
    vatAmount: invoice.vat_amount,
    totalAmount: invoice.total_amount,
    totalCharges: invoice.total_charges,
    totalPayments: invoice.total_payments,
    outstandingBalance: invoice.outstanding_balance,
    paymentTerms: invoice.payment_terms,
    dueDate: invoice.due_date,
    invoiceLineItems: (invoice.invoice_line_items ?? []).map((item) => ({
      lineNumber: item.line_number ?? null,
      description: item.description ?? "",
      quantity: item.quantity,
      unitOfMeasure: item.unit_of_measure ?? null,
      unitPrice: item.unit_price,
      amount: item.amount,
      vatRate: item.vat_rate ?? null,
      vatAmount: item.vat_amount ?? null,
    })),
    settlementLineItems: (invoice.settlement_line_items ?? []).map((item) => ({
      documentDate: item.document_date,
      documentNumber: item.document_number,
      description: item.description ?? "",
      chargedAmount: item.charged_amount,
      paidAmount: item.paid_amount,
      outstandingAmount: item.outstanding_amount,
    })),
    notes: invoice.notes ?? null,
  };
}

export function financeAmount(form: SettlementForm): number | null {
  if (form.documentType === "settlement") return form.outstandingBalance;
  return form.totalAmount;
}

export const REGRESSION_DISPLAY_FIELDS = [
  { field: "supplier_name", label: "Supplier" },
  { field: "document_date", label: "Date" },
  { field: "total_amount", label: "Invoice total" },
  { field: "outstanding_balance", label: "Outstanding" },
  { field: "vat_amount", label: "VAT" },
  { field: "purchase_order_number", label: "PO" },
  { field: "allocation_number", label: "Allocation #" },
  { field: "line_items", label: "Line items" },
] as const;

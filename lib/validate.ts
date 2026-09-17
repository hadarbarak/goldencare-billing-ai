import type { CanonicalInvoice, RawExtraction, RawField } from "@/lib/schema";
import { emptyRawExtraction } from "@/lib/schema";
import { canonicalize, type CanonicalResult } from "@/lib/normalize/canonical";
import { normalizeText } from "@/lib/normalize/hebrew";

export { emptyRawExtraction };

export type IssueSeverity = "error" | "warning";
export type IssueLayer = "schema" | "business";

export interface Issue {
  code: string;
  field?: string;
  message: string;
  severity: IssueSeverity;
  layer: IssueLayer;
}

export type ExtractionStatus = "processed" | "needs_review" | "failed";

export interface ValidationResult {
  status: ExtractionStatus;
  issues: Issue[];
  canonical: CanonicalResult;
}

const MONEY_TOLERANCE = 0.05;

const RAW_PROVENANCE_FIELDS: Array<keyof RawExtraction> = [
  "supplier_name",
  "supplier_tax_id",
  "document_number",
  "document_date",
  "period_start",
  "period_end",
  "subtotal",
  "vat_amount",
  "total_amount",
  "purchase_order_number",
  "allocation_number",
  "customer_name",
  "total_charges",
  "total_payments",
  "outstanding_balance",
];

function nearlyEqual(a: number, b: number, tolerance = MONEY_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

function collapse(text: string): string {
  return normalizeText(text).replace(/\s+/g, "");
}

export function documentContains(documentText: string, needle: string): boolean {
  if (!needle.trim()) return false;
  const hay = normalizeText(documentText);
  const n = normalizeText(needle);
  if (hay.includes(n)) return true;
  return collapse(hay).includes(collapse(n));
}

function provenanceIssues(raw: RawExtraction, ...documentTexts: Array<string | null | undefined>): Issue[] {
  const documentText = documentTexts.filter((text): text is string => Boolean(text && text.trim())).join("\n");
  if (!documentText || normalizeText(documentText).length < 20) {
    return [
      {
        code: "provenance_skipped",
        severity: "warning",
        layer: "business",
        message: "אין שכבת טקסט מספיקה לאימות provenance.",
      },
    ];
  }

  const issues: Issue[] = [];
  for (const field of RAW_PROVENANCE_FIELDS) {
    const rawField = raw[field] as RawField | undefined;
    if (!rawField?.value) continue;
    const snippet = rawField.source_text || rawField.value;
    if (!documentContains(documentText, snippet) && !documentContains(documentText, rawField.value)) {
      issues.push({
        code: "provenance_mismatch",
        field,
        severity: "error",
        layer: "business",
        message: `הערך ב-${field} לא נמצא במסמך. ייתכן שהמודל המציא אותו.`,
      });
    }
  }
  return issues;
}

function isIsoDate(value: string | null): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function statusFromIssues(issues: Issue[]): ExtractionStatus {
  const schemaFailed = issues.some((issue) => issue.layer === "schema" && issue.severity === "error");
  const businessFailed = issues.some((issue) => issue.layer === "business" && issue.severity === "error");
  return schemaFailed ? "failed" : businessFailed ? "needs_review" : "processed";
}

/** Schema + arithmetic only. Used after human correction; provenance is not re-applied. */
export function validateCanonical(invoice: CanonicalInvoice): { status: ExtractionStatus; issues: Issue[] } {
  const issues = collectIntegrityIssues(invoice);
  return { status: statusFromIssues(issues), issues };
}

function collectIntegrityIssues(invoice: CanonicalInvoice): Issue[] {
  const issues: Issue[] = [];

  if (!invoice.supplier_name) {
    issues.push({
      code: "missing_required",
      field: "supplierName",
      layer: "schema",
      severity: "error",
      message: "חסר שם ספק",
    });
  }

  if (invoice.document_type === "settlement") {
    if (invoice.outstanding_balance === null) {
      issues.push({
        code: "invalid_total",
        field: "outstandingBalance",
        layer: "schema",
        severity: "error",
        message: "חסרה יתרת חוב בטופס התחשבנות",
      });
    }
  } else if (invoice.total_amount === null || invoice.total_amount <= 0) {
    issues.push({
      code: "invalid_total",
      field: "totalAmount",
      layer: "schema",
      severity: "error",
      message: "סה\"כ חייב להיות מספר גדול מאפס",
    });
  }

  if (!isIsoDate(invoice.document_date)) {
    issues.push({
      code: "invalid_date",
      field: "documentDate",
      layer: "schema",
      severity: "error",
      message: "תאריך מסמך חסר או לא תקין",
    });
  }

  if (!Array.isArray(invoice.invoice_line_items) || !Array.isArray(invoice.settlement_line_items)) {
    issues.push({
      code: "invalid_line_items",
      field: "lineItems",
      layer: "schema",
      severity: "error",
      message: "פירוט שורות חייב להיות מערך",
    });
  }

  if (invoice.document_type === "settlement") {
    const charged = invoice.settlement_line_items
      .map((item) => item.charged_amount)
      .filter((amount): amount is number => amount !== null);
    const paid = invoice.settlement_line_items
      .map((item) => item.paid_amount)
      .filter((amount): amount is number => amount !== null);
    if (charged.length > 0 && paid.length > 0 && invoice.outstanding_balance !== null) {
      const expectedBalance = charged.reduce((acc, n) => acc + n, 0) - paid.reduce((acc, n) => acc + n, 0);
      if (!nearlyEqual(expectedBalance, invoice.outstanding_balance)) {
        issues.push({
          code: "settlement_balance_mismatch",
          field: "outstandingBalance",
          layer: "business",
          severity: "error",
          message: `Σ חיובים − Σ תשלומים (${expectedBalance.toFixed(2)}) ≠ יתרת חוב (${invoice.outstanding_balance})`,
        });
      }
    }
    if (
      invoice.total_charges !== null &&
      invoice.total_payments !== null &&
      invoice.outstanding_balance !== null &&
      !nearlyEqual(invoice.total_charges - invoice.total_payments, invoice.outstanding_balance)
    ) {
      issues.push({
        code: "settlement_header_mismatch",
        field: "outstandingBalance",
        layer: "business",
        severity: "error",
        message: `סה"כ חיובים (${invoice.total_charges}) − סה"כ תשלומים (${invoice.total_payments}) ≠ יתרה (${invoice.outstanding_balance})`,
      });
    }
  } else {
    if (invoice.subtotal !== null && invoice.vat_amount !== null && invoice.total_amount !== null) {
      if (!nearlyEqual(invoice.subtotal + invoice.vat_amount, invoice.total_amount)) {
        issues.push({
          code: "arithmetic_mismatch",
          field: "totalAmount",
          layer: "business",
          severity: "error",
          message: `לפני מע"מ (${invoice.subtotal}) + מע"מ (${invoice.vat_amount}) ≠ סה"כ (${invoice.total_amount})`,
        });
      }
    }

    const lineAmounts = invoice.invoice_line_items
      .map((item) => item.amount)
      .filter((amount): amount is number => amount !== null);
    if (lineAmounts.length > 0 && invoice.subtotal !== null) {
      const lineSum = lineAmounts.reduce((acc, n) => acc + n, 0);
      if (!nearlyEqual(lineSum, invoice.subtotal)) {
        issues.push({
          code: "line_items_sum_mismatch",
          field: "lineItems",
          layer: "business",
          severity: "warning",
          message: `סכום השורות (${lineSum.toFixed(2)}) לא תואם את הסכום לפני מע"מ (${invoice.subtotal})`,
        });
      }
    }
  }

  if (invoice.period_start && invoice.period_end && invoice.period_start > invoice.period_end) {
    issues.push({
      code: "period_order",
      field: "period",
      layer: "business",
      severity: "error",
      message: "תאריך סיום התקופה מוקדם מתאריך ההתחלה",
    });
  }

  return issues;
}

/**
 * Schema validation first (can the record exist?), then business rules
 * (do the numbers and evidence hold up?).
 *
 * Failed       — schema broken; not written to Excel at all.
 * Needs Review — identifiable form; written as held_for_review, excluded from totals.
 * Processed    — both layers passed; written as active (the finance source of truth).
 */
export function validateExtraction(
  raw: RawExtraction,
  documentText: string | null,
  rawPdfText?: string | null,
): ValidationResult {
  const canonical = canonicalize(raw);
  const issues = collectIntegrityIssues(canonical.invoice);

  for (const field of canonical.unparsed) {
    issues.push({
      code: "unparsed_field",
      field,
      layer: "business",
      severity: "error",
      message: `המודל החזיר ערך ב-${field} אבל לא הצלחנו לפרסר אותו`,
    });
  }

  for (const field of canonical.monthOnly) {
    issues.push({
      code: "month_only_date",
      field,
      layer: "business",
      severity: "warning",
      message: `${field} פורש כחודש בלי יום מדויק`,
    });
  }

  for (const field of canonical.derived) {
    issues.push({
      code: "derived_field",
      field,
      layer: "business",
      severity: "warning",
      message: `${field} חושב אריתמטית ולא נקרא מהמסמך`,
    });
  }

  issues.push(...provenanceIssues(raw, documentText, rawPdfText));

  return { status: statusFromIssues(issues), issues, canonical };
}

export function normalizeStatus(status: string): ExtractionStatus | "duplicate" {
  if (status === "ok" || status === "processed") return "processed";
  if (status === "failed") return "failed";
  if (status === "duplicate") return "duplicate";
  return "needs_review";
}

export function llmUnavailableIssue(detail: string): Issue {
  return {
    code: "LLM_ERROR",
    layer: "schema",
    severity: "error",
    message: `Extraction service unavailable / invalid model response${detail ? `: ${detail}` : ""}`,
  };
}

export function visionUnavailableIssue(detail: string): Issue {
  return {
    code: "VISION_ERROR",
    layer: "schema",
    severity: "error",
    message: `Could not rasterize a scanned document for the vision model${detail ? `: ${detail}` : ""}`,
  };
}

export function summarizeInvoice(invoice: CanonicalInvoice): string {
  const name = invoice.supplier_name ?? "ספק לא ידוע";
  const total =
    invoice.document_type === "settlement"
      ? invoice.outstanding_balance !== null
        ? String(invoice.outstanding_balance)
        : "—"
      : invoice.total_amount !== null
        ? String(invoice.total_amount)
        : "—";
  const date = invoice.document_date ?? "—";
  return `${name} · ${date} · ${total} ${invoice.currency ?? ""}`.trim();
}

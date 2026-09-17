import type { CanonicalInvoice, InvoiceLineItem, ScoredField, StatementLineItem } from "@/lib/schema";
import { SCORED_FIELDS } from "@/lib/schema";
import { supplierKey } from "@/lib/normalize/hebrew";
import { LABELED_SUITE_SIZE } from "@/lib/fixtures/samples";

const MONEY_TOLERANCE = 0.02;

export interface FieldScore {
  field: ScoredField | "line_items";
  expected: unknown;
  actual: unknown;
  ok: boolean;
  skipped?: boolean;
}

export interface CaseScore {
  name: string;
  filename: string;
  fields: FieldScore[];
  scalarCorrect: number;
  scalarTotal: number;
  lineItemF1: number;
}

function numbersEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "number" || typeof b !== "number") return false;
  return Math.abs(a - b) <= MONEY_TOLERANCE;
}

function namesEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return supplierKey(a) === supplierKey(b) || a.trim() === b.trim();
}

function scalarEqual(field: ScoredField, expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true;
  if (field === "supplier_name" || field === "customer_name") return namesEqual(expected, actual);
  if (typeof expected === "number" || typeof actual === "number") return numbersEqual(expected, actual);
  return String(expected) === String(actual);
}

function invoiceLineKey(item: InvoiceLineItem): string {
  return `${(item.description || "").trim()}|${item.amount ?? ""}`;
}

function statementLineKey(item: StatementLineItem): string {
  return `${item.document_number || item.description || ""}|${item.charged_amount ?? ""}`;
}

export function lineItemF1<T>(expected: T[], actual: T[], keyOf: (item: T) => string): number {
  if (expected.length === 0 && actual.length === 0) return 1;
  const expectedKeys = expected.map(keyOf);
  const actualKeys = actual.map(keyOf);
  let overlap = 0;
  const used = new Set<number>();
  for (const key of expectedKeys) {
    const idx = actualKeys.findIndex((candidate, i) => candidate === key && !used.has(i));
    if (idx >= 0) {
      used.add(idx);
      overlap += 1;
    }
  }
  const precision = actualKeys.length ? overlap / actualKeys.length : 0;
  const recall = expectedKeys.length ? overlap / expectedKeys.length : 0;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function present(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Score only fields that appear on this document. A missing Cost Center / GL
 * account is not a model failure — it was never on the page.
 */
export function scoreCase(name: string, filename: string, expected: CanonicalInvoice, actual: CanonicalInvoice): CaseScore {
  const fields: FieldScore[] = [];
  for (const field of SCORED_FIELDS) {
    if (!present(expected[field])) continue;
    fields.push({
      field,
      expected: expected[field],
      actual: actual[field],
      ok: scalarEqual(field, expected[field], actual[field]),
    });
  }
  let lineItemF1Value = 1;
  if (expected.settlement_line_items.length > 0) {
    lineItemF1Value = lineItemF1(expected.settlement_line_items, actual.settlement_line_items, statementLineKey);
    fields.push({
      field: "line_items",
      expected: expected.settlement_line_items,
      actual: actual.settlement_line_items,
      ok: lineItemF1Value === 1,
    });
  } else if (expected.invoice_line_items.length > 0) {
    lineItemF1Value = lineItemF1(expected.invoice_line_items, actual.invoice_line_items, invoiceLineKey);
    fields.push({
      field: "line_items",
      expected: expected.invoice_line_items,
      actual: actual.invoice_line_items,
      ok: lineItemF1Value === 1,
    });
  }
  const scalars = fields.filter((item) => item.field !== "line_items");
  return {
    name,
    filename,
    fields,
    scalarCorrect: scalars.filter((item) => item.ok).length,
    scalarTotal: scalars.length,
    lineItemF1: lineItemF1Value,
  };
}

export function aggregateScores(cases: CaseScore[]) {
  const scalarCorrect = cases.reduce((acc, item) => acc + item.scalarCorrect, 0);
  const scalarTotal = cases.reduce((acc, item) => acc + item.scalarTotal, 0);
  const fieldAccuracy = scalarTotal === 0 ? 0 : scalarCorrect / scalarTotal;
  const withLines = cases.filter((item) => item.fields.some((field) => field.field === "line_items"));
  const lineItemF1Avg =
    withLines.length === 0 ? 1 : withLines.reduce((acc, item) => acc + item.lineItemF1, 0) / withLines.length;

  const byField: Record<string, { correct: number; total: number; accuracy: number }> = {};
  for (const field of [...SCORED_FIELDS, "line_items"] as const) {
    const relevant = cases.flatMap((item) => item.fields.filter((entry) => entry.field === field && !entry.skipped));
    const correct = relevant.filter((entry) => entry.ok).length;
    byField[field] = {
      correct,
      total: relevant.length,
      accuracy: relevant.length ? correct / relevant.length : 0,
    };
  }

  return {
    scalarCorrect,
    scalarTotal,
    fieldAccuracy,
    lineItemF1: lineItemF1Avg,
    byField,
    caveat: `n=${LABELED_SUITE_SIZE} מסמכים מתויגים, רק שדות שמופיעים במסמך. דיוק להשוואת פרומפטים, לא הבטחת ייצור.`,
  };
}

export function diffRuns(before: CaseScore[] | null, after: CaseScore[]) {
  if (!before) return after.map((item) => ({ filename: item.filename, changed: [] as string[] }));
  return after.map((item) => {
    const prev = before.find((c) => c.filename === item.filename);
    if (!prev) return { filename: item.filename, changed: ["new_case"] };
    const changed = item.fields
      .filter((field) => {
        const old = prev.fields.find((entry) => entry.field === field.field);
        return old && old.ok !== field.ok;
      })
      .map((field) => field.field);
    return { filename: item.filename, changed };
  });
}

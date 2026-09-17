import fs from "node:fs";
import ExcelJS from "exceljs";
import type { CanonicalInvoice } from "@/lib/schema";
import { paths } from "@/lib/paths";

export type LedgerStatus = "active" | "held_for_review" | "superseded";

export interface LedgerWriteInput {
  extractionId: number;
  documentId: number;
  messageId: string | null;
  sha256: string;
  filename: string;
  receivedAt: string;
  invoice: CanonicalInvoice;
  status: LedgerStatus;
}

export interface LedgerWriteResult {
  action: "inserted" | "skipped_duplicate" | "superseded" | "held_for_review" | "updated_review";
  excelRow: number | null;
}

const HEADERS = [
  "ledger_status",
  "extraction_id",
  "document_id",
  "message_id",
  "sha256",
  "filename",
  "received_at",
  "supplier_name",
  "supplier_key",
  "supplier_tax_id",
  "document_number",
  "document_date",
  "period_start",
  "period_end",
  "currency",
  "subtotal",
  "vat_amount",
  "vat_rate",
  "total_amount",
  "line_items_json",
  "written_at",
  "document_type",
  "supplier_id",
  "purchase_order_number",
  "contract_number",
  "reference_number",
  "allocation_number",
  "payment_terms",
  "due_date",
  "customer_name",
  "total_charges",
  "total_payments",
  "outstanding_balance",
] as const;

function invoiceFingerprint(invoice: CanonicalInvoice): string {
  return JSON.stringify({
    supplier_tax_id: invoice.supplier_tax_id,
    document_number: invoice.document_number,
    document_date: invoice.document_date,
    total_amount: invoice.total_amount,
    line_items: {
      invoice: invoice.invoice_line_items,
      settlement: invoice.settlement_line_items,
    },
    outstanding_balance: invoice.outstanding_balance,
  });
}

function sameInvoiceIdentity(a: ExcelJS.Row, invoice: CanonicalInvoice, messageId: string | null, sha256: string): boolean {
  const rowMessage = String(a.getCell(4).value ?? "");
  const rowHash = String(a.getCell(5).value ?? "");
  if (messageId && rowMessage === messageId && rowHash === sha256) return true;

  const taxId = String(a.getCell(10).value ?? "");
  const docNo = String(a.getCell(11).value ?? "");
  if (invoice.supplier_tax_id && invoice.document_number && taxId === invoice.supplier_tax_id && docNo === invoice.document_number) {
    return true;
  }
  return false;
}

async function loadWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(paths.excel)) {
    await workbook.xlsx.readFile(paths.excel);
    return workbook;
  }
  const sheet = workbook.addWorksheet("Invoices", { views: [{ rightToLeft: true }] });
  sheet.addRow([...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = HEADERS.map((header) => ({ header, width: Math.max(14, header.length + 2) }));
  const lines = workbook.addWorksheet("LineItems");
  lines.addRow([
    "extraction_id",
    "supplier_name",
    "kind",
    "line_number",
    "description",
    "quantity",
    "unit_of_measure",
    "unit_price",
    "amount",
    "document_number",
    "document_date",
    "charged_amount",
    "paid_amount",
    "outstanding_amount",
  ]);
  return workbook;
}

function rowValues(input: LedgerWriteInput, writtenAt: string): Array<string | number | null> {
  const { invoice } = input;
  return [
    input.status,
    input.extractionId,
    input.documentId,
    input.messageId,
    input.sha256,
    input.filename,
    input.receivedAt,
    invoice.supplier_name,
    invoice.supplier_key,
    invoice.supplier_tax_id,
    invoice.document_number,
    invoice.document_date,
    invoice.period_start,
    invoice.period_end,
    invoice.currency,
    invoice.subtotal,
    invoice.vat_amount,
    invoice.vat_rate,
    invoice.total_amount,
    JSON.stringify({
      invoice: invoice.invoice_line_items,
      settlement: invoice.settlement_line_items,
    }),
    writtenAt,
    invoice.document_type,
    invoice.supplier_id,
    invoice.purchase_order_number,
    invoice.contract_number,
    invoice.reference_number,
    invoice.allocation_number,
    invoice.payment_terms,
    invoice.due_date,
    invoice.customer_name,
    invoice.total_charges,
    invoice.total_payments,
    invoice.outstanding_balance,
  ];
}

async function withExcelLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  while (true) {
    try {
      fs.writeFileSync(paths.excelLock, String(process.pid), { flag: "wx" });
      break;
    } catch {
      try {
        const stat = fs.statSync(paths.excelLock);
        if (Date.now() - stat.mtimeMs > 30_000) fs.unlinkSync(paths.excelLock);
      } catch {
        /* lock disappeared */
      }
      if (Date.now() - start > 15_000) throw new Error("Excel lock timeout");
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      fs.unlinkSync(paths.excelLock);
    } catch {
      /* ignore */
    }
  }
}

/** Append or update the maintained workbook. Never silently duplicates a document. */
export async function writeLedger(input: LedgerWriteInput): Promise<LedgerWriteResult> {
  return withExcelLock(async () => {
    const workbook = await loadWorkbook();
    const sheet = workbook.getWorksheet("Invoices") ?? workbook.worksheets[0];
    const writtenAt = new Date().toISOString();

    let match: ExcelJS.Row | undefined;
    sheet.eachRow((row, number) => {
      if (number === 1 || match) return;
      if (sameInvoiceIdentity(row, input.invoice, input.messageId, input.sha256)) match = row;
    });

    if (match) {
      const previousStatus = String(match.getCell(1).value ?? "");
      const previousExtraction = Number(match.getCell(2).value ?? 0);
      const previousFingerprint = String(match.getCell(20).value ?? "") + String(match.getCell(19).value ?? "");
      const nextFingerprint =
        JSON.stringify(input.invoice.invoice_line_items) +
        JSON.stringify(input.invoice.settlement_line_items) +
        String(input.invoice.total_amount) +
        String(input.invoice.outstanding_balance);

      if (previousExtraction === input.extractionId) {
        match.values = [undefined, ...rowValues(input, writtenAt)];
        await workbook.xlsx.writeFile(paths.excel);
        return { action: "updated_review", excelRow: match.number };
      }

      if (previousStatus === "active" && nextFingerprint === previousFingerprint && input.status === "active") {
        return { action: "skipped_duplicate", excelRow: match.number };
      }

      match.getCell(1).value = "superseded";
      const added = sheet.addRow(rowValues(input, writtenAt));
      syncLineItems(workbook, input);
      await workbook.xlsx.writeFile(paths.excel);
      return { action: "superseded", excelRow: added.number };
    }

    const added = sheet.addRow(rowValues(input, writtenAt));
    syncLineItems(workbook, input);
    await workbook.xlsx.writeFile(paths.excel);
    return {
      action: input.status === "held_for_review" ? "held_for_review" : "inserted",
      excelRow: added.number,
    };
  });
}

function syncLineItems(workbook: ExcelJS.Workbook, input: LedgerWriteInput) {
  let sheet = workbook.getWorksheet("LineItems");
  if (!sheet) {
    sheet = workbook.addWorksheet("LineItems");
    sheet.addRow([
      "extraction_id",
      "supplier_name",
      "kind",
      "line_number",
      "description",
      "quantity",
      "unit_of_measure",
      "unit_price",
      "amount",
      "document_number",
      "document_date",
      "charged_amount",
      "paid_amount",
      "outstanding_amount",
    ]);
  }
  const keep: ExcelJS.Row[] = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    if (Number(row.getCell(1).value) !== input.extractionId) keep.push(row);
  });
  if (sheet.rowCount > 1) sheet.spliceRows(2, sheet.rowCount - 1);
  for (const item of input.invoice.invoice_line_items) {
    sheet.addRow([
      input.extractionId,
      input.invoice.supplier_name,
      "invoice",
      item.line_number ?? null,
      item.description,
      item.quantity,
      item.unit_of_measure ?? null,
      item.unit_price,
      item.amount,
      null,
      null,
      null,
      null,
      null,
    ]);
  }
  for (const item of input.invoice.settlement_line_items) {
    sheet.addRow([
      input.extractionId,
      input.invoice.supplier_name,
      "settlement",
      null,
      item.description,
      null,
      null,
      null,
      item.outstanding_amount,
      item.document_number,
      item.document_date,
      item.charged_amount,
      item.paid_amount,
      item.outstanding_amount,
    ]);
  }
}

function financeTotal(row: ExcelJS.Row): number {
  const docType = String(row.getCell(22).value ?? "");
  const invoiceTotal = Number(row.getCell(19).value ?? 0);
  const outstandingRaw = row.getCell(33).value;
  if (docType === "settlement" && outstandingRaw !== null && outstandingRaw !== undefined && outstandingRaw !== "") {
    const outstanding = Number(outstandingRaw);
    return Number.isFinite(outstanding) ? outstanding : 0;
  }
  return Number.isFinite(invoiceTotal) ? invoiceTotal : 0;
}

export async function readActiveLedgerRows(): Promise<
  Array<{
    status: string;
    supplier_name: string;
    supplier_key: string;
    document_date: string;
    total_amount: number;
    currency: string;
    filename: string;
  }>
> {
  if (!fs.existsSync(paths.excel)) return [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(paths.excel);
  const sheet = workbook.getWorksheet("Invoices");
  if (!sheet) return [];
  const rows: Array<{
    status: string;
    supplier_name: string;
    supplier_key: string;
    document_date: string;
    total_amount: number;
    currency: string;
    filename: string;
  }> = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    rows.push({
      status: String(row.getCell(1).value ?? ""),
      supplier_name: String(row.getCell(8).value ?? ""),
      supplier_key: String(row.getCell(9).value ?? ""),
      document_date: String(row.getCell(12).value ?? ""),
      total_amount: financeTotal(row),
      currency: String(row.getCell(15).value ?? "ILS"),
      filename: String(row.getCell(6).value ?? ""),
    });
  });
  return rows;
}

export function excelExists(): boolean {
  return fs.existsSync(paths.excel);
}

/** Used only to keep TypeScript from dropping the helper if tree-shaken. */
export const _fingerprint = invoiceFingerprint;

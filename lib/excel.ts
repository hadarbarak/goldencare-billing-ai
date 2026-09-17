import fs from "node:fs";
import ExcelJS from "exceljs";
import type { CanonicalInvoice } from "@/lib/schema";
import { getDb, listFinanceDocuments } from "@/lib/db";
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
  "document_type",
  "supplier_name",
  "supplier_tax_id",
  "supplier_id",
  "document_number",
  "document_date",
  "period_start",
  "period_end",
  "currency",
  "subtotal",
  "vat_amount",
  "vat_rate",
  "total_amount",
  "total_charges",
  "total_payments",
  "outstanding_balance",
  "payment_terms",
  "due_date",
  "purchase_order_number",
  "contract_number",
  "reference_number",
  "allocation_number",
  "customer_name",
  "written_at",
] as const;

const LINE_ITEM_HEADERS = [
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
] as const;

type HeaderName = (typeof HEADERS)[number];

function col(name: HeaderName): number {
  return HEADERS.indexOf(name) + 1;
}

function cellValue(row: ExcelJS.Row, name: HeaderName): ExcelJS.CellValue {
  return row.getCell(col(name)).value;
}

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
  const rowMessage = String(cellValue(a, "message_id") ?? "");
  const rowHash = String(cellValue(a, "sha256") ?? "");
  if (messageId && rowMessage === messageId && rowHash === sha256) return true;

  const taxId = String(cellValue(a, "supplier_tax_id") ?? "");
  const docNo = String(cellValue(a, "document_number") ?? "");
  if (invoice.supplier_tax_id && invoice.document_number && taxId === invoice.supplier_tax_id && docNo === invoice.document_number) {
    return true;
  }
  return false;
}

function invoiceContentFingerprint(invoice: CanonicalInvoice): string {
  return [
    String(invoice.total_amount ?? ""),
    String(invoice.total_charges ?? ""),
    String(invoice.total_payments ?? ""),
    String(invoice.outstanding_balance ?? ""),
  ].join("|");
}

function rowContentFingerprint(row: ExcelJS.Row): string {
  return [
    String(cellValue(row, "total_amount") ?? ""),
    String(cellValue(row, "total_charges") ?? ""),
    String(cellValue(row, "total_payments") ?? ""),
    String(cellValue(row, "outstanding_balance") ?? ""),
  ].join("|");
}

function scalar(value: ExcelJS.CellValue): string | number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value) return String((value as { text: string }).text ?? "");
  if (typeof value === "object" && "result" in value) return scalar((value as { result: ExcelJS.CellValue }).result);
  return String(value);
}

function headerNames(sheet: ExcelJS.Worksheet): string[] {
  const names: string[] = [];
  for (let i = 1; i <= 60; i += 1) {
    const value = sheet.getRow(1).getCell(i).value;
    if (value == null || value === "") break;
    names.push(String(value));
  }
  return names;
}

function headerRowMatches(sheet: ExcelJS.Worksheet): boolean {
  return HEADERS.every((header, index) => String(sheet.getRow(1).getCell(index + 1).value ?? "") === header);
}

function isCurrentLedger(workbook: ExcelJS.Workbook): boolean {
  const sheet = workbook.getWorksheet("Invoices") ?? workbook.worksheets[0];
  return Boolean(sheet && headerRowMatches(sheet) && workbook.getWorksheet("LineItems"));
}

function addLineItemHeader(sheet: ExcelJS.Worksheet) {
  sheet.addRow([...LINE_ITEM_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = LINE_ITEM_HEADERS.map((header) => ({ header, width: Math.max(14, header.length + 2) }));
}

function createWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Invoices", { views: [{ rightToLeft: true }] });
  sheet.addRow([...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = HEADERS.map((header) => ({ header, width: Math.max(14, header.length + 2) }));
  addLineItemHeader(workbook.addWorksheet("LineItems"));
  return workbook;
}

function migrateWorkbook(oldWorkbook: ExcelJS.Workbook): ExcelJS.Workbook {
  const fresh = createWorkbook();
  const oldSheet = oldWorkbook.getWorksheet("Invoices") ?? oldWorkbook.worksheets[0];
  const newSheet = fresh.getWorksheet("Invoices");
  if (!oldSheet || !newSheet) return fresh;

  const names = headerNames(oldSheet);
  oldSheet.eachRow((row, number) => {
    if (number === 1) return;
    const record: Record<string, ExcelJS.CellValue> = {};
    names.forEach((name, index) => {
      record[name] = row.getCell(index + 1).value;
    });
    newSheet.addRow(HEADERS.map((header) => scalar(record[header])));
    const json = record.line_items_json;
    if (json) {
      appendLegacyLineItems(
        fresh,
        Number(scalar(record.extraction_id) ?? 0),
        String(scalar(record.supplier_name) ?? ""),
        json,
      );
    }
  });

  const oldLines = oldWorkbook.getWorksheet("LineItems");
  const newLines = fresh.getWorksheet("LineItems");
  if (oldLines && newLines) {
    oldLines.eachRow((row, number) => {
      if (number === 1) return;
      newLines.addRow(LINE_ITEM_HEADERS.map((_, index) => scalar(row.getCell(index + 1).value)));
    });
  }
  return fresh;
}

function appendLegacyLineItems(
  workbook: ExcelJS.Workbook,
  extractionId: number,
  supplierName: string,
  json: ExcelJS.CellValue,
) {
  if (!extractionId) return;
  const sheet = workbook.getWorksheet("LineItems");
  if (!sheet) return;
  let exists = false;
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    if (Number(row.getCell(1).value ?? 0) === extractionId) exists = true;
  });
  if (exists) return;
  try {
    const parsed = JSON.parse(String(scalar(json) ?? "")) as {
      invoice?: CanonicalInvoice["invoice_line_items"];
      settlement?: CanonicalInvoice["settlement_line_items"];
    };
    for (const item of parsed.invoice ?? []) {
      sheet.addRow([
        extractionId,
        supplierName,
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
    for (const item of parsed.settlement ?? []) {
      sheet.addRow([
        extractionId,
        supplierName,
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
  } catch {
    /* ignore unreadable legacy JSON */
  }
}

function ledgerStatusFromExtraction(status: string | null): LedgerStatus | null {
  if (status === "processed") return "active";
  if (status === "needs_review") return "held_for_review";
  return null;
}

function backfillCurrentDocuments(workbook: ExcelJS.Workbook): boolean {
  const sheet = workbook.getWorksheet("Invoices");
  if (!sheet) return false;
  let changed = false;
  const writtenAt = new Date().toISOString();

  for (const row of listFinanceDocuments()) {
    if (!row.canonical_json || !row.extraction_id) continue;
    const status = ledgerStatusFromExtraction(row.status);
    if (!status) continue;
    let invoice: CanonicalInvoice;
    try {
      invoice = JSON.parse(row.canonical_json) as CanonicalInvoice;
    } catch {
      continue;
    }
    invoice.invoice_line_items ??= [];
    invoice.settlement_line_items ??= [];
    const meta = getDb()
      .prepare(`SELECT sha256, message_id FROM documents WHERE id = ?`)
      .get(row.document_id) as { sha256: string; message_id: string | null } | undefined;

    let exists = false;
    sheet.eachRow((existing, number) => {
      if (number === 1 || exists) return;
      if (sameInvoiceIdentity(existing, invoice, meta?.message_id ?? null, meta?.sha256 ?? "")) exists = true;
    });
    if (exists) continue;

    const input: LedgerWriteInput = {
      extractionId: row.extraction_id,
      documentId: row.document_id,
      messageId: meta?.message_id ?? null,
      sha256: meta?.sha256 ?? "",
      filename: row.filename,
      receivedAt: row.created_at,
      invoice,
      status,
    };
    sheet.addRow(rowValues(input, writtenAt));
    changed = true;
  }
  return changed;
}

async function loadWorkbook(): Promise<ExcelJS.Workbook> {
  let workbook: ExcelJS.Workbook;
  let dirty = false;
  if (fs.existsSync(paths.excel)) {
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(paths.excel);
    if (!isCurrentLedger(workbook)) {
      workbook = migrateWorkbook(workbook);
      dirty = true;
    }
  } else {
    workbook = createWorkbook();
    dirty = true;
  }
  if (backfillCurrentDocuments(workbook)) dirty = true;
  const lineCountBefore = workbook.getWorksheet("LineItems")?.rowCount ?? 0;
  rebuildLineItems(workbook);
  if ((workbook.getWorksheet("LineItems")?.rowCount ?? 0) !== lineCountBefore) dirty = true;
  if (dirty) await workbook.xlsx.writeFile(paths.excel);
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
    invoice.document_type,
    invoice.supplier_name,
    invoice.supplier_tax_id,
    invoice.supplier_id,
    invoice.document_number,
    invoice.document_date,
    invoice.period_start,
    invoice.period_end,
    invoice.currency,
    invoice.subtotal,
    invoice.vat_amount,
    invoice.vat_rate,
    invoice.total_amount,
    invoice.total_charges,
    invoice.total_payments,
    invoice.outstanding_balance,
    invoice.payment_terms,
    invoice.due_date,
    invoice.purchase_order_number,
    invoice.contract_number,
    invoice.reference_number,
    invoice.allocation_number,
    invoice.customer_name,
    writtenAt,
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

/** Rebuild ledger.xlsx when missing or still using a previous header layout. */
export async function ensureCurrentLedger(): Promise<void> {
  await withExcelLock(async () => {
    await loadWorkbook();
  });
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
      const previousStatus = String(cellValue(match, "ledger_status") ?? "");
      const previousExtraction = Number(cellValue(match, "extraction_id") ?? 0);
      const previousFingerprint = rowContentFingerprint(match);
      const nextFingerprint = invoiceContentFingerprint(input.invoice);

      if (previousExtraction === input.extractionId) {
        match.values = [undefined, ...rowValues(input, writtenAt)];
        rebuildLineItems(workbook);
        await workbook.xlsx.writeFile(paths.excel);
        return { action: "updated_review", excelRow: match.number };
      }

      if (previousStatus === "active" && nextFingerprint === previousFingerprint && input.status === "active") {
        return { action: "skipped_duplicate", excelRow: match.number };
      }

      match.getCell(col("ledger_status")).value = "superseded";
      const added = sheet.addRow(rowValues(input, writtenAt));
      rebuildLineItems(workbook);
      await workbook.xlsx.writeFile(paths.excel);
      return { action: "superseded", excelRow: added.number };
    }

    const added = sheet.addRow(rowValues(input, writtenAt));
    rebuildLineItems(workbook);
    await workbook.xlsx.writeFile(paths.excel);
    return {
      action: input.status === "held_for_review" ? "held_for_review" : "inserted",
      excelRow: added.number,
    };
  });
}

function rebuildLineItems(workbook: ExcelJS.Workbook) {
  const existing = workbook.getWorksheet("LineItems");
  if (existing) workbook.removeWorksheet(existing.id);
  const sheet = workbook.addWorksheet("LineItems");
  addLineItemHeader(sheet);

  const invoices = workbook.getWorksheet("Invoices");
  invoices?.eachRow((row, number) => {
    if (number === 1) return;
    const extractionId = Number(cellValue(row, "extraction_id") ?? 0);
    if (!extractionId) return;
    const rec = getDb()
      .prepare(`SELECT canonical_json FROM extractions WHERE id = ?`)
      .get(extractionId) as { canonical_json: string } | undefined;
    if (!rec?.canonical_json) return;
    let invoice: CanonicalInvoice;
    try {
      invoice = JSON.parse(rec.canonical_json) as CanonicalInvoice;
    } catch {
      return;
    }
    const supplierName = String(cellValue(row, "supplier_name") ?? invoice.supplier_name ?? "");
    for (const item of invoice.invoice_line_items ?? []) {
      sheet.addRow([
        extractionId,
        supplierName,
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
    for (const item of invoice.settlement_line_items ?? []) {
      sheet.addRow([
        extractionId,
        supplierName,
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
  });
}

function financeTotal(row: ExcelJS.Row): number {
  const docType = String(cellValue(row, "document_type") ?? "");
  const invoiceTotal = Number(cellValue(row, "total_amount") ?? 0);
  const outstandingRaw = cellValue(row, "outstanding_balance");
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
  return withExcelLock(async () => {
    const workbook = await loadWorkbook();
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
      const supplierName = String(cellValue(row, "supplier_name") ?? "");
      rows.push({
        status: String(cellValue(row, "ledger_status") ?? ""),
        supplier_name: supplierName,
        supplier_key: supplierName,
        document_date: String(cellValue(row, "document_date") ?? ""),
        total_amount: financeTotal(row),
        currency: String(cellValue(row, "currency") ?? "ILS"),
        filename: String(cellValue(row, "filename") ?? ""),
      });
    });
    return rows;
  });
}

export async function readLedgerBytes(): Promise<Buffer | null> {
  if (!fs.existsSync(paths.excel)) return null;
  return withExcelLock(async () => {
    await loadWorkbook();
    return fs.readFileSync(paths.excel);
  });
}

export function excelExists(): boolean {
  return fs.existsSync(paths.excel);
}

/** Used only to keep TypeScript from dropping the helper if tree-shaken. */
export const _fingerprint = invoiceFingerprint;

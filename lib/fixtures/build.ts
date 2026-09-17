import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { samples } from "@/lib/fixtures/samples";
import { paths } from "@/lib/paths";

const NOTO_URLS = [
  "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSansHebrew/full/ttf/NotoSansHebrew-Regular.ttf",
  "https://github.com/notofonts/notofonts.github.io/raw/main/fonts/NotoSansHebrew/full/ttf/NotoSansHebrew-Regular.ttf",
];

async function ensureHebrewFont(): Promise<string | null> {
  fs.mkdirSync(paths.fonts, { recursive: true });
  const dest = path.join(paths.fonts, "NotoSansHebrew-Regular.ttf");
  if (fs.existsSync(dest) && fs.statSync(dest).size > 20_000) return dest;

  try {
    for (const url of NOTO_URLS) {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 20_000) continue;
      fs.writeFileSync(dest, buf);
      return dest;
    }
    throw new Error("no working Noto URL");
  } catch (error) {
    console.warn("Noto Sans Hebrew download failed", error);
  }

  for (const candidate of ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf"]) {
    if (fs.existsSync(candidate)) {
      fs.copyFileSync(candidate, dest);
      return dest;
    }
  }
  return fs.existsSync(dest) ? dest : null;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;

type Align = "left" | "right" | "center";

interface TableColumn {
  header: string;
  width: number;
  align: Align;
}

interface TableBlock {
  kind: "table";
  columns: TableColumn[];
  rows: string[][];
}

interface LineBlock {
  kind: "line";
  text: string;
  title?: boolean;
}

type Block = TableBlock | LineBlock;

const SETTLEMENT_COLUMNS: TableColumn[] = [
  { header: "תאריך", width: 78, align: "center" },
  { header: "חשבונית", width: 70, align: "center" },
  { header: "תיאור", width: 145, align: "right" },
  { header: "חיוב", width: 72, align: "right" },
  { header: "שולם", width: 72, align: "right" },
  { header: "יתרה", width: 78, align: "right" },
];

const INVOICE_COLUMNS: TableColumn[] = [
  { header: "מס׳", width: 32, align: "center" },
  { header: "תיאור", width: 175, align: "right" },
  { header: "כמות", width: 48, align: "right" },
  { header: "יחידה", width: 56, align: "right" },
  { header: "מחיר", width: 88, align: "right" },
  { header: "סכום", width: 116, align: "right" },
];

const AMOUNT_COLUMNS: TableColumn[] = [
  { header: "תיאור", width: 360, align: "right" },
  { header: "סכום", width: 155, align: "right" },
];

const SETTLEMENT_ROW =
  /^(\d{1,2}[./]\d{1,2}[./]\d{2,4})\s+(\S+)\s+(.+?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s*$/;
const INVOICE_ROW =
  /^(?:(\d+)\s+)?(.+?)\s+(\d+(?:\.\d+)?)\s+(\S+)\s+x\s+([\d,]+(?:\.\d+)?)\s+=\s+([\d,]+(?:\.\d+)?)\s*$/;
const AMOUNT_ROW = /^(.+?)\s+([\d,]+(?:\.\d{2}))\s*$/;
const TOTAL_LINE = /סה["״]?כ|מע["״]?מ|לפני|לתשלום|יתרת|ביניים/;

function parseSettlementRow(line: string): string[] | null {
  const match = line.match(SETTLEMENT_ROW);
  if (!match) return null;
  return [match[1], match[2], match[3].trim(), match[4], match[5], match[6]];
}

function parseInvoiceRow(line: string): string[] | null {
  const match = line.match(INVOICE_ROW);
  if (!match) return null;
  return [match[1] ?? "", match[2].trim(), match[3], match[4], match[5], match[6]];
}

function parseAmountRow(line: string): string[] | null {
  if (TOTAL_LINE.test(line) || INVOICE_ROW.test(line) || SETTLEMENT_ROW.test(line)) return null;
  const match = line.match(AMOUNT_ROW);
  if (!match) return null;
  if (/[\u0590-\u05ff]/.test(match[1]) === false) return null;
  return [match[1].trim(), match[2]];
}

function collectRows(lines: string[], start: number, parse: (line: string) => string[] | null): { rows: string[][]; next: number } | null {
  const rows: string[][] = [];
  let i = start;
  while (i < lines.length) {
    const row = parse(lines[i]);
    if (!row) break;
    rows.push(row);
    i += 1;
  }
  return rows.length ? { rows, next: i } : null;
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  let sawTitle = false;
  while (i < lines.length) {
    const line = lines[i];
    if (/תאריך/.test(line) && /יתרה|שולם/.test(line) && /תיאור|חשבונית/.test(line)) {
      const collected = collectRows(lines, i + 1, parseSettlementRow);
      if (collected) {
        blocks.push({ kind: "table", columns: SETTLEMENT_COLUMNS, rows: collected.rows });
        i = collected.next;
        continue;
      }
    }
    const settlement = collectRows(lines, i, parseSettlementRow);
    if (settlement) {
      blocks.push({ kind: "table", columns: SETTLEMENT_COLUMNS, rows: settlement.rows });
      i = settlement.next;
      continue;
    }
    const invoice = collectRows(lines, i, parseInvoiceRow);
    if (invoice) {
      blocks.push({ kind: "table", columns: INVOICE_COLUMNS, rows: invoice.rows });
      i = invoice.next;
      continue;
    }
    const amounts = collectRows(lines, i, parseAmountRow);
    if (amounts) {
      blocks.push({ kind: "table", columns: AMOUNT_COLUMNS, rows: amounts.rows });
      i = amounts.next;
      continue;
    }
    blocks.push({ kind: "line", text: line, title: !sawTitle && line.trim().length > 0 });
    if (line.trim()) sawTitle = true;
    i += 1;
  }
  return blocks;
}

function columnXs(columns: TableColumn[]): number[] {
  const xs: number[] = [];
  let x = PAGE_WIDTH - MARGIN;
  for (const col of columns) {
    x -= col.width;
    xs.push(x);
  }
  return xs;
}

function drawPrepared(
  page: PDFPage,
  raw: string,
  opts: { x: number; y: number; width: number; font: PDFFont; hebrewFont: PDFFont; latin: PDFFont; size: number; align: Align },
) {
  const rtl = /[\u0590-\u05ff]/.test(raw);
  let font = opts.hebrewFont;
  let draw = rtl ? prepareHebrewDrawLine(raw) : raw;
  try {
    font.widthOfTextAtSize(draw, opts.size);
  } catch {
    draw = raw.replace(/[^\x00-\x7F]/g, "?");
    font = opts.latin;
  }
  let size = opts.size;
  const max = Math.max(8, opts.width - 8);
  while (size > 7 && font.widthOfTextAtSize(draw, size) > max) size -= 0.5;
  const tw = font.widthOfTextAtSize(draw, size);
  let x = opts.x + 4;
  if (opts.align === "right") x = opts.x + opts.width - 4 - tw;
  else if (opts.align === "center") x = opts.x + (opts.width - tw) / 2;
  page.drawText(draw, { x, y: opts.y, size, font, color: rgb(0.12, 0.12, 0.12) });
}

function drawTable(
  page: PDFPage,
  table: TableBlock,
  yTop: number,
  fonts: { hebrew: PDFFont; latin: PDFFont },
): number {
  const xs = columnXs(table.columns);
  const rowH = 22;
  const headerH = 24;
  const tableLeft = PAGE_WIDTH - MARGIN - TABLE_WIDTH;
  const headerColor = rgb(0.91, 0.94, 0.93);
  const grid = rgb(0.78, 0.82, 0.8);
  const headerY = yTop - headerH;

  page.drawRectangle({
    x: tableLeft,
    y: headerY,
    width: TABLE_WIDTH,
    height: headerH,
    color: headerColor,
    borderColor: grid,
    borderWidth: 0.8,
  });

  for (let c = 0; c < table.columns.length; c++) {
    drawPrepared(page, table.columns[c].header, {
      x: xs[c],
      y: headerY + 7,
      width: table.columns[c].width,
      font: fonts.hebrew,
      hebrewFont: fonts.hebrew,
      latin: fonts.latin,
      size: 9,
      align: "center",
    });
  }

  let y = headerY;
  table.rows.forEach((row, index) => {
    y -= rowH;
    if (index % 2 === 1) {
      page.drawRectangle({
        x: tableLeft,
        y,
        width: TABLE_WIDTH,
        height: rowH,
        color: rgb(0.97, 0.98, 0.97),
      });
    }
    page.drawRectangle({
      x: tableLeft,
      y,
      width: TABLE_WIDTH,
      height: rowH,
      borderColor: grid,
      borderWidth: 0.6,
    });
    row.forEach((cell, c) => {
      const col = table.columns[c];
      if (!col) return;
      drawPrepared(page, cell, {
        x: xs[c],
        y: y + 7,
        width: col.width,
        font: fonts.hebrew,
        hebrewFont: fonts.hebrew,
        latin: fonts.latin,
        size: 9,
        align: col.align,
      });
    });
  });

  for (let c = 1; c < table.columns.length; c++) {
    const x = xs[c] + table.columns[c].width;
    page.drawLine({
      start: { x, y: y },
      end: { x, y: yTop },
      thickness: 0.6,
      color: grid,
    });
  }

  return y - 10;
}

/**
 * pdf-lib + Hebrew fonts:
 * - RTL (Hebrew-first) lines: LTR runs are stored reversed; pre-reverse them.
 * - Mixed lines that start with a date/ID: the engine keeps LTR order and
 *   reverses Hebrew instead — so we pre-reverse only the Hebrew runs.
 */
function prepareHebrewDrawLine(line: string): string {
  if (!/[\u0590-\u05ff]/.test(line)) return line;
  if (/^[A-Za-z0-9]/.test(line.trimStart())) {
    return line.replace(/[\u0590-\u05ff]+(?:\s+[\u0590-\u05ff]+)*/g, (run) => [...run].reverse().join(""));
  }
  const prepared = line.replace(/[A-Za-z0-9][A-Za-z0-9/.,:+-]*/g, (token) => [...token].reverse().join(""));
  return `\u200F${prepared}`;
}

function wrapEml(sample: (typeof samples)[number], pdf: Buffer, messageId: string): string {
  const boundary = "gc-boundary-7a3f";
  const b64 = pdf.toString("base64").replace(/(.{76})/g, "$1\n");
  return [
    `From: ${sample.from}`,
    "To: finance@goldencare.example",
    `Subject: =?UTF-8?B?${Buffer.from(sample.subject).toString("base64")}?=`,
    `Date: Tue, 15 Sep 2026 10:00:00 +0300`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(sample.body, "utf8").toString("base64").replace(/(.{76})/g, "$1\n"),
    `--${boundary}`,
    "Content-Type: application/pdf",
    `Content-Disposition: attachment; filename="${sample.filename}"`,
    "Content-Transfer-Encoding: base64",
    "",
    b64,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function buildPdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const latin = await doc.embedFont(StandardFonts.Helvetica);

  const fontPath = await ensureHebrewFont();
  let hebrewFont: PDFFont = latin;
  if (fontPath) {
    hebrewFont = await doc.embedFont(fs.readFileSync(fontPath));
  }

  const fonts = { hebrew: hebrewFont, latin };
  const blocks = parseBlocks(text);
  let y = 792;

  page.drawRectangle({
    x: MARGIN - 8,
    y: 36,
    width: TABLE_WIDTH + 16,
    height: PAGE_HEIGHT - 72,
    borderColor: rgb(0.82, 0.85, 0.83),
    borderWidth: 0.8,
  });

  for (const block of blocks) {
    if (block.kind === "table") {
      y = drawTable(page, block, y, fonts);
      continue;
    }
    if (!block.text.trim()) {
      y -= 8;
      continue;
    }
    const rtl = /[\u0590-\u05ff]/.test(block.text);
    const size = block.title ? 14 : 11;
    if (block.title) y -= 4;
    drawPrepared(page, block.text, {
      x: MARGIN,
      y,
      width: TABLE_WIDTH,
      font: hebrewFont,
      hebrewFont,
      latin,
      size,
      align: rtl || block.title ? "right" : "left",
    });
    if (block.title) {
      y -= 8;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 1,
        color: rgb(0.15, 0.35, 0.32),
      });
      y -= 18;
    } else {
      y -= 16;
    }
  }
  return Buffer.from(await doc.save());
}

/** Flatten a text PDF into a medium-quality image-only page (no text layer). */
async function buildScannedPdf(text: string): Promise<Buffer> {
  const textPdf = await buildPdf(text);
  try {
    const { pdf } = await import("pdf-to-img");
    const doc = await pdf(textPdf, { scale: 1.15, format: "png" });
    try {
      const png = await doc.getPage(1);
      const out = await PDFDocument.create();
      const image = await out.embedPng(png);
      const page = out.addPage([PAGE_WIDTH, 842]);
      page.drawImage(image, { x: 0, y: 0, width: PAGE_WIDTH, height: 842 });
      return Buffer.from(await out.save());
    } finally {
      await doc.destroy().catch(() => undefined);
    }
  } catch (error) {
    console.warn("scan rasterize failed; writing text PDF instead", error);
    return textPdf;
  }
}

export async function buildFixtures(): Promise<void> {
  fs.mkdirSync(paths.invoices, { recursive: true });
  fs.mkdirSync(paths.emails, { recursive: true });

  for (const sample of samples) {
    fs.writeFileSync(path.join(paths.invoices, sample.filename.replace(/\.pdf$/i, ".txt")), sample.text, "utf8");
    const pdf = sample.forceVision ? await buildScannedPdf(sample.text) : await buildPdf(sample.text);
    fs.writeFileSync(path.join(paths.invoices, sample.filename), pdf);
  }

  const monthly = samples.find((s) => s.id === "monthly") ?? samples[0];
  const monthlyPdf = fs.readFileSync(path.join(paths.invoices, monthly.filename));
  fs.writeFileSync(path.join(paths.emails, "sample.eml"), wrapEml(monthly, monthlyPdf, "<sample-monthly-2026-08@goldencare.local>"));

  const mismatch = samples.find((s) => s.id === "mismatch")!;
  const mismatchPdf = fs.readFileSync(path.join(paths.invoices, mismatch.filename));
  fs.writeFileSync(
    path.join(paths.emails, "sample-review.eml"),
    wrapEml(mismatch, mismatchPdf, "<sample-mismatch-err77@goldencare.local>"),
  );

  const keepInvoices = new Set(
    samples.flatMap((sample) => [sample.filename, sample.filename.replace(/\.pdf$/i, ".txt")]),
  );
  for (const file of fs.readdirSync(paths.invoices)) {
    if (!keepInvoices.has(file)) fs.unlinkSync(path.join(paths.invoices, file));
  }
}

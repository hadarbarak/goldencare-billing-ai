import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
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

/** Visual order for scanned pages only. Text-layer PDFs stay logical for pdf.js. */
function visualRtlLine(line: string): string {
  if (!/[\u0590-\u05ff]/.test(line)) return line;
  return [...line].reverse().join("");
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

async function buildPdf(text: string, title: string, visualRtl = false): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 842]);
  const latin = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(title, { x: 50, y: 790, size: 14, font: latin, color: rgb(0.1, 0.2, 0.3) });

  const fontPath = await ensureHebrewFont();
  let font: PDFFont = latin;
  if (fontPath) {
    font = await doc.embedFont(fs.readFileSync(fontPath));
  }

  let y = 760;
  for (const rawLine of text.split("\n")) {
    const line = visualRtl ? visualRtlLine(rawLine) : rawLine;
    try {
      page.drawText(line, { x: 50, y, size: 11, font, color: rgb(0, 0, 0) });
    } catch {
      const ascii = line.replace(/[^\x00-\x7F]/g, "?");
      page.drawText(ascii.slice(0, 90), { x: 50, y, size: 10, font: latin });
    }
    y -= 16;
  }
  return Buffer.from(await doc.save());
}

/** Flatten a text PDF into a medium-quality image-only page (no text layer). */
async function buildScannedPdf(text: string, title: string): Promise<Buffer> {
  const textPdf = await buildPdf(text, title, true);
  try {
    const { pdf } = await import("pdf-to-img");
    const doc = await pdf(textPdf, { scale: 1.15, format: "png" });
    try {
      const png = await doc.getPage(1);
      const out = await PDFDocument.create();
      const image = await out.embedPng(png);
      const page = out.addPage([595, 842]);
      page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
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
    const pdf = sample.forceVision
      ? await buildScannedPdf(sample.text, sample.id)
      : await buildPdf(sample.text, sample.id);
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

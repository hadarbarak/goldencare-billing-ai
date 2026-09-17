/**
 * Reconstruct Hebrew PDF text from pdf.js text items.
 *
 * Stream order (`rawPdfText`) is kept for audit. The LLM sees `normalizedPdfText`,
 * which is rebuilt from item positions (y then x) and only then repaired using
 * each item's own `dir` + script mix.
 *
 * LTR money columns (`8,500.00`) stay untouched. We never reverse every number
 * on the page — that would fix one fixture and corrupt another.
 */

export interface PdfTextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  dir: string;
  hasEOL?: boolean;
}

const HEBREW = /[\u0590-\u05ff]/;
const LOGICAL_HEBREW =
  /חשבונית|התחשבנות|ספק|תאריך|לתשלום|מע["״]?מ|סה["״]?כ|מספר|הקצאה|חיוב|תשלומ|יתרת|תנאי|תקופ|לכבוד|שעות|נסיעות|כפפות|קופסה|מאת|לפני|שעה|חודש|קוד|הזמנת/;
const REVERSED_HEBREW = /תועש|דועיס|עובש|תנישבח|ןויז|תועיסנ|הליל|טסוגוא/;

const LINE_Y_TOLERANCE = 5;

function hasHebrew(text: string): boolean {
  return HEBREW.test(text);
}

function isLogicalAmount(token: string): boolean {
  if (/^0\.00$/.test(token)) return true;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token)) return true;
  if (/^[1-9]\d{0,2}\.\d{2}$/.test(token)) return true;
  return false;
}

function isPlausibleDate(token: string): boolean {
  const match = token.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1990 && year <= 2099;
}

/** Reverse an LTR token that looks like a visual-order artifact, not a printed amount. */
export function reverseLtrToken(token: string): string {
  if (isLogicalAmount(token)) return token;
  if (isPlausibleDate(token)) return token;
  if (/^[A-Za-z]{1,6}-\d/.test(token)) {
    return token
      .split("-")
      .map((part) => [...part].reverse().join(""))
      .join("-");
  }
  return [...token].reverse().join("");
}

export function reverseLtrRuns(text: string): string {
  return text.replace(/[A-Za-z0-9][A-Za-z0-9/.,:+-]*/g, reverseLtrToken);
}

export function reverseHebrewRuns(text: string): string {
  return text.replace(/[\u0590-\u05ff]+(?:\s+[\u0590-\u05ff]+)*/g, (run) => [...run].reverse().join(""));
}

/**
 * Repair a single pdf.js text item. Uses that item's dir/script — not a page-wide reverse.
 */
export function repairPdfTextItem(str: string, dir: string): string {
  if (!str.trim()) return str;
  const hebrew = hasHebrew(str);
  if (!hebrew && dir !== "rtl") return str;
  if (hebrew && REVERSED_HEBREW.test(str) && !LOGICAL_HEBREW.test(str)) {
    return reverseHebrewRuns(str);
  }
  if (hebrew || dir === "rtl") return reverseLtrRuns(str);
  return str;
}

function clusterLines(runs: PdfTextRun[]): PdfTextRun[][] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfTextRun[][] = [];
  for (const run of sorted) {
    const last = lines[lines.length - 1];
    if (!last) {
      lines.push([run]);
      continue;
    }
    const lineY = last.reduce((sum, item) => sum + item.y, 0) / last.length;
    if (Math.abs(run.y - lineY) <= LINE_Y_TOLERANCE) last.push(run);
    else lines.push([run]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

function joinLine(runs: PdfTextRun[]): string {
  let out = "";
  let lastRight = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const gap = run.x - lastRight;
    if (out && gap > 1.5 && !out.endsWith(" ") && !run.str.startsWith(" ")) out += " ";
    out += run.str;
    lastRight = run.x + run.width;
  }
  return out.replace(/[ \t]+/g, " ").trim();
}

export function rawTextFromRuns(runs: PdfTextRun[]): string {
  const lines: string[] = [];
  let current = "";
  for (const run of runs) {
    if (current && run.str && !current.endsWith(" ") && !run.str.startsWith(" ")) current += " ";
    current += run.str;
    if (run.hasEOL) {
      const line = current.replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
      current = "";
    }
  }
  const tail = current.replace(/\s+/g, " ").trim();
  if (tail) lines.push(tail);
  return lines.join("\n").trim();
}

export function normalizedTextFromRuns(runs: PdfTextRun[]): string {
  const repaired = runs.map((run) => ({
    ...run,
    str: repairPdfTextItem(run.str, run.dir),
  }));
  return clusterLines(repaired)
    .map(joinLine)
    .filter(Boolean)
    .join("\n")
    .trim();
}

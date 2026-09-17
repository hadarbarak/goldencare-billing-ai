/**
 * Deterministic normalisation of Hebrew invoice text.
 *
 * Everything in here is pure and unit-testable on purpose: these are the
 * conversions that an LLM does inconsistently (and expensively), and that a
 * few dozen lines of code do the same way every time.
 */

/** Bidi control characters. PDF text layers of RTL documents are full of them
 *  and they break every naive comparison and number parse. */
const BIDI_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g;

/** Hebrew geresh/gershayim, which appear interchangeably with ASCII quotes. */
const GERESH = /\u05f3/g;
const GERSHAYIM = /\u05f4/g;

/** Combining marks: nikud and cantillation. */
const NIKUD = /[\u0591-\u05c7]/g;

export function stripBidi(input: string): string {
  return input.replace(BIDI_MARKS, "");
}

/** Canonical form for any Hebrew text before comparison or parsing. */
export function normalizeText(input: string): string {
  return stripBidi(input)
    .replace(NIKUD, "")
    .replace(GERSHAYIM, '"')
    .replace(GERESH, "'")
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201f]/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CURRENCY_TOKENS: Array<[RegExp, string]> = [
  [/₪|ש"ח|שח|שקל(?:ים)?(?:\s+חדש(?:ים)?)?|\bILS\b|\bNIS\b/i, "ILS"],
  [/\$|\bUSD\b|דולר/i, "USD"],
  [/€|\bEUR\b|אירו|יורו/i, "EUR"],
  [/£|\bGBP\b/i, "GBP"],
];

/** Currency code implied by the text, or null if nothing recognisable. */
export function detectCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = normalizeText(raw);
  for (const [pattern, code] of CURRENCY_TOKENS) {
    if (pattern.test(text)) return code;
  }
  return null;
}

/**
 * Parse a printed amount into a number.
 *
 * Handles currency symbols on either side, thousands separators, parenthesised
 * and trailing-minus negatives, and the comma/period ambiguity by treating
 * whichever separator appears last as the decimal point.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let text = normalizeText(String(raw));
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }

  // Drop currency words/symbols and anything else that is not part of a number.
  text = text.replace(/[^\d.,\-+]/g, "");
  if (text.endsWith("-")) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  text = text.replace(/[+\-]/g, "");
  if (!/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the rightmost one is the decimal separator.
    const decimalAt = Math.max(lastComma, lastDot);
    const intPart = text.slice(0, decimalAt).replace(/[.,]/g, "");
    const fracPart = text.slice(decimalAt + 1).replace(/[.,]/g, "");
    text = `${intPart}.${fracPart}`;
  } else if (lastComma !== -1) {
    const after = text.length - lastComma - 1;
    // "1,234" / "1,234,567" are thousands; "12,5" is a decimal comma.
    text = after === 3 ? text.replace(/,/g, "") : text.replace(",", ".");
  } else if (lastDot !== -1) {
    const after = text.length - lastDot - 1;
    // "1.234" with exactly 3 digits and more than one group is thousands.
    const groups = text.split(".");
    const allThousandGroups = groups.slice(1).every((g) => g.length === 3);
    text = after === 3 && groups.length > 2 && allThousandGroups ? text.replace(/\./g, "") : text;
    if (groups.length > 2 && !allThousandGroups) text = text.replace(/\.(?=.*\.)/g, "");
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** VAT rate as a fraction: "17%" and "17" both become 0.17. */
export function parseRate(raw: string | null | undefined): number | null {
  const value = parseAmount(raw);
  if (value === null) return null;
  if (value > 1) return value / 100;
  return value;
}

const HEBREW_MONTHS: Record<string, number> = {
  ינואר: 1,
  פברואר: 2,
  מרץ: 3,
  מרס: 3,
  אפריל: 4,
  מאי: 5,
  יוני: 6,
  יולי: 7,
  אוגוסט: 8,
  ספטמבר: 9,
  אוקטובר: 10,
  נובמבר: 11,
  דצמבר: 12,
};

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects things like 31/02 that would otherwise roll over into March.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function expandYear(year: number): number {
  if (year >= 1000) return year;
  // Two-digit years on billing forms are always current-century here.
  return year >= 70 ? 1900 + year : 2000 + year;
}

export type DateGranularity = "day" | "month";

export interface ParsedDate {
  iso: string;
  granularity: DateGranularity;
}

/**
 * Parse a Hebrew/Israeli printed date.
 *
 * Day-first is assumed throughout, which is the Israeli convention; an
 * unambiguous ISO string (yyyy-mm-dd) is still honoured. Month-only values
 * ("דצמבר 2024", "12/2024") resolve to the first of the month and are reported
 * as month granularity so callers can decide whether that is acceptable.
 */
export function parseHebrewDate(raw: string | null | undefined): ParsedDate | null {
  if (!raw) return null;
  const text = normalizeText(String(raw));
  if (!text) return null;

  // yyyy-mm-dd (ISO, unambiguous)
  const isoMatch = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const value = iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (value) return { iso: value, granularity: "day" };
  }

  // dd/mm/yyyy, dd.mm.yy, dd-mm-yyyy
  const dmy = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmy) {
    const value = iso(expandYear(Number(dmy[3])), Number(dmy[2]), Number(dmy[1]));
    if (value) return { iso: value, granularity: "day" };
  }

  // "31 בדצמבר 2024" / "31 דצמבר 2024"
  const dayMonthName = text.match(/(\d{1,2})\s+ב?([\u0590-\u05ff]+)\s+(\d{4})/);
  if (dayMonthName) {
    const month = HEBREW_MONTHS[dayMonthName[2]];
    if (month) {
      const value = iso(Number(dayMonthName[3]), month, Number(dayMonthName[1]));
      if (value) return { iso: value, granularity: "day" };
    }
  }

  // "דצמבר 2024" / "ינואר 25"
  const monthName = text.match(/ב?([\u0590-\u05ff]+)\s+(\d{2,4})/);
  if (monthName) {
    const month = HEBREW_MONTHS[monthName[1]];
    if (month) {
      const value = iso(expandYear(Number(monthName[2])), month, 1);
      if (value) return { iso: value, granularity: "month" };
    }
  }

  // "12/2024" / "12-2024"
  const monthYear = text.match(/(\d{1,2})[-/.](\d{4})/);
  if (monthYear) {
    const value = iso(Number(monthYear[2]), Number(monthYear[1]), 1);
    if (value) return { iso: value, granularity: "month" };
  }

  return null;
}

/** Convenience wrapper for callers that only want the ISO string. */
export function parseHebrewDateIso(raw: string | null | undefined): string | null {
  return parseHebrewDate(raw)?.iso ?? null;
}

/** 9-digit Israeli company/registered-dealer number, or null. */
export function parseTaxId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = normalizeText(String(raw)).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 9) return null;
  return digits.padStart(9, "0");
}

const LEGAL_SUFFIXES = [
  /בע"מ/g,
  /בעמ/g,
  /חברה בע"מ/g,
  /\bltd\.?\b/gi,
  /\bl\.?t\.?d\.?\b/gi,
  /\binc\.?\b/gi,
];

const ADDRESS_PREFIXES = /^(?:לכבוד|לכב'|מאת|ספק|שם הספק|שם ספק)\s*:?\s*/;

/** Display form of a supplier name: cleaned up but still human-readable. */
export function normalizeSupplierName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = normalizeText(String(raw))
    .replace(ADDRESS_PREFIXES, "")
    .replace(/^[-–—:,.]+|[-–—:,.]+$/g, "")
    .trim();
  return text || null;
}

/**
 * Grouping key for a supplier.
 *
 * Without this the dashboard shows 'פתרונות סיעוד בע"מ', 'פתרונות סיעוד בעמ'
 * and 'פתרונות סיעוד' as three different suppliers, which is the first thing
 * a finance user notices and the last thing they forgive.
 */
export function supplierKey(raw: string | null | undefined): string | null {
  const name = normalizeSupplierName(raw);
  if (!name) return null;
  let key = name.toLowerCase();
  for (const suffix of LEGAL_SUFFIXES) key = key.replace(suffix, " ");
  key = key
    .replace(/^חברת\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key || null;
}

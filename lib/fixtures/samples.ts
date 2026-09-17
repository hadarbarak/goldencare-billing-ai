import type { CanonicalInvoice, RawExtraction } from "@/lib/schema";
import { EMPTY_CANONICAL } from "@/lib/schema";

export interface SampleInvoice {
  id: string;
  filename: string;
  title: string;
  story: string;
  from: string;
  subject: string;
  body: string;
  text: string;
  raw: RawExtraction;
  expected: CanonicalInvoice;
  /** Image-only PDF; extraction should take the vision path. */
  forceVision?: boolean;
}

function field(value: string, source_text: string) {
  return { value, source_text };
}

function expected(partial: Partial<CanonicalInvoice>): CanonicalInvoice {
  return { ...EMPTY_CANONICAL, ...partial };
}

const cleanRaw: RawExtraction = {
  document_type: field("חשבונית מס", "חשבונית מס"),
  document_number: field("INV-1001", "מספר חשבונית: INV-1001"),
  document_date: field("12/08/2026", "תאריך: 12/08/2026"),
  period_start: { value: null, source_text: null },
  period_end: { value: null, source_text: null },
  supplier_name: field('פתרונות סיעוד בע"מ', 'ספק: פתרונות סיעוד בע"מ'),
  supplier_tax_id: field("515123456", "ח.פ. 515123456"),
  currency: field("₪", 'סה"כ לתשלום: 11,700.00 ₪'),
  subtotal: field("10,000.00", 'סה"כ לפני מע"מ: 10,000.00'),
  vat_amount: field("1,700.00", 'מע"מ 17%: 1,700.00'),
  vat_rate: field("17%", 'מע"מ 17%: 1,700.00'),
  total_amount: field("11,700.00 ₪", 'סה"כ לתשלום: 11,700.00 ₪'),
  payment_terms: field("שוטף + 30", "תנאי תשלום: שוטף + 30"),
  due_date: field("11/09/2026", "לתשלום עד: 11/09/2026"),
  line_items: [
    { line_number: "1", description: "שעות סיעוד בוקר", quantity: "80", unit_of_measure: "שעה", unit_price: "50.00", amount: "4,000.00" },
    { line_number: "2", description: "שעות סיעוד ערב", quantity: "60", unit_of_measure: "שעה", unit_price: "55.00", amount: "3,300.00" },
    { line_number: "3", description: "תוספת סופי שבוע", quantity: "16", unit_of_measure: "שעה", unit_price: "100.00", amount: "1,600.00" },
    { line_number: "4", description: "נסיעות", quantity: "1", unit_of_measure: "גלגול", unit_price: "1,100.00", amount: "1,100.00" },
  ],
};

const monthlyRaw: RawExtraction = {
  document_type: field("טופס התחשבנות", "טופס התחשבנות ספק — אוגוסט 2026"),
  document_number: field("SET-2026-08", "מסמך SET-2026-08"),
  document_date: field("05/09/2026", "תאריך המסמך: 05/09/2026"),
  period_start: field("01/08/2026", "תקופת שירות: 01/08/2026 – 31/08/2026"),
  period_end: field("31/08/2026", "תקופת שירות: 01/08/2026 – 31/08/2026"),
  supplier_name: field('קייר מדיקל בע"מ', 'ספק: קייר מדיקל בע"מ'),
  supplier_tax_id: field("516888777", "ח.פ. 516888777"),
  customer_name: field('גולדן קייר בע"מ', 'לכבוד: גולדן קייר בע"מ'),
  currency: field("₪", 'יתרת חוב: 18,300.00 ₪'),
  subtotal: { value: null, source_text: null },
  vat_amount: { value: null, source_text: null },
  vat_rate: { value: null, source_text: null },
  total_amount: { value: null, source_text: null },
  total_charges: field("38,400.00", 'סה"כ חיובים: 38,400.00'),
  total_payments: field("20,100.00", 'סה"כ תשלומים: 20,100.00'),
  outstanding_balance: field("18,300.00 ₪", 'יתרת חוב: 18,300.00 ₪'),
  payment_terms: field("שוטף + 30", "תנאי תשלום: שוטף + 30"),
  line_items: [
    {
      document_date: "03/08/2026",
      document_number: "INV-801",
      description: "שעות סיעוד שבוע 1",
      charged_amount: "8,500.00",
      paid_amount: "8,500.00",
      outstanding_amount: "0.00",
    },
    {
      document_date: "10/08/2026",
      document_number: "INV-814",
      description: "שעות סיעוד שבוע 2",
      charged_amount: "12,000.00",
      paid_amount: "0.00",
      outstanding_amount: "12,000.00",
    },
    {
      document_date: "17/08/2026",
      document_number: "INV-822",
      description: "שעות סיעוד שבוע 3",
      charged_amount: "9,600.00",
      paid_amount: "9,600.00",
      outstanding_amount: "0.00",
    },
    {
      document_date: "24/08/2026",
      document_number: "INV-830",
      description: "שעות לילה",
      charged_amount: "7,200.00",
      paid_amount: "2,000.00",
      outstanding_amount: "5,200.00",
    },
    {
      document_date: "31/08/2026",
      document_number: "INV-841",
      description: "נסיעות אוגוסט",
      charged_amount: "1,100.00",
      paid_amount: "0.00",
      outstanding_amount: "1,100.00",
    },
  ],
};

const allocationRaw: RawExtraction = {
  document_type: field("חשבונית מס", "חשבונית מס"),
  document_number: field("24891", "חשבונית מס 24891"),
  document_date: field("31 בדצמבר 2024", "תאריך: 31 בדצמבר 2024"),
  period_start: { value: null, source_text: null },
  period_end: { value: null, source_text: null },
  supplier_name: field("מעבדות גולדן בעמ", "מאת מעבדות גולדן בעמ"),
  supplier_id: field("V-441", "קוד ספק: V-441"),
  supplier_tax_id: field("514987321", "ע.מ. 514-987-321"),
  purchase_order_number: field("PO-88421", "הזמנת רכש: PO-88421"),
  allocation_number: field("2026001234567", "מספר הקצאה: 2026001234567"),
  currency: field('ש"ח', 'לתשלום: 5,850 ש"ח'),
  subtotal: field("5,000", "ביניים 5,000"),
  vat_amount: field("850", "מע\"מ 850"),
  vat_rate: field("17", "מע\"מ 17"),
  total_amount: field('5,850 ש"ח', 'לתשלום: 5,850 ש"ח'),
  line_items: [{ description: "בדיקות מעבדה חודשיות", quantity: "1", unit_of_measure: "חודש", unit_price: "5,000", amount: "5,000" }],
};

const scanRaw: RawExtraction = {
  document_type: field("חשבונית מס", "חשבונית מס"),
  document_number: field("NK-0192", "אסמכתא NK-0192"),
  document_date: field("02.01.25", "תאריך 02.01.25"),
  period_start: { value: null, source_text: null },
  period_end: { value: null, source_text: null },
  supplier_name: field('שירותי ניקיון ירושלים בע"מ', 'שם הספק: שירותי ניקיון ירושלים בע"מ'),
  supplier_tax_id: field("513111222", "ח.פ. 513111222"),
  currency: field("ILS", "מטבע: ILS"),
  subtotal: field("3,200.50", 'לפני מע"מ 3,200.50'),
  vat_amount: field("544.09", 'מע"מ 544.09'),
  vat_rate: field("17%", 'מע"מ 17%'),
  total_amount: field("3,744.59", 'סה"כ 3,744.59'),
  line_items: [
    { description: "ניקיון סניף ראשי", quantity: "1", unit_price: "2,400.50", amount: "2,400.50" },
    { description: "חומרי ניקוי", quantity: "1", unit_price: "800.00", amount: "800.00" },
  ],
};

const mismatchRaw: RawExtraction = {
  document_type: field("חשבונית מס", "חשבונית מס"),
  document_number: field("ERR-77", "מספר ERR-77"),
  document_date: field("15/01/2025", "תאריך 15/01/2025"),
  period_start: field("01/01/2025", "תקופה 01/01/2025 – 31/01/2025"),
  period_end: field("31/01/2025", "תקופה 01/01/2025 – 31/01/2025"),
  supplier_name: field("אספקת ציוד רפואי כהן", "ספק אספקת ציוד רפואי כהן"),
  supplier_tax_id: field("512000111", "ח.פ. 512000111"),
  currency: field("₪", "₪"),
  subtotal: field("2,000.00", 'לפני מע"מ 2,000.00'),
  vat_amount: field("340.00", 'מע"מ 340.00'),
  vat_rate: field("17%", "17%"),
  total_amount: field("4,999.00", 'סה"כ לתשלום 4,999.00'),
  line_items: [{ description: "כפפות", quantity: "10", unit_of_measure: "קופסה", unit_price: "200.00", amount: "2,000.00" }],
};

export const samples: SampleInvoice[] = [
  {
    id: "clean",
    filename: "invoice-clean.pdf",
    title: "חשבונית נקייה — 4 שורות",
    story: "חשבונית ספק בעברית עם פירוט מלא.",
    from: "billing@siud-care.co.il",
    subject: "חשבונית INV-1001",
    body: "מצורפת חשבונית מס.",
    text: [
      "חשבונית מס",
      'ספק: פתרונות סיעוד בע"מ',
      "ח.פ. 515123456",
      "מספר חשבונית: INV-1001",
      "תאריך: 12/08/2026",
      "תנאי תשלום: שוטף + 30",
      "לתשלום עד: 11/09/2026",
      "1  שעות סיעוד בוקר     80 שעה x 50.00 = 4,000.00",
      "2  שעות סיעוד ערב      60 שעה x 55.00 = 3,300.00",
      "3  תוספת סופי שבוע     16 שעה x 100.00 = 1,600.00",
      "4  נסיעות               1 גלגול x 1,100.00 = 1,100.00",
      'סה"כ לפני מע"מ: 10,000.00',
      'מע"מ 17%: 1,700.00',
      'סה"כ לתשלום: 11,700.00 ₪',
    ].join("\n"),
    raw: cleanRaw,
    expected: expected({
      document_type: "invoice",
      document_number: "INV-1001",
      document_date: "2026-08-12",
      supplier_name: 'פתרונות סיעוד בע"מ',
      supplier_key: "פתרונות סיעוד",
      supplier_tax_id: "515123456",
      currency: "ILS",
      subtotal: 10000,
      vat_amount: 1700,
      vat_rate: 0.17,
      total_amount: 11700,
      payment_terms: "שוטף + 30",
      due_date: "2026-09-11",
      invoice_line_items: [
        { line_number: "1", description: "שעות סיעוד בוקר", quantity: 80, unit_of_measure: "שעה", unit_price: 50, amount: 4000 },
        { line_number: "2", description: "שעות סיעוד ערב", quantity: 60, unit_of_measure: "שעה", unit_price: 55, amount: 3300 },
        { line_number: "3", description: "תוספת סופי שבוע", quantity: 16, unit_of_measure: "שעה", unit_price: 100, amount: 1600 },
        { line_number: "4", description: "נסיעות", quantity: 1, unit_of_measure: "גלגול", unit_price: 1100, amount: 1100 },
      ],
    }),
  },
  {
    id: "monthly",
    filename: "settlement-monthly.pdf",
    title: "התחשבנות חודשית — חיובים מול תשלומים",
    story: "טופס reconciliation: כמה חשבוניות לתקופה, חלקן שולמו. לא חשבונית עם period.",
    from: "billing@supplier.co.il",
    subject: "טופס התחשבנות - אוגוסט 2026",
    body: "שלום, מצורף טופס ההתחשבנות לחודש אוגוסט.",
    text: [
      "טופס התחשבנות ספק — אוגוסט 2026",
      'ספק: קייר מדיקל בע"מ',
      "ח.פ. 516888777",
      'לכבוד: גולדן קייר בע"מ',
      "מסמך SET-2026-08",
      "תאריך המסמך: 05/09/2026",
      "תקופת שירות: 01/08/2026 – 31/08/2026",
      "תנאי תשלום: שוטף + 30",
      "תאריך     חשבונית   תיאור                 חיוב      שולם     יתרה",
      "03/08/2026 INV-801  שעות סיעוד שבוע 1    8,500.00  8,500.00      0.00",
      "10/08/2026 INV-814  שעות סיעוד שבוע 2   12,000.00      0.00 12,000.00",
      "17/08/2026 INV-822  שעות סיעוד שבוע 3    9,600.00  9,600.00      0.00",
      "24/08/2026 INV-830  שעות לילה            7,200.00  2,000.00  5,200.00",
      "31/08/2026 INV-841  נסיעות אוגוסט        1,100.00      0.00  1,100.00",
      'סה"כ חיובים: 38,400.00',
      'סה"כ תשלומים: 20,100.00',
      'יתרת חוב: 18,300.00 ₪',
    ].join("\n"),
    raw: monthlyRaw,
    expected: expected({
      document_type: "settlement",
      document_number: "SET-2026-08",
      document_date: "2026-09-05",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      supplier_name: 'קייר מדיקל בע"מ',
      supplier_key: "קייר מדיקל",
      supplier_tax_id: "516888777",
      customer_name: 'גולדן קייר בע"מ',
      currency: "ILS",
      total_charges: 38400,
      total_payments: 20100,
      outstanding_balance: 18300,
      payment_terms: "שוטף + 30",
      settlement_line_items: [
        { document_date: "2026-08-03", document_number: "INV-801", description: "שעות סיעוד שבוע 1", charged_amount: 8500, paid_amount: 8500, outstanding_amount: 0 },
        { document_date: "2026-08-10", document_number: "INV-814", description: "שעות סיעוד שבוע 2", charged_amount: 12000, paid_amount: 0, outstanding_amount: 12000 },
        { document_date: "2026-08-17", document_number: "INV-822", description: "שעות סיעוד שבוע 3", charged_amount: 9600, paid_amount: 9600, outstanding_amount: 0 },
        { document_date: "2026-08-24", document_number: "INV-830", description: "שעות לילה", charged_amount: 7200, paid_amount: 2000, outstanding_amount: 5200 },
        { document_date: "2026-08-31", document_number: "INV-841", description: "נסיעות אוגוסט", charged_amount: 1100, paid_amount: 0, outstanding_amount: 1100 },
      ],
    }),
  },
  {
    id: "allocation",
    filename: "invoice-allocation.pdf",
    title: "חשבונית עם מע\"מ, הקצאה ו-PO",
    story: "שדות ישראליים ו-ERP header: מספר הקצאה והזמנת רכש.",
    from: "accounts@golden-labs.co.il",
    subject: "חשבונית 24891 עם הזמנה PO-88421",
    body: "מצורפת חשבונית מול הזמנת רכש.",
    text: [
      "חשבונית מס 24891",
      "מאת מעבדות גולדן בעמ",
      "ע.מ. 514-987-321",
      "קוד ספק: V-441",
      "תאריך: 31 בדצמבר 2024",
      "הזמנת רכש: PO-88421",
      "מספר הקצאה: 2026001234567",
      "בדיקות מעבדה חודשיות  1 חודש x 5,000 = 5,000",
      "ביניים 5,000",
      'מע"מ 17  850',
      'לתשלום: 5,850 ש"ח',
    ].join("\n"),
    raw: allocationRaw,
    expected: expected({
      document_type: "invoice",
      document_number: "24891",
      document_date: "2024-12-31",
      supplier_name: "מעבדות גולדן בעמ",
      supplier_key: "מעבדות גולדן",
      supplier_id: "V-441",
      supplier_tax_id: "514987321",
      purchase_order_number: "PO-88421",
      allocation_number: "2026001234567",
      currency: "ILS",
      subtotal: 5000,
      vat_amount: 850,
      vat_rate: 0.17,
      total_amount: 5850,
      invoice_line_items: [{ description: "בדיקות מעבדה חודשיות", quantity: 1, unit_of_measure: "חודש", unit_price: 5000, amount: 5000 }],
    }),
  },
  {
    id: "scan",
    filename: "invoice-scan.pdf",
    title: "PDF סרוק — Vision fallback",
    story: "בלי שכבת טקסט. בודק rasterize → vision.",
    from: "office@jk-clean.co.il",
    subject: "חשבונית סרוקה NK-0192",
    body: "מצורף סריק.",
    forceVision: true,
    text: [
      "חשבונית מס",
      'שם הספק: שירותי ניקיון ירושלים בע"מ',
      "ח.פ. 513111222",
      "אסמכתא NK-0192",
      "תאריך 02.01.25",
      "מטבע: ILS",
      "ניקיון סניף ראשי  2,400.50",
      "חומרי ניקוי  800.00",
      'לפני מע"מ 3,200.50',
      'מע"מ 17% 544.09',
      'סה"כ 3,744.59',
    ].join("\n"),
    raw: scanRaw,
    expected: expected({
      document_type: "invoice",
      document_number: "NK-0192",
      document_date: "2025-01-02",
      supplier_name: 'שירותי ניקיון ירושלים בע"מ',
      supplier_key: "שירותי ניקיון ירושלים",
      supplier_tax_id: "513111222",
      currency: "ILS",
      subtotal: 3200.5,
      vat_amount: 544.09,
      vat_rate: 0.17,
      total_amount: 3744.59,
      invoice_line_items: [
        { description: "ניקיון סניף ראשי", quantity: 1, unit_price: 2400.5, amount: 2400.5 },
        { description: "חומרי ניקוי", quantity: 1, unit_price: 800, amount: 800 },
      ],
    }),
  },
  {
    id: "mismatch",
    filename: "invoice-mismatch.pdf",
    title: "סכומים לא מסתדרים — Needs Review",
    story: "סה\"כ לא שווה לפירוט + מע\"מ. חייב needs_review.",
    from: "sales@cohen-med.co.il",
    subject: "חשבונית ERR-77",
    body: "מצורפת חשבונית. נא לבדוק את הסכום.",
    text: [
      "חשבונית מס",
      "ספק אספקת ציוד רפואי כהן",
      "ח.פ. 512000111",
      "מספר ERR-77",
      "תאריך 15/01/2025",
      "תקופה 01/01/2025 – 31/01/2025",
      "כפפות  10 קופסה x 200.00 = 2,000.00",
      'לפני מע"מ 2,000.00',
      'מע"מ 340.00',
      'סה"כ לתשלום 4,999.00',
    ].join("\n"),
    raw: mismatchRaw,
    expected: expected({
      document_type: "invoice",
      document_number: "ERR-77",
      document_date: "2025-01-15",
      period_start: "2025-01-01",
      period_end: "2025-01-31",
      supplier_name: "אספקת ציוד רפואי כהן",
      supplier_key: "אספקת ציוד רפואי כהן",
      supplier_tax_id: "512000111",
      currency: "ILS",
      subtotal: 2000,
      vat_amount: 340,
      vat_rate: 0.17,
      total_amount: 4999,
      invoice_line_items: [{ description: "כפפות", quantity: 10, unit_of_measure: "קופסה", unit_price: 200, amount: 2000 }],
    }),
  },
];

export const LABELED_SUITE_SIZE = samples.length;

export function sampleByFilename(filename: string): SampleInvoice | undefined {
  const base = filename.replace(/^.*[\\/]/, "").toLowerCase();
  return samples.find((s) => s.filename.toLowerCase() === base || base.includes(s.id));
}

export function sampleByText(text: string): SampleInvoice | undefined {
  return samples.find((s) => text.includes(s.expected.supplier_tax_id ?? "___"));
}

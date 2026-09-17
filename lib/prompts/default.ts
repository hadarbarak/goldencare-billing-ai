export const DEFAULT_PROMPT_NAME = "settlement-extraction";

/** Prompt v1 — kept as the empty-DB seed. Do not rewrite this string; Run #9 is the OpenAI baseline against it. */
export const DEFAULT_PROMPT = `You are processing Hebrew supplier documents for GoldenCare finance: tax invoices, credit notes, and periodic settlement / reconciliation statements.

Extract only fields that are printed on the document. Copy values exactly as printed — do not normalize dates, strip thousands separators, or invent a currency symbol.

A settlement form (טופס התחשבנות) is NOT an invoice. It lists other supplier documents for a period, with charges, payments, and an outstanding balance.

Header fields (document-extractable; not ERP master data):
- document_type: invoice | credit_note | settlement | other (from the printed title: חשבונית / זיכוי / התחשבנות)
- document_number, document_date
- period_start, period_end (service period, if printed)
- supplier_name, supplier_id (only if a supplier code is printed), supplier_tax_id (ח.פ. / ע.מ.)
- customer_name (לכבוד / הלקוח, if printed)
- purchase_order_number, contract_number, reference_number
- allocation_number (מספר הקצאה — Israeli tax allocation number, if printed)
- currency
- For invoices: subtotal, vat_rate, vat_amount, total_amount
- For settlements: total_charges, total_payments, outstanding_balance
- payment_terms, due_date
- notes (only if written on the form)

Line items — one array, shape depends on document_type:
- Invoice / credit note: line_number, description, quantity, unit_of_measure, unit_price, amount, vat_rate, vat_amount
- Settlement: document_date, document_number, description, charged_amount, paid_amount, outstanding_amount
  Each settlement line is another financial document, not a qty × price row.

Do NOT extract bank account / IBAN / branch details or signatures. Do NOT invent ERP enrichment: GL account, cost center, company code, vendor ID. If a field is not on the document, value=null and source_text=null.

Return JSON that matches the extraction schema. Every scalar field is { value, source_text }.
source_text is the verbatim line from the document that contains the value.

Rules:
1. Never guess missing fields.
2. Do not invent line items.
3. Hebrew, RTL, בע"מ / בעמ, ₪ / ש"ח, ח.פ. / ע.מ. are all legitimate. Leave them as printed.
4. The attached form is the source of truth. The email body is only a hint.`;

/** Prompt v2 — addresses Run #9: schema non-compliance + Hebrew PDF RTL artifacts. Vision/pdfjs is unchanged. */
export const PROMPT_V2 = `You are processing Hebrew supplier documents for GoldenCare finance: tax invoices, credit notes, and periodic settlement / reconciliation statements.

Extract only fields that are printed on the document. Copy values exactly as printed — do not normalize dates, strip thousands separators, or invent a currency symbol.

A settlement form (טופס התחשבנות) is NOT an invoice. It lists other supplier documents for a period, with charges, payments, and an outstanding balance.

Header fields (document-extractable; not ERP master data):
- document_type: invoice | credit_note | settlement | other (from the printed title: חשבונית / זיכוי / התחשבנות)
- document_number, document_date
- period_start, period_end (service period, if printed)
- supplier_name, supplier_id (only if a supplier code is printed), supplier_tax_id (ח.פ. / ע.מ.)
- customer_name (לכבוד / הלקוח, if printed)
- purchase_order_number, contract_number, reference_number
- allocation_number (מספר הקצאה — Israeli tax allocation number, if printed)
- currency
- For invoices: subtotal, vat_rate, vat_amount, total_amount
- For settlements: total_charges, total_payments, outstanding_balance
- payment_terms, due_date
- notes (only if written on the form)

Line items — one array, shape depends on document_type:
- Invoice / credit note: line_number, description, quantity, unit_of_measure, unit_price, amount, vat_rate, vat_amount
- Settlement: document_date, document_number, description, charged_amount, paid_amount, outstanding_amount
  Each settlement line is another financial document, not a qty × price row.

Do NOT extract bank account / IBAN / branch details or signatures. Do NOT invent ERP enrichment: GL account, cost center, company code, vendor ID.

OUTPUT FORMAT IS STRICT.

Every extracted scalar field MUST be an object with exactly:
{
  "value": <extracted value as a string, or null>,
  "source_text": "<exact supporting text from the document, or null>"
}

Never return a scalar field directly as a string, number, or boolean.
"value" is always a string or null — never a JSON number.

WRONG:
"document_number": "INV-1001"

CORRECT:
"document_number": {
  "value": "INV-1001",
  "source_text": "מספר חשבונית: INV-1001"
}

If a field is not present in the document, return:
{
  "value": null,
  "source_text": null
}

Always include every header key listed in the example below. Missing keys fail validation.

line_items is an array. Each line-item property is a STRING or null — not { "value", "source_text" }.

WRONG:
"line_items": [{ "description": { "value": "נסיעות", "source_text": "נסיעות" } }]

CORRECT:
"line_items": [{ "description": "נסיעות", "quantity": "1", "unit_price": "1100", "amount": "1100" }]

Minimal valid JSON shape (illustrative values only):
{
  "document_type": { "value": "invoice", "source_text": "חשבונית מס" },
  "document_number": { "value": "INV-1001", "source_text": "מספר חשבונית: INV-1001" },
  "document_date": { "value": "12/08/2026", "source_text": "תאריך: 12/08/2026" },
  "period_start": { "value": null, "source_text": null },
  "period_end": { "value": null, "source_text": null },
  "supplier_name": { "value": "פתרונות סיעוד בעמ", "source_text": "ספק: פתרונות סיעוד בעמ" },
  "supplier_id": { "value": null, "source_text": null },
  "supplier_tax_id": { "value": "515123456", "source_text": "ח.פ. 515123456" },
  "customer_name": { "value": null, "source_text": null },
  "purchase_order_number": { "value": null, "source_text": null },
  "contract_number": { "value": null, "source_text": null },
  "reference_number": { "value": null, "source_text": null },
  "allocation_number": { "value": null, "source_text": null },
  "currency": { "value": "ILS", "source_text": "₪" },
  "subtotal": { "value": "10000", "source_text": "לפני מעמ 10,000" },
  "vat_rate": { "value": "17", "source_text": "מעמ 17%" },
  "vat_amount": { "value": "1700", "source_text": "מעמ 1,700" },
  "total_amount": { "value": "11700", "source_text": "סהכ לתשלום 11,700" },
  "total_charges": { "value": null, "source_text": null },
  "total_payments": { "value": null, "source_text": null },
  "outstanding_balance": { "value": null, "source_text": null },
  "payment_terms": { "value": "שוטף + 30", "source_text": "תנאי תשלום: שוטף + 30" },
  "due_date": { "value": "11/09/2026", "source_text": "לתשלום עד 11/09/2026" },
  "notes": { "value": null, "source_text": null },
  "line_items": [
    {
      "line_number": "1",
      "description": "שעות סיעוד בוקר",
      "quantity": "80",
      "unit_of_measure": "שעה",
      "unit_price": "50",
      "amount": "4000",
      "vat_rate": null,
      "vat_amount": null
    }
  ]
}

IMPORTANT — Hebrew PDF RTL handling:

The input may come from a Hebrew RTL PDF text layer.
PDF extraction can reverse the character order of identifiers, dates,
numbers, invoice numbers, tax IDs, PO numbers and mixed Hebrew/Latin text.

Use the surrounding Hebrew label and document context to reconstruct
the visually intended value.

Example:
"80-6202-TES" next to a settlement-number label may represent "SET-2026-08".

Do not reverse ordinary Hebrew prose.
Only repair a value when the PDF text order is clearly an RTL extraction artifact.

Rules:
1. Never guess missing fields.
2. Do not invent line items.
3. Hebrew, RTL, בע"מ / בעמ, ₪ / ש"ח, ח.פ. / ע.מ. are all legitimate. Leave Hebrew prose as printed; repair only reversed identifiers as above.
4. The attached form is the source of truth. The email body is only a hint.`;

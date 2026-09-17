# GoldenCare Billing AI

שירות שמקבל טופס התחשבנות ממייל, מחלץ ממנו נתונים בעברית, כותב אותם לקובץ אקסל מתוחזק, ונותן לצוות כספים שליטה על הפרומפט, על איכות הפענוח ועל רשומות שדורשות בדיקה.

## הרצה בפקודה אחת

```bash
npm install && npm run dev
```

ברירת המחדל היא `LLM_PROVIDER=mock` — בלי מפתח API. פותחים http://localhost:3000.

### הרצה עם OpenAI

לבדיקת extraction עם מודל אמיתי, יוצרים `.env` מקומי:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o
```

`.env` נמצא ב-`.gitignore` ואינו נשמר ב-Git. ללא `.env`, המערכת נשארת במצב Mock וניתנת להרצה ללא API key.

`npm run setup` עשוי להוריד פעם אחת את Noto Sans Hebrew כדי לייצר את מסמכי הבדיקה בעברית. אחרי זה הריצה עצמה מקומית.

## הדגמה מקצה לקצה

בדשבורד לוחצים **Simulate Incoming Email**. מוצג payload עם `from` / `to` / `subject` / `body` / `attachments`, ואז הוא רץ לכל אורך הפייפליין.

או מהטרמינל:

```bash
npm run demo
```

הזרימה שרואים בהגשה:

Incoming email → attachment detected → extraction → Excel updated → Backoffice shows record → change prompt / test → regression results.

מייל שני עם סכומים לא מסתדרים:

```bash
npx tsx scripts/send-sample-email.ts fixtures/emails/sample-review.eml
```

הרשומה הזו מסומנת `needs_review`: היא **נכתבת** לאקסל כ-`held_for_review`, אבל לא נספרת כ-active ולא נכנסת לסכומי הדשבורד.

## מה נבנה ולמה

| בחירה | סיבה |
|---|---|
| Next.js + TypeScript | אפליקציה אחת ל-API ול-Backoffice. מרים בפקודה אחת. |
| SQLite | אפס התקנה. מחסן תפעולי להרצות, גרסאות פרומפט ותור בדיקה. |
| קובץ Excel אחד | זה מקור האמת שביקשו. ה-DB לא מחליף אותו. |
| Mock LLM כברירת מחדל | משכפלים, מריצים, וזה עובד. `LLM_PROVIDER=openai` כשרוצים מודל אמיתי. |
| בלי n8n / בלי MySQL | עוד רכיבים היו שוברים את ה-one-liner בלי להוסיף ערך להדגמה. |

האקסל הוא מחברת מצטברת: כפילות לפי Message-ID + hash של הקובץ, מניעת overwrite מקבילי (lock), ומסמך מתוקן שנשלח שוב מסמן את השורה הקודמת כ-`superseded`.

## Schema: extracted fields ≠ ERP enrichment

The canonical schema is built around common ERP/AP concepts (header vs line items, supplier identity, references, tax, totals), while deliberately separating fields extractable from the source document from ERP master-data enrichment. It is not “the SAP schema.” Since real GoldenCare forms contain PII and could not be shared, the regression suite uses synthetic Hebrew supplier documents covering multiple layouts and failure modes.

What we extract is what is printed on the supplier document. Invoice and settlement share a header; **line-item shape follows `documentType`**.

- **Invoice / credit note lines:** description, quantity, unit of measure, unit price, amount, tax.
- **Settlement lines:** each row is another financial document (`documentNumber`, `documentDate`, `chargedAmount`, `paidAmount`, `outstandingAmount`). Validation is `Σ charged − Σ paid = outstanding balance`, not subtotal + VAT.
- **Header:** document type/number/date, supplier, optional customer (`לכבוד`), PO / contract / reference, currency, payment terms, Israeli **allocation number** (`מספר הקצאה`).

Bank details and signatures are intentionally out of the MVP: the system is for settlement and analysis, not for changing payment instructions.

GL account, cost center, company code, and vendor ID from an ERP master are **not** extraction fields. Unless they explicitly appear on the document, filling them in would require the model to infer accounting information. That is a later enrichment step using ERP master data or business rules.

Ground truth scores only fields that are observable on that document. A missing `contract_number` does not lower accuracy if it was never printed.

```
Supplier document
       ↓
AI Extraction
       ↓
Header + line items
       ↓
Normalization
       ↓
Validation
       ↓
ERP-ready canonical structure
       ↓
ERP enrichment (vendor ID / cost center / GL account)
       ↓
SAP / Hashavshevet
```

## אמינות הפענוח

ה-LLM מחזיר רק מחרוזות גולמיות + `source_text`. תאריכים, סכומים, מטבע ושם ספק מנורמלים בקוד (`lib/normalize`).

אחרי החילוץ רצה ולידציה דטרמיניסטית:

- שדות חובה (ספק, תאריך; בחשבונית סה״כ, בהתחשבנות יתרת חוב)
- אריתמטיקה לחשבונית: לפני מע״מ + מע״מ = סה״כ
- אריתמטיקה להתחשבנות: Σ חיובים − Σ תשלומים = יתרת חוב
- provenance: ה-`source_text` חייב להופיע במסמך
- נרמול עברית: ₪/ש״ח, פסיקים, `31 בדצמבר 2024`, בע״מ/בעמ

Processed records are written as active. Needs Review records remain in the ledger as held_for_review and are excluded from active financial data. Failed extractions are not written.

איך הסטטוס מגיע לאקסל:

| סטטוס | מה נכתב ל-`data/ledger.xlsx` | נספר בדשבורד |
|---|---|---|
| **Failed** | לא נכתב בכלל | לא |
| **Needs Review** | נשמר כ-`held_for_review` — נראה למבקר, לא מצטרף לסכומים | לא |
| **Processed** | נכנס כ-`active` — זה מקור האמת הפיננסי | כן |

אישור ידני ב-Backoffice מריץ שוב את אותן בדיקות אריתמטיקה. תיקון שלא מסתדר נשאר `needs_review` / `held_for_review`.

## רגרסיה

חמישה מסמכים מתויגים ב-`fixtures/invoices`, כל אחד בודק מצב אחר — לא חמש וריאציות של אותו טופס:

1. חשבונית ספק נקייה בעברית עם 4 שורות (`invoice-clean.pdf`)
2. טופס התחשבנות תקופתי: 5 חשבוניות, חיובים מול תשלומים, יתרת חוב (`settlement-monthly.pdf`)
3. חשבונית עם מע״מ, מספר הקצאה ו-PO (`invoice-allocation.pdf`)
4. PDF סרוק באיכות בינונית (`invoice-scan.pdf`) — ב-mock מסומן כנתיב Vision; רנדור תמונות אמיתי רק עם `LLM_PROVIDER=openai`
5. סה״כ שלא מתאים לפירוט → Needs Review (`invoice-mismatch.pdf`)

Ground truth בודק רק שדות שמופיעים במסמך. המודל לא נענש על Cost Center / GL Account שלא היו בדף. דיוק ברמת שדה, שורות פירוט ב-F1, ואחרי שינוי פרומפט — Before/After.

### תוצאות עם GPT-4o

הרגרסיה הורצה גם מול `LLM_PROVIDER=openai` על חמשת מסמכי הבדיקה. בכל הרצה שונה רכיב אחד בלבד:

| Run | Change | Field Accuracy | Line-item F1 |
| --- | --- | ---: | ---: |
| #9 | Prompt v1 baseline | 5.4% | 0.0 |
| #10 | Structured-output prompt (v2) | 57.1% | 0.8 |
| #11 | Deterministic RTL preprocessing | 83.9% | 0.8 |
| #12 | Vision fallback fixed | **94.6%** | **0.8** |

ב-Run #12 ארבעת מסמכי ה-PDF עם שכבת הטקסט הגיעו ל-47/47 שדות נכונים. שלוש טעויות השדה שנותרו היו במסמך הסרוק שעבר דרך Vision. לא בוצע tuning נוסף על חמשת מסמכי הבדיקה כדי לא לבצע overfitting למדגם קטן.

```bash
npm run regression
```

חמישה מסמכים הם מדגם קטן. המספר שימושי להשוואת פרומפטים, לא כהבטחת ייצור.

במצב `LLM_PROVIDER=mock` הרגרסיה בודקת את הפייפליין ואת מנגנון הניקוד מול fixtures ידועים — לא את איכות המודל, ולא Vision extraction. מדידת איכות פענוח בעברית וסריקות דורשת `LLM_PROVIDER=openai`.

`npm run setup` מוריד את Noto Sans Hebrew כדי שלמסמכי הבדיקה תהיה שכבת טקסט עברית אמיתית, לא סימני `?`.

## סריקות בלי שכבת טקסט

אם חילוץ הטקסט מה-PDF ריק או חלש, המערכת מרנדרת עמודים לתמונות ושולחת אותן למודל vision. אין OCR נפרד.

## כשל ב-LLM

אם ספק ה-AI נופל או מחזיר JSON לא תקין, הסטטוס הוא Failed עם issue מפורש `LLM_ERROR` — לא חסרים שדות כאילו המסמך היה ריק.

## מה הושאר בחוץ

- חיבור IMAP אמיתי — המשימה מתירה לדמות מייל, וה-`.eml` מספיק להדגמה.
- UI מלוטש — התעדוף היה פייפליין, חילוץ, רגרסיה, ואז ממשק שמיש לאיש כספים.
- Python backend נפרד — לא היה צורך.

## מבנה

```
app/api/email/inbound   קבלת .eml
app/api/documents/test  העלאת טופס ידנית
lib/extract             PDF → LLM → JSON
lib/normalize           פרסור עברית דטרמיניסטי
lib/validate            schema + business → processed / needs_review / failed
lib/excel               מחברת xlsx: active | held_for_review | superseded
data/ledger.xlsx        מקור האמת (נוצר בהרצה, לא ב-git)
```

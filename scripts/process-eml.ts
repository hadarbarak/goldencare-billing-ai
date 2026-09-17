import fs from "node:fs";
import path from "node:path";
import { getDb, seedIfEmpty } from "../lib/db";
import { processInboundEmail } from "../lib/extract/pipeline";

getDb();
seedIfEmpty();
const file = process.argv[2] || path.join(process.cwd(), "fixtures", "emails", "sample.eml");
const parsed = await processInboundEmail(fs.readFileSync(file));
console.log(
  JSON.stringify(
    {
      error: parsed.error ?? null,
      email: {
        messageId: parsed.email.messageId,
        from: parsed.email.from,
        subject: parsed.email.subject,
        attachments: parsed.email.attachments.map((a) => a.filename),
      },
      results: parsed.results.map((item) => ({
        filename: item.filename,
        status: item.status,
        ledger: item.ledgerAction,
        supplier: item.invoice?.supplier_name,
        total: item.invoice?.total_amount,
      })),
    },
    null,
    2,
  ),
);

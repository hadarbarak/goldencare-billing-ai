import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { processInboundEmail } from "@/lib/extract/pipeline";
import { getDb, seedIfEmpty } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  getDb();
  seedIfEmpty();
  const file = path.join(process.cwd(), "fixtures", "emails", "sample.eml");
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: "missing_sample_eml" }, { status: 500 });
  }
  const { email, results, error } = await processInboundEmail(fs.readFileSync(file));
  return NextResponse.json({
    error: error ?? null,
    email: {
      messageId: email.messageId,
      from: email.from,
      to: email.to,
      subject: email.subject,
      date: email.date,
      headers: email.headers,
      body: email.text,
      attachmentNames: email.attachments.map((a) => a.filename),
      rawSize: email.rawSize,
    },
    results,
  });
}

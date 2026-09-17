import { NextResponse } from "next/server";
import { processInboundEmail } from "@/lib/extract/pipeline";
import { getDb, seedIfEmpty } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  getDb();
  seedIfEmpty();
  const contentType = request.headers.get("content-type") || "";
  let raw: Buffer;
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file") ?? form.get("eml");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing_eml" }, { status: 400 });
    }
    raw = Buffer.from(await file.arrayBuffer());
  } else {
    raw = Buffer.from(await request.arrayBuffer());
  }
  if (raw.length < 20) {
    return NextResponse.json({ error: "empty_payload" }, { status: 400 });
  }
  const { email, results, error } = await processInboundEmail(raw);
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

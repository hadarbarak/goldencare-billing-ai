import { NextResponse } from "next/server";
import { DEMO_EMAIL_PAYLOAD } from "@/lib/email/simulate";
import { processDocument, readFixtureBuffer } from "@/lib/extract/pipeline";
import { getDb, seedIfEmpty } from "@/lib/db";
import { buildFixtures } from "@/lib/fixtures/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ payload: DEMO_EMAIL_PAYLOAD });
}

export async function POST() {
  getDb();
  seedIfEmpty();
  await buildFixtures();
  const payload = DEMO_EMAIL_PAYLOAD;
  const attachment = payload.attachments[0];
  const file = readFixtureBuffer(attachment.filename);
  if (!file) {
    return NextResponse.json({ error: "missing_attachment_fixture", payload }, { status: 500 });
  }

  const result = await processDocument({
    source: "email",
    messageId: `<simulate-${Date.now()}@goldencare.local>`,
    fromAddress: payload.from,
    toAddress: payload.to,
    subject: payload.subject,
    emailDate: new Date(payload.receivedAt).toISOString(),
    headersJson: JSON.stringify({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      date: payload.receivedAt,
      "message-id": `<simulate-${Date.now()}@goldencare.local>`,
      "content-type": "multipart/mixed",
    }),
    bodyText: payload.body,
    filename: attachment.filename,
    mimeType: attachment.contentType,
    buffer: file.buffer,
  });

  return NextResponse.json({ payload, result });
}

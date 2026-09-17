import { NextResponse } from "next/server";
import { processDocument } from "@/lib/extract/pipeline";
import { getDb, seedIfEmpty } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  getDb();
  seedIfEmpty();
  const form = await request.formData();
  const file = form.get("file");
  const promptOverride = String(form.get("promptBody") || "") || undefined;
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processDocument({
    source: "upload",
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    buffer,
    promptOverride,
  });
  return NextResponse.json(result);
}

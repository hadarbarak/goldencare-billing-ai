import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDb, getFinanceDocument, seedIfEmpty } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  getDb();
  seedIfEmpty();
  const { id } = await context.params;
  const row = getFinanceDocument(Number(id));
  if (!row || !fs.existsSync(row.storage_path)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const bytes = fs.readFileSync(row.storage_path);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": row.mime_type || "application/pdf",
      "content-disposition": `inline; filename="${row.filename}"`,
    },
  });
}

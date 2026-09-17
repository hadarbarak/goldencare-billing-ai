import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDb, getFinanceDocument, seedIfEmpty } from "@/lib/db";
import { currentFixtureFilename, currentFixturePdfPath } from "@/lib/fixtures/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  getDb();
  seedIfEmpty();
  const { id } = await context.params;
  const row = getFinanceDocument(Number(id));
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const filePath = currentFixturePdfPath(row.filename) ?? row.storage_path;
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  const bytes = fs.readFileSync(filePath);
  const filename = currentFixtureFilename(row.filename);
  const mtime = fs.statSync(filePath).mtimeMs;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": row.mime_type || "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
      etag: `"${mtime}-${bytes.length}"`,
    },
  });
}

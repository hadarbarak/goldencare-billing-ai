import { NextResponse } from "next/server";
import { getDb, getExtractionBundle, listRecentExtractions, seedIfEmpty } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  getDb();
  seedIfEmpty();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const row = getExtractionBundle(Number(id));
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({
      ...row,
      raw: JSON.parse(row.raw_json),
      invoice: JSON.parse(row.canonical_json),
      issues: JSON.parse(row.issues_json),
    });
  }
  return NextResponse.json({ items: listRecentExtractions(50) });
}

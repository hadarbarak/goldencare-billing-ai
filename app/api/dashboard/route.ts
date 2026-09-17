import { NextResponse } from "next/server";
import { getDb, seedIfEmpty } from "@/lib/db";
import { dashboardPayload } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getDb();
  seedIfEmpty();
  return NextResponse.json(await dashboardPayload());
}

import { NextResponse } from "next/server";
import { getDb, listRegressionCases, listRegressionRuns, seedIfEmpty } from "@/lib/db";
import { runRegression } from "@/lib/regression/run";
import { currentLlmProvider } from "@/lib/extract/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getDb();
  seedIfEmpty();
  return NextResponse.json({
    provider: currentLlmProvider(),
    cases: listRegressionCases(),
    runs: listRegressionRuns(8),
  });
}

export async function POST() {
  getDb();
  seedIfEmpty();
  const result = await runRegression();
  return NextResponse.json({ provider: currentLlmProvider(), ...result });
}

import { NextResponse } from "next/server";
import { readLedgerBytes } from "@/lib/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const bytes = await readLedgerBytes();
  if (!bytes) {
    return NextResponse.json({ error: "ledger_not_created_yet" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="goldencare-ledger.xlsx"',
    },
  });
}

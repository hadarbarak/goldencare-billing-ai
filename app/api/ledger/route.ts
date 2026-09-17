import fs from "node:fs";
import { NextResponse } from "next/server";
import { paths } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!fs.existsSync(paths.excel)) {
    return NextResponse.json({ error: "ledger_not_created_yet" }, { status: 404 });
  }
  const bytes = fs.readFileSync(paths.excel);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="goldencare-ledger.xlsx"',
    },
  });
}

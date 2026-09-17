import { NextResponse } from "next/server";
import { activatePrompt, getDb, listPrompts, saveNewPromptVersion, seedIfEmpty } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getDb();
  seedIfEmpty();
  return NextResponse.json({ prompts: listPrompts() });
}

export async function POST(request: Request) {
  getDb();
  seedIfEmpty();
  const body = (await request.json()) as { body?: string; activateId?: number };
  if (typeof body.activateId === "number") {
    activatePrompt(body.activateId);
    return NextResponse.json({ prompts: listPrompts() });
  }
  if (!body.body || body.body.trim().length < 20) {
    return NextResponse.json({ error: "prompt_too_short" }, { status: 400 });
  }
  const id = saveNewPromptVersion(body.body);
  return NextResponse.json({ id, prompts: listPrompts() });
}

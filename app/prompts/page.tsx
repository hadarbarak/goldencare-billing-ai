"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Prompt = {
  id: number;
  name: string;
  body: string;
  version: number;
  is_active: number;
  created_at: string;
};

export default function PromptsPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/prompts");
    const json = await res.json();
    setPrompts(json.prompts);
    const active = json.prompts.find((p: Prompt) => p.is_active);
    if (active) setBody(active.body);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    await load();
    setSaving(false);
  }

  async function activate(id: number) {
    await fetch("/api/prompts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activateId: id }),
    });
    await load();
  }

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h1 className="mb-1 text-xl font-semibold">Settlement Extraction Prompt</h1>
        <p className="mb-4 text-sm text-stone-500">שמירה יוצרת גרסה חדשה. Test Prompt מריץ את הטקסט שבתיבה — גם אם עוד לא נשמר — בלי לייחס את התוצאה לגרסה הפעילה.</p>
        <textarea
          className="min-h-[420px] w-full rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-4 flex gap-3">
          <button className="rounded-full bg-teal-800 px-5 py-2 text-white disabled:opacity-50" onClick={save} disabled={saving}>
            Save New Version
          </button>
          <button
            className="rounded-full border border-stone-300 px-5 py-2"
            onClick={() => {
              sessionStorage.setItem("goldencare-prompt-override", body);
              router.push("/test");
            }}
          >
            Test Prompt
          </button>
        </div>
      </section>
      <aside className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Versions</h2>
        <ul className="space-y-3 text-sm">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="rounded-xl border border-stone-100 p-3">
              <div className="flex items-center justify-between">
                <span>Version {prompt.version}{prompt.is_active ? " - Active" : ""}</span>
                {!prompt.is_active && (
                  <button className="text-teal-800" onClick={() => activate(prompt.id)}>
                    הפעל
                  </button>
                )}
              </div>
              <div className="text-stone-400">{prompt.created_at}</div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

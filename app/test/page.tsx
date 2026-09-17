"use client";

import { useEffect, useState } from "react";
import { ExtractedForm } from "@/components/ExtractedForm";
import { StatusBadge } from "@/components/StatusBadge";
import { ValidationList } from "@/components/ValidationList";
import type { SettlementForm } from "@/lib/schema";
import type { Issue } from "@/lib/validate";

type Result = {
  filename: string;
  status: string;
  method: string | null;
  model: string | null;
  ledgerAction: string | null;
  issues: Issue[];
  settlement: SettlementForm | null;
};

export default function TestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [overridePrompt, setOverridePrompt] = useState(false);

  useEffect(() => {
    setOverridePrompt(Boolean(sessionStorage.getItem("goldencare-prompt-override")));
  }, []);

  function takeFile(next: File | null) {
    setFile(next);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function run(next = file) {
    if (!next) return;
    setBusy(true);
    const form = new FormData();
    form.set("file", next);
    const override = sessionStorage.getItem("goldencare-prompt-override");
    if (override) form.set("promptBody", override);
    const res = await fetch("/api/documents/test", { method: "POST", body: form });
    setResult(await res.json());
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      {overridePrompt && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          מריץ עם טיוטת פרומפט מ-Prompt Manager. התוצאה לא תיוחס לגרסה הפעילה.
        </p>
      )}
      <section
        className={`rounded-2xl border-2 border-dashed p-8 text-center ${drag ? "border-teal-700 bg-teal-50" : "border-stone-300 bg-white"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const next = e.dataTransfer.files[0];
          if (next) takeFile(next);
        }}
      >
        <p className="mb-1 text-lg font-medium">Upload settlement form</p>
        <p className="mb-1 text-xs text-stone-400">
          Document → Header + Line items → Normalization → Validation → ERP-ready canonical
        </p>
        <p className="mb-4 text-sm text-stone-500">PDF או תמונה · גררו לכאן או בחרו קובץ</p>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.txt"
          onChange={(e) => takeFile(e.target.files?.[0] ?? null)}
        />
        <div className="mt-4">
          <button className="rounded-full bg-teal-800 px-5 py-2 text-white disabled:opacity-50" disabled={!file || busy} onClick={() => run()}>
            {busy ? "מריץ…" : "Run AI"}
          </button>
        </div>
      </section>

      {(preview || result) && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="mb-3 font-semibold">Original</h2>
            {preview && file?.type.includes("pdf") ? (
              <iframe title="pdf" className="h-[560px] w-full rounded-lg bg-stone-100" src={preview} />
            ) : preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="form" className="max-h-[560px] w-full object-contain" />
            ) : (
              <p className="text-sm text-stone-500">אין תצוגה מקדימה</p>
            )}
          </section>
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Extracted</h2>
              {result && <StatusBadge status={result.status} />}
            </div>
            {result?.settlement ? <ExtractedForm settlement={result.settlement} /> : <p className="text-sm text-stone-500">לחצו Run AI</p>}
            {result && (
              <div className="mt-6">
                <ValidationList issues={result.issues ?? []} />
                <p className="mt-3 text-xs text-stone-400">
                  {result.method} · {result.model} · Excel: {result.ledgerAction ?? "—"}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

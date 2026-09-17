"use client";

import { useEffect, useState } from "react";
import { REGRESSION_DISPLAY_FIELDS } from "@/lib/schema";
import { LABELED_SUITE_SIZE } from "@/lib/fixtures/samples";

type RunResult = {
  runId: number;
  promptVersion: number;
  previousAccuracy: number | null;
  aggregate: {
    fieldAccuracy: number;
    lineItemF1: number;
    scalarCorrect: number;
    scalarTotal: number;
    byField: Record<string, { correct: number; total: number; accuracy: number }>;
    caveat: string;
  };
  cases: Array<{
    name: string;
    filename: string;
    scalarCorrect: number;
    scalarTotal: number;
    lineItemF1: number;
    fields: Array<{ field: string; ok: boolean; expected: unknown; actual: unknown }>;
  }>;
};

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function RegressionPage() {
  const [meta, setMeta] = useState<{
    provider?: string;
    cases: Array<{ name: string; filename: string }>;
    runs: Array<{ id: number; field_accuracy: number | null; prompt_version: number | null }>;
  } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/regression")
      .then((r) => r.json())
      .then(setMeta);
  }, []);

  async function run() {
    setBusy(true);
    const res = await fetch("/api/regression", { method: "POST" });
    const json = await res.json();
    setResult(json);
    setMeta((prev) => (prev ? { ...prev, provider: json.provider ?? prev.provider } : prev));
    setBusy(false);
  }

  const docs = result?.cases.length ?? meta?.cases.length ?? 0;
  const fieldsTested = result?.aggregate.scalarTotal ?? 0;
  const correct = result?.aggregate.scalarCorrect ?? 0;
  const delta =
    result && result.previousAccuracy !== null ? result.aggregate.fieldAccuracy - result.previousAccuracy : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Regression Suite</h1>
            <p className="text-sm text-stone-500">
              {meta?.cases.length ?? LABELED_SUITE_SIZE} labeled documents covering distinct layouts and failure modes.
              Ground truth scores only fields that appear on each document.
            </p>
            <div className="mt-2 inline-block rounded-full bg-stone-100 px-3 py-1 text-xs font-medium">
              Provider: {(meta?.provider ?? "mock").toUpperCase()}
            </div>
          </div>
          <button className="rounded-full bg-teal-800 px-5 py-2 text-white disabled:opacity-50" onClick={run} disabled={busy}>
            {busy ? "רץ…" : "Run Regression"}
          </button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <Stat label="Documents" value={String(docs)} />
          <Stat label="Fields tested" value={result ? String(fieldsTested) : "—"} />
          <Stat label="Correct" value={result ? String(correct) : "—"} />
          <Stat label="Accuracy" value={result ? pct(result.aggregate.fieldAccuracy) : "—"} />
        </div>
        {meta?.cases && meta.cases.length > 0 && (
          <ol className="mt-5 list-decimal space-y-1 pr-5 text-sm text-stone-600">
            {meta.cases.map((item) => (
              <li key={item.filename}>
                <span className="font-medium text-stone-800">{item.name}</span>
                <span className="text-stone-400"> · {item.filename}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {result && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          {result.previousAccuracy !== null && (
            <div className="mb-5 rounded-xl bg-stone-50 p-4 text-sm">
              <div>Previous prompt: {pct(result.previousAccuracy)}</div>
              <div>New prompt: {pct(result.aggregate.fieldAccuracy)}</div>
              {delta !== null && (
                <div className={delta >= 0 ? "text-teal-800" : "text-red-800"}>
                  {delta >= 0 ? "↑" : "↓"} {delta >= 0 ? "+" : ""}
                  {pct(delta)}
                </div>
              )}
            </div>
          )}
          <table className="w-full text-right text-sm">
            <thead className="text-stone-500">
              <tr>
                <th className="py-2">Field</th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {REGRESSION_DISPLAY_FIELDS.map(({ field, label }) => {
                const stats = result.aggregate.byField[field] ?? { accuracy: 0, correct: 0, total: 0 };
                return (
                  <tr key={field} className="border-t border-stone-100">
                    <td className="py-2">{label}</td>
                    <td>
                      {pct(stats.accuracy)} ({stats.correct}/{stats.total})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-stone-400">{result.aggregate.caveat}</p>
          {(meta?.provider ?? "mock") === "mock" && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Mock mode validates the pipeline and scoring mechanism. Extraction-quality measurements should be evaluated with an actual LLM provider.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-stone-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

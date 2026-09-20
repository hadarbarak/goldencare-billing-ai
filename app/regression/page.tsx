"use client";

import { useEffect, useState } from "react";
import { REGRESSION_DISPLAY_FIELDS } from "@/lib/schema";
import { LABELED_SUITE_SIZE } from "@/lib/fixtures/samples";

type StoredRun = {
  id: number;
  field_accuracy: number | null;
  line_item_f1: number | null;
  prompt_version: number | null;
  finished_at: string | null;
  summary_json: string | null;
};

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

function resultFromStoredRun(run: StoredRun): RunResult | null {
  if (!run.summary_json) return null;
  try {
    const summary = JSON.parse(run.summary_json) as Partial<RunResult> & {
      promptVersion?: number;
      previousAccuracy?: number | null;
    };
    if (!summary.aggregate || !summary.cases) return null;
    return {
      runId: run.id,
      promptVersion: run.prompt_version ?? summary.promptVersion ?? 0,
      previousAccuracy: summary.previousAccuracy ?? null,
      aggregate: summary.aggregate,
      cases: summary.cases,
    };
  } catch {
    return null;
  }
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function RegressionPage() {
  const [meta, setMeta] = useState<{
    provider?: string;
    cases: Array<{ name: string; filename: string }>;
    runs: StoredRun[];
  } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/regression")
      .then((r) => r.json())
      .then((json) => {
        setMeta(json);
        const latest = json.runs?.[0] as StoredRun | undefined;
        if (latest) setResult(resultFromStoredRun(latest));
      });
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
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="inline-block rounded-full bg-stone-100 px-3 py-1 text-xs font-medium">
                Provider: {(meta?.provider ?? "mock").toUpperCase()}
              </div>
              {result && (
                <div className="inline-block rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-900">
                  Last run #{result.runId} · Prompt v{result.promptVersion} · F1 {result.aggregate.lineItemF1.toFixed(2)}
                </div>
              )}
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

      {meta?.runs && meta.runs.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Recent runs</h2>
          <ul className="space-y-2 text-sm">
            {meta.runs.map((run) => (
              <li key={run.id} className="flex justify-between border-t border-stone-100 py-2 first:border-0">
                <span>
                  Run #{run.id}
                  {run.prompt_version != null ? ` · Prompt v${run.prompt_version}` : ""}
                </span>
                <span className="text-stone-500">
                  {run.field_accuracy == null ? "—" : pct(run.field_accuracy)}
                  {run.line_item_f1 == null ? "" : ` · F1 ${run.line_item_f1.toFixed(2)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney } from "@/lib/present";
import { DownloadExcelButton } from "@/components/DownloadExcelButton";

type Dashboard = {
  totals: { processedForms: number; heldCount: number; amount: number; accuracy: number | null };
  bySupplier: Array<{ key: string; name: string; total: number; count: number }>;
  byMonth: Array<{ month: string; total: number; count: number }>;
  pendingReviews: Array<{
    review_id: number;
    extraction_id: number;
    filename: string;
    canonical_json: string;
    issues_json: string;
  }>;
};

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [payload, setPayload] = useState<unknown>(null);
  const [simResult, setSimResult] = useState<{ result?: { documentId: number; status: string; settlement?: { supplierName: string | null; totalAmount: number | null } } } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [dash, sim] = await Promise.all([fetch("/api/dashboard"), fetch("/api/email/simulate")]);
    setData(await dash.json());
    setPayload((await sim.json()).payload);
  }

  useEffect(() => {
    load();
  }, []);

  async function simulate() {
    setBusy(true);
    const res = await fetch("/api/email/simulate", { method: "POST" });
    setSimResult(await res.json());
    await load();
    setBusy(false);
  }

  if (!data) return <p>טוען…</p>;

  const maxSupplier = Math.max(...data.bySupplier.map((row) => row.total), 1);
  const maxMonth = Math.max(...data.byMonth.map((row) => row.total), 1);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Email Simulator</h1>
            <p className="text-sm text-stone-500">Payload אמיתי: headers, body, attachment. בלי חיבור לתיבת מייל.</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <DownloadExcelButton className="rounded-full border border-stone-300 bg-white px-5 py-2 text-sm" />
            <button className="rounded-full bg-teal-800 px-5 py-2 text-white disabled:opacity-50" disabled={busy} onClick={simulate}>
              {busy ? "שולח…" : "Simulate Incoming Email"}
            </button>
          </div>
        </div>
        <pre className="overflow-auto rounded-xl bg-stone-950 p-4 text-left text-xs leading-5 text-stone-100" dir="ltr">
          {JSON.stringify(payload, null, 2)}
        </pre>
        {simResult?.result && (
          <p className="mt-3 text-sm">
            סטטוס: <StatusBadge status={simResult.result.status} /> ·{" "}
            <Link className="text-teal-800" href={`/documents/${simResult.result.documentId}`}>
              פתח מסמך
            </Link>
          </p>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Kpi label="Processed Forms" value={String(data.totals.processedForms)} />
        <Kpi label="Total Amount" value={formatMoney(data.totals.amount)} />
        <Kpi label="Needs Review" value={String(data.totals.heldCount)} warn={data.totals.heldCount > 0} />
        <Kpi label="Extraction Accuracy" value={data.totals.accuracy === null ? "—" : pct(data.totals.accuracy)} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card title="Spend by Supplier">
          {data.bySupplier.length === 0 && <p className="text-sm text-stone-500">אין עדיין רשומות פעילות באקסל.</p>}
          {data.bySupplier.map((row) => (
            <Bar key={row.key} label={`${row.name} (${row.count})`} value={formatMoney(row.total)} ratio={row.total / maxSupplier} />
          ))}
        </Card>
        <Card title="Monthly Spend">
          {data.byMonth.length === 0 && <p className="text-sm text-stone-500">אין עדיין מגמה חודשית.</p>}
          {data.byMonth.map((row) => (
            <Bar key={row.month} label={row.month} value={formatMoney(row.total)} ratio={row.total / maxMonth} />
          ))}
        </Card>
      </section>
    </div>
  );
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${warn ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}>
      <div className="text-sm text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Bar({ label, value, ratio }: { label: string; value: string; ratio: number }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-stone-100">
        <div className="h-2 rounded-full bg-teal-700" style={{ width: `${Math.max(8, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMoney } from "@/lib/present";

type Row = {
  documentId: number;
  filename: string;
  documentType: string | null;
  supplier: string;
  period: string;
  amount: number | null;
  currency: string;
  status: string;
  method: string;
};

function kindLabel(type: string | null): string {
  if (type === "settlement") return "טופס התחשבנות";
  if (type === "invoice") return "חשבונית";
  return "מסמך";
}

export default function DocumentsPage() {
  const [items, setItems] = useState<Row[]>([]);

  useEffect(() => {
    fetch("/api/documents")
      .then(async (res) => {
        if (!res.ok) return { items: [] as Row[] };
        return res.json() as Promise<{ items?: Row[] }>;
      })
      .then((json) => setItems(json.items ?? []))
      .catch(() => setItems([]));
  }, []);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5">
      <h1 className="mb-4 text-xl font-semibold">Documents</h1>
      <table className="w-full text-right text-sm">
        <thead className="text-stone-500">
          <tr>
            <th className="py-2">סוג</th>
            <th>ספק</th>
            <th>Period</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.documentId} className="border-t border-stone-100 hover:bg-stone-50">
              <td className="py-3 text-stone-600">{kindLabel(row.documentType)}</td>
              <td>
                <Link className="text-teal-900" href={`/documents/${row.documentId}`}>
                  {row.supplier}
                </Link>
                <div className="text-xs text-stone-400">{row.filename}</div>
              </td>
              <td>{row.period}</td>
              <td>{formatMoney(row.amount, row.currency)}</td>
              <td className="text-stone-500">{row.method}</td>
              <td>
                <StatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="mt-6 text-sm text-stone-500">אין מסמכים עדיין. הריצו Simulate Incoming Email מהדשבורד.</p>}
    </section>
  );
}

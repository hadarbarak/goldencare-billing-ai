"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ExtractedForm } from "@/components/ExtractedForm";
import { StatusBadge } from "@/components/StatusBadge";
import { ValidationList } from "@/components/ValidationList";
import type { SettlementForm } from "@/lib/schema";
import type { Issue } from "@/lib/validate";

type Detail = {
  documentId: number;
  extractionId: number | null;
  reviewId: number | null;
  filename: string;
  mimeType: string;
  extractedText: string | null;
  status: string;
  method: string;
  settlement: SettlementForm | null;
  issues: Issue[];
  from: string | null;
  subject: string | null;
  body: string | null;
  fileRev?: number;
  redirectTo?: number;
};

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<SettlementForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  async function load() {
    const json = await fetch(`/api/documents/${params.id}`).then((res) => res.json());
    if (json.redirectTo) {
      router.replace(`/documents/${json.redirectTo}`);
      return;
    }
    setData(json);
    setDraft(json.settlement);
  }

  useEffect(() => {
    load();
  }, [params.id]);

  async function approve() {
    if (!data?.reviewId || !data.extractionId || !draft) return;
    setBusy(true);
    setReviewMessage(null);
    const json = await fetch("/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewId: data.reviewId,
        extractionId: data.extractionId,
        settlement: draft,
        promote: true,
      }),
    }).then((res) => res.json());
    await load();
    if (!json.ok) {
      setReviewMessage("התיקון נשמר, אבל האריתמטיקה עדיין לא תקינה. הרשומה נשארת Needs Review.");
    }
    setBusy(false);
  }

  if (!data) return <p>טוען…</p>;

  const fileUrl = `/api/documents/${data.documentId}/file?v=${data.fileRev ?? Date.now()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.filename}</h1>
          <p className="text-sm text-stone-500">
            {data.from} · {data.subject} · {data.method}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.mimeType?.includes("pdf") && (
            <>
              <a
                className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm"
                href={`${fileUrl}#zoom=page-width`}
                target="_blank"
                rel="noreferrer"
              >
                פתח מקור בחלון מלא
              </a>
              <a className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm" href={`${fileUrl}&download=1`}>
                הורד PDF
              </a>
            </>
          )}
          <StatusBadge status={data.status} />
        </div>
      </div>
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Extracted fields</h2>
        {data.status === "needs_review" && draft ? (
          <ReviewEditor
            draft={draft}
            onChange={setDraft}
            onApprove={approve}
            busy={busy}
            message={reviewMessage}
          />
        ) : data.settlement ? (
          <ExtractedForm settlement={data.settlement} />
        ) : (
          <p>אין חילוץ</p>
        )}
        <div className="mt-6">
          <ValidationList issues={data.issues ?? []} />
        </div>
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">מסמך מקור</h2>
          <p className="text-xs text-stone-500">אם התצוגה קטנה — פתחו בחלון מלא או הורידו את ה-PDF</p>
        </div>
        {data.mimeType?.includes("pdf") ? (
          <iframe
            title="original"
            className="h-[min(90vh,1100px)] w-full rounded-lg border border-stone-200 bg-stone-100"
            src={`${fileUrl}#toolbar=1&navpanes=0&zoom=page-width`}
          />
        ) : (
          <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap text-sm">{data.extractedText || data.body}</pre>
        )}
      </section>
    </div>
  );
}

function ReviewEditor({
  draft,
  onChange,
  onApprove,
  busy,
  message,
}: {
  draft: SettlementForm;
  onChange: (next: SettlementForm) => void;
  onApprove: () => void;
  busy: boolean;
  message: string | null;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-stone-500">
        Approval re-runs arithmetic checks. A total that still does not add up stays Needs Review.
      </p>
      {message && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-950">{message}</p>}
      <Field label="Supplier" value={draft.supplierName ?? ""} onChange={(supplierName) => onChange({ ...draft, supplierName })} />
      <Field label="Document date" value={draft.documentDate ?? ""} onChange={(documentDate) => onChange({ ...draft, documentDate })} />
      <Field
        label="Total"
        value={draft.totalAmount === null ? "" : String(draft.totalAmount)}
        onChange={(value) => onChange({ ...draft, totalAmount: value === "" ? null : Number(value) })}
      />
      <Field
        label="VAT"
        value={draft.vatAmount === null ? "" : String(draft.vatAmount)}
        onChange={(value) => onChange({ ...draft, vatAmount: value === "" ? null : Number(value) })}
      />
      <Field label="Allocation #" value={draft.allocationNumber ?? ""} onChange={(allocationNumber) => onChange({ ...draft, allocationNumber })} />
      <Field
        label="Purchase order"
        value={draft.purchaseOrderNumber ?? ""}
        onChange={(purchaseOrderNumber) => onChange({ ...draft, purchaseOrderNumber })}
      />
      <Field
        label="Subtotal"
        value={draft.subtotal === null ? "" : String(draft.subtotal)}
        onChange={(value) => onChange({ ...draft, subtotal: value === "" ? null : Number(value) })}
      />
      <button className="rounded-full bg-teal-800 px-4 py-2 text-white disabled:opacity-50" disabled={busy} onClick={onApprove}>
        Approve and write to ledger
      </button>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-stone-500">{label}</div>
      <input className="w-full rounded-lg border border-stone-200 px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

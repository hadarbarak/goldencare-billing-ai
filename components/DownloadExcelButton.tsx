"use client";

import { useState } from "react";

export function DownloadExcelButton({ className }: { className?: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    setMessage(null);
    const res = await fetch("/api/ledger");
    if (!res.ok) {
      setMessage("עדיין אין קובץ Excel. הריצו Simulate Incoming Email מהדשבורד.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "goldencare-ledger.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <button type="button" className={className} onClick={download}>
        הורד Excel
      </button>
      {message && <p className="mt-2 text-xs text-amber-800">{message}</p>}
    </div>
  );
}

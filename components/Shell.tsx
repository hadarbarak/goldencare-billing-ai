"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DownloadExcelButton } from "@/components/DownloadExcelButton";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/test", label: "Test Extraction" },
  { href: "/prompts", label: "Prompts" },
  { href: "/regression", label: "Regression Tests" },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-teal-950 text-teal-50">
        <div className="border-b border-teal-900 px-5 py-6">
          <div className="text-xs tracking-wide text-teal-300">GoldenCare AI</div>
          <div className="mt-1 text-lg font-semibold">התחשבנות ספקים</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm ${active ? "bg-teal-800 text-white" : "text-teal-100 hover:bg-teal-900"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-3 border-t border-teal-900 px-4 py-4">
          <DownloadExcelButton className="w-full rounded-lg bg-teal-800 px-3 py-2 text-sm text-white hover:bg-teal-700" />
          <div className="text-xs text-teal-400">מקור האמת: קובץ Excel אחד</div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

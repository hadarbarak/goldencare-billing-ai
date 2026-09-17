import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata = {
  title: "GoldenCare Billing AI",
  description: "פענוח טפסי התחשבנות בעברית",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

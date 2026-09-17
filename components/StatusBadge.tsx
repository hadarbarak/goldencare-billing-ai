import { normalizeStatus } from "@/lib/validate";

export function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status);
  const styles: Record<string, string> = {
    processed: "bg-teal-100 text-teal-900",
    needs_review: "bg-amber-100 text-amber-900",
    failed: "bg-red-100 text-red-800",
    duplicate: "bg-stone-100 text-stone-600",
  };
  const labels: Record<string, string> = {
    processed: "✓ Processed",
    needs_review: "⚠ Review",
    failed: "Failed",
    duplicate: "Duplicate",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${styles[normalized] ?? styles.failed}`}>
      {labels[normalized] ?? status}
    </span>
  );
}

import type { Issue } from "@/lib/validate";

export function ValidationList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) {
    return <div className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-900">✓ Validation passed</div>;
  }
  const fatal = issues.filter((issue) => issue.code === "LLM_ERROR" || issue.code === "VISION_ERROR");
  const schema = issues.filter((issue) => issue.layer === "schema" && !fatal.includes(issue));
  const business = issues.filter((issue) => issue.layer !== "schema");
  return (
    <div className="space-y-3 text-sm">
      {fatal.length > 0 && (
        <section className="rounded-xl bg-red-50 px-4 py-3 text-red-900">
          {fatal.map((issue) => (
            <div key={issue.code}>{issue.message}</div>
          ))}
        </section>
      )}
      {schema.length > 0 && (
        <section>
          <div className="mb-1 font-medium text-stone-500">Schema Validation</div>
          <ul className="space-y-1">
            {schema.map((issue) => (
              <li key={`${issue.code}-${issue.field}`} className={issue.severity === "error" ? "text-red-800" : "text-stone-600"}>
                {issue.severity === "error" ? "✗" : "⚠"} {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
      {business.length > 0 && (
        <section>
          <div className="mb-1 font-medium text-stone-500">Business Validation</div>
          <ul className="space-y-1">
            {business.map((issue) => (
              <li key={`${issue.code}-${issue.field}-${issue.message}`} className={issue.severity === "error" ? "text-amber-800" : "text-stone-600"}>
                {issue.severity === "error" ? "⚠" : "•"} {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

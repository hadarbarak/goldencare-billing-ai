import { runRegression } from "../lib/regression/run";
import { getDb, seedIfEmpty } from "../lib/db";

getDb();
seedIfEmpty();
const result = await runRegression();
const misses = result.cases.map((item) => ({
  filename: item.filename,
  name: item.name,
  score: `${item.scalarCorrect}/${item.scalarTotal}`,
  lineItemF1: item.lineItemF1,
  misses: item.fields
    .filter((field) => !field.ok)
    .map((field) => ({ field: field.field, expected: field.expected, actual: field.actual })),
}));
console.log(
  JSON.stringify(
    {
      runId: result.runId,
      promptVersion: result.promptVersion,
      fieldAccuracy: result.aggregate.fieldAccuracy,
      lineItemF1: result.aggregate.lineItemF1,
      byField: result.aggregate.byField,
      misses,
      beforeAfter: result.beforeAfter,
    },
    null,
    2,
  ),
);

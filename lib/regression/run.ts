import fs from "node:fs";
import path from "node:path";
import { getActivePrompt, listRegressionCases, listRegressionRuns, insertRegressionRun, finishRegressionRun } from "@/lib/db";
import { processDocument, readFixtureBuffer } from "@/lib/extract/pipeline";
import type { CanonicalInvoice } from "@/lib/schema";
import { EMPTY_CANONICAL } from "@/lib/schema";
import { aggregateScores, diffRuns, scoreCase, type CaseScore } from "@/lib/regression/score";

export async function runRegression() {
  const prompt = getActivePrompt();
  const cases = listRegressionCases();
  const previous = listRegressionRuns(1)[0];
  const previousCases: CaseScore[] | null = previous?.summary_json
    ? ((JSON.parse(previous.summary_json) as { cases: CaseScore[] }).cases ?? null)
    : null;

  const runId = insertRegressionRun(prompt.id);
  const scored: CaseScore[] = [];

  for (const testCase of cases) {
    const file = readFixtureBuffer(testCase.filename);
    if (!file) {
      scored.push({
        name: testCase.name,
        filename: testCase.filename,
        fields: [],
        scalarCorrect: 0,
        scalarTotal: 0,
        lineItemF1: 0,
      });
      continue;
    }
    const result = await processDocument({
      source: "regression",
      filename: testCase.filename,
      mimeType: file.mimeType,
      buffer: file.buffer,
      skipLedger: true,
    });
    const expected = JSON.parse(testCase.expected_json) as CanonicalInvoice;
    scored.push(
      scoreCase(testCase.name, testCase.filename, expected, result.invoice ?? emptyInvoice()),
    );
  }

  const aggregate = aggregateScores(scored);
  const beforeAfter = diffRuns(previousCases, scored);
  const summary = {
    promptId: prompt.id,
    promptVersion: prompt.version,
    cases: scored,
    aggregate,
    beforeAfter,
    previousRunId: previous?.id ?? null,
    previousAccuracy: previous?.field_accuracy ?? null,
  };
  finishRegressionRun(runId, aggregate.fieldAccuracy, aggregate.lineItemF1, JSON.stringify(summary));
  return { runId, ...summary };
}

function emptyInvoice(): CanonicalInvoice {
  return { ...EMPTY_CANONICAL };
}

export function regressionFixturePath(filename: string): string {
  return path.join(process.cwd(), "fixtures", "invoices", filename);
}

export function fixtureExists(filename: string): boolean {
  return fs.existsSync(regressionFixturePath(filename));
}

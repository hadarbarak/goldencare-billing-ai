import { getDb, seedIfEmpty, saveNewPromptVersion, listPrompts, listRegressionRuns } from "../lib/db";
import { PROMPT_V2 } from "../lib/prompts/default";

getDb();
seedIfEmpty();

const run9 = listRegressionRuns(20).find((run) => run.id === 9);
if (!run9) {
  throw new Error("Run #9 is missing — refusing to create Prompt v2 until the baseline is present.");
}

const prompts = listPrompts();
const v1 = prompts.find((p) => p.version === 1);
if (!v1) throw new Error("Prompt v1 is missing.");

const existingV2 = prompts.find((p) => p.version === 2 && p.body === PROMPT_V2);
if (existingV2) {
  console.log(JSON.stringify({ action: "already_active_or_present", promptId: existingV2.id, version: 2, run9Accuracy: run9.field_accuracy }));
  process.exit(0);
}

const id = saveNewPromptVersion(PROMPT_V2);
const after = listPrompts();
console.log(
  JSON.stringify(
    {
      action: "created",
      promptId: id,
      versions: after.map((p) => ({ id: p.id, version: p.version, is_active: p.is_active, bodyLen: p.body.length })),
      run9Accuracy: run9.field_accuracy,
      v1Unchanged: after.find((p) => p.version === 1)?.body === v1.body,
    },
    null,
    2,
  ),
);

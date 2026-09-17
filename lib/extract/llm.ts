import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import { emptyRawExtraction, rawExtractionSchema, type RawExtraction } from "@/lib/schema";
import { sampleByFilename, sampleByText } from "@/lib/fixtures/samples";
import type { PageImage } from "@/lib/extract/vision";
import { currentLlmProvider } from "@/lib/extract/provider";

export { currentLlmProvider } from "@/lib/extract/provider";

export class LlmExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmExtractionError";
  }
}

export interface LlmInput {
  prompt: string;
  documentText: string;
  filename: string;
  emailSubject?: string | null;
  emailBody?: string | null;
  images?: PageImage[];
}

export interface LlmResult {
  raw: RawExtraction;
  model: string;
}

function mockExtract(input: LlmInput): RawExtraction {
  const sample = sampleByFilename(input.filename) ?? sampleByText(input.documentText);
  if (sample) return sample.raw;
  return emptyRawExtraction();
}

function textPreamble(input: LlmInput): string {
  const scanNote = input.images?.length
    ? "המסמך הוא סריקה. חלץ את השדות מהתמונות המצורפות. source_text יכול לתאר את האזור בתמונה."
    : "";
  return [
    input.emailSubject ? `נושא המייל: ${input.emailSubject}` : "",
    input.emailBody ? `גוף המייל:\n${input.emailBody}` : "",
    `שם הקובץ: ${input.filename}`,
    scanNote,
    input.documentText ? `טקסט המסמך:\n${input.documentText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function openaiExtract(input: LlmInput): Promise<LlmResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new LlmExtractionError("OPENAI_API_KEY is missing. Set LLM_PROVIDER=mock to run without a key.");
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const client = new OpenAI({ apiKey });

  const content: ChatCompletionContentPart[] = [{ type: "text", text: textPreamble(input) }];
  for (const image of input.images ?? []) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.mime};base64,${image.base64}` },
    });
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.prompt },
      { role: "user", content },
    ],
  });
  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) throw new LlmExtractionError("Empty LLM response");
  try {
    return { raw: rawExtractionSchema.parse(JSON.parse(rawContent)), model };
  } catch (error) {
    throw new LlmExtractionError(
      error instanceof Error ? `invalid model response: ${error.message}` : "invalid model response",
    );
  }
}

export async function runLlm(input: LlmInput): Promise<LlmResult> {
  if (currentLlmProvider() === "openai") return openaiExtract(input);
  return { raw: mockExtract(input), model: "mock" };
}

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { sampleByFilename, sampleByText } from "@/lib/fixtures/samples";
import { currentLlmProvider } from "@/lib/extract/provider";
import {
  normalizedTextFromRuns,
  rawTextFromRuns,
  type PdfTextRun,
} from "@/lib/extract/rtl-text";

const require = createRequire(import.meta.url);
const WEAK_TEXT = 40;

export interface PdfTextLayers {
  rawPdfText: string;
  normalizedPdfText: string;
}

export async function extractPdfTextLayers(buffer: Buffer): Promise<PdfTextLayers> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ).href;
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });
    const pdf = await task.promise;
    const rawPages: string[] = [];
    const normalizedPages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: PdfTextRun[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        const tx = pdfjs.Util.transform(viewport.transform, item.transform);
        runs.push({
          str: item.str,
          x: tx[4],
          y: tx[5],
          width: item.width,
          dir: item.dir || "ltr",
          hasEOL: item.hasEOL,
        });
      }
      rawPages.push(rawTextFromRuns(runs));
      normalizedPages.push(normalizedTextFromRuns(runs));
    }
    return {
      rawPdfText: rawPages.filter(Boolean).join("\n").trim(),
      normalizedPdfText: normalizedPages.filter(Boolean).join("\n").trim(),
    };
  } catch (error) {
    console.warn("pdf text extraction failed", error);
    return { rawPdfText: "", normalizedPdfText: "" };
  }
}

/** Stream-order text; kept for callers that only need a blob. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const layers = await extractPdfTextLayers(buffer);
  return layers.rawPdfText;
}

export function looksLikeHebrewInvoice(text: string): boolean {
  return /[\u0590-\u05ff]/.test(text) && text.replace(/\s/g, "").length >= WEAK_TEXT;
}

export function isWeakDocumentText(text: string): boolean {
  return !looksLikeHebrewInvoice(text) && text.replace(/\s/g, "").length < WEAK_TEXT;
}

export interface TextExtraction {
  text: string;
  rawPdfText: string;
  normalizedPdfText: string;
  method: string;
  needsVision: boolean;
}

function layers(text: string, method: string, needsVision: boolean): TextExtraction {
  return { text, rawPdfText: text, normalizedPdfText: text, method, needsVision };
}

export async function extractDocumentText(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<TextExtraction> {
  const mime = input.mimeType.split(";")[0].trim().toLowerCase();
  const provider = currentLlmProvider();
  const known = sampleByFilename(input.filename);

  // Labeled fixtures: mock must validate against the printed form, not a pdf.js
  // round-trip of a generated Hebrew text layer.
  if (known && provider === "mock") {
    return layers(known.text, known.forceVision ? "vision" : "mock", false);
  }

  if (known?.forceVision) {
    return { text: "", rawPdfText: "", normalizedPdfText: "", method: "vision", needsVision: true };
  }

  if (mime.startsWith("text/") || input.filename.toLowerCase().endsWith(".txt")) {
    return layers(input.buffer.toString("utf8"), "plain-text", false);
  }

  if (mime.startsWith("image/")) {
    if (provider === "mock" && sampleByFilename(input.filename)) {
      return layers(sampleByFilename(input.filename)!.text, "mock", false);
    }
    return { text: "", rawPdfText: "", normalizedPdfText: "", method: "vision", needsVision: true };
  }

  if (mime === "application/pdf" || input.filename.toLowerCase().endsWith(".pdf")) {
    const extracted = await withTimeout(extractPdfTextLayers(input.buffer), 8000, {
      rawPdfText: "",
      normalizedPdfText: "",
    });
    const llmText = extracted.normalizedPdfText || extracted.rawPdfText;
    if (!isWeakDocumentText(llmText)) {
      return {
        text: llmText,
        rawPdfText: extracted.rawPdfText,
        normalizedPdfText: extracted.normalizedPdfText || extracted.rawPdfText,
        method: "pdf-text",
        needsVision: false,
      };
    }
    const sample = sampleByFilename(input.filename) ?? (llmText ? sampleByText(llmText) : undefined);
    if (provider === "mock" && sample) {
      return layers(sample.text, "mock", false);
    }
    return {
      text: llmText,
      rawPdfText: extracted.rawPdfText,
      normalizedPdfText: extracted.normalizedPdfText,
      method: "vision",
      needsVision: true,
    };
  }

  if (known && provider === "mock") {
    return layers(known.text, "mock", false);
  }
  return layers("", "unknown", false);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

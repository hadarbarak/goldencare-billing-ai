import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CanonicalInvoice, SettlementForm } from "@/lib/schema";
import { toSettlementForm } from "@/lib/schema";
import {
  findDuplicateDocument,
  getActivePrompt,
  insertDocument,
  insertExtraction,
  insertLedgerEvent,
  insertReview,
  documentByFilename,
} from "@/lib/db";
import { parseInboundEmail } from "@/lib/email/parse";
import { extractDocumentText } from "@/lib/extract/text";
import { currentLlmProvider, LlmExtractionError, runLlm } from "@/lib/extract/llm";
import { renderDocumentImages, type PageImage } from "@/lib/extract/vision";
import { writeLedger } from "@/lib/excel";
import { paths } from "@/lib/paths";
import {
  emptyRawExtraction,
  llmUnavailableIssue,
  validateExtraction,
  visionUnavailableIssue,
  type ExtractionStatus,
  type Issue,
} from "@/lib/validate";

export interface ProcessResult {
  duplicate?: boolean;
  documentId: number;
  extractionId: number | null;
  filename: string;
  messageId: string | null;
  status: ExtractionStatus | "duplicate";
  issues: Issue[];
  invoice: CanonicalInvoice | null;
  settlement: SettlementForm | null;
  ledgerAction: string | null;
  method: string | null;
  model: string | null;
}

export interface ProcessOptions {
  source: "email" | "upload" | "regression";
  messageId?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  subject?: string | null;
  emailDate?: string | null;
  headersJson?: string | null;
  bodyText?: string | null;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  skipLedger?: boolean;
  promptOverride?: string;
  promptIdOverride?: number | null;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function storeAttachment(sha: string, filename: string, buffer: Buffer): string {
  const safe = filename.replace(/[^\w.\u0590-\u05ff-]+/g, "_");
  const dest = path.join(paths.attachments, `${sha.slice(0, 12)}-${safe}`);
  fs.writeFileSync(dest, buffer);
  return dest;
}

export async function processDocument(options: ProcessOptions): Promise<ProcessResult> {
  const hash = sha256(options.buffer);
  const existing = findDuplicateDocument(options.messageId ?? null, hash);
  if (existing && options.source === "email") {
    return {
      duplicate: true,
      documentId: existing.id,
      extractionId: null,
      filename: options.filename,
      messageId: options.messageId ?? null,
      status: "duplicate",
      issues: [],
      invoice: null,
      settlement: null,
      ledgerAction: "skipped_duplicate",
      method: null,
      model: null,
    };
  }

  const extracted = await extractDocumentText({
    buffer: options.buffer,
    filename: options.filename,
    mimeType: options.mimeType,
  });

  let method = extracted.method;
  let images: PageImage[] = [];
  let fatalIssue: Issue | null = null;

  if (extracted.needsVision && currentLlmProvider() === "openai") {
    try {
      images = await renderDocumentImages({
        buffer: options.buffer,
        mimeType: options.mimeType,
        filename: options.filename,
      });
      method = "vision";
      if (images.length === 0) {
        fatalIssue = visionUnavailableIssue("no pages rendered");
      }
    } catch (error) {
      fatalIssue = visionUnavailableIssue(error instanceof Error ? error.message : "rasterize failed");
    }
  }

  const combinedText = [options.bodyText, extracted.normalizedPdfText || extracted.text].filter(Boolean).join("\n\n");
  const storagePath = storeAttachment(hash, options.filename, options.buffer);
  const prompt = getActivePrompt();
  const promptBody = options.promptOverride || prompt.body;
  const promptId =
    options.promptOverride && options.promptIdOverride === undefined ? null : (options.promptIdOverride ?? prompt.id);

  const documentId = insertDocument({
    source: options.source,
    message_id: options.messageId ?? null,
    from_address: options.fromAddress ?? null,
    to_address: options.toAddress ?? null,
    subject: options.subject ?? null,
    email_date: options.emailDate ?? null,
    headers_json: options.headersJson ?? null,
    body_text: options.bodyText ?? null,
    filename: options.filename,
    mime_type: options.mimeType,
    sha256: hash,
    storage_path: storagePath,
    extracted_text: extracted.rawPdfText || extracted.text,
    normalized_text: extracted.normalizedPdfText || extracted.text,
    extraction_method: method,
  });

  let llmRaw = emptyRawExtraction();
  let model = "none";
  if (!fatalIssue) {
    try {
      const llm = await runLlm({
        prompt: promptBody,
        documentText: combinedText,
        filename: options.filename,
        emailSubject: options.subject,
        emailBody: options.bodyText,
        images,
      });
      llmRaw = llm.raw;
      model = llm.model;
    } catch (error) {
      const detail = error instanceof LlmExtractionError || error instanceof Error ? error.message : "unknown error";
      fatalIssue = llmUnavailableIssue(detail);
    }
  }

  const validation = validateExtraction(llmRaw, extracted.normalizedPdfText || extracted.text, extracted.rawPdfText);
  const issues = fatalIssue ? [fatalIssue] : validation.issues;
  const status: ExtractionStatus = fatalIssue ? "failed" : validation.status;
  const extractionId = insertExtraction({
    document_id: documentId,
    prompt_id: promptId,
    raw_json: JSON.stringify(llmRaw),
    canonical_json: JSON.stringify(validation.canonical.invoice),
    status,
    issues_json: JSON.stringify(issues),
    derived_json: JSON.stringify(validation.canonical.derived),
    model,
  });

  let ledgerAction: string | null = null;
  // Failed: skip Excel. Needs Review: persist as held_for_review. Processed: active source of truth.
  if (!options.skipLedger && status !== "failed") {
    const ledgerStatus = status === "processed" ? "active" : "held_for_review";
    const written = await writeLedger({
      extractionId,
      documentId,
      messageId: options.messageId ?? null,
      sha256: hash,
      filename: options.filename,
      receivedAt: options.emailDate ?? new Date().toISOString(),
      invoice: validation.canonical.invoice,
      status: ledgerStatus,
    });
    ledgerAction = written.action;
    insertLedgerEvent({
      extraction_id: extractionId,
      document_id: documentId,
      action: written.action,
      excel_row: written.excelRow,
    });
    if (status === "needs_review") insertReview(extractionId);
  } else if (!options.skipLedger && status === "failed") {
    ledgerAction = "not_written";
  }

  return {
    documentId,
    extractionId,
    filename: options.filename,
    messageId: options.messageId ?? null,
    status,
    issues,
    invoice: validation.canonical.invoice,
    settlement: toSettlementForm(validation.canonical.invoice),
    ledgerAction,
    method,
    model,
  };
}

export async function processInboundEmail(raw: Buffer) {
  const email = await parseInboundEmail(raw);
  if (email.attachments.length === 0) {
    return { email, results: [] as ProcessResult[], error: "no_billing_attachment" as const };
  }
  const results: ProcessResult[] = [];
  for (const attachment of email.attachments) {
    results.push(
      await processDocument({
        source: "email",
        messageId: email.messageId,
        fromAddress: email.from,
        toAddress: email.to,
        subject: email.subject,
        emailDate: email.date,
        headersJson: JSON.stringify(email.headers),
        bodyText: email.text,
        filename: attachment.filename,
        mimeType: attachment.contentType,
        buffer: attachment.content,
      }),
    );
  }
  return { email, results };
}

export function readFixtureBuffer(filename: string): { buffer: Buffer; mimeType: string } | null {
  const pdfPath = path.join(paths.invoices, filename);
  if (fs.existsSync(pdfPath)) {
    return { buffer: fs.readFileSync(pdfPath), mimeType: "application/pdf" };
  }
  const txtName = filename.replace(/\.pdf$/i, ".txt");
  const txtPath = path.join(paths.invoices, txtName);
  if (fs.existsSync(txtPath)) {
    return { buffer: fs.readFileSync(txtPath), mimeType: "text/plain" };
  }
  const stored = documentByFilename(filename);
  if (stored && fs.existsSync(stored.storage_path)) {
    return { buffer: fs.readFileSync(stored.storage_path), mimeType: stored.mime_type };
  }
  return null;
}

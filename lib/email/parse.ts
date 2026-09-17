import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

export interface InboundAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface InboundEmail {
  messageId: string | null;
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  text: string | null;
  headers: Record<string, string>;
  attachments: InboundAttachment[];
  rawSize: number;
}

const BILLING_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/webp",
  "text/plain",
];

function addressText(value: AddressObject | AddressObject[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value.map((item) => item.text).join(", ");
  return value.text;
}

function flattenHeaders(mail: ParsedMail): Record<string, string> {
  const headers: Record<string, string> = {};
  mail.headers.forEach((value, key) => {
    headers[key] = Array.isArray(value) ? value.map(String).join(", ") : String(value);
  });
  return headers;
}

export function isBillingAttachment(filename: string, contentType: string): boolean {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (BILLING_TYPES.includes(type)) return true;
  return /\.(pdf|png|jpe?g|tiff?|webp|txt)$/i.test(filename);
}

export async function parseInboundEmail(raw: Buffer): Promise<InboundEmail> {
  const mail = await simpleParser(raw);
  const attachments: InboundAttachment[] = [];
  for (const attachment of mail.attachments) {
    const filename = attachment.filename || "attachment.bin";
    const contentType = attachment.contentType || "application/octet-stream";
    if (!isBillingAttachment(filename, contentType)) continue;
    attachments.push({
      filename,
      contentType,
      content: Buffer.isBuffer(attachment.content) ? attachment.content : Buffer.from(attachment.content),
    });
  }

  return {
    messageId: mail.messageId ?? null,
    from: addressText(mail.from),
    to: addressText(mail.to as AddressObject | AddressObject[] | undefined),
    subject: mail.subject ?? null,
    date: mail.date ? mail.date.toISOString() : null,
    text: mail.text ?? null,
    headers: flattenHeaders(mail),
    attachments,
    rawSize: raw.length,
  };
}

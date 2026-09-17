export const DEMO_EMAIL_PAYLOAD = {
  from: "billing@supplier.co.il",
  to: "finance@goldencare.co.il",
  subject: "טופס התחשבנות - אוגוסט 2026",
  body: "שלום, מצורף טופס ההתחשבנות לחודש אוגוסט.",
  receivedAt: "2026-09-15T10:32:00",
  attachments: [
    {
      filename: "settlement-monthly.pdf",
      contentType: "application/pdf",
    },
  ],
} as const;

export type DemoEmailPayload = typeof DEMO_EMAIL_PAYLOAD;

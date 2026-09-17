import { getPdfjs } from "@/lib/extract/pdfjs";

export type PageImage = {
  mime: string;
  base64: string;
};

const MAX_PAGES = 4;

/**
 * Rasterize a scanned PDF (or pass through an already-uploaded image) so a
 * vision model can read forms that have no text layer.
 *
 * Uses the same pdfjs-dist package as text extraction so the API and Worker
 * versions cannot drift.
 */
export async function renderDocumentImages(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<PageImage[]> {
  const mime = input.mimeType.split(";")[0].trim().toLowerCase();
  if (mime.startsWith("image/")) {
    return [{ mime, base64: input.buffer.toString("base64") }];
  }
  if (mime !== "application/pdf" && !input.filename.toLowerCase().endsWith(".pdf")) {
    return [];
  }

  const pdfjs = await getPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(input.buffer),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  try {
    const pages: PageImage[] = [];
    const count = Math.min(pdf.numPages || 1, MAX_PAGES);
    for (let i = 1; i <= count; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const factory = pdf.canvasFactory as {
        create: (width: number, height: number) => { canvas: { toBuffer: (mime: string) => Buffer } };
      };
      const canvasAndContext = factory.create(viewport.width, viewport.height);
      await page.render({
        canvas: canvasAndContext.canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      const png = canvasAndContext.canvas.toBuffer("image/png");
      pages.push({ mime: "image/png", base64: png.toString("base64") });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

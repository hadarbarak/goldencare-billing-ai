import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/**
 * Load pdfjs API and pin the worker from the same installed package.
 * Mixing pdf-to-img's nested 6.2.108 API with the top-level 6.3.289 worker
 * is what produced VISION_ERROR on invoice-scan.pdf.
 */
export async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ).href;
  return pdfjs;
}

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Native / node-only modules must not be bundled by the server compiler.
  serverExternalPackages: ["better-sqlite3", "exceljs", "pdfjs-dist", "pdf-to-img", "@napi-rs/canvas"],
  agentRules: false,
  turbopack: { root: projectRoot },
};

export default nextConfig;

import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL || "http://localhost:3000";
const file = process.argv[2] || path.join(process.cwd(), "fixtures", "emails", "sample.eml");

if (!fs.existsSync(file)) {
  console.error(`Missing ${file}. Run npm run setup first.`);
  process.exit(1);
}

const raw = fs.readFileSync(file);
const res = await fetch(`${base}/api/email/inbound`, {
  method: "POST",
  headers: {
    "content-type": "message/rfc822",
    "x-goldencare-demo": "1",
  },
  body: raw,
});

const json = await res.json();
console.log(JSON.stringify(json, null, 2));
if (!res.ok) process.exit(1);

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const harPath = path.join(here, "inputs", "mapping-systems.har");
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.CHROME_PATH ||
  (existsSync(systemChrome) ? systemChrome : undefined);

const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  recordHar: {
    path: harPath,
    content: "omit",
    mode: "full",
  },
});

const page = await context.newPage();
const pages = [
  "https://mapping-systems.org/",
  "https://mapping-systems.org/lessons/assignments/web-mapping",
  "https://mapping-systems.org/lessons/assignments/networks",
];

for (const url of pages) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
}

await context.close();
await browser.close();

console.log(`HAR saved to ${harPath}`);

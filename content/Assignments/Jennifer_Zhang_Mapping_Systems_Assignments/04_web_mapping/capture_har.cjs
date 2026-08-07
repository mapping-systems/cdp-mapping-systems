/** Capture a HAR of the selected public website for the assignment. */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const here = __dirname;
const output = path.join(here, "inputs", "vanishing-network.raw.har");
const target = "https://jzhang2468.github.io/mapping-system-final-project/";
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

fs.mkdirSync(path.dirname(output), { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({
    recordHar: { path: output, content: "omit", mode: "full" },
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#intro").waitFor({ state: "visible" });
  await page.locator("#skip-intro").click();
  await page.locator("#map-interface").waitFor({ state: "visible" });
  await page.waitForTimeout(5_000);
  await context.close();
  await browser.close();
  console.log(`Captured ${target} -> ${output}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

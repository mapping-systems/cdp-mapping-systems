import fs from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:8005";
const reportPath = process.argv[3] ?? "qa/web-interaction-report.json";
const browser = await chromium.launch({ headless: true });
const checks = [];

function assert(name, condition, detail = "") {
  checks.push({ name, pass: Boolean(condition), detail: condition ? "Verified" : detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
}

async function assignment04() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/04_web_mapping/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#server-count")?.textContent === "4");
  assert("A04 server GeoJSON loaded", await page.locator("#server-count").textContent() === "4", "Expected four public server IP results");
  await page.screenshot({ path: "04_web_mapping/outputs/web-map-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "NYC rent context" }).click();
  await page.waitForTimeout(1300);
  assert("A04 NYC view toggle", (await page.locator("#map-note").textContent()).includes("NYC VIEW"), "Toggle did not update map state");
  assert("A04 browser errors", errors.length === 0, JSON.stringify(errors));
  await page.close();
}

async function assignment05Local() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  await page.route("**/config.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: 'window.RENT_MAP_CONFIG={SUPABASE_URL:"",SUPABASE_ANON_KEY:""};',
  }));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/05_web_map_visualization/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#mode-badge")?.textContent.includes("Local"));
  assert("A05 default local mode", (await page.locator("#mode-badge").textContent()).includes("Local GeoJSON fallback"), "Local mode badge missing");
  const initialCoordinates = await page.locator("#selected-coordinates").textContent();
  const mapBox = await page.locator("#map").boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width * 0.54, mapBox.y + mapBox.height * 0.48);
  await page.waitForTimeout(350);
  const changedCoordinates = await page.locator("#selected-coordinates").textContent();
  assert("A05 map selection", changedCoordinates !== initialCoordinates, `${initialCoordinates} → ${changedCoordinates}`);
  await page.locator("#radius").fill("5");
  await page.locator("#radius").dispatchEvent("change");
  await page.waitForTimeout(250);
  assert("A05 radius control", await page.locator("#radius-output").textContent() === "5.0 km", await page.locator("#radius-output").textContent());
  assert("A05 browser errors", errors.length === 0, JSON.stringify(errors));
  await page.close();
}

async function assignment05Live() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/05_web_map_visualization/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#mode-badge")?.textContent.includes("Supabase"));
  assert("A05 live Supabase mode", (await page.locator("#mode-badge").textContent()).includes("Supabase / PostGIS"), "Live mode badge missing");
  assert("A05 live RPC result count", await page.locator("#result-count").textContent() === "6 areas", await page.locator("#result-count").textContent());
  const distances = await page.locator(".result-distance").allTextContents();
  const distanceKm = distances.map((value) => Number.parseFloat(value));
  assert("A05 live RPC distance order", distanceKm.every((value, index) => index === 0 || distanceKm[index - 1] <= value), JSON.stringify(distanceKm));
  const layout = await page.evaluate(() => {
    const footer = document.querySelector("footer")?.getBoundingClientRect();
    const results = Array.from(document.querySelectorAll(".result-button"))
      .map((element) => element.getBoundingClientRect());
    const overlap = footer && results.some((result) => (
      result.left < footer.right
      && result.right > footer.left
      && result.top < footer.bottom
      && result.bottom > footer.top
    ));
    return {
      overlap: Boolean(overlap),
      footer: footer ? { top: footer.top, bottom: footer.bottom } : null,
      lastResult: results.length
        ? { top: results.at(-1).top, bottom: results.at(-1).bottom }
        : null,
    };
  });
  assert("A05 desktop results do not overlap footer", !layout.overlap, JSON.stringify(layout));
  await page.screenshot({ path: "05_web_map_visualization/outputs/web-map-supabase-desktop.png", fullPage: true });
  assert("A05 live browser errors", errors.length === 0, JSON.stringify(errors));
  await page.close();
}

async function assignment05ApiFailure() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const warnings = [];
  const errors = [];
  await page.route("https://supabase.test.invalid/rest/v1/rpc/find_rent_areas_within_radius", (route) => route.fulfill({
    status: 200,
    contentType: "text/plain",
    body: "controlled invalid API payload",
  }));
  await page.route("**/config.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: 'window.RENT_MAP_CONFIG={SUPABASE_URL:"https://supabase.test.invalid",SUPABASE_ANON_KEY:"public-test-anon-key"};',
  }));
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/05_web_map_visualization/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#mode-badge")?.textContent.includes("Local"));
  assert("A05 failed API falls back", (await page.locator("#mode-badge").textContent()).includes("Local GeoJSON fallback"), "Fallback badge missing after forced API failure");
  assert("A05 fallback warning visible in diagnostics", warnings.some((value) => value.includes("Supabase unavailable")), JSON.stringify(warnings));
  assert("A05 API failure has no uncaught errors", errors.length === 0, JSON.stringify(errors));
  await page.close();
}

let fatal = null;
try {
  await assignment04();
  await assignment05Live();
  await assignment05Local();
  await assignment05ApiFailure();
} catch (error) {
  fatal = String(error);
} finally {
  await browser.close();
}

const report = {
  tested_at_utc: new Date().toISOString(),
  base_url: base,
  checks,
  passed: checks.filter((item) => item.pass).length,
  failed: checks.filter((item) => !item.pass).length,
  fatal,
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (fatal || checks.some((item) => !item.pass)) process.exitCode = 2;

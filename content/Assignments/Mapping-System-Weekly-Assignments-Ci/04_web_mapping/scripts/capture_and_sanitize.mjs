import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const assignmentRoot = path.resolve(import.meta.dirname, "..");
const targetUrl = process.argv[2] ?? "https://streeteasy.com/blog/data-dashboard/";
const sourceSlug = process.argv[3] ?? "streeteasy-dashboard";
const rawPath = path.join(assignmentRoot, "data", `raw-${sourceSlug}.har`);
const safePath = path.join(assignmentRoot, "data", `${sourceSlug}.sanitized.har`);
const reportPath = path.join(assignmentRoot, "data", `${sourceSlug}.capture-report.json`);

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[REDACTED]");
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value;
  }
}

function stripEntry(entry) {
  const request = entry.request ?? {};
  const response = entry.response ?? {};
  const cleanRequestUrl = sanitizeUrl(request.url ?? "");
  const queryString = (request.queryString ?? []).map((item) => ({
    name: item.name,
    value: "[REDACTED]",
  }));

  return {
    startedDateTime: entry.startedDateTime,
    time: entry.time,
    request: {
      method: request.method,
      url: cleanRequestUrl,
      httpVersion: request.httpVersion,
      cookies: [],
      headers: [],
      queryString,
      headersSize: -1,
      bodySize: request.bodySize ?? -1,
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      httpVersion: response.httpVersion,
      cookies: [],
      headers: [],
      content: {
        size: response.content?.size ?? 0,
        mimeType: response.content?.mimeType ?? "",
      },
      redirectURL: sanitizeUrl(response.redirectURL ?? ""),
      headersSize: -1,
      bodySize: response.bodySize ?? -1,
    },
    cache: {},
    timings: entry.timings ?? {},
    serverIPAddress: entry.serverIPAddress ?? "",
    connection: entry.connection,
  };
}

await fs.mkdir(path.dirname(rawPath), { recursive: true });

const consoleErrors = [];
const failedRequests = [];
let finalUrl = targetUrl;
let title = "";
let captureError = null;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
  recordHar: { path: rawPath, content: "omit", mode: "full" },
});
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("requestfailed", (request) => {
  failedRequests.push({ url: sanitizeUrl(request.url()), error: request.failure()?.errorText ?? "unknown" });
});

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(async () => {
    window.scrollTo(0, Math.min(document.body.scrollHeight, 1800));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    window.scrollTo(0, 0);
  });
  finalUrl = page.url();
  title = await page.title();
} catch (error) {
  captureError = String(error);
} finally {
  await context.close();
  await browser.close();
}

const raw = JSON.parse(await fs.readFile(rawPath, "utf8"));
const entries = (raw.log?.entries ?? []).map(stripEntry);
const safeHar = {
  log: {
    version: raw.log?.version ?? "1.2",
    creator: { name: "Playwright capture, sanitized for coursework", version: "1" },
    pages: [],
    entries,
  },
};
await fs.writeFile(safePath, `${JSON.stringify(safeHar, null, 2)}\n`, "utf8");
await fs.rm(rawPath, { force: true });

const titleText = `${title} ${finalUrl}`.toLowerCase();
const blocked = /captcha|denied|forbidden|verify you are human|robot|challenge/.test(titleText);
const report = {
  captured_at_utc: new Date().toISOString(),
  requested_url: targetUrl,
  final_url: finalUrl,
  title,
  source_slug: sourceSlug,
  sanitized_har: path.relative(assignmentRoot, safePath),
  entries: entries.length,
  unique_hosts: [...new Set(entries.map((entry) => {
    try { return new URL(entry.request.url).hostname; } catch { return ""; }
  }).filter(Boolean))].length,
  entries_with_server_ip: entries.filter((entry) => entry.serverIPAddress).length,
  blocked_or_challenged: blocked,
  capture_error: captureError,
  console_error_count: consoleErrors.length,
  failed_request_count: failedRequests.length,
  failed_requests: failedRequests.slice(0, 20),
  raw_har_retained: false,
  privacy: "New isolated browser context; no user profile or login state. Request/response headers, cookies, bodies, credentials, and all query values removed.",
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (captureError) process.exitCode = 2;

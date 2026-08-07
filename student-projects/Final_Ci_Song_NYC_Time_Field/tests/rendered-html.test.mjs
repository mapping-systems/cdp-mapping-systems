import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished NYC TIME FIELD shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>NYC TIME FIELD<\/title>/i);
  assert.match(html, /Where can/);
  assert.match(html, /Commute Map Lab/);
  assert.match(html, /pause on a hex for route steps/i);
  assert.match(html, /Neighborhood field/);
  assert.doesNotMatch(html, /Route anatomy/i);
  assert.match(html, /How the field is built/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("GitHub Pages export is portable and excludes the retired color strip", async () => {
  const pagesRoot = new URL("../dist/pages/", import.meta.url);
  const html = await readFile(new URL("index.html", pagesRoot), "utf8");
  assert.match(
    html,
    /cisanotheraccount\.github\.io\/cdp-mapping-systems_Ci\//,
  );
  assert.doesNotMatch(html, /cisong18\.chatgpt\.site/);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:assets|data|methodology|vendor)\//);
  assert.doesNotMatch(html, /import\(["']\/assets\//);
  assert.doesNotMatch(html, /(?:href|src)="\.\.\/assets\//);
  assert.doesNotMatch(html, /import\(["']\.\.\/assets\//);

  const assetNames = await readdir(new URL("assets/", pagesRoot));
  const cssNames = assetNames.filter((name) => name.endsWith(".css"));
  assert.equal(cssNames.length, 1, "clean export should contain one CSS bundle");
  const css = await readFile(new URL(`assets/${cssNames[0]}`, pagesRoot), "utf8");
  assert.doesNotMatch(css, /url\((?:["'])?\//);
  assert.doesNotMatch(
    css,
    /(?:map-stage|control-panel)(?:::|:)before/,
    "the retired MTA color strip must not return",
  );
});

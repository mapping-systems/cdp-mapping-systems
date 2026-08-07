import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist", "pages");
const port = 4173;
const server = spawn(
  path.join(root, "node_modules", ".bin", "vinext"),
  ["start", "--port", String(port)],
  {
    cwd: root,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: path.join(root, ".wrangler", "wrangler.log"),
    },
    stdio: "inherit",
  },
);

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return response.text();
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the production server.");
}

try {
  const sourceHtml = await waitForServer();
  // Always export into a clean directory. Keeping old hashed bundles here can
  // accidentally publish CSS from an earlier design even when index.html no
  // longer references it.
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(root, "dist", "client"), output, { recursive: true });

  let html = sourceHtml;
  for (const [from, to] of [
    ['import("/assets/', 'import("./assets/'],
    ["import('/assets/", "import('./assets/"],
    ['\\"/assets/', '\\"./assets/'],
    ['src="/assets/', 'src="./assets/'],
    ['href="/assets/', 'href="./assets/'],
    ['src="/vendor/', 'src="./vendor/'],
    ['href="/vendor/', 'href="./vendor/'],
    ['src="/map-renderer-runtime.js"', 'src="./map-renderer-runtime.js"'],
    ['href="/favicon.svg"', 'href="./favicon.svg"'],
    ['href="/data/', 'href="./data/'],
    ['href="/methodology/', 'href="./methodology/'],
  ]) {
    html = html.split(from).join(to);
  }

  // CSS is emitted in assets/, so public files must be one directory up when
  // the site is hosted below a GitHub Pages project path.
  const assetsDirectory = path.join(output, "assets");
  for (const filename of await readdir(assetsDirectory)) {
    if (!filename.endsWith(".css")) continue;
    const cssPath = path.join(assetsDirectory, filename);
    const css = await readFile(cssPath, "utf8");
    const portableCss = css
      .split('url("/').join('url("../')
      .split("url('/").join("url('../")
      .split("url(/").join("url(../");
    await writeFile(cssPath, portableCss);
  }

  await writeFile(path.join(output, "index.html"), html);
  await writeFile(path.join(output, "404.html"), html);
  await writeFile(path.join(output, ".nojekyll"), "");
  console.log(`GitHub Pages export ready: ${output}`);
} finally {
  server.kill("SIGTERM");
}

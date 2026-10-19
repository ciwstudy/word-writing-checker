// Tiny HTTPS static server for local development. Office add-ins must be
// served over HTTPS, so this uses the trusted localhost certificate that
// `npm run certs` installs.
import https from "node:https";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import devCerts from "office-addin-dev-certs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".xml": "application/xml",
  ".json": "application/json",
};

// /assets/* comes from the assets folder, everything else from src/
function fileFor(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^([/\\])+/, "");
  const base = clean.startsWith("assets") ? root : join(root, "src");
  const full = resolve(base, clean || "taskpane.html");
  return full.startsWith(base) ? full : null;
}

const options = await devCerts.getHttpsServerOptions();
https
  .createServer(options, async (req, res) => {
    const file = fileFor(req.url);
    try {
      if (!file) throw new Error("bad path");
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(PORT, () => console.log(`Writing Checker running at https://localhost:${PORT}/taskpane.html`));

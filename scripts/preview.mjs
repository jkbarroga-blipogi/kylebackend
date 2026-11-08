import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../frontend/", import.meta.url));
const portOption = process.argv.slice(2).find((argument) => argument.startsWith("--port="));
const port = Number(portOption?.slice(7) || 4173);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Use --port= with an integer from 1 to 65535.");
const apiOption = process.argv.slice(2).find((argument) => argument.startsWith("--api="));
const api = apiOption ? new URL(apiOption.slice(6)) : null;
if (api && ((api.protocol !== "https:" && !(api.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname))) || api.username || api.password || api.search || api.hash || api.pathname !== "/")) throw new Error("Use --api= with an HTTPS origin or an HTTP localhost origin.");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
  const pathname = new URL(request.url, "http://localhost").pathname;
  const file = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
  const type = types[extname(file)];
  if (!file.startsWith(resolve(root) + sep) || !type) { response.writeHead(404).end("Not found"); return; }
  try {
    let content = await readFile(file);
    if (api && file === resolve(root, "index.html")) content = content.toString("utf8").replace('name="api-base" content="https://kylebackend.onrender.com"', `name="api-base" content="${api.origin}"`);
    response.writeHead(200, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Preview file unavailable");
  }
});
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Barroga preview: http://127.0.0.1:${port}/`));

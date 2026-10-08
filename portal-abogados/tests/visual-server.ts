// READ-ONLY visual fixture. Loopback only, in-memory DB, no real credentials.
// Run after build: pnpm exec tsx tests/visual-server.ts
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { TestDb } from "./test-db";
import { createSession } from "../functions/_lib/github-auth";
import worker from "../src/worker";

const root = resolve("out"), DB = new TestDb();
const types: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain" };
const env = { DB, AUTH_SESSION_SECRET: "visual-fixture-not-production", USER_AUTH_SECRET: "visual-fixture-not-production", ASSETS: { fetch: async (request: Request) => {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const file = resolve(root, `.${pathname.endsWith("/") ? pathname + "index.html" : pathname}`);
  if (!file.startsWith(root + sep)) return new Response(null, { status: 403 });
  try { return new Response(await readFile(file), { headers: { "Content-Type": types[extname(file)] || "application/octet-stream" } }); }
  catch { return new Response("Not found", { status: 404 }); }
} } } as unknown as Parameters<typeof worker.fetch>[1];
async function main() {
const token = await createSession("gprecabarren", env, new Request("https://jurisconecta.cl/admin/"));
const server = createServer(async (incoming, outgoing) => {
  if (incoming.method !== "GET") { outgoing.writeHead(405).end("Read-only fixture"); return; }
  const pathname = incoming.url || "/";
  // Never calls a remote database or provider; cookie is injected only in this fixture.
  const request = new Request(`https://jurisconecta.cl${pathname}`, { headers: { Cookie: `juris_admin=${token}` } });
  try {
    const response = pathname.startsWith("/admin/") || pathname.startsWith("/api/") ? await worker.fetch(request, env) : await env.ASSETS.fetch(request);
    const headers = Object.fromEntries([...response.headers].filter(([key]) => key !== "set-cookie"));
    outgoing.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500).end("Visual fixture failed"); }
});
server.listen(3008, "127.0.0.1", () => console.log("Read-only visual fixture: http://127.0.0.1:3008/admin/ (in-memory test data only)"));
}
void main().catch(() => { console.error("Unable to start visual fixture"); process.exitCode = 1; });

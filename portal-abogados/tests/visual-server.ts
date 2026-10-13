// Loopback-only visual fixture, isolated in-memory DB and fake credentials.
// Default: read-only. --features-demo enables ONLY the new billing/partner test APIs.
// Run after build: pnpm exec tsx tests/visual-server.ts [--features-demo]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { TestDb } from "./test-db";
import { createSession } from "../functions/_lib/github-auth";
import { createUserSession } from "../functions/_lib/user-auth";
import worker from "../src/worker";

const root = resolve("out"), DB = new TestDb();
const demo = process.argv.includes("--features-demo");
const types: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain" };
const env = { DB, AUTH_SESSION_SECRET: "visual-fixture-not-production", USER_AUTH_SECRET: "visual-fixture-not-production", ASSETS: { fetch: async (request: Request) => {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const file = resolve(root, `.${pathname.endsWith("/") ? pathname + "index.html" : pathname}`);
  if (!file.startsWith(root + sep)) return new Response(null, { status: 403 });
  try {
    const bytes = await readFile(file);
    const body = extname(file) === ".html" && demo ? bytes.toString("utf8").replace("</head>", '<style data-local-fixture>html::before{content:"Demo local · datos ficticios · sin pagos reales";display:block;padding:10px 16px;background:#ebc594;color:#06111d;font:14px Arial;text-align:center}</style></head>') : bytes;
    return new Response(body, { headers: { "Content-Type": types[extname(file)] || "application/octet-stream" } });
  }
  catch { return new Response("Not found", { status: 404 }); }
} } } as unknown as Parameters<typeof worker.fetch>[1];
async function main() {
const token = await createSession("gprecabarren", env, new Request("https://jurisconecta.cl/admin/"));
const lawyerId = "lawyer-maria-recabarren";
const userToken = demo ? await createUserSession({ id: lawyerId, role: "lawyer", fullName: "Abogada de prueba", email: "abogada@example.test", sessionVersion: 0 }, env, new Request("http://127.0.0.1:3008/")) : "";
if (demo) {
  await DB.prepare("UPDATE users SET full_name = 'Cuenta de prueba ' || substr(id, 1, 8), email = id || '@example.test', phone = NULL").run();
  await DB.prepare("UPDATE users SET full_name = 'Abogada de prueba' WHERE id = ?").bind(lawyerId).run();
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1kAAAAASUVORK5CYII=";
  for (const category of ["company", "law_firm"]) for (let i = 1; i <= 3; i++) {
    await DB.prepare("INSERT INTO home_partners (id, name, category, alt, link_url, sort_order, active, data_base64, mime_type, byte_size, storage_size, updated_by) VALUES (?, ?, ?, 'Imagen de ejemplo, no es una colaboración real', '', ?, 1, ?, 'image/png', ?, ?, 'fixture-local')").bind(crypto.randomUUID(), `${category === "company" ? "Empresa" : "Estudio"} de prueba ${i}`, category, i, png, Buffer.from(png, "base64").length, png.length).run();
  }
}
const server = createServer(async (incoming, outgoing) => {
  const pathname = incoming.url || "/";
  const localUrl = new URL(pathname, "http://127.0.0.1:3008");
  const method = incoming.method || "GET";
  if (localUrl.origin !== "http://127.0.0.1:3008" || incoming.headers.host !== "127.0.0.1:3008") { outgoing.writeHead(403).end("Loopback host required"); return; }
  if (!["GET", "HEAD"].includes(method) && (!demo || !["/api/lawyer/plans", "/api/admin/billing", "/api/admin/partners"].includes(localUrl.pathname) || !["POST", "PATCH"].includes(method))) { outgoing.writeHead(405).end("Read-only fixture outside demo APIs"); return; }
  if (localUrl.pathname.startsWith("/auth/")) { outgoing.writeHead(403).end("External auth disabled in fixture"); return; }
  if (!["GET", "HEAD"].includes(method) && incoming.headers.origin !== localUrl.origin) { outgoing.writeHead(403).end("Local origin required"); return; }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of incoming) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 80_000) { outgoing.writeHead(413).end("Test request too large"); return; } chunks.push(bytes); }
  // Never calls a remote database or provider; cookie is injected only in this fixture.
  const request = new Request(localUrl, { method, headers: { Cookie: `juris_admin=${token}${userToken ? `; juris_user=${userToken}` : ""}`, ...(incoming.headers.origin ? { Origin: incoming.headers.origin } : {}), "Content-Type": incoming.headers["content-type"] || "application/json" }, ...(!["GET", "HEAD"].includes(method) ? { body: Buffer.concat(chunks) } : {}) });
  try {
    const response = ["/admin", "/planes", "/api", "/aliados/media"].some((prefix) => localUrl.pathname === prefix || localUrl.pathname.startsWith(prefix + "/")) ? await worker.fetch(request, env) : await env.ASSETS.fetch(request);
    const headers = Object.fromEntries([...response.headers].filter(([key]) => key !== "set-cookie"));
    outgoing.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500).end("Visual fixture failed"); }
});
server.listen(3008, "127.0.0.1", () => console.log(`Local visual fixture: http://127.0.0.1:3008/ (${demo ? "interactive feature demo" : "read-only"}; in-memory test data only)`));
}
void main().catch(() => { console.error("Unable to start visual fixture"); process.exitCode = 1; });

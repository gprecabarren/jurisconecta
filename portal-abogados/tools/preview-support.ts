/** Local visual QA only. In-memory fixtures, no credentials, no remote bindings. */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { TestDb } from "../tests/test-db";
import { createSession } from "../functions/_lib/github-auth";
import { createUserSession } from "../functions/_lib/user-auth";
import worker from "../src/worker";

async function main() {
  if (!process.argv.includes("--local-fixture")) throw new Error("Use --local-fixture explicitly. Never deploy this tool.");
  const port = 3008;
  const localOrigin = `http://127.0.0.1:${port}`;
  const assetRoot = resolve("out");
  const DB = new TestDb();
  DB.native.exec("UPDATE github_administrators SET github_login = 'propietario-demo' WHERE role = 'owner'; UPDATE users SET full_name = CASE role WHEN 'person' THEN 'Cliente de ejemplo' ELSE 'Abogado de ejemplo' END, email = id || '@example.test'");
  const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };
  async function asset(request: Request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    let path = resolve(assetRoot, `.${pathname}`);
    if (path !== assetRoot && !path.startsWith(assetRoot + sep)) return new Response(null, { status: 403 });
    try {
      const info = await stat(path).catch(() => null);
      if (info?.isDirectory()) path = resolve(path, "index.html");
      else if (!info && !extname(path)) path += ".html";
      const content = await readFile(path);
      return new Response(content, { headers: { "Content-Type": mime[extname(path)] || "application/octet-stream", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
    } catch { return new Response("Fixture asset not found. Build the app first.", { status: 404 }); }
  }
  const env = { DB, AUTH_SESSION_SECRET: "visual-fixture-admin-only-not-a-real-secret", USER_AUTH_SECRET: "visual-fixture-client-only-not-a-real-secret", ASSETS: { fetch: asset } };
  const metadata = new Request("https://jurisconecta.cl/", { headers: { "User-Agent": "Chrome local visual fixture" } });
  const admin = `juris_admin=${await createSession("propietario-demo", env, metadata)}`;
  const clientRow = await DB.prepare("SELECT id, email, full_name, session_version FROM users WHERE role = 'person' LIMIT 1").first<{ id: string; email: string; full_name: string; session_version: number }>();
  if (!clientRow) throw new Error("Missing fixture client");
  const user = `juris_user=${await createUserSession({ id: clientRow.id, email: clientRow.email, fullName: clientRow.full_name, role: "person", sessionVersion: clientRow.session_version }, env, metadata)}`;
  // All state stays in this process. Production APIs are never called.
  const ticketId = crypto.randomUUID();
  await DB.prepare("INSERT INTO support_tickets (id,user_id,subject,category) VALUES (?,?,?,?)").bind(ticketId, clientRow.id, "No puedo revisar una propuesta de ejemplo", "technical").run();
  for (let index = 0; index < 56; index += 1) {
    await DB.prepare("INSERT INTO support_ticket_messages (id,ticket_id,author,body,created_at) VALUES (?,?,?,?,datetime('now',?))").bind(crypto.randomUUID(), ticketId, index % 2 ? "admin" : "user", `Mensaje ficticio ${index + 1}: conversación local para comprobar navegación y paginación. No corresponde a una persona real.`, `-${60 - index} minutes`).run();
  }

  const server = createServer(async (incoming, outgoing) => {
    try {
      const target = new URL(incoming.url || "/", localOrigin);
      if (target.origin !== localOrigin) { outgoing.writeHead(403).end(); return; }
      if (target.pathname.startsWith("/auth/")) { outgoing.writeHead(403).end("External authentication disabled in fixture"); return; }
      const origin = incoming.headers.origin;
      if (origin && origin !== localOrigin) { outgoing.writeHead(403).end(); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const piece of incoming) {
        size += piece.length;
        if (size > 262_144) { outgoing.writeHead(413).end(); return; }
        chunks.push(piece);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value && !["host", "cookie", "origin", "content-length"].includes(key)) headers.set(key, Array.isArray(value) ? value.join(",") : value);
      headers.set("Cookie", `${admin}; ${user}`);
      if (origin) headers.set("Origin", "https://jurisconecta.cl");
      const method = incoming.method || "GET";
      const request = new Request(`https://jurisconecta.cl${target.pathname}${target.search}`, { method, headers, ...(!["GET", "HEAD"].includes(method) ? { body: Buffer.concat(chunks) } : {}) });
      // The local adapter intentionally implements only the D1/static bindings used in QA.
      // Missing remote R2/OAuth bindings must stay unavailable, never use production secrets.
      const response = target.pathname.startsWith("/api/") ? await worker.fetch(request, env as unknown as Parameters<typeof worker.fetch>[1]) : await asset(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Fixture error");
      outgoing.writeHead(500).end("Local fixture error");
    }
  });
  server.listen(port, "127.0.0.1", () => console.log(`Local-only fictional preview: ${localOrigin}/admin/#tickets and /admin/correos/`));
  const close = () => server.close(() => { DB.native.close(); process.exit(0); });
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : "Fixture start failed"); process.exitCode = 1; });

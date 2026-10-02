import { sessionMetadata } from "./session-meta";
import type { D1Database } from "./user-auth";
export interface AuthEnv {
  DB?: D1Database;
  ADMIN_AUTH_CONFIG?: string;
  ADMIN_GITHUB_LOGIN?: string;
  AUTH_SESSION_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

type Session = { login: string; sessionId: string; expiresAt: number };
type StoredConfig = { clientSecret?: string; sessionSecret?: string };

export const githubClientId = "Ov23liir1fiOAg9FC4YK";
export const adminGitHubLogin = "gprecabarren";

const encoder = new TextEncoder();

function storedConfig(env: AuthEnv): StoredConfig {
  if (!env.ADMIN_AUTH_CONFIG) return {};
  try { return JSON.parse(env.ADMIN_AUTH_CONFIG) as StoredConfig; } catch { return {}; }
}

export function authSettings(env: AuthEnv) {
  const config = storedConfig(env);
  return {
    clientId: env.GITHUB_CLIENT_ID || githubClientId,
    clientSecret: env.GITHUB_CLIENT_SECRET || config.clientSecret,
    allowedLogin: env.ADMIN_GITHUB_LOGIN || adminGitHubLogin,
    sessionSecret: env.AUTH_SESSION_SECRET || config.sessionSecret,
  };
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlText(text: string) {
  return base64Url(encoder.encode(text));
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function equals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export function cookieValue(request: Request, name: string) {
  const header = request.headers.get("Cookie") || "";
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie(name: string) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function createSession(login: string, env: AuthEnv, request: Request) {
  const { sessionSecret } = authSettings(env);
  if (!sessionSecret || !env.DB) throw new Error("La autenticación todavía no está configurada.");
  const sessionId = crypto.randomUUID();
  const { device, location, ipHint } = sessionMetadata(request);
  await env.DB.prepare("INSERT INTO admin_sessions (id, github_login, device, location, ip_hint) VALUES (?, ?, ?, ?, ?)").bind(sessionId, login, device, location, ipHint).run();
  const payload = base64UrlText(JSON.stringify({ login, sessionId, expiresAt: Date.now() + 1000 * 60 * 60 * 8 } satisfies Session));
  return `${payload}.${await sign(payload, sessionSecret)}`;
}

export async function readSession(request: Request, env: AuthEnv): Promise<Session | null> {
  const token = cookieValue(request, "juris_admin");
  const { sessionSecret } = authSettings(env);
  if (!token || !sessionSecret) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !equals(signature, await sign(payload, sessionSecret))) return null;
  try {
    const session = JSON.parse(fromBase64Url(payload)) as Session;
    if (!session.login || !session.sessionId || !session.expiresAt || session.expiresAt < Date.now() || !env.DB) return null;
    const active = await env.DB.prepare("SELECT id, last_seen_at FROM admin_sessions WHERE id = ? AND github_login = ? AND revoked_at IS NULL LIMIT 1").bind(session.sessionId, session.login).first<{ id: string; last_seen_at: string }>();
    if (!active) return null;
    if (Date.now() - Date.parse(active.last_seen_at + "Z") > 30 * 60 * 1000) await env.DB.prepare("UPDATE admin_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL").bind(session.sessionId).run();
    return session;
  } catch { return null; }
}

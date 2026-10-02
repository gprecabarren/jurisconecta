import { sessionMetadata } from "./session-meta";
export type UserRole = "person" | "lawyer" | "admin";

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<{ meta?: { changes?: number } }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

export interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string | string[]): Promise<void>;
}

export interface UserAuthEnv {
  DB?: D1Database;
  USER_AUTH_SECRET?: string;
}

export type UserSession = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  sessionVersion?: number;
  sessionId?: string;
  expiresAt: number;
};

const encoder = new TextEncoder();
// Workers Free has a tight CPU ceiling. Use this only for the test accounts in the MVP;
// production login should move to an external identity provider such as Google.
const iterations = 10000;

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlText(value: string) {
  return base64Url(encoder.encode(value));
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}

function bytesFromBase64Url(value: string) {
  return Uint8Array.from(fromBase64Url(value), (character) => character.charCodeAt(0));
}

function equal(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function passwordBits(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: bytesFromBase64Url(salt), iterations, hash: "SHA-256" }, material, 256));
}

export async function hashPassword(password: string) {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = base64Url(saltBytes);
  return `pbkdf2$${iterations}$${salt}$${base64Url(await passwordBits(password, salt))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, storedIterations, salt, expected] = stored.split("$");
  if (algorithm !== "pbkdf2" || Number(storedIterations) !== iterations || !salt || !expected) return false;
  return equal(base64Url(await passwordBits(password, salt)), expected);
}

export function readUserSession(request: Request, env: UserAuthEnv): Promise<UserSession | null> {
  return readSession(request, env);
}

async function readSession(request: Request, env: UserAuthEnv): Promise<UserSession | null> {
  const token = (request.headers.get("Cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("juris_user="))?.slice("juris_user=".length);
  if (!token || !env.USER_AUTH_SECRET) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !equal(signature, await sign(payload, env.USER_AUTH_SECRET))) return null;
  try {
    const session = JSON.parse(fromBase64Url(payload)) as UserSession;
    if (!session.id || !session.email || !session.role || !session.sessionId || !session.expiresAt || session.expiresAt < Date.now() || !env.DB) return null;
    const current = await env.DB.prepare("SELECT session_version, role, status FROM users WHERE id = ? LIMIT 1").bind(session.id).first<{ session_version: number; role: UserRole; status: string }>();
    if (!current || current.status === "suspended" || current.role !== session.role || current.session_version !== (session.sessionVersion ?? 0)) return null;
    const active = await env.DB.prepare("SELECT id, last_seen_at FROM user_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL LIMIT 1").bind(session.sessionId, session.id).first<{ id: string; last_seen_at: string }>();
    if (!active) return null;
    if (Date.now() - Date.parse(active.last_seen_at + "Z") > 30 * 60 * 1000) await env.DB.prepare("UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL").bind(session.sessionId).run();
    return session;
  } catch {
    return null;
  }
}

export async function createUserSession(user: Omit<UserSession, "expiresAt" | "sessionId">, env: UserAuthEnv, request: Request) {
  if (!env.USER_AUTH_SECRET || !env.DB) throw new Error("La autenticación de usuarios todavía no está configurada.");
  const sessionId = crypto.randomUUID();
  const { device, location, ipHint } = sessionMetadata(request);
  await env.DB.prepare("INSERT INTO user_sessions (id, user_id, device, location, ip_hint) VALUES (?, ?, ?, ?, ?)").bind(sessionId, user.id, device, location, ipHint).run();
  const payload = base64UrlText(JSON.stringify({ ...user, sessionId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14 } satisfies UserSession));
  return `${payload}.${await sign(payload, env.USER_AUTH_SECRET)}`;
}

export function userSessionCookie(value: string) {
  return `juris_user=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}

export function clearUserSessionCookie() {
  return "juris_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validPassword(value: string) {
  return value.length >= 8 && value.length <= 128;
}

export function cleanText(value: unknown, maximum = 500) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function normalizeRut(value: unknown) {
  return cleanText(value, 20).replace(/[^0-9kK]/g, "").toUpperCase();
}

export function validRut(value: unknown) {
  const rut = normalizeRut(value);
  if (rut.length < 8 || rut.length > 9) return false;
  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const computed = 11 - (sum % 11);
  const expected = computed === 11 ? "0" : computed === 10 ? "K" : String(computed);
  return verifier === expected;
}

export function loginDestination(role: UserRole) {
  return role === "person" ? "/cliente" : "/dashboard";
}

export async function requireUser(request: Request, env: UserAuthEnv, role?: UserRole) {
  const session = await readUserSession(request, env);
  if (!session || (role && session.role !== role)) return null;
  return session;
}

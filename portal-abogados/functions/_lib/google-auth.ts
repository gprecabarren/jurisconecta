import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { cookie, cookieValue, clearCookie } from "./github-auth";
import { cleanText, createUserSession, loginDestination, normalizeEmail, requireUser, userSessionCookie, type UserAuthEnv, type UserRole } from "./user-auth";
import { noStore, readJsonBody } from "./http";
import { isChileRegion } from "../../shared/chile";

export type GoogleEnv = UserAuthEnv & { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string };
const origin = "https://jurisconecta.cl";
const callback = `${origin}/auth/google/callback`;
type Flow = { verifier: string; nonce: string; intent: "login" | "register" | "link" | "reauth"; role: "person" | "lawyer"; user_id: string | null; return_to: string | null };
type Registration = { subject: string; email: string; full_name: string; role: "person" | "lawyer"; return_to: string | null };
type User = { id: string; email: string; full_name: string; role: UserRole; status: string; session_version: number };

export function randomOAuthToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export async function oauthHash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export function validGoogleClaims(payload: JWTPayload, nonce: string) {
  return payload.nonce === nonce && payload.email_verified === true && typeof payload.sub === "string" && payload.sub.length > 0 && typeof payload.email === "string" && /^\S+@\S+\.\S+$/.test(payload.email);
}
function redirect(path: string, cookies: string[] = []) {
  const headers = new Headers({ Location: `${origin}${path}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" });
  cookies.forEach((value) => headers.append("Set-Cookie", value));
  return new Response(null, { status: 303, headers });
}
function fail(reason: string) { return redirect(`/ingresar/?google_error=${encodeURIComponent(reason)}`, [clearCookie("juris_google_state")]); }
export function googleAvailable(env: GoogleEnv) { return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.USER_AUTH_SECRET); }

export async function startGoogle(request: Request, env: GoogleEnv) {
  if (!googleAvailable(env) || !env.DB) return fail("unavailable");
  const url = new URL(request.url);
  if (url.origin !== origin) return new Response("Origen no autorizado.", { status: 403 });
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return new Response("Inicia el acceso desde JurisConecta.", { status: 403 });
  const intent = url.searchParams.get("intent");
  if (!["login", "register", "link", "reauth"].includes(intent || "")) return fail("invalid");
  const role = url.searchParams.get("role") === "lawyer" ? "lawyer" : "person";
  const returnTo = url.searchParams.get("next") === "/solicitar/" ? "/solicitar/" : null;
  const user = await requireUser(request, env);
  if ((intent === "link" || intent === "reauth") && !user) return fail("session");
  const state = randomOAuthToken(), verifier = randomOAuthToken(), nonce = randomOAuthToken();
  const now = Date.now();
  // Bound ephemeral state and rate limit starts by hashed IP, without storing raw IP.
  const ipHash = await oauthHash(`${env.USER_AUTH_SECRET}:${request.headers.get("CF-Connecting-IP") || "local"}`);
  const rate = await env.DB.prepare("INSERT INTO auth_rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END, window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END RETURNING count").bind(`google:${ipHash}`, now, now - 60_000, now - 60_000).first<{ count: number }>();
  if ((rate?.count || 0) > 20) return new Response("Demasiados intentos. Espera un minuto.", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM google_oauth_flows WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM google_registrations WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM auth_rate_limits WHERE window_start < ?").bind(now - 86_400_000),
    env.DB.prepare("INSERT INTO google_oauth_flows (state_hash, verifier, nonce, intent, role, user_id, expires_at, return_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(await oauthHash(state), verifier, nonce, intent, role, intent === "link" || intent === "reauth" ? user!.id : null, now + 600_000, returnTo),
  ]);
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: callback, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: await oauthHash(verifier), code_challenge_method: "S256", prompt: "select_account" }).toString();
  return new Response(null, { status: 303, headers: { Location: authorize.toString(), "Set-Cookie": cookie("juris_google_state", state, 600), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

async function userDestination(user: User, env: GoogleEnv) {
  const profile = user.role === "lawyer" ? await env.DB!.prepare("SELECT application_status FROM lawyer_profiles WHERE user_id = ?").bind(user.id).first<{ application_status: string }>() : null;
  return user.role === "lawyer" && (user.status !== "active" || profile?.application_status !== "approved") ? "/postulacion-abogado/" : loginDestination(user.role);
}
async function loginGoogleUser(request: Request, env: GoogleEnv, user: User, returnTo: string | null) {
  if (user.status === "suspended" || user.role === "admin") return fail("disabled");
  const token = await createUserSession({ id: user.id, email: user.email, fullName: user.full_name, role: user.role, sessionVersion: user.session_version }, env, request);
  await env.DB!.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at,CURRENT_TIMESTAMP) WHERE id = ?").bind(user.id).run();
  return redirect(user.role === "person" && returnTo === "/solicitar/" ? returnTo : await userDestination(user, env), [clearCookie("juris_google_state"), userSessionCookie(token)]);
}

export async function googleCallback(request: Request, env: GoogleEnv) {
  if (!googleAvailable(env) || !env.DB) return fail("unavailable");
  const url = new URL(request.url), state = url.searchParams.get("state") || "", browserState = cookieValue(request, "juris_google_state") || "";
  if (!state || !browserState || state.length > 100 || await oauthHash(state) !== await oauthHash(browserState)) return fail("state");
  // DELETE RETURNING consumes the transaction exactly once, even under concurrent callbacks.
  const flow = await env.DB.prepare("DELETE FROM google_oauth_flows WHERE state_hash = ? AND expires_at > ? RETURNING verifier, nonce, intent, role, user_id, return_to").bind(await oauthHash(state), Date.now()).first<Flow>();
  if (!flow) return fail("expired");
  if (url.searchParams.has("error")) return fail("cancelled");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) return fail("invalid");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, code, code_verifier: flow.verifier, grant_type: "authorization_code", redirect_uri: callback }), signal: AbortSignal.timeout(10_000) });
    const tokens: unknown = await response.json();
    if (!response.ok || !tokens || typeof tokens !== "object" || !("id_token" in tokens) || typeof tokens.id_token !== "string") return fail("invalid");
    const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 5000 });
    const { payload } = await jwtVerify(tokens.id_token, jwks, { audience: env.GOOGLE_CLIENT_ID!, issuer: ["https://accounts.google.com", "accounts.google.com"], algorithms: ["RS256"], maxTokenAge: "10m", clockTolerance: 30 });
    if (!validGoogleClaims(payload, flow.nonce)) return fail("invalid");
    const email = normalizeEmail(payload.email as string), subject = payload.sub!;
    const identity = await env.DB.prepare("SELECT users.id, users.email, users.full_name, users.role, users.status, users.session_version FROM google_identities JOIN users ON users.id = google_identities.user_id WHERE subject = ?").bind(subject).first<User>();
    if (flow.intent === "link" || flow.intent === "reauth") {
      const session = await requireUser(request, env);
      if (!session || session.id !== flow.user_id) return fail("session");
      const user = await env.DB.prepare("SELECT id, email, full_name, role, status, session_version FROM users WHERE id = ?").bind(session.id).first<User>();
      if (!user || user.role === "admin" || user.status === "suspended" || normalizeEmail(user.email) !== email || (identity && identity.id !== user.id)) return fail("link");
      if (flow.intent === "reauth" && identity?.id !== user.id) return fail("link");
      const linked = await env.DB.prepare("SELECT subject FROM google_identities WHERE user_id = ?").bind(user.id).first<{ subject: string }>();
      if (linked && linked.subject !== subject) return fail("link");
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO google_identities (subject, user_id) VALUES (?, ?)").bind(subject, user.id),
        env.DB.prepare("UPDATE user_sessions SET google_reauth_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM google_identities WHERE subject = ? AND user_id = ?)").bind(Date.now(), session.sessionId, user.id, subject, user.id),
        env.DB.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at,CURRENT_TIMESTAMP) WHERE id = ? AND EXISTS(SELECT 1 FROM google_identities WHERE subject = ? AND user_id = ?)").bind(user.id,subject,user.id),
      ]);
      const confirmed = await env.DB.prepare("SELECT subject FROM google_identities WHERE user_id = ? AND subject = ?").bind(user.id, subject).first<{ subject: string }>();
      if (!confirmed) return fail("link");
      return redirect(user.role === "person" && flow.return_to === "/solicitar/" ? flow.return_to : user.role === "person" ? "/cliente/cuenta/?google=verified" : "/account/?google=verified", [clearCookie("juris_google_state")]);
    }
    if (identity) return loginGoogleUser(request, env, identity, flow.return_to);
    // Never auto-link by email. Password account owners must explicitly link from their signed-in panel.
    const emailOwner = await env.DB.prepare("SELECT id FROM users WHERE lower(trim(email)) = ?").bind(email).first<{ id: string }>();
    if (emailOwner) return fail("existing");
    if (flow.intent === "login") return fail("register");
    const registrationToken = randomOAuthToken();
    await env.DB.prepare("INSERT INTO google_registrations (token_hash, subject, email, full_name, role, expires_at, return_to) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(await oauthHash(registrationToken), subject, email, cleanText(payload.name, 120), flow.role, Date.now() + 600_000, flow.return_to).run();
    return redirect("/registro/google/", [clearCookie("juris_google_state"), cookie("juris_google_registration", registrationToken, 600)]);
  } catch {
    // No codes, tokens, credentials, user emails or provider errors in logs.
    console.error(JSON.stringify({ message: "Google OAuth verification failed" }));
    return fail("invalid");
  }
}

export async function googleRegistration(request: Request, env: GoogleEnv) {
  if (!env.DB) return Response.json({ error: "Servicio no disponible." }, { status: 503 });
  const token = cookieValue(request, "juris_google_registration");
  if (!token || token.length > 100) return noStore(Response.json({ error: "Vuelve a comenzar el registro con Google." }, { status: 401 }));
  const hash = await oauthHash(token);
  const pending = await env.DB.prepare("SELECT subject, email, full_name, role, return_to FROM google_registrations WHERE token_hash = ? AND expires_at > ?").bind(hash, Date.now()).first<Registration>();
  if (!pending) return noStore(Response.json({ error: "El registro expiró. Vuelve a comenzar." }, { status: 401 }));
  if (request.method === "GET") return noStore(Response.json({ email: pending.email, fullName: pending.full_name, role: pending.role }));
  const body = await readJsonBody(request);
  const fullName = cleanText(body?.fullName, 120), region = cleanText(body?.region, 80);
  if (fullName.length < 3 || body?.acceptTerms !== true || (region && !isChileRegion(region))) return Response.json({ error: "Revisa tu nombre, región y aceptación de términos." }, { status: 400 });
  const exists = await env.DB.prepare("SELECT id FROM users WHERE lower(trim(email)) = ?").bind(normalizeEmail(pending.email)).first<{ id: string }>();
  if (exists) return Response.json({ error: "Ya existe esa cuenta. Inicia sesión y vincula Google desde tu panel." }, { status: 409 });
  const consumed = await env.DB.prepare("DELETE FROM google_registrations WHERE token_hash = ? AND expires_at > ? RETURNING subject").bind(hash, Date.now()).first<{ subject: string }>();
  if (!consumed) return Response.json({ error: "El registro expiró o ya fue utilizado." }, { status: 409 });
  const id = crypto.randomUUID(), status = pending.role === "lawyer" ? "pending" : "active";
  const statements = [
    env.DB.prepare("INSERT INTO users (id, email, full_name, role, status, auth_provider, provider_subject, phone, region, commune, terms_accepted_at,email_verified_at) VALUES (?, ?, ?, ?, ?, 'google', ?, ?, ?, ?, CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(id, normalizeEmail(pending.email), fullName, pending.role, status, pending.subject, cleanText(body?.phone, 30) || null, region || null, cleanText(body?.commune, 80) || null),
    env.DB.prepare("INSERT INTO google_identities (subject, user_id) VALUES (?, ?)").bind(pending.subject, id),
  ];
  if (pending.role === "lawyer") statements.push(env.DB.prepare("INSERT INTO lawyer_profiles (user_id, subscription_status, plan_code, application_status) VALUES (?, 'none', 'silver', 'draft')").bind(id));
  try { await env.DB.batch(statements); } catch { return Response.json({ error: "La cuenta ya se registró. Vuelve a iniciar sesión." }, { status: 409 }); }
  const session = await createUserSession({ id, email: pending.email, fullName, role: pending.role, sessionVersion: 0 }, env, request);
  const response = noStore(Response.json({ destination: pending.role === "lawyer" ? "/postulacion-abogado/" : pending.return_to === "/solicitar/" ? pending.return_to : "/cliente/" }));
  response.headers.append("Set-Cookie", userSessionCookie(session));
  response.headers.append("Set-Cookie", clearCookie("juris_google_registration"));
  return response;
}

export async function googleAccountStatus(request: Request, env: GoogleEnv) {
  const session = await requireUser(request, env);
  if (!session || !env.DB) return noStore(Response.json({ error: "No autorizado." }, { status: 401 }));
  const user = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(session.id).first<{ password_hash: string | null }>();
  const linked = await env.DB.prepare("SELECT subject FROM google_identities WHERE user_id = ?").bind(session.id).first<{ subject: string }>();
  return noStore(Response.json({ enabled: googleAvailable(env), linked: Boolean(linked), passwordAccount: Boolean(user?.password_hash) }));
}

export async function recentlyVerifiedGoogle(request: Request, env: UserAuthEnv, id: string) {
  const session = await requireUser(request, env);
  if (!session || session.id !== id || !env.DB) return false;
  const row = await env.DB.prepare("SELECT user_sessions.google_reauth_at FROM user_sessions JOIN google_identities ON google_identities.user_id = user_sessions.user_id WHERE user_sessions.id = ? AND user_sessions.user_id = ? AND user_sessions.revoked_at IS NULL").bind(session.sessionId, id).first<{ google_reauth_at: number | null }>();
  return Boolean(row?.google_reauth_at && Date.now() - row.google_reauth_at < 300_000);
}

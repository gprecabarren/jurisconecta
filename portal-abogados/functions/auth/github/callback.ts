import { authSettings, clearCookie, cookie, cookieValue, createSession, type AuthEnv } from "../../_lib/github-auth";

interface Context { request: Request; env: AuthEnv; }
type GitHubUser = { login?: string };

export const onRequestGet = async ({ request, env }: Context) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookieValue(request, "juris_oauth_state");
  if (!code || !state || !expectedState || state !== expectedState) return new Response("No fue posible validar el inicio de sesión.", { status: 400, headers: { "Set-Cookie": clearCookie("juris_oauth_state") } });
  const { clientId, clientSecret, allowedLogin } = authSettings(env);
  if (!clientId || !clientSecret || !allowedLogin) return new Response("La autenticación de administrador todavía no está configurada.", { status: 503 });

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: `${url.origin}/auth/github/callback` }),
  });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return new Response("GitHub no autorizó el inicio de sesión.", { status: 401, headers: { "Set-Cookie": clearCookie("juris_oauth_state") } });

  const profileResponse = await fetch("https://api.github.com/user", { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token.access_token}`, "User-Agent": "JurisConecta-Admin" } });
  const profile = await profileResponse.json() as GitHubUser;
  if (!profile.login || profile.login.toLowerCase() !== allowedLogin.toLowerCase()) return new Response("Esta cuenta de GitHub no está autorizada para administrar JurisConecta.", { status: 403, headers: { "Set-Cookie": clearCookie("juris_oauth_state") } });

  const session = await createSession(profile.login, env, request);
  if (env.DB) await env.DB.prepare("INSERT INTO admin_audit_log (id, github_login, action, target_type, target_id, details_json) VALUES (?, ?, 'admin.login', 'admin_session', NULL, '{}')").bind(crypto.randomUUID(), profile.login).run();
  const headers = new Headers({ Location: "/admin/" });
  headers.append("Set-Cookie", clearCookie("juris_oauth_state"));
  headers.append("Set-Cookie", cookie("juris_admin", session, 28800));
  return new Response(null, { status: 302, headers });
};

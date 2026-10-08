import { authSettings, clearCookie, cookie, cookieValue, createSession, type AuthEnv } from "../../_lib/github-auth";
import { adminTokenHash, githubJson, githubProfile, pendingInvitation, stageAdminAcceptance } from "../../_lib/admin-members";

interface Context { request: Request; env: AuthEnv; }

export const onRequestGet = async ({ request, env }: Context) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = cookieValue(request, "juris_oauth_state");
  if (!code || code.length > 200 || !state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !expectedState || state !== expectedState) return new Response("No fue posible validar el inicio de sesión.", { status: 400, headers: { "Set-Cookie": clearCookie("juris_oauth_state"), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  const flow = await env.DB?.prepare("DELETE FROM github_oauth_flows WHERE state_hash = ? AND expires_at > ? RETURNING verifier, invitation_id").bind(await adminTokenHash(state), Date.now()).first<{ verifier: string; invitation_id: string | null }>();
  if (!flow || !env.DB) return new Response("Inicio de sesión vencido o ya utilizado.", { status: 400, headers: { "Set-Cookie": clearCookie("juris_oauth_state") } });
  const { clientId, clientSecret } = authSettings(env);
  if (!clientId || !clientSecret) return new Response("La autenticación de administrador todavía no está configurada.", { status: 503 });

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, code_verifier: flow.verifier, redirect_uri: `${url.origin}/auth/github/callback` }),
    signal: AbortSignal.timeout(8000),
  });
  const token: unknown = await tokenResponse.json();
  if (!tokenResponse.ok || !token || typeof token !== "object" || !("access_token" in token) || typeof token.access_token !== "string") return new Response("GitHub no autorizó el inicio de sesión.", { status: 401, headers: { "Set-Cookie": clearCookie("juris_oauth_state") } });

  const profile = githubProfile(await githubJson("/user", token.access_token));
  if (!profile) return new Response("GitHub no pudo verificar esta cuenta.", { status: 403 });
  if (flow.invitation_id) {
    const invitation = await pendingInvitation(env, flow.invitation_id);
    if (!invitation || invitation.github_id !== profile.id) return new Response("La invitación venció, fue revocada o pertenece a otra cuenta.", { status: 403 });
    const proof = await stageAdminAcceptance(env, invitation, profile, await githubJson("/user/emails?per_page=100", token.access_token));
    if (!proof) return new Response("El correo de la invitación no figura como verificado en esta cuenta de GitHub.", { status: 403 });
    const headers = new Headers({ Location: "/invitacion-admin/", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    headers.append("Set-Cookie", clearCookie("juris_oauth_state")); headers.append("Set-Cookie", cookie("juris_admin_accept", proof, 600));
    return new Response(null, { status: 303, headers });
  }
  const member = await env.DB.prepare("SELECT github_id FROM github_administrators WHERE github_id = ? AND status = 'active'").bind(profile.id).first();
  if (!member) return new Response("Esta cuenta de GitHub no está autorizada para administrar JurisConecta.", { status: 403, headers: { "Set-Cookie": clearCookie("juris_oauth_state") } });
  await env.DB.prepare("UPDATE github_administrators SET github_login = ? WHERE github_id = ?").bind(profile.login, profile.id).run();

  const session = await createSession(profile.login, env, request);
  if (env.DB) await env.DB.prepare("INSERT INTO admin_audit_log (id, github_login, action, target_type, target_id, details_json) VALUES (?, ?, 'admin.login', 'admin_session', NULL, '{}')").bind(crypto.randomUUID(), profile.login).run();
  const headers = new Headers({ Location: "/admin/", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", clearCookie("juris_oauth_state"));
  headers.append("Set-Cookie", cookie("juris_admin", session, 28800));
  return new Response(null, { status: 302, headers });
};

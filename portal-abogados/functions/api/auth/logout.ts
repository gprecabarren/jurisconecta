import { clearUserSessionCookie, readUserSession, type UserAuthEnv } from "../../_lib/user-auth";

export const onRequestPost = async ({ request, env }: { request: Request; env: UserAuthEnv }) => {
  const session = await readUserSession(request, env);
  if (session?.sessionId && env.DB) await env.DB.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(session.sessionId, session.id).run();
  return Response.json({ loggedOut: true }, { headers: { "Set-Cookie": clearUserSessionCookie() } });
};

import { readSession, type AuthEnv } from "../_lib/github-auth";

interface Context { request: Request; env: AuthEnv; next: () => Promise<Response>; }

export const onRequest = async ({ request, env, next }: Context) => {
  const session = await readSession(request, env);
  if (session) {
    const assetResponse = await next();
    const response = new Response(assetResponse.body, assetResponse);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  return Response.redirect(new URL("/auth/github/login", request.url), 302);
};

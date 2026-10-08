import type { AuthEnv } from "../../_lib/github-auth";
import { startGitHub } from "../../_lib/admin-members";

interface Context { request: Request; env: AuthEnv; }

export const onRequestGet = async ({ request, env }: Context) => {
  return startGitHub(request, env);
};

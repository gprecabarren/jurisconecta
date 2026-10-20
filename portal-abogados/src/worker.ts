import { onRequest as protectLawyerAccount } from "../functions/account/[[path]]";
import { onRequest as protectAdmin } from "../functions/admin/[[path]]";
import { onRequest as protectLawyerCases } from "../functions/casos/[[path]]";
import { onRequest as protectClient } from "../functions/cliente/[[path]]";
import { onRequest as protectDashboard } from "../functions/dashboard/[[path]]";
import { onRequest as protectReviews } from "../functions/evaluaciones/[[path]]";
import { onRequest as protectPlans } from "../functions/planes/[[path]]";
import { onRequest as protectLawyerApplication } from "../functions/postulacion-abogado/[[path]]";
import { onRequest as protectPublishCase } from "../functions/publicar-caso/[[path]]";
import { onRequestGet as getAdminApplicationDocument } from "../functions/api/admin/application-document/[id]";
import { onRequestGet as getAdminApplications, onRequestPatch as reviewAdminApplication } from "../functions/api/admin/applications";
import { onRequestGet as getAdminCases, onRequestPatch as updateAdminCase } from "../functions/api/admin/cases";
import { onRequestGet as getAdminContent, onRequestPut as updateAdminContent } from "../functions/api/admin/content";
import { onRequestGet as getAdminProfiles } from "../functions/api/admin/profiles";
import { onRequestGet as getAdminTickets, onRequestPatch as updateAdminTicket } from "../functions/api/admin/tickets";
import { onRequestGet as getAdminRecovery, onRequestPatch as updateAdminRecovery } from "../functions/api/admin/recovery";
import { onRequestGet as getAdminAudit } from "../functions/api/admin/audit";
import { onRequestGet as getAdminUsers, onRequestPatch as updateAdminUser, onRequestDelete as deleteAdminUser } from "../functions/api/admin/users";
import { onRequestGet as getAdminSessions, onRequestDelete as deleteAdminSession } from "../functions/api/admin/sessions";
import { onRequestGet as getAdminSettings, onRequestPatch as updateAdminSettings } from "../functions/api/admin/settings";
import { onRequestPost as login } from "../functions/api/auth/login";
import { onRequestPost as logout } from "../functions/api/auth/logout";
import { onRequestGet as getCurrentUser } from "../functions/api/auth/me";
import { onRequestPatch as updateCurrentUser } from "../functions/api/auth/profile";
import { onRequestPost as register } from "../functions/api/auth/register";
import { onRequestPatch as changePassword } from "../functions/api/auth/password";
import { onRequestPost as requestRecovery, onRequestPatch as resetPassword } from "../functions/api/auth/recovery";
import { onRequestPatch as disableOwnAccount, onRequestDelete as deleteOwnAccount } from "../functions/api/auth/account";
import { onRequestGet as getUserSessions, onRequestDelete as deleteUserSession } from "../functions/api/auth/sessions";
import { onRequestGet as getClientCases, onRequestPatch as updateClientCase, onRequestPost as createClientCase } from "../functions/api/cases";
import { onRequestGet as getPublicContent } from "../functions/api/content";
import { onRequestPost as submitLawyerApplication } from "../functions/api/lawyer/application";
import { onRequestGet as getLawyerCases, onRequestPost as accessLawyerCase } from "../functions/api/lawyer/cases";
import { onRequestGet as getLawyerPlans, onRequestPost as updateLawyerPlan } from "../functions/api/lawyer/plans";
import { onRequestGet as getLawyerProfile, onRequestPatch as updateLawyerProfile } from "../functions/api/lawyer/profile";
import { onRequestGet as getLawyerProposals, onRequestPost as createLawyerProposal } from "../functions/api/lawyer/proposals";
import { onRequestGet as getClientProposals, onRequestPatch as decideClientProposal } from "../functions/api/client/proposals";
import { onRequestGet as getTickets, onRequestPost as createTicket, onRequestPatch as replyTicket } from "../functions/api/tickets";
import { onRequestGet as getNotifications, onRequestPatch as markNotification } from "../functions/api/notifications";
import { onRequestGet as getNotificationPreferences, onRequestPatch as updateNotificationPreferences } from "../functions/api/notifications/preferences";
import { onRequestGet as getReviews, onRequestPost as createReview } from "../functions/api/reviews";
import { onRequestGet as githubCallback } from "../functions/auth/github/callback";
import { onRequestGet as githubLogin } from "../functions/auth/github/login";
import type { AuthEnv } from "../functions/_lib/github-auth";
import type { UserAuthEnv } from "../functions/_lib/user-auth";
import { googleAvailable, googleCallback, googleRegistration, googleAccountStatus, startGoogle, type GoogleEnv } from "../functions/_lib/google-auth";
import { serveNews, editorialFeed } from "../functions/_lib/news-public";
import { handleAdminNews } from "../functions/api/admin/news";
import { uploadNewsMedia } from "../functions/api/admin/news-media";
import { handleAdminInvitation, handleAdminMe, handleAdminMembers } from "../functions/_lib/admin-members";
import { onRequestGet as getAdminBilling, onRequestPatch as updateAdminBilling, onRequestPost as adjustAdminCredits } from "../functions/api/admin/billing";
import { handlePublicPartners, handleAdminPartners, handlePartnerMedia } from "../functions/_lib/partners";
import { onRequestGet as getCaseTypes } from "../functions/api/case-types";
import { onRequestGet as getAdminCaseTypes, onRequestPost as createAdminCaseType, onRequestPatch as updateAdminCaseType } from "../functions/api/admin/case-types";
import { handleIntakeDraft, handleIntakeSubmit } from "../functions/_lib/case-intake";
import { handleAdminEmailTemplates } from "../functions/api/admin/email-templates";

type AppEnv = CloudflareEnv & AuthEnv & UserAuthEnv & GoogleEnv;
type PageMiddleware = (context: { request: Request; env: AppEnv; next: () => Promise<Response> }) => Promise<Response>;

const apiNotFound = () => Response.json({ error: "Ruta no encontrada." }, { status: 404 });

function methodNotAllowed(allowed: string[]) {
  return Response.json(
    { error: "Método no permitido." },
    { status: 405, headers: { Allow: allowed.join(", ") } },
  );
}

function routePrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

async function dispatchApi(request: Request, env: AppEnv, pathname: string): Promise<Response> {
  const method = request.method.toUpperCase();
  if (pathname === "/api/admin/email-templates") return ["GET", "POST", "PATCH"].includes(method) ? handleAdminEmailTemplates(request, env) : methodNotAllowed(["GET", "POST", "PATCH"]);
  if (pathname === "/api/case-types") return method === "GET" ? getCaseTypes({request,env}) : methodNotAllowed(["GET"]);
  if (pathname === "/api/admin/case-types") {
    if (method === "GET") return getAdminCaseTypes({request,env});
    if (method === "POST") return createAdminCaseType({request,env});
    if (method === "PATCH") return updateAdminCaseType({request,env});
    return methodNotAllowed(["GET","POST","PATCH"]);
  }
  if (pathname === "/api/intake/draft") return ["GET","POST","DELETE"].includes(method) ? handleIntakeDraft(request,env) : methodNotAllowed(["GET","POST","DELETE"]);
  if (pathname === "/api/intake/submit") return method === "POST" ? handleIntakeSubmit(request,env) : methodNotAllowed(["POST"]);
  if (pathname === "/api/admin/me") return handleAdminMe(request, env);
  if (pathname === "/api/admin/administrators") return handleAdminMembers(request, env);
  if (pathname === "/api/invitaciones-admin") return ["GET", "POST"].includes(method) ? handleAdminInvitation(request, env) : methodNotAllowed(["GET", "POST"]);
  if (pathname === "/api/partners") return method === "GET" ? handlePublicPartners(request, env) : methodNotAllowed(["GET"]);
  if (pathname === "/api/admin/partners") return ["GET", "POST", "PATCH"].includes(method) ? handleAdminPartners(request, env) : methodNotAllowed(["GET", "POST", "PATCH"]);
  if (pathname === "/api/admin/billing") {
    if (method === "GET") return getAdminBilling({ request, env });
    if (method === "PATCH") return updateAdminBilling({ request, env });
    if (method === "POST") return adjustAdminCredits({ request, env });
    return methodNotAllowed(["GET", "PATCH", "POST"]);
  }

  if (pathname === "/api/auth/providers") return method === "GET" ? Response.json({ google: googleAvailable(env) }, { headers: { "Cache-Control": "no-store" } }) : methodNotAllowed(["GET"]);
  if (pathname === "/api/auth/google/registration") return method === "GET" || method === "POST" ? googleRegistration(request, env) : methodNotAllowed(["GET", "POST"]);
  if (pathname === "/api/auth/google/account") return method === "GET" ? googleAccountStatus(request, env) : methodNotAllowed(["GET"]);
  if (pathname === "/api/admin/news") return ["GET", "POST", "PUT"].includes(method) ? handleAdminNews({ request, env }) : methodNotAllowed(["GET", "POST", "PUT"]);
  if (pathname === "/api/admin/news/media") return method === "POST" ? uploadNewsMedia(request, env) : methodNotAllowed(["POST"]);
  if (pathname === "/api/measurement") {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    const settings = await env.DB.prepare("SELECT gtm_id FROM site_settings WHERE id = 1").first<{ gtm_id: string }>();
    return Response.json({ gtmId: settings?.gtm_id || "" }, { headers: { "Cache-Control": "no-store" } });
  }

  if (pathname === "/api/health") {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
    return method === "HEAD"
      ? new Response(null, { status: 200 })
      : Response.json({ status: "ok", service: "jurisconecta" });
  }
  if (pathname === "/api/content") return method === "GET" ? getPublicContent({ env }) : methodNotAllowed(["GET"]);
  if (pathname === "/api/cases") {
    if (method === "GET") return getClientCases({ request, env });
    if (method === "POST") return createClientCase({ request, env });
    if (method === "PATCH") return updateClientCase({ request, env });
    return methodNotAllowed(["GET", "POST", "PATCH"]);
  }

  if (pathname === "/api/auth/login") return method === "POST" ? login({ request, env }) : methodNotAllowed(["POST"]);
  if (pathname === "/api/auth/logout") return method === "POST" ? logout({ request, env }) : methodNotAllowed(["POST"]);
  if (pathname === "/api/auth/me") return method === "GET" ? getCurrentUser({ request, env }) : methodNotAllowed(["GET"]);
  if (pathname === "/api/auth/profile") return method === "PATCH" ? updateCurrentUser({ request, env }) : methodNotAllowed(["PATCH"]);
  if (pathname === "/api/auth/register") return method === "POST" ? register({ request, env }) : methodNotAllowed(["POST"]);
  if (pathname === "/api/auth/password") return method === "PATCH" ? changePassword({ request, env }) : methodNotAllowed(["PATCH"]);
  if (pathname === "/api/auth/recovery") {
    if (method === "POST") return requestRecovery({ request, env });
    if (method === "PATCH") return resetPassword({ request, env });
    return methodNotAllowed(["POST", "PATCH"]);
  }
  if (pathname === "/api/auth/account") {
    if (method === "PATCH") return disableOwnAccount({ request, env });
    if (method === "DELETE") return deleteOwnAccount({ request, env });
    return methodNotAllowed(["PATCH", "DELETE"]);
  }
  if (pathname === "/api/auth/sessions") {
    if (method === "GET") return getUserSessions({ request, env });
    if (method === "DELETE") return deleteUserSession({ request, env });
    return methodNotAllowed(["GET", "DELETE"]);
  }
  if (pathname === "/api/tickets") {
    if (method === "GET") return getTickets({ request, env });
    if (method === "POST") return createTicket({ request, env });
    if (method === "PATCH") return replyTicket({ request, env });
    return methodNotAllowed(["GET", "POST", "PATCH"]);
  }
  if (pathname === "/api/notifications") {
    if (method === "GET") return getNotifications({ request, env });
    if (method === "PATCH") return markNotification({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }
  if (pathname === "/api/notifications/preferences") {
    if (method === "GET") return getNotificationPreferences({ request, env });
    if (method === "PATCH") return updateNotificationPreferences({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }
  if (pathname === "/api/reviews") {
    if (method === "GET") return getReviews({ request, env });
    if (method === "POST") return createReview({ request, env });
    return methodNotAllowed(["GET", "POST"]);
  }
  if (pathname === "/api/client/proposals") {
    if (method === "GET") return getClientProposals({ request, env });
    if (method === "PATCH") return decideClientProposal({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (pathname === "/api/lawyer/application") return method === "POST" ? submitLawyerApplication({ request, env }) : methodNotAllowed(["POST"]);
  if (pathname === "/api/lawyer/cases") {
    if (method === "GET") return getLawyerCases({ request, env });
    if (method === "POST") return accessLawyerCase({ request, env });
    return methodNotAllowed(["GET", "POST"]);
  }
  if (pathname === "/api/lawyer/plans") {
    if (method === "GET") return getLawyerPlans({ request, env });
    if (method === "POST") return updateLawyerPlan({ request, env });
    return methodNotAllowed(["GET", "POST"]);
  }
  if (pathname === "/api/lawyer/profile") {
    if (method === "GET") return getLawyerProfile({ request, env });
    if (method === "PATCH") return updateLawyerProfile({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }
  if (pathname === "/api/lawyer/proposals") {
    if (method === "GET") return getLawyerProposals({ request, env });
    if (method === "POST") return createLawyerProposal({ request, env });
    return methodNotAllowed(["GET", "POST"]);
  }

  if (pathname === "/api/admin/applications") {
    if (method === "GET") return getAdminApplications({ request, env });
    if (method === "PATCH") return reviewAdminApplication({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }
  if (pathname === "/api/admin/cases") {
    if (method === "GET") return getAdminCases({ request, env });
    if (method === "PATCH") return updateAdminCase({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }
  if (pathname === "/api/admin/content") {
    if (method === "GET") return getAdminContent({ request, env });
    if (method === "PUT") return updateAdminContent({ request, env });
    return methodNotAllowed(["GET", "PUT"]);
  }
  if (pathname === "/api/admin/profiles") return method === "GET" ? getAdminProfiles({ request, env }) : methodNotAllowed(["GET"]);
  if (pathname === "/api/admin/tickets") {
    if (method === "GET") return getAdminTickets({ request, env });
    if (method === "PATCH") return updateAdminTicket({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }
  if (pathname === "/api/admin/recovery") {
    if (method === "GET") return getAdminRecovery({ request, env });
    if (method === "PATCH") return updateAdminRecovery({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }
  if (pathname === "/api/admin/audit") return method === "GET" ? getAdminAudit({ request, env }) : methodNotAllowed(["GET"]);
  if (pathname === "/api/admin/users") {
    if (method === "GET") return getAdminUsers({ request, env });
    if (method === "PATCH") return updateAdminUser({ request, env });
    if (method === "DELETE") return deleteAdminUser({ request, env });
    return methodNotAllowed(["GET", "PATCH", "DELETE"]);
  }
  if (pathname === "/api/admin/sessions") {
    if (method === "GET") return getAdminSessions({ request, env });
    if (method === "DELETE") return deleteAdminSession({ request, env });
    return methodNotAllowed(["GET", "DELETE"]);
  }
  if (pathname === "/api/admin/settings") {
    if (method === "GET") return getAdminSettings({ request, env });
    if (method === "PATCH") return updateAdminSettings({ request, env });
    return methodNotAllowed(["GET", "PATCH"]);
  }

  const documentMatch = pathname.match(/^\/api\/admin\/application-document\/([^/]+)$/);
  if (documentMatch) {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    return getAdminApplicationDocument({ request, env, params: { id: decodeURIComponent(documentMatch[1]) } });
  }

  return apiNotFound();
}

async function serveProtectedPage(request: Request, env: AppEnv, pathname: string): Promise<Response | null> {
  const next = () => env.ASSETS.fetch(request);
  const protections: Array<[string, PageMiddleware]> = [
    ["/admin", protectAdmin],
    ["/account", protectLawyerAccount],
    ["/casos", protectLawyerCases],
    ["/dashboard", protectDashboard],
    ["/evaluaciones", protectReviews],
    ["/planes", protectPlans],
    ["/postulacion-abogado", protectLawyerApplication],
    ["/cliente", protectClient],
    ["/publicar-caso", protectPublishCase],
  ];
  const protection = protections.find(([prefix]) => routePrefix(pathname, prefix));
  return protection ? protection[1]({ request, env, next }) : null;
}

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname === "www.jurisconecta.cl") {
      url.hostname = "jurisconecta.cl";
      return Response.redirect(url.toString(), 308);
    }

    try {
      const maintenanceExempt = url.pathname === "/invitacion-admin/" || url.pathname === "/api/invitaciones-admin" || routePrefix(url.pathname, "/admin") || routePrefix(url.pathname, "/api/admin") || routePrefix(url.pathname, "/auth/github") || routePrefix(url.pathname, "/_next") || routePrefix(url.pathname, "/mantenimiento") || url.pathname === "/api/health" || url.pathname === "/icon.svg" || url.pathname === "/og-jurisconecta.png";
      if (!maintenanceExempt) {
        const settings = await env.DB.prepare("SELECT maintenance_enabled FROM site_settings WHERE id = 1").first<{ maintenance_enabled: number }>();
        if (settings?.maintenance_enabled === 1) {
          const headers = { "Cache-Control": "no-store", "Retry-After": "3600", "X-Robots-Tag": "noindex, nofollow" };
          if (routePrefix(url.pathname, "/api")) return Response.json({ error: "JurisConecta está en mantenimiento." }, { status: 503, headers });
          const maintenanceUrl = new URL("/mantenimiento/", url);
          const page = await env.ASSETS.fetch(new Request(maintenanceUrl, { method: "GET" }));
          return new Response(request.method === "HEAD" ? null : page.body, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
        }
      }
      if (routePrefix(url.pathname, "/api")) {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("Origin") !== url.origin) return Response.json({ error: "Origen no autorizado." }, { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff" } });
        const response = await dispatchApi(request, env, url.pathname);
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        return response;
      }
      if (url.pathname === "/auth/github/login") return request.method === "GET" ? githubLogin({ request, env }) : methodNotAllowed(["GET"]);
      if (url.pathname === "/auth/github/callback") return request.method === "GET" ? githubCallback({ request, env }) : methodNotAllowed(["GET"]);
      if (url.pathname === "/auth/google/start") return request.method === "GET" ? startGoogle(request, env) : methodNotAllowed(["GET"]);
      if (url.pathname === "/auth/google/callback") return request.method === "GET" ? googleCallback(request, env) : methodNotAllowed(["GET"]);
      if (routePrefix(url.pathname,"/publicar-caso") && ["GET","HEAD"].includes(request.method)) return new Response(null,{status:303,headers:{Location:"/solicitar/","Cache-Control":"no-store"}});
      if (url.pathname === "/sitemap.xml" || url.pathname === "/noticias/feed.xml") return editorialFeed(request, env);
      if (routePrefix(url.pathname, "/noticias")) return serveNews(request, env);
      const partnerMedia = url.pathname.match(/^\/aliados\/media\/([a-f\d-]{36})$/i);
      if (partnerMedia) return ["GET", "HEAD"].includes(request.method) ? handlePartnerMedia(request, env, partnerMedia[1]) : methodNotAllowed(["GET", "HEAD"]);

      const protectedResponse = await serveProtectedPage(request, env, url.pathname.replace(/\/$/, "") || "/");
      const response = protectedResponse ?? await env.ASSETS.fetch(request);
      if (routePrefix(url.pathname,"/solicitar") || routePrefix(url.pathname,"/encuentra-abogado")) {
        const privateForm = new Response(response.body,response);
        privateForm.headers.set("Cache-Control","private, no-store");
        privateForm.headers.set("Referrer-Policy","no-referrer");
        privateForm.headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
        return privateForm;
      }
      if (["/", "/equipo/", "/soporte/"].includes(url.pathname) && response.headers.get("Content-Type")?.includes("text/html")) {
        return new HTMLRewriter().on("head", { element(element) { element.append('<script src="/measurement.js" defer></script>', { html: true }); } }).transform(response);
      }
      return response;
    } catch (error) {
      console.error(JSON.stringify({
        message: "Unhandled request error",
        method: request.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return routePrefix(url.pathname, "/api")
        ? Response.json({ error: "Ocurrió un error inesperado." }, { status: 500, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } })
        : new Response("Ocurrió un error inesperado.", { status: 500 });
    }
  },
} satisfies ExportedHandler<AppEnv>;

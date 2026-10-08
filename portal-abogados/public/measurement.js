/* JurisConecta: basic consent, public pages only, no personal data. */
(function () {
  "use strict";
  if (new URLSearchParams(location.search).has("preview")) return;
  var eligible = /^\/(?:$|equipo\/?$|soporte\/?$|noticias(?:\/|$))/;
  if (!eligible.test(location.pathname)) return;
  var key = "juris_analytics_consent_v1", consent = null, loaded = false, container = "";
  try { consent = JSON.parse(localStorage.getItem(key) || "null"); if (consent && (typeof consent.allowed !== "boolean" || typeof consent.at !== "number" || consent.at > Date.now() || Date.now() - consent.at > 180 * 86400000)) consent = null; } catch { /* Storage is optional. */ }
  function cleanPath(value) { try { var u = new URL(value, location.origin); return u.origin === location.origin && eligible.test(u.pathname) ? u.origin + u.pathname : u.origin; } catch { return ""; } }
  function load() {
    if (loaded || !container || !consent || !consent.allowed) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    window.dataLayer.push({ event: "jc_page_view", jc_page_location: location.origin + location.pathname, jc_page_title: document.title.slice(0, 160), jc_page_referrer: cleanPath(document.referrer) });
    var script = document.createElement("script"); script.async = true; script.src = "https://www.googletagmanager.com/gtm.js?id=" + container; document.head.appendChild(script);
  }
  function save(allowed) {
    consent = { allowed: allowed, at: Date.now() };
    try { localStorage.setItem(key, JSON.stringify(consent)); } catch { /* Consent applies to this page. */ }
    banner.hidden = true;
    if (allowed) load();
    else if (loaded) {
      document.cookie.split(";").forEach(function (entry) { var name = entry.split("=")[0].trim(); if (/^_ga(?:_|$)/.test(name)) [location.hostname, "." + location.hostname, ""].forEach(function (domain) { document.cookie = name + "=; Max-Age=0; Path=/" + (domain ? "; Domain=" + domain : "") + "; Secure; SameSite=Lax"; }); });
      location.reload();
    }
  }
  var banner = document.createElement("section"); banner.className = "consent-banner"; banner.setAttribute("aria-label", "Preferencias de analítica"); banner.hidden = true;
  banner.innerHTML = '<div><strong>Tu privacidad importa</strong><p>Con tu permiso usamos Google Analytics para medir visitas a páginas públicas. No enviamos formularios, datos personales ni información de tus casos. <a href="/privacidad/">Más información</a></p></div><div class="consent-actions"><button type="button" data-consent="no">Rechazar</button><button type="button" data-consent="yes">Aceptar analítica</button></div>';
  banner.querySelector('[data-consent="no"]').addEventListener("click", function () { save(false); });
  banner.querySelector('[data-consent="yes"]').addEventListener("click", function () { save(true); });
  document.body.appendChild(banner);
  var preferences = document.createElement("button"); preferences.type = "button"; preferences.className = "consent-preferences"; preferences.textContent = "Preferencias de privacidad"; preferences.hidden = true;
  preferences.addEventListener("click", function () { banner.hidden = false; banner.querySelector("button").focus(); }); document.body.appendChild(preferences);
  fetch("/api/measurement", { credentials: "omit" }).then(function (response) { return response.ok ? response.json() : null; }).then(function (settings) { if (!settings || !/^GTM-[A-Z0-9]{4,12}$/.test(settings.gtmId)) return; container = settings.gtmId; preferences.hidden = false; if (!consent) banner.hidden = false; else load(); }).catch(function () { /* No tracker on configuration errors. */ });
  document.addEventListener("click", function (event) {
    var link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || link.target === "_blank" || link.hasAttribute("download")) return;
    var url; try { url = new URL(link.href); } catch { return; }
    var action = /^\/registro\/?$/.test(url.pathname) ? "register_start" : /^\/ingresar\/?$/.test(url.pathname) ? "login_open" : /^(mailto:|tel:)/.test(url.protocol) || url.hostname === "wa.me" ? "contact_click" : "";
    var navigates = url.origin === location.origin && (url.pathname !== location.pathname || url.search !== location.search);
    if (action && loaded && consent.allowed) {
      var payload = { event: "jc_public_action", jc_action: action };
      if (navigates) {
        // Let GTM dispatch the public intent before unloading it. An ad blocker
        // or a failed tag must never trap the visitor on the current page.
        event.preventDefault(); event.stopImmediatePropagation();
        var followed = false;
        var follow = function () { if (!followed) { followed = true; location.assign(url.href); } };
        payload.eventCallback = follow; payload.eventTimeout = 400;
        window.dataLayer.push(payload); setTimeout(follow, 450); return;
      }
      window.dataLayer.push(payload);
    }
    // A full navigation also unloads GTM before any private/auth route is rendered.
    if (navigates) { event.preventDefault(); event.stopImmediatePropagation(); location.assign(url.href); }
  }, true);
})();

export function sessionMetadata(request: Request) {
  const agent = (request.headers.get("User-Agent") || "").slice(0, 250);
  const browser = /Edg\//.test(agent) ? "Edge" : /Chrome\//.test(agent) ? "Chrome" : /Firefox\//.test(agent) ? "Firefox" : /Safari\//.test(agent) ? "Safari" : "Navegador desconocido";
  const system = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "Sistema desconocido";
  const cf = (request as Request & { cf?: { city?: string; region?: string; country?: string } }).cf;
  const location = [cf?.city, cf?.region, cf?.country].filter(Boolean).join(", ") || "Ubicación no disponible";
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipHint = ip.includes(".") ? ip.replace(/\.\d+$/, ".x") : ip.includes(":") ? `${ip.split(":").slice(0, 2).join(":")}:…` : null;
  return { device: `${browser} en ${system}`, location, ipHint };
}

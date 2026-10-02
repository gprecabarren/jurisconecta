export function validAvatarDataUrl(value: unknown): value is string {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 33_000) return false;
  const match = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  try {
    const binary = atob(match[2]);
    if (binary.length < 16 || binary.length > 24_576) return false;
    if (match[1] === "webp") return binary.slice(0, 4) === "RIFF" && binary.slice(8, 12) === "WEBP";
    if (match[1] === "jpeg") return binary.charCodeAt(0) === 0xff && binary.charCodeAt(1) === 0xd8 && binary.charCodeAt(2) === 0xff;
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => binary.charCodeAt(index) === byte);
  } catch { return false; }
}

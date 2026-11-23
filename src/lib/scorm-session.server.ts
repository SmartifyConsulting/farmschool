/**
 * Short-lived, signed access tokens for the SCORM file proxy. An <iframe src="..."> can never send
 * a custom Authorization header, so entitlement is checked once (via a real fetch with a Bearer
 * token) and the result is handed back as a signed token the browser stores as a same-origin cookie,
 * scoped by Path to this one package, that every subsequent same-origin asset request then carries
 * automatically.
 */
const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function signScormSession(secret: string, authorId: string, packageId: string): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${authorId}:${packageId}:${expiresAt}`;
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const token = `${base64UrlEncode(encoder.encode(payload))}.${base64UrlEncode(new Uint8Array(signature))}`;
  return { token, expiresAt };
}

export async function verifyScormSession(secret: string, token: string, authorId: string, packageId: string): Promise<boolean> {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return false;
  const key = await hmacKey(secret);
  const payloadBytes = base64UrlDecode(payloadPart);
  const valid = await crypto.subtle.verify("HMAC", key, base64UrlDecode(signaturePart) as BufferSource, payloadBytes as BufferSource);
  if (!valid) return false;
  const payload = new TextDecoder().decode(payloadBytes);
  const [tokenAuthor, tokenPackage, expiresAtRaw] = payload.split(":");
  const expiresAt = Number(expiresAtRaw);
  return tokenAuthor === authorId && tokenPackage === packageId && Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function scormSessionCookieName(packageId: string): string {
  return `scorm_sess_${packageId}`;
}

/**
 * Firma HMAC-SHA256 para la integración Convex ↔ n8n (igual en ambas direcciones).
 *
 *   Cuerpo:    {"payload": "<JSON como texto>"}
 *   Cabeceras: X-LendLoop-Timestamp: <segundos Unix>
 *              X-LendLoop-Signature: hex(HMAC_SHA256(secret, `${timestamp}.${payload}`))
 *
 * El payload viaja como texto para que ambos lados firmen exactamente los mismos bytes,
 * sin depender de cómo cada uno re-serializa el JSON.
 */

export const TIMESTAMP_HEADER = "X-LendLoop-Timestamp";
export const SIGNATURE_HEADER = "X-LendLoop-Signature";
/** Ventana anti-replay: se rechazan firmas con más de 5 minutos. */
export const MAX_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación en tiempo constante para no filtrar información por timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function requireSecret(name: "CONVEX_TO_N8N_SECRET" | "N8N_TO_CONVEX_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} is not configured`);
  return value;
}

/** Construye cuerpo y cabeceras firmados para enviar `data`. */
export async function signPayload(secret: string, data: unknown, now = Date.now()) {
  const payload = JSON.stringify(data);
  const timestamp = Math.floor(now / 1000).toString();
  const signature = await hmacHex(secret, `${timestamp}.${payload}`);
  return {
    body: JSON.stringify({ payload }),
    headers: {
      "Content-Type": "application/json",
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: signature,
    },
  };
}

export type VerifyResult = { ok: true; data: unknown } | { ok: false; reason: string };

/** Verifica una petición firmada y devuelve el payload ya parseado. */
export async function verifyRequest(secret: string, request: Request, now = Date.now()): Promise<VerifyResult> {
  const timestamp = request.headers.get(TIMESTAMP_HEADER);
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!timestamp || !signature) return { ok: false, reason: "missing signature headers" };
  if (!/^\d{9,11}$/.test(timestamp)) return { ok: false, reason: "invalid timestamp" };
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale timestamp" };
  }

  let payload: unknown;
  try {
    payload = (JSON.parse(await request.text()) as { payload?: unknown }).payload;
  } catch {
    return { ok: false, reason: "invalid body" };
  }
  if (typeof payload !== "string") return { ok: false, reason: "invalid body" };

  const expected = await hmacHex(secret, `${timestamp}.${payload}`);
  if (!timingSafeEqual(expected, signature.toLowerCase())) return { ok: false, reason: "bad signature" };

  try {
    return { ok: true, data: JSON.parse(payload) };
  } catch {
    return { ok: false, reason: "invalid payload" };
  }
}

// Sesión firmada con HMAC-SHA256. Usa Web Crypto porque también se ejecuta en
// middleware.ts (Edge), donde no está disponible el módulo crypto de Node.

export const SESSION_MAX_AGE = 60 * 60 * 8 // 8 horas

const MIN_SECRET_LENGTH = 32

export interface SessionData {
  uid: number
  email: string
}

async function getKey(): Promise<CryptoKey | null> {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/**
 * Crea el token de sesión. Retorna null si falta SESSION_SECRET o es muy corto.
 */
export async function createSessionToken(data: SessionData): Promise<string | null> {
  const key = await getKey()
  if (!key) return null

  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ ...data, exp })))
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

/**
 * Retorna los datos de la sesión, o null si el token no es válido o expiró.
 */
export async function verifySessionToken(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null
  const key = await getKey()
  if (!key) return null

  const [payload, signature, ...rest] = token.split('.')
  if (!payload || !signature || rest.length > 0) return null

  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(payload)
    )
    if (!valid) return null

    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    if (typeof data.uid !== 'number' || typeof data.exp !== 'number') return null
    if (data.exp <= Math.floor(Date.now() / 1000)) return null

    return { uid: data.uid, email: data.email }
  } catch {
    return null
  }
}

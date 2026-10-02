// PIN, biometria (Face ID / digital via WebAuthn) e criptografia de backups.

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
const random = (n: number) => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)))

async function pbkdf2(secret: string, salt: Uint8Array<ArrayBuffer>, usage: 'bits' | 'key') {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits', 'deriveKey'])
  const params = { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' }
  if (usage === 'bits') return crypto.subtle.deriveBits(params, base, 256)
  return crypto.subtle.deriveKey(params, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function hashPin(pin: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? fromB64(saltB64) : random(16)
  const bits = (await pbkdf2(pin, salt, 'bits')) as ArrayBuffer
  return { hash: toB64(bits), salt: toB64(salt) }
}

export async function checkPin(pin: string, hash: string, salt: string): Promise<boolean> {
  const r = await hashPin(pin, salt)
  return r.hash === hash
}

// ---------------------------------------------------------------------------
// Biometria (WebAuthn com autenticador do próprio aparelho)
// ---------------------------------------------------------------------------

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof PublicKeyCredential !== 'undefined' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    )
  } catch {
    return false
  }
}

export async function registerBiometric(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: 'Minhas Finanças' },
      user: { id: random(16), name: 'proprietario', displayName: 'Proprietário' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Cadastro cancelado')
  return toB64(cred.rawId)
}

export async function verifyBiometric(id: string): Promise<boolean> {
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: fromB64(id) }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return !!cred
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Backup criptografado (AES-GCM 256 com chave derivada da senha)
// ---------------------------------------------------------------------------

export interface BackupFile {
  app: 'minhas-financas'
  version: 1
  createdAt: string
  encrypted: boolean
  salt?: string
  iv?: string
  payload: string // JSON puro ou base64 cifrado
}

export async function makeBackup(data: unknown, password?: string): Promise<BackupFile> {
  const json = JSON.stringify(data)
  const base = { app: 'minhas-financas' as const, version: 1 as const, createdAt: new Date().toISOString() }
  if (!password) return { ...base, encrypted: false, payload: json }
  const salt = random(16)
  const iv = random(12)
  const key = (await pbkdf2(password, salt, 'key')) as CryptoKey
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json))
  return { ...base, encrypted: true, salt: toB64(salt), iv: toB64(iv), payload: toB64(cipher) }
}

export async function readBackup(file: BackupFile, password?: string): Promise<unknown> {
  if (file.app !== 'minhas-financas') throw new Error('Este arquivo não é um backup do Minhas Finanças.')
  if (!file.encrypted) return JSON.parse(file.payload)
  if (!password) throw new Error('Este backup é protegido por senha.')
  const key = (await pbkdf2(password, fromB64(file.salt!), 'key')) as CryptoKey
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.iv!) }, key, fromB64(file.payload))
    return JSON.parse(dec.decode(plain))
  } catch {
    throw new Error('Senha incorreta ou arquivo corrompido.')
  }
}

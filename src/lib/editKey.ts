// Online edit mode credentials. A GitHub token that can write to the site's repo is
// encrypted with the owner's password (PBKDF2 → AES-GCM) and published as
// public/edit-key.json. Only the ciphertext is public; the password never leaves
// the owner's head, and the token is only ever decrypted in the owner's browser.
// Shared by the browser and scripts/edit-key.ts (WebCrypto exists in both).

export interface Remote {
  /** "owner/repo" */
  repo: string
  branch: string
  token: string
}

export interface EditKeyFile {
  v: 1
  iter: number
  salt: string
  iv: string
  data: string
}

const ITER = 600_000

const b64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptRemote(remote: Remote, password: string): Promise<EditKeyFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await derive(password, salt, ITER)
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(remote))))
  return { v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) }
}

/** Throws on a wrong password (AES-GCM authentication fails). */
export async function decryptRemote(file: EditKeyFile, password: string): Promise<Remote> {
  const key = await derive(password, unb64(file.salt), file.iter)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) as BufferSource }, key, unb64(file.data) as BufferSource)
  return JSON.parse(new TextDecoder().decode(plain)) as Remote
}

export { b64 as toBase64 }

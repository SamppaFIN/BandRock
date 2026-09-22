/**
 * Muokkauskoodi: 5 merkkiä ilman sekoitettavia kirjaimia (ei 0/O, 1/I/L).
 * Koodi ei koskaan kulje R2:een sellaisenaan — vain HMAC-SHA256-tiiviste tallennetaan.
 * Sama koodi ei koskaan esiinny ilmoituksen id:ssä (ks. CLAUDE.md, turvallisuuskorjaus 22.9.2026).
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashCode(code, secret) {
  return hmac(code.toUpperCase(), secret);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCode(code, storedHash, secret) {
  if (typeof code !== 'string' || !code) return false;
  const hash = await hashCode(code, secret);
  return timingSafeEqual(hash, storedHash);
}

/** Nimestä johdettu, luettava, URL-turvallinen tunnus. Sama logiikka kuin public/assets/render.js:ssä. */
export function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'bandi';
}

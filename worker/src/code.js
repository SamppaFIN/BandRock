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

// Yleisavaimet (Infiniten päätös 24.9.2026): kiinteitä, tarkoituksella tunnettuja koodeja
// jotka toimivat KAIKKIIN ilmoituksiin. 00000 vain muokkaukseen (tiedot, kuvat, keikat),
// 99999 vain poistoon. Omistajan oma koodi toimii kuten ennenkin.
export const MASTER_EDIT_CODE = '00000';
export const MASTER_DELETE_CODE = '99999';

/** purpose: 'edit' | 'delete'. Ristiin ei toimi: 00000 ei poista, 99999 ei muokkaa. */
export function isMasterCode(code, purpose) {
  if (typeof code !== 'string') return false;
  const master = purpose === 'delete' ? MASTER_DELETE_CODE : purpose === 'edit' ? MASTER_EDIT_CODE : null;
  return master !== null && timingSafeEqual(code.trim(), master);
}

/** Ylläpitosalasanan vertailu (env.ADMIN_SECRET). Aikavakioinen, ei riipu pituudesta ulospäin. */
export function verifyAdmin(given, secret) {
  if (typeof given !== 'string' || !given || typeof secret !== 'string' || !secret) return false;
  return timingSafeEqual(given, secret);
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

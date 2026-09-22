/** Ilmoituksen (posterin) tarkistus ja siivous. Sama koodi Workerissa ja testeissä. */
import { parseMedia } from './media.js';

export const LIMITS = { title: 80, city: 60, tagline: 400, tag: 30, email: 120, note: 300, venue: 80, url: 300, media: 300 };
export const MAX_TAGS = 6;
export const MAX_MEDIA = 6;
export const TYPES = new Set(['bandi', 'keikka', 'haku', 'myynti']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Ohjausmerkit ja tekstin suuntaa kääntävät merkit (osoitteiden ja nimien huijaukseen).
const BAD_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;

export function todayHelsinki(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Helsinki' }).format(now);
}

function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const len = (s) => [...s].length;

function httpsHref(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

function textField(src, errors, field, limit, required) {
  const v = clean(src[field]);
  if (!v) {
    if (required) errors[field] = 'Pakollinen kenttä.';
    return null;
  }
  if (len(v) > limit) errors[field] = `Enintään ${limit} merkkiä.`;
  else if (BAD_CHARS.test(v)) errors[field] = 'Sisältää kiellettyjä merkkejä.';
  return v;
}

function parseTags(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const seen = new Set();
  const out = [];
  for (const part of raw.split(',')) {
    const t = clean(part).slice(0, LIMITS.tag);
    if (t && !BAD_CHARS.test(t) && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
      if (out.length >= MAX_TAGS) break;
    }
  }
  return out;
}

// Yksi linkki per rivi. Palauttaa sekä käyttäjän kirjoittaman osoitteen (esitäyttöä
// varten muokkauslomakkeeseen) että palvelimen rakentaman turvallisen upotusosoitteen.
function parseDiscography(raw, errors) {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_MEDIA);
  const out = [];
  for (const line of lines) {
    if (len(line) > LIMITS.media) { errors.media = `Jokainen linkki enintään ${LIMITS.media} merkkiä.`; return []; }
    const embed = parseMedia(line);
    if (!embed) { errors.media = 'Tuettu on YouTube-, Spotify- tai SoundCloud-linkki, yksi per rivi.'; return []; }
    out.push({ url: line, embed });
  }
  return out;
}

function commonFields(src, errors, { titleRequired }) {
  const title = textField(src, errors, 'title', LIMITS.title, titleRequired);
  const city = textField(src, errors, 'city', LIMITS.city, false);
  const tagline = textField(src, errors, 'tagline', LIMITS.tagline, false);
  const tags = parseTags(src.tags);

  let email = null;
  const rawEmail = clean(src.email);
  if (rawEmail) {
    if (len(rawEmail) > LIMITS.email || !EMAIL_RE.test(rawEmail)) errors.email = 'Anna kelvollinen sähköpostiosoite.';
    else email = rawEmail;
  }

  const discography = parseDiscography(src.media, errors);

  return { title, city, tagline, tags, email, discography };
}

/** POST /api/posters — luonti. */
export function validateCreate(input) {
  const errors = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  const type = clean(src.type) || 'bandi';
  if (!TYPES.has(type)) errors.type = 'Tuntematon tyyppi.';

  const fields = commonFields(src, errors, { titleRequired: true });

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { type, ...fields } };
}

/** PATCH /api/posters/:id — muokkaus. Vain lomakkeen kentät; muu sisältö (bio, kuvat, keikat…) säilyy ennallaan. */
export function validatePatch(input) {
  const errors = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const fields = commonFields(src, errors, { titleRequired: true });
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: fields };
}

/** POST /api/posters/:id/gigs — yhden keikan lisäys bändin omalle sivulle. */
export function validateGigEntry(input, today = todayHelsinki()) {
  const errors = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  const date = clean(src.date);
  if (!isRealDate(date)) errors.date = 'Anna päivämäärä muodossa VVVV-KK-PP.';
  else if (date < today) errors.date = 'Päivämäärä on jo mennyt.';
  else if (date > `${Number(today.slice(0, 4)) + 3}${today.slice(4)}`) {
    errors.date = 'Päivämäärä on liian kaukana (enintään 3 vuotta).';
  }

  const time = clean(src.time);
  if (time && !TIME_RE.test(time)) errors.time = 'Anna kellonaika muodossa TT:MM.';

  const venue = textField(src, errors, 'venue', LIMITS.venue, true);
  const city = textField(src, errors, 'city', LIMITS.city, false);
  const note = textField(src, errors, 'note', LIMITS.note, false);

  let url = null;
  const rawUrl = clean(src.url);
  if (rawUrl) {
    if (len(rawUrl) > LIMITS.url) errors.url = `Enintään ${LIMITS.url} merkkiä.`;
    else {
      url = httpsHref(rawUrl);
      if (!url) errors.url = 'Linkin pitää olla https://-osoite.';
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { date, time: time || null, venue, city, note, url } };
}

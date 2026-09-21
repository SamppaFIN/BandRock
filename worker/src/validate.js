/** Keikkailmoituksen tarkistus ja siivous. Sama koodi Workerissa ja testeissä. */
import { parseMedia } from './media.js';

export const LIMITS = { artist: 80, venue: 80, city: 60, url: 300, media: 300, note: 300 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Ohjausmerkit ja tekstin suuntaa kääntävät merkit (osoitteiden ja nimien huijaukseen).
const BAD_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;

/** Tämä päivä Suomen ajassa muodossa VVVV-KK-PP. */
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

/**
 * @returns {{ok: true, value: object} | {ok: false, errors: Record<string, string>}}
 */
export function validateGig(input, today = todayHelsinki()) {
  const errors = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};

  const text = (field, required) => {
    const v = clean(src[field]);
    if (!v) {
      if (required) errors[field] = 'Pakollinen kenttä.';
      return null;
    }
    if (len(v) > LIMITS[field]) errors[field] = `Enintään ${LIMITS[field]} merkkiä.`;
    else if (BAD_CHARS.test(v)) errors[field] = 'Sisältää kiellettyjä merkkejä.';
    return v;
  };

  const date = clean(src.date);
  if (!isRealDate(date)) errors.date = 'Anna päivämäärä muodossa VVVV-KK-PP.';
  else if (date < today) errors.date = 'Päivämäärä on jo mennyt.';
  else if (date > `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`) {
    errors.date = 'Päivämäärä on liian kaukana (enintään 2 vuotta).';
  }

  const time = clean(src.time);
  if (time && !TIME_RE.test(time)) errors.time = 'Anna kellonaika muodossa TT:MM.';

  const artist = text('artist', true);
  const venue = text('venue', true);
  const city = text('city', true);
  const note = text('note', false);

  let url = null;
  const rawUrl = clean(src.url);
  if (rawUrl) {
    if (len(rawUrl) > LIMITS.url) errors.url = `Enintään ${LIMITS.url} merkkiä.`;
    else {
      url = httpsHref(rawUrl);
      if (!url) errors.url = 'Linkin pitää olla https://-osoite.';
    }
  }

  // Soitin: vain tunnetut palvelut, upotusosoite rakennetaan palvelimella (ks. media.js).
  let embed = null;
  const rawMedia = clean(src.media);
  if (rawMedia) {
    if (len(rawMedia) > LIMITS.media) errors.media = `Enintään ${LIMITS.media} merkkiä.`;
    else {
      embed = parseMedia(rawMedia);
      if (!embed) errors.media = 'Tuettu on YouTube-, Spotify- tai SoundCloud-linkki.';
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { date, time: time || null, artist, venue, city, url, embed, note } };
}

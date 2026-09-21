/**
 * Keikkalistan Worker: ottaa ilmoitukset vastaan ja palauttaa valmiin listan.
 *
 *   GET  /gigs   tulevat, näkyvät keikat aikajärjestyksessä (enintään 200)
 *   POST /gigs   uusi ilmoitus; palvelin tarkistaa ja siivoaa kentät
 *
 * Ilmoittajasta ei tallenneta mitään. Piilotus: UPDATE gigs SET status='hidden' WHERE id=…
 */
import { validateGig, todayHelsinki } from './validate.js';

const LIST_LIMIT = 200;
const HOURLY_CAP = 30; // koko sivun yhteinen tuntiraja (ei henkilökohtainen, joten ei tallenna IP:tä)
const MAX_BODY = 4096;

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get('origin');
  const headers = {
    vary: 'origin',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
  if (origin && allowed.includes(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

async function listGigs(env, cors) {
  const { results } = await env.DB.prepare(
    `SELECT id, date, time, artist, venue, city, url, embed, note FROM gigs
     WHERE status = 'visible' AND date >= ?1
     ORDER BY date, COALESCE(time, '99:99'), id
     LIMIT ?2`,
  )
    .bind(todayHelsinki(), LIST_LIMIT)
    .all();
  return json({ gigs: results }, 200, { ...cors, 'cache-control': 'no-store' });
}

async function addGig(request, env, cors) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413, cors);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400, cors);
  }

  // Piilokenttä: ihminen ei näe eikä täytä sitä. Botille vastataan kuin onnistuisi, mitään ei tallenneta.
  if (input && input.website) return json({ ok: true }, 201, cors);

  const result = validateGig(input);
  if (!result.ok) return json({ error: 'invalid', fields: result.errors }, 400, cors);

  const now = Date.now();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM gigs WHERE created_at > ?1')
    .bind(now - 3600 * 1000)
    .first();
  if (n >= HOURLY_CAP) return json({ error: 'busy' }, 429, cors);

  const g = result.value;
  await env.DB.prepare(
    `INSERT INTO gigs (created_at, date, time, artist, venue, city, url, embed, note)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(now, g.date, g.time, g.artist, g.venue, g.city, g.url, g.embed, g.note)
    .run();
  return json({ ok: true }, 201, cors);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (new URL(request.url).pathname !== '/gigs') return json({ error: 'not_found' }, 404, cors);
      if (request.method === 'GET') return await listGigs(env, cors);
      if (request.method === 'POST') return await addGig(request, env, cors);
      return json({ error: 'method_not_allowed' }, 405, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'server_error' }, 500, cors);
    }
  },
};

/**
 * BandRockin Worker: ilmoitukset (posterit) R2:ssa, ei tietokantaa.
 *
 *   GET    /api/posters              kevyt lista (vain näkyvät), ruudukkoa varten
 *   GET    /api/posters/:id          täysi ilmoitus (codeHash ei koskaan mukana)
 *   POST   /api/posters              uusi ilmoitus; palauttaa koodin KERRAN
 *   PATCH  /api/posters/:id          muokkaus koodilla (vain lomakkeen kentät, muu sisältö säilyy)
 *   DELETE /api/posters/:id          poisto koodilla
 *   POST   /api/posters/:id/gigs     yhden keikan lisäys koodilla
 *
 * Ilmoittajasta ei tallenneta mitään pysyvästi. IP:tä käytetään vain ohimenevästi
 * nopeusrajoittimen avaimena (Cloudflaren oma rajoitinpalvelu), ei kirjoiteta R2:een.
 */
import { validateCreate, validatePatch, validateGigEntry } from './schema.js';
import { generateCode, hashCode, verifyCode, slugify } from './code.js';

const MAX_BODY = 8192;
const LIST_CACHE_SECONDS = 30;

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin');
  const headers = {
    vary: 'origin',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
  if (origin && allowed.includes(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

// Poistaa aina koodin ja sen tiivisteen vastauksesta — kumpaakaan ei koskaan lähetetä ulos.
function publicView(poster) {
  const { codeHash, editCode, ...pub } = poster;
  return pub;
}

async function rateLimited(env, key) {
  if (!env.RATE_LIMITER) return false; // paikallinen kehitys ilman sidontaa: ei rajoiteta
  try {
    const { success } = await env.RATE_LIMITER.limit({ key });
    return !success;
  } catch {
    return false; // rajoitin ei saatavilla — ei estetä käyttöä sen takia
  }
}

async function listPosters(env, cors) {
  const cache = caches.default;
  const cacheKey = new Request('https://bandrock.internal/api/posters');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, { headers: { ...Object.fromEntries(cached.headers), ...cors } });

  const out = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: 'posters/', cursor, include: ['customMetadata'] });
    for (const obj of page.objects) {
      let m = obj.customMetadata || {};
      // Tavallisesti customMetadata riittää (POST/PATCH-reitit asettavat sen aina).
      // Jos joku ilmoitus on kirjoitettu R2:een muuta kautta (esim. `wrangler r2 object
      // put`, joka ei osaa asettaa customMetadataa), luetaan tiedot silloin itse tiedostosta.
      if (!m.title) {
        try {
          const body = await env.BUCKET.get(obj.key);
          if (body) m = await body.json();
        } catch { /* jätetään ohi, jos tiedosto ei ole kelvollista JSON:ia */ }
      }
      if (m.status === 'hidden') continue;
      out.push({
        id: m.id || obj.key.slice('posters/'.length, -'.json'.length),
        type: m.type || 'bandi',
        title: m.title || '',
        city: m.city || '',
        tagline: m.tagline || '',
        tags: Array.isArray(m.tags) ? m.tags : (typeof m.tags === 'string' ? m.tags.split('|').filter(Boolean) : []),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const res = json({ posters: out }, 200, { 'cache-control': `public, max-age=${LIST_CACHE_SECONDS}` });
  await cache.put(cacheKey, res.clone());
  return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...cors } });
}

async function getPoster(env, id, cors) {
  const obj = await env.BUCKET.get(`posters/${id}.json`);
  if (!obj) return json({ error: 'not_found' }, 404, cors);
  const poster = await obj.json();
  if (poster.status === 'hidden') return json({ error: 'not_found' }, 404, cors);
  return json(publicView(poster), 200, { ...cors, 'cache-control': 'no-store' });
}

async function purgeListCache() {
  await caches.default.delete(new Request('https://bandrock.internal/api/posters'));
}

async function uniqueId(env, title) {
  const base = slugify(title);
  let id = base;
  for (let i = 0; i < 5; i++) {
    const exists = await env.BUCKET.head(`posters/${id}.json`);
    if (!exists) return id;
    id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return { error: json({ error: 'too_large' }, 413) };
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { error: json({ error: 'bad_json' }, 400) };
  }
}

function customMetaFor(poster) {
  return {
    id: poster.id,
    type: poster.type,
    title: poster.title,
    city: poster.city || '',
    tagline: poster.tagline || '',
    tags: (poster.tags || []).join('|'),
    status: poster.status,
  };
}

async function createPoster(request, env, cors) {
  const { value: input, error } = await readBody(request);
  if (error) return json(await error.json(), error.status, cors);

  // Piilokenttä: ihminen ei näe eikä täytä sitä. Botille vastataan kuin onnistuisi.
  if (input && input.website) return json({ ok: true, id: 'ok', code: '-----' }, 201, cors);

  if (await rateLimited(env, 'create')) return json({ error: 'busy' }, 429, cors);

  const result = validateCreate(input);
  if (!result.ok) return json({ error: 'invalid', fields: result.errors }, 400, cors);

  const id = await uniqueId(env, result.value.title);
  const code = generateCode();
  const codeHash = await hashCode(code, env.CODE_SECRET);
  const now = Date.now();

  const poster = {
    id,
    type: result.value.type,
    title: result.value.title,
    city: result.value.city,
    tagline: result.value.tagline,
    tags: result.value.tags,
    contact: result.value.email ? { email: result.value.email } : null,
    media: result.value.media,
    embed: result.value.embed,
    gigs: [],
    status: 'visible',
    created: now,
    updated: now,
    codeHash,
  };

  await env.BUCKET.put(`posters/${id}.json`, JSON.stringify(poster), { customMetadata: customMetaFor(poster) });
  await purgeListCache();
  return json({ ok: true, id, code }, 201, cors);
}

async function loadForEdit(env, id, code) {
  const obj = await env.BUCKET.get(`posters/${id}.json`);
  if (!obj) return { error: json({ error: 'not_found' }, 404) };
  const poster = await obj.json();
  const ok = await verifyCode(code, poster.codeHash, env.CODE_SECRET);
  if (!ok) return { error: json({ error: 'forbidden' }, 403) };
  return { poster };
}

async function patchPoster(request, env, id, cors) {
  const { value: input, error } = await readBody(request);
  if (error) return json(await error.json(), error.status, cors);

  if (await rateLimited(env, `edit:${id}`)) return json({ error: 'busy' }, 429, cors);

  const { poster, error: authError } = await loadForEdit(env, id, String((input && input.code) || ''));
  if (authError) return json(await authError.json(), authError.status, cors);

  const result = validatePatch(input);
  if (!result.ok) return json({ error: 'invalid', fields: result.errors }, 400, cors);

  const updated = {
    ...poster,
    title: result.value.title,
    city: result.value.city,
    tagline: result.value.tagline,
    tags: result.value.tags,
    contact: result.value.email ? { email: result.value.email } : poster.contact,
    media: result.value.media ?? poster.media,
    embed: result.value.embed ?? poster.embed,
    updated: Date.now(),
  };
  await env.BUCKET.put(`posters/${id}.json`, JSON.stringify(updated), { customMetadata: customMetaFor(updated) });
  await purgeListCache();
  return json({ ok: true }, 200, cors);
}

async function deletePoster(request, env, id, cors) {
  const { value: input, error } = await readBody(request);
  if (error) return json(await error.json(), error.status, cors);

  if (await rateLimited(env, `edit:${id}`)) return json({ error: 'busy' }, 429, cors);

  const { error: authError } = await loadForEdit(env, id, String((input && input.code) || ''));
  if (authError) return json(await authError.json(), authError.status, cors);

  await env.BUCKET.delete(`posters/${id}.json`);
  await purgeListCache();
  return json({ ok: true }, 200, cors);
}

async function addGig(request, env, id, cors) {
  const { value: input, error } = await readBody(request);
  if (error) return json(await error.json(), error.status, cors);

  if (await rateLimited(env, `edit:${id}`)) return json({ error: 'busy' }, 429, cors);

  const { poster, error: authError } = await loadForEdit(env, id, String((input && input.code) || ''));
  if (authError) return json(await authError.json(), authError.status, cors);

  const result = validateGigEntry(input);
  if (!result.ok) return json({ error: 'invalid', fields: result.errors }, 400, cors);

  const updated = { ...poster, gigs: [...(poster.gigs || []), result.value], updated: Date.now() };
  await env.BUCKET.put(`posters/${id}.json`, JSON.stringify(updated), { customMetadata: customMetaFor(updated) });
  return json({ ok: true }, 201, cors);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean); // ["api","posters", ":id"?, "gigs"?]
      if (parts[0] !== 'api' || parts[1] !== 'posters') return json({ error: 'not_found' }, 404, cors);

      if (parts.length === 2) {
        if (request.method === 'GET') return await listPosters(env, cors);
        if (request.method === 'POST') return await createPoster(request, env, cors);
      } else if (parts.length === 3) {
        const id = decodeURIComponent(parts[2]);
        if (request.method === 'GET') return await getPoster(env, id, cors);
        if (request.method === 'PATCH') return await patchPoster(request, env, id, cors);
        if (request.method === 'DELETE') return await deletePoster(request, env, id, cors);
      } else if (parts.length === 4 && parts[3] === 'gigs') {
        const id = decodeURIComponent(parts[2]);
        if (request.method === 'POST') return await addGig(request, env, id, cors);
      }
      return json({ error: 'method_not_allowed' }, 405, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'server_error' }, 500, cors);
    }
  },
};

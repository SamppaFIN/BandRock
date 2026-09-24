/**
 * BandRockin Worker: ilmoitukset (posterit) R2:ssa, ei tietokantaa.
 *
 *   GET    /api/posters              kevyt lista (vain näkyvät), ruudukkoa varten
 *   GET    /api/posters/:id          täysi ilmoitus (codeHash ei koskaan mukana)
 *   POST   /api/posters              uusi ilmoitus; palauttaa koodin KERRAN
 *   PATCH  /api/posters/:id          muokkaus koodilla (vain lomakkeen kentät, muu sisältö säilyy)
 *   DELETE /api/posters/:id          poisto koodilla
 *   POST   /api/posters/:id/gigs     yhden keikan lisäys koodilla (JSON, tai multipart jos keikalla on kuva)
 *   POST   /api/posters/:id/photo    bändin kuvan lataus koodilla (multipart/form-data, voi sisältää credit-kentän)
 *   POST   /api/posters/:id/logo     bändin logon lataus koodilla (sama muoto, ei kuvatekstiä)
 *   POST   /api/posters/:id/report   "ilmoita asiaton" — anonyymi, ei koodia, nostaa laskuria
 *   GET    /img/<id>/<tiedosto>      ladattu kuva
 *   GET    /admin                    ylläpitosivu (kysyy ADMIN_SECRETin selaimessa)
 *   GET    /api/admin/posters        kaikki ilmoitukset piilotetut mukaan lukien (x-admin-key)
 *   POST   /api/admin/posters/:id/status   piilota/näytä (x-admin-key)
 *   DELETE /api/admin/posters/:id    poisto ilman omistajan koodia (x-admin-key)
 *
 * Ilmoittajasta ei tallenneta mitään pysyvästi. IP:tä käytetään vain ohimenevästi
 * nopeusrajoittimen avaimena (Cloudflaren oma rajoitinpalvelu), ei kirjoiteta R2:een.
 */
import { validateCreate, validatePatch, validateGigEntry, sanitizeText, LIMITS } from './schema.js';
import { generateCode, hashCode, verifyCode, verifyAdmin, isMasterCode, slugify } from './code.js';
import { detectImageType, MAX_IMAGE_BYTES } from './image.js';

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
    discography: result.value.discography,
    gigs: [],
    status: 'visible',
    reports: 0,
    created: now,
    updated: now,
    codeHash,
  };

  await env.BUCKET.put(`posters/${id}.json`, JSON.stringify(poster), { customMetadata: customMetaFor(poster) });
  await purgeListCache();
  return json({ ok: true, id, code }, 201, cors);
}

async function loadForEdit(env, id, code, purpose = 'edit') {
  const obj = await env.BUCKET.get(`posters/${id}.json`);
  if (!obj) return { error: json({ error: 'not_found' }, 404) };
  const poster = await obj.json();
  const ok = isMasterCode(code, purpose) || (await verifyCode(code, poster.codeHash, env.CODE_SECRET));
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
    discography: result.value.discography,
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

  const { error: authError } = await loadForEdit(env, id, String((input && input.code) || ''), 'delete');
  if (authError) return json(await authError.json(), authError.status, cors);

  await env.BUCKET.delete(`posters/${id}.json`);
  await purgeListCache();
  return json({ ok: true }, 200, cors);
}

// Tarkistaa ladatun kuvatiedoston (koko + tyyppi alkutavuista). Palauttaa joko
// { bytes, detected } tai { fieldError } jonka kutsuja muuttaa 400-vastaukseksi.
async function readImage(file) {
  if (!(file instanceof File) || file.size === 0) return { fieldError: 'Valitse kuva.' };
  if (file.size > MAX_IMAGE_BYTES) return { fieldError: 'Kuva on liian suuri.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) return { fieldError: 'Tiedosto ei ole tunnistettu kuva (JPEG, PNG tai WebP).' };
  return { bytes, detected };
}

// Keikan lisäys. JSON kuten ennen; jos keikalle liitetään kuva, lähetys on
// multipart/form-data (kentät + photo), jolloin keikka ja sen kuva tallentuvat yhdellä pyynnöllä.
async function addGig(request, env, id, cors) {
  let input, form = null;
  if ((request.headers.get('content-type') || '').startsWith('multipart/form-data')) {
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'bad_form' }, 400, cors);
    }
    input = {};
    for (const [k, v] of form.entries()) if (typeof v === 'string') input[k] = v;
  } else {
    const { value, error } = await readBody(request);
    if (error) return json(await error.json(), error.status, cors);
    input = value;
  }

  if (await rateLimited(env, `edit:${id}`)) return json({ error: 'busy' }, 429, cors);

  const { poster, error: authError } = await loadForEdit(env, id, String((input && input.code) || ''));
  if (authError) return json(await authError.json(), authError.status, cors);

  const result = validateGigEntry(input);
  if (!result.ok) return json({ error: 'invalid', fields: result.errors }, 400, cors);

  const gig = { ...result.value };
  const file = form && form.get('photo');
  if (file) {
    const img = await readImage(file);
    if (img.fieldError) return json({ error: 'invalid', fields: { photo: img.fieldError } }, 400, cors);
    const key = `img/${id}/${Date.now()}-gig.${img.detected.ext}`;
    await env.BUCKET.put(key, img.bytes, { httpMetadata: { contentType: img.detected.type } });
    gig.photo = {
      src: `${new URL(request.url).origin}/${key}`,
      width: Math.round(Number(form.get('width'))) || null,
      height: Math.round(Number(form.get('height'))) || null,
    };
  }

  const updated = { ...poster, gigs: [...(poster.gigs || []), gig], updated: Date.now() };
  await env.BUCKET.put(`posters/${id}.json`, JSON.stringify(updated), { customMetadata: customMetaFor(updated) });
  return json({ ok: true }, 201, cors);
}

// Poimii R2-avaimen kuvan src-kentästä. src on tavallisesti täysi osoite
// (tämän Workerin tarjoilema), mutta hyväksytään myös suora avain varmuudeksi.
function photoKeyOf(src) {
  if (typeof src !== 'string' || !src) return null;
  try {
    return new URL(src).pathname.replace(/^\/+/, '');
  } catch {
    return src;
  }
}

// field on 'photo' (bändikuva, voi kantaa kuvatekstin) tai 'logo' (otsikkokuva, ei kuvatekstiä).
async function uploadImage(request, env, id, field, cors) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'bad_form' }, 400, cors);
  }
  const code = String(form.get('code') || '');

  if (await rateLimited(env, `edit:${id}`)) return json({ error: 'busy' }, 429, cors);

  const { poster, error: authError } = await loadForEdit(env, id, code);
  if (authError) return json(await authError.json(), authError.status, cors);

  const img = await readImage(form.get(field));
  if (img.fieldError) return json({ error: 'invalid', fields: { [field]: img.fieldError } }, 400, cors);
  const { bytes, detected } = img;

  // Vanha kuva pois, jos korvataan uudella — ei jätetä orpoja tiedostoja R2:een.
  // <field>.src on täysi osoite (esim. https://bandrock.xxx.workers.dev/img/<id>/<ts>-logo.jpg);
  // R2-avain on sen polku ilman alkukauttaviivaa.
  const oldKey = photoKeyOf(poster[field] && poster[field].src);
  if (oldKey && oldKey.startsWith(`img/${id}/`)) {
    await env.BUCKET.delete(oldKey).catch(() => {});
  }

  const width = Math.round(Number(form.get('width'))) || null;
  const height = Math.round(Number(form.get('height'))) || null;
  const key = `img/${id}/${Date.now()}-${field}.${detected.ext}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: detected.type } });

  // Täysi osoite, ei suhteellinen polku: kuva tarjoillaan tältä Workerilta, ei sivustolta
  // (toisin kuin esim. Ray Jonen valmis img/band.jpg, joka on osa itse sivuston tiedostoja).
  const src = `${new URL(request.url).origin}/${key}`;
  const imageValue = { src, width, height, alt: poster.title };
  if (field === 'photo') {
    const credit = sanitizeText(form.get('credit'), LIMITS.credit);
    if (credit) imageValue.credit = credit;
  }
  const updated = { ...poster, [field]: imageValue, updated: Date.now() };
  await env.BUCKET.put(`posters/${id}.json`, JSON.stringify(updated), { customMetadata: customMetaFor(updated) });
  await purgeListCache();
  return json({ ok: true, src: key }, 201, cors);
}

async function serveImage(env, key, cors) {
  const obj = await env.BUCKET.get(key);
  if (!obj) return json({ error: 'not_found' }, 404, cors);
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable', // tiedostonimessä aikaleima, joten sama avain ei koskaan vaihda sisältöä
      ...cors,
    },
  });
}

// ── "Ilmoita asiaton": anonyymi, ei koodia, vain laskuri ylläpitoa varten ──
// Ei koskaan piilota automaattisesti — se olisi väärinkäytettävissä (joukolla
// ilmoittamalla saisi kenen tahansa sivun katoamaan). Ylläpitäjä päättää aina.
async function reportPoster(env, id, cors) {
  if (await rateLimited(env, `report:${id}`)) return json({ error: 'busy' }, 429, cors);
  const obj = await env.BUCKET.get(`posters/${id}.json`);
  if (!obj) return json({ error: 'not_found' }, 404, cors);
  const poster = await obj.json();
  const updated = { ...poster, reports: (poster.reports || 0) + 1, updated: poster.updated };
  await env.BUCKET.put(`posters/${id}.json`, JSON.stringify(updated), { customMetadata: customMetaFor(updated) });
  return json({ ok: true }, 200, cors);
}

// ── Ylläpito: oma salasana (ADMIN_SECRET), ei omistajan koodi ─────────────
function requireAdmin(request, env) {
  return verifyAdmin(request.headers.get('x-admin-key') || '', env.ADMIN_SECRET || '');
}

async function adminListPosters(env, cors) {
  const out = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: 'posters/', cursor });
    for (const obj of page.objects) {
      const body = await env.BUCKET.get(obj.key);
      if (!body) continue;
      const p = await body.json();
      out.push({ id: p.id, title: p.title, type: p.type, city: p.city, status: p.status, reports: p.reports || 0, created: p.created });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  out.sort((a, b) => (b.reports || 0) - (a.reports || 0) || b.created - a.created);
  return json({ posters: out }, 200, { ...cors, 'cache-control': 'no-store' });
}

async function adminSetStatus(request, env, id, cors) {
  const { value: input, error } = await readBody(request);
  if (error) return json(await error.json(), error.status, cors);
  if (input.status !== 'visible' && input.status !== 'hidden') return json({ error: 'invalid' }, 400, cors);

  const obj = await env.BUCKET.get(`posters/${id}.json`);
  if (!obj) return json({ error: 'not_found' }, 404, cors);
  const poster = await obj.json();
  const updated = { ...poster, status: input.status, updated: Date.now() };
  await env.BUCKET.put(`posters/${id}.json`, JSON.stringify(updated), { customMetadata: customMetaFor(updated) });
  await purgeListCache();
  return json({ ok: true }, 200, cors);
}

async function adminDeletePoster(env, id, cors) {
  await env.BUCKET.delete(`posters/${id}.json`);
  await purgeListCache();
  return json({ ok: true }, 200, cors);
}

function serveAdminPage(cors) {
  return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', ...cors } });
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>BandRock — ylläpito</title>
<style>
  body { margin:0; background:#0a0806; color:#f3ede2; font-family:Georgia,serif; }
  .wrap { max-width:900px; margin:0 auto; padding:24px 16px 60px; }
  h1 { font-size:20px; letter-spacing:.1em; text-transform:uppercase; color:#f5b122; }
  .row { display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
  input { font:inherit; padding:10px 12px; border-radius:8px; border:1px solid #444; background:#1a1712; color:#fff; }
  button { font:inherit; padding:10px 16px; border-radius:8px; border:1px solid #f5b122; background:#f5b122; color:#1a1204; cursor:pointer; }
  button.ghost { background:none; color:#f5b122; }
  button.danger { background:#c44; border-color:#c44; color:#fff; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #2a2620; vertical-align:top; }
  .reports { color:#e66; font-weight:bold; }
  .hidden-row { opacity:.5; }
  .msg { color:#e66; }
</style></head>
<body><div class="wrap">
  <h1>BandRock — ylläpito</h1>
  <div class="row">
    <input type="password" id="key" placeholder="Ylläpitosalasana" style="flex:1">
    <button id="load">Näytä ilmoitukset</button>
  </div>
  <p class="msg" id="msg"></p>
  <table id="table" hidden>
    <thead><tr><th>Nimi</th><th>Tyyppi</th><th>Kaupunki</th><th>Ilmoituksia</th><th>Tila</th><th></th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
</div>
<script>
  var key = sessionStorage.getItem('bandrock-admin-key') || '';
  document.getElementById('key').value = key;
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-admin-key': document.getElementById('key').value }, opts.headers || {});
    return fetch(path, opts).then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); });
  }
  function load() {
    key = document.getElementById('key').value;
    sessionStorage.setItem('bandrock-admin-key', key);
    document.getElementById('msg').textContent = 'Ladataan…';
    api('/api/admin/posters').then(function (res) {
      if (res.status === 401) { document.getElementById('msg').textContent = 'Väärä salasana.'; document.getElementById('table').hidden = true; return; }
      document.getElementById('msg').textContent = '';
      var rows = document.getElementById('rows');
      rows.innerHTML = '';
      res.body.posters.forEach(function (p) {
        var tr = document.createElement('tr');
        if (p.status === 'hidden') tr.className = 'hidden-row';
        var tds = [p.title, p.type, p.city, p.reports || 0, p.status];
        tds.forEach(function (v, i) {
          var td = document.createElement('td');
          if (i === 3 && v > 0) td.className = 'reports';
          td.textContent = v;
          tr.appendChild(td);
        });
        var actionsTd = document.createElement('td');
        var toggleBtn = document.createElement('button');
        toggleBtn.className = 'ghost';
        toggleBtn.textContent = p.status === 'hidden' ? 'Näytä' : 'Piilota';
        toggleBtn.onclick = function () {
          api('/api/admin/posters/' + encodeURIComponent(p.id) + '/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: p.status === 'hidden' ? 'visible' : 'hidden' }) }).then(load);
        };
        var delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.textContent = 'Poista pysyvästi';
        delBtn.style.marginLeft = '6px';
        delBtn.onclick = function () {
          if (!confirm('Poistetaanko "' + p.title + '" pysyvästi? Ei voi perua.')) return;
          api('/api/admin/posters/' + encodeURIComponent(p.id), { method: 'DELETE' }).then(load);
        };
        actionsTd.appendChild(toggleBtn);
        actionsTd.appendChild(delBtn);
        tr.appendChild(actionsTd);
        rows.appendChild(tr);
      });
      document.getElementById('table').hidden = false;
    });
  }
  document.getElementById('load').addEventListener('click', load);
  if (key) load();
</script>
</body></html>`;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      const url = new URL(request.url);
      const parts = url.pathname.split('/').filter(Boolean);

      if (parts[0] === 'img') {
        if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
        return await serveImage(env, parts.join('/'), cors);
      }

      if (parts[0] === 'admin' && parts.length === 1) {
        if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
        return serveAdminPage(cors);
      }

      if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'posters') {
        if (!requireAdmin(request, env)) return json({ error: 'unauthorized' }, 401, cors);
        if (parts.length === 3 && request.method === 'GET') return await adminListPosters(env, cors);
        if (parts.length === 5 && parts[4] === 'status' && request.method === 'POST') {
          return await adminSetStatus(request, env, decodeURIComponent(parts[3]), cors);
        }
        if (parts.length === 4 && request.method === 'DELETE') {
          return await adminDeletePoster(env, decodeURIComponent(parts[3]), cors);
        }
        return json({ error: 'method_not_allowed' }, 405, cors);
      }

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
      } else if (parts.length === 4 && (parts[3] === 'photo' || parts[3] === 'logo')) {
        const id = decodeURIComponent(parts[2]);
        if (request.method === 'POST') return await uploadImage(request, env, id, parts[3], cors);
      } else if (parts.length === 4 && parts[3] === 'report') {
        const id = decodeURIComponent(parts[2]);
        if (request.method === 'POST') return await reportPoster(env, id, cors);
      }
      return json({ error: 'method_not_allowed' }, 405, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'server_error' }, 500, cors);
    }
  },
};

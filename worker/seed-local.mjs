// Kirjoittaa Ray Jonen datan paikalliseen R2-emulaatioon (sama ämpäri jota `wrangler dev`
// käyttää projektin wrangler.toml:n mukaan), jotta koko luonti->muokkaus->poisto-kierto on
// testattavissa heti koodilla 00000. Ei kosketa oikeaa Cloudflare-tiliä.
import { unstable_dev } from 'wrangler';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const CODE_SECRET = process.env.CODE_SECRET || 'paikallinen-testisalaisuus';

async function hashCode(code, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(code.toUpperCase()));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

const raw = JSON.parse(readFileSync(path.resolve(root, '..', 'public', 'data', 'ray-jone.json'), 'utf8'));
const { editCode, ...poster } = raw;
poster.contact = poster.contact || null;
poster.media = null;
poster.embed = null;
poster.status = 'visible';
poster.created = Date.now();
poster.updated = Date.now();
poster.codeHash = await hashCode(editCode, CODE_SECRET);

// Tilapäinen siemenskripti: sama R2-sidonta (BUCKET) kuin oikealla Workerilla,
// mutta fetch-käsittelijä vain kirjoittaa annetun JSON:n suoraan R2:een. Ei julkaista.
const seedWorkerPath = path.resolve(root, '_seed-worker.mjs');
writeFileSync(
  seedWorkerPath,
  `export default { async fetch(request, env) {
    const { key, data, customMetadata } = await request.json();
    await env.BUCKET.put(key, JSON.stringify(data), { customMetadata });
    return new Response('ok');
  } };`,
);

const worker = await unstable_dev(seedWorkerPath, {
  config: path.resolve(root, '..', 'wrangler.toml'),
  local: true,
  persist: true,
  logLevel: 'error',
});

try {
  const res = await worker.fetch('http://seed/', {
    method: 'POST',
    body: JSON.stringify({
      key: `posters/${poster.id}.json`,
      data: poster,
      customMetadata: {
        id: poster.id,
        type: poster.type,
        title: poster.title,
        city: poster.city || '',
        tagline: poster.tagline || '',
        tags: (poster.tags || []).join('|'),
        status: poster.status,
      },
    }),
  });
  console.log(`Siemennetty: posters/${poster.id}.json — ${await res.text()} (koodi ${editCode}, CODE_SECRET="${CODE_SECRET}")`);
} finally {
  await worker.stop();
  unlinkSync(seedWorkerPath);
}

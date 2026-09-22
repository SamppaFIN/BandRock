// Kirjoittaa Ray Jonen datan OIKEAAN, julkaistuun R2-ämpäriin. Aja tämä VASTA kun
// `npm run deploy:worker` on onnistunut. CODE_SECRET annetaan ympäristömuuttujana,
// jotta arvo ei koskaan päädy mihinkään lokiin tai keskusteluun — käytä täsmälleen
// samaa arvoa jonka annoit `wrangler secret put CODE_SECRET`:lle.
//
// Käyttö (PowerShell):  $env:CODE_SECRET = "<sama arvo kuin secret put>"; node worker/seed-remote.mjs
// Käyttö (Bash):        CODE_SECRET="<sama arvo>" node worker/seed-remote.mjs
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const root = path.dirname(fileURLToPath(import.meta.url));
const CODE_SECRET = process.env.CODE_SECRET;

if (!CODE_SECRET) {
  console.error('VIRHE: CODE_SECRET-ympäristömuuttuja puuttuu.');
  console.error('Anna sama arvo jonka kirjoitit "wrangler secret put CODE_SECRET" -komentoon:');
  console.error('  PowerShell:  $env:CODE_SECRET = "arvosi"; node worker/seed-remote.mjs');
  console.error('  Bash:        CODE_SECRET="arvosi" node worker/seed-remote.mjs');
  process.exit(1);
}

async function hashCode(code, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(code.toUpperCase()));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

const raw = JSON.parse(readFileSync(path.resolve(root, '..', 'public', 'data', 'ray-jone.json'), 'utf8'));
const { editCode, ...poster } = raw;
poster.status = 'visible';
poster.created = Date.now();
poster.updated = Date.now();
poster.codeHash = await hashCode(editCode, CODE_SECRET);

const tmpFile = path.join(os.tmpdir(), `bandrock-seed-${Date.now()}.json`);
writeFileSync(tmpFile, JSON.stringify(poster));

try {
  console.log('Kirjoitetaan posters/ray-jone.json tuotanto-R2:een (bandrock-posters)…');
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', 'bandrock-posters/posters/ray-jone.json', '--remote', `--file=${tmpFile}`, '--content-type=application/json'], {
    cwd: path.resolve(root, '..'),
    stdio: 'inherit',
    shell: true,
  });
  console.log(`\nValmis. Muokkauskoodi on ${editCode} (kuten aina).`);
  console.log('Huom: tämä tapa ei aseta R2:n customMetadataa (komentorivi ei tue sitä) —');
  console.log('Worker lukee sen tapauksessa tarvittavat kentät suoraan tiedostosta ruudukkoa varten.');
} finally {
  unlinkSync(tmpFile);
}

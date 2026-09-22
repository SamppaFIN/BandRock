import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType, MAX_IMAGE_BYTES } from '../worker/src/image.js';

const bytes = (...vals) => new Uint8Array(vals);

test('detectImageType: JPEG tunnistetaan alkutavuista', () => {
  const r = detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0));
  assert.deepEqual(r, { type: 'image/jpeg', ext: 'jpg' });
});

test('detectImageType: PNG tunnistetaan alkutavuista', () => {
  const r = detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0));
  assert.deepEqual(r, { type: 'image/png', ext: 'png' });
});

test('detectImageType: WebP vaatii sekä RIFF- että WEBP-merkinnän', () => {
  // RIFF + koko (4 tavua, väliä ei tarkisteta) + "WEBP"
  const riff = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
  const r = detectImageType(bytes(...riff));
  assert.deepEqual(r, { type: 'image/webp', ext: 'webp' });

  // RIFF-alku ilman WEBP-merkintää (esim. joku muu RIFF-pohjainen tiedosto, kuten .wav) hylätään
  const notWebp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
  assert.equal(detectImageType(bytes(...notWebp)), null);
});

test('detectImageType: tuntematon tai väärennetty tiedosto hylätään', () => {
  assert.equal(detectImageType(bytes(0, 0, 0, 0)), null);
  assert.equal(detectImageType(new Uint8Array()), null);
  // GIF-allekirjoitus ("GIF89a") — ei tuettu tyyppi
  assert.equal(detectImageType(new TextEncoder().encode('GIF89a')), null);
  // <script>-teksti .jpg-nimisenä tiedostona (väärennetty laajennus) — alkutavut eivät täsmää
  assert.equal(detectImageType(new TextEncoder().encode('<script>alert(1)</script>')), null);
});

test('detectImageType: liian lyhyt data ei kaada eikä täsmää vahingossa', () => {
  assert.equal(detectImageType(bytes(0xff, 0xd8)), null);
  assert.equal(detectImageType(bytes(0x89, 0x50)), null);
});

test('MAX_IMAGE_BYTES on järkevä raja pienennetylle kuvalle', () => {
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
});

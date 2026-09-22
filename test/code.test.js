import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCode, hashCode, verifyCode, slugify } from '../worker/src/code.js';

test('generateCode: 5 merkkiä, ei sekoitettavia kirjaimia (0/O, 1/I/L)', () => {
  for (let i = 0; i < 200; i++) {
    const c = generateCode();
    assert.equal(c.length, 5);
    assert.match(c, /^[A-HJ-NP-Z2-9]{5}$/);
  }
});

test('generateCode: satunnainen (ei aina sama)', () => {
  const codes = new Set(Array.from({ length: 50 }, generateCode));
  assert.ok(codes.size > 40, 'odotettiin suurta osaa uniikkeja koodeja 50:stä');
});

test('hashCode + verifyCode: oikea koodi hyväksytään, väärä ei', async () => {
  const secret = 'testisalaisuus';
  const code = 'K7M2P';
  const hash = await hashCode(code, secret);
  assert.equal(typeof hash, 'string');
  assert.ok(hash.length >= 32);
  assert.equal(await verifyCode(code, hash, secret), true);
  assert.equal(await verifyCode('k7m2p', hash, secret), true); // ei väliä kirjainkoolla
  assert.equal(await verifyCode('VAARIN', hash, secret), false);
  assert.equal(await verifyCode(code, hash, 'eri-salaisuus'), false);
});

test('verifyCode: tyhjä tai puuttuva koodi ei koskaan täsmää', async () => {
  const hash = await hashCode('K7M2P', 's');
  assert.equal(await verifyCode('', hash, 's'), false);
  assert.equal(await verifyCode(undefined, hash, 's'), false);
  assert.equal(await verifyCode(null, hash, 's'), false);
});

test('hashCode: sama koodi ja salaisuus antavat aina saman tiivisteen', async () => {
  const a = await hashCode('K7M2P', 'x');
  const b = await hashCode('K7M2P', 'x');
  assert.equal(a, b);
});

test('slugify: nimestä luettava, URL-turvallinen tunnus', () => {
  assert.equal(slugify('Ray Jone & The Nekalabama Thunderstorm'), 'ray-jone-the-nekalabama-thunderstorm');
  assert.equal(slugify('Örkit ja Ämpärit!'), 'orkit-ja-amparit');
  assert.equal(slugify(''), 'bandi');
  assert.equal(slugify('   '), 'bandi');
  assert.equal(slugify('a'.repeat(100)).length <= 60, true);
});

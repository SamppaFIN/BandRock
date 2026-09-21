import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGig, todayHelsinki, LIMITS } from '../worker/src/validate.js';

const TODAY = '2026-09-21';
const good = { date: '2026-10-12', time: '20:00', artist: 'Ray Jone', venue: 'Pub Nimi', city: 'Tampere' };

const fields = (input) => {
  const r = validateGig(input, TODAY);
  return r.ok ? null : Object.keys(r.errors).sort();
};

test('kelvollinen ilmoitus menee läpi ja vapaaehtoiset kentät ovat null', () => {
  const r = validateGig({ ...good, time: '' }, TODAY);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { ...good, time: null, url: null, embed: null, note: null });
});

test('välilyönnit siistitään', () => {
  const r = validateGig({ ...good, venue: '  Pub \n  Nimi  ' }, TODAY);
  assert.equal(r.value.venue, 'Pub Nimi');
});

test('pakolliset kentät puuttuvat', () => {
  assert.deepEqual(fields({}), ['artist', 'city', 'date', 'venue']);
  assert.deepEqual(fields(null), ['artist', 'city', 'date', 'venue']);
  assert.deepEqual(fields({ ...good, artist: '   ' }), ['artist']);
});

test('päivämäärä: mahdoton, mennyt ja liian kaukainen hylätään, tämä päivä kelpaa', () => {
  assert.deepEqual(fields({ ...good, date: '2026-02-30' }), ['date']);
  assert.deepEqual(fields({ ...good, date: '12.10.2026' }), ['date']);
  assert.deepEqual(fields({ ...good, date: '2026-09-20' }), ['date']);
  assert.deepEqual(fields({ ...good, date: '2028-09-22' }), ['date']);
  assert.equal(fields({ ...good, date: TODAY }), null);
  assert.equal(fields({ ...good, date: '2028-09-21' }), null);
});

test('kellonaika: väärä muoto hylätään', () => {
  assert.deepEqual(fields({ ...good, time: '25:00' }), ['time']);
  assert.deepEqual(fields({ ...good, time: '8:00' }), ['time']);
  assert.equal(fields({ ...good, time: '23:59' }), null);
});

test('linkki: vain https ilman tunnuksia', () => {
  for (const url of ['http://a.fi', 'javascript:alert(1)', 'ftp://a.fi', 'a.fi', 'https://user:pw@a.fi', 'data:text/html,x']) {
    assert.deepEqual(fields({ ...good, url }), ['url'], url);
  }
  const r = validateGig({ ...good, url: 'https://tiketti.fi/keikka' }, TODAY);
  assert.equal(r.value.url, 'https://tiketti.fi/keikka');
});

test('pituusrajat', () => {
  assert.deepEqual(fields({ ...good, artist: 'x'.repeat(LIMITS.artist + 1) }), ['artist']);
  assert.deepEqual(fields({ ...good, note: 'x'.repeat(LIMITS.note + 1) }), ['note']);
  assert.equal(fields({ ...good, note: 'x'.repeat(LIMITS.note) }), null);
  assert.deepEqual(fields({ ...good, url: 'https://a.fi/' + 'x'.repeat(LIMITS.url) }), ['url']);
});

test('ohjausmerkit ja suunnanvaihtomerkit hylätään', () => {
  assert.deepEqual(fields({ ...good, venue: 'Pub\u0000Nimi' }), ['venue']);
  assert.deepEqual(fields({ ...good, city: 'Tampere‮' }), ['city']);
});

test('HTML säilyy tekstinä (sivu näyttää sen textContentilla)', () => {
  const r = validateGig({ ...good, note: '<script>alert(1)</script>' }, TODAY);
  assert.equal(r.value.note, '<script>alert(1)</script>');
});

test('väärän tyyppiset kentät eivät kaada', () => {
  assert.deepEqual(fields({ ...good, artist: 5, venue: { a: 1 }, city: ['x'] }), ['artist', 'city', 'venue']);
  assert.equal(fields({ ...good, note: 42, url: 7 }), null);
});

test('todayHelsinki: päivä vaihtuu Suomen ajassa', () => {
  // 20.9. klo 22:30 UTC on 21.9. klo 01:30 Suomessa (kesäaika, UTC+3)
  assert.equal(todayHelsinki(new Date('2026-09-20T22:30:00Z')), '2026-09-21');
  assert.equal(todayHelsinki(new Date('2026-09-20T20:30:00Z')), '2026-09-20');
});

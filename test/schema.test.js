import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCreate, validatePatch, validateGigEntry, sanitizeText, todayHelsinki, LIMITS, MAX_TAGS } from '../worker/src/schema.js';

const TODAY = '2026-09-21';
const goodCreate = { type: 'bandi', title: 'Ray Jone & The Nekalabama Thunderstorm', city: 'Tampere', tagline: 'Country soul', tags: 'blues, country soul, blues, americana' };

const fields = (fn, input, ...rest) => {
  const r = fn(input, ...rest);
  return r.ok ? null : Object.keys(r.errors).sort();
};

test('validateCreate: kelvollinen ilmoitus menee läpi, tagit siivotaan ja tuplat poistetaan', () => {
  const r = validateCreate(goodCreate);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.tags, ['blues', 'country soul', 'americana']);
  assert.equal(r.value.title, goodCreate.title);
  assert.equal(r.value.email, null);
});

test('validateCreate: tyyppi oletuksena bandi, tuntematon tyyppi hylätään', () => {
  const r = validateCreate({ title: 'X' });
  assert.equal(r.ok, true);
  assert.equal(r.value.type, 'bandi');
  assert.deepEqual(fields(validateCreate, { title: 'X', type: 'admin' }), ['type']);
});

test('validateCreate: otsikko pakollinen', () => {
  assert.deepEqual(fields(validateCreate, {}), ['title']);
  assert.deepEqual(fields(validateCreate, { title: '   ' }), ['title']);
});

test('validateCreate: tagit rajataan enintään MAX_TAGS kappaleeseen', () => {
  const many = Array.from({ length: 10 }, (_, i) => 'tag' + i).join(',');
  const r = validateCreate({ title: 'X', tags: many });
  assert.equal(r.value.tags.length, MAX_TAGS);
});

test('validateCreate: sähköposti tarkistetaan', () => {
  assert.deepEqual(fields(validateCreate, { title: 'X', email: 'ei-kelpaa' }), ['email']);
  const r = validateCreate({ title: 'X', email: 'band@example.com' });
  assert.equal(r.value.email, 'band@example.com');
});

test('validateCreate: soitinlinkki muuttuu upotusosoitteeksi ja alkuperäinen url säilyy esitäyttöä varten', () => {
  const ok = validateCreate({ title: 'X', media: 'https://youtu.be/GKlZrIftTZ8' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.discography, [{ url: 'https://youtu.be/GKlZrIftTZ8', embed: 'https://www.youtube-nocookie.com/embed/GKlZrIftTZ8' }]);

  assert.deepEqual(fields(validateCreate, { title: 'X', media: 'https://ray.bandcamp.com/album/madrid' }), ['media']);
});

test('validateCreate: useampi soitinlinkki, yksi per rivi, enintään MAX_MEDIA', () => {
  const three = ['https://youtu.be/GKlZrIftTZ8', 'https://youtu.be/dQw4w9WgXcQ', 'https://open.spotify.com/artist/6MZ5sOhKDci1bYweyqJBj7'].join('\n');
  const ok = validateCreate({ title: 'X', media: three });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.discography.length, 3);
  assert.equal(ok.value.discography[2].embed, 'https://open.spotify.com/embed/artist/6MZ5sOhKDci1bYweyqJBj7?theme=0');

  const many = Array.from({ length: 10 }, () => 'https://youtu.be/GKlZrIftTZ8').join('\n');
  assert.equal(validateCreate({ title: 'X', media: many }).value.discography.length, 6);
});

test('validateCreate: yksikin huono linkki hylkää koko median-kentän', () => {
  const mix = 'https://youtu.be/GKlZrIftTZ8\nhttps://ray.bandcamp.com/album/madrid';
  assert.deepEqual(fields(validateCreate, { title: 'X', media: mix }), ['media']);
});

test('validateCreate: pituusrajat ja ohjausmerkit', () => {
  assert.deepEqual(fields(validateCreate, { title: 'x'.repeat(LIMITS.title + 1) }), ['title']);
  assert.deepEqual(fields(validateCreate, { title: 'X', city: 'Tampere\u0000' }), ['city']);
});

test('validateCreate: väärän tyyppiset kentät eivät kaada', () => {
  // title on pakollinen, joten väärä tyyppi -> virhe. city on vapaaehtoinen, joten
  // väärä tyyppi siivotaan hiljaa nulliksi eikä anna virhettä.
  assert.deepEqual(fields(validateCreate, { title: 5, city: { a: 1 } }), ['title']);
  const r = validateCreate({ title: 'X', city: { a: 1 } });
  assert.equal(r.ok, true);
  assert.equal(r.value.city, null);
});

test('validatePatch: sama peruslogiikka, otsikko yhä pakollinen', () => {
  const r = validatePatch({ title: 'Uusi nimi', city: 'Turku', tags: 'rock' });
  assert.equal(r.ok, true);
  assert.equal(r.value.title, 'Uusi nimi');
  assert.deepEqual(fields(validatePatch, {}), ['title']);
});

test('validateGigEntry: kelvollinen keikka menee läpi, vapaaehtoiset kentät null', () => {
  const r = validateGigEntry({ date: '2026-10-12', time: '20:00', venue: 'Pub Nimi', city: 'Tampere' }, TODAY);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { date: '2026-10-12', time: '20:00', venue: 'Pub Nimi', city: 'Tampere', note: null, url: null });
});

test('validateGigEntry: paikka pakollinen, ei artistikenttää', () => {
  assert.deepEqual(fields(validateGigEntry, { date: '2026-10-12' }, TODAY), ['venue']);
  assert.ok(!('artist' in validateGigEntry({ date: '2026-10-12', venue: 'X' }, TODAY).value));
});

test('validateGigEntry: päivämäärä mahdoton, mennyt tai liian kaukainen hylätään', () => {
  assert.deepEqual(fields(validateGigEntry, { date: '2026-02-30', venue: 'X' }, TODAY), ['date']);
  assert.deepEqual(fields(validateGigEntry, { date: '2026-09-20', venue: 'X' }, TODAY), ['date']);
  assert.deepEqual(fields(validateGigEntry, { date: '2030-09-22', venue: 'X' }, TODAY), ['date']);
  assert.equal(fields(validateGigEntry, { date: TODAY, venue: 'X' }, TODAY), null);
});

test('validateGigEntry: linkki vain https ilman tunnuksia', () => {
  for (const url of ['http://a.fi', 'javascript:alert(1)', 'https://user:pw@a.fi']) {
    assert.deepEqual(fields(validateGigEntry, { date: '2026-10-12', venue: 'X', url }, TODAY), ['url'], url);
  }
});

test('HTML säilyy tekstinä (sivu näyttää sen textContentilla)', () => {
  const r = validateGigEntry({ date: '2026-10-12', venue: 'X', note: '<script>alert(1)</script>' }, TODAY);
  assert.equal(r.value.note, '<script>alert(1)</script>');
});

test('sanitizeText: siivoaa ja typistää sen sijaan että hylkäisi, ohjausmerkit tyhjentävät', () => {
  assert.equal(sanitizeText('  Kuva: Elmo Romppanen  ', LIMITS.credit), 'Kuva: Elmo Romppanen');
  assert.equal(sanitizeText('', LIMITS.credit), '');
  assert.equal(sanitizeText(undefined, LIMITS.credit), '');
  assert.equal(sanitizeText('x'.repeat(200), 10).length, 10);
  assert.equal(sanitizeText('paha\u0000merkki', LIMITS.credit), '');
});

test('todayHelsinki: päivä vaihtuu Suomen ajassa', () => {
  assert.equal(todayHelsinki(new Date('2026-09-20T22:30:00Z')), '2026-09-21');
  assert.equal(todayHelsinki(new Date('2026-09-20T20:30:00Z')), '2026-09-20');
});

test('validateCreate: suora äänitiedosto tallentuu audio-kenttänä, palvelulinkit ennallaan, sekarivit toimivat', () => {
  const mix = ['https://youtu.be/GKlZrIftTZ8', 'https://cdn.example.com/madrid.mp3'].join('\n');
  const r = validateCreate({ title: 'X', media: mix });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.discography[0], { url: 'https://youtu.be/GKlZrIftTZ8', embed: 'https://www.youtube-nocookie.com/embed/GKlZrIftTZ8' });
  assert.deepEqual(r.value.discography[1], { url: 'https://cdn.example.com/madrid.mp3', audio: 'https://cdn.example.com/madrid.mp3' });
  assert.deepEqual(fields(validateCreate, { title: 'X', media: 'https://cdn.example.com/sivu.html' }), ['media']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMedia } from '../worker/src/media.js';
import { validateCreate } from '../worker/src/schema.js';

const YT = 'https://www.youtube-nocookie.com/embed/GKlZrIftTZ8';

test('YouTube: kaikki yleiset linkkimuodot antavat saman upotuksen', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=GKlZrIftTZ8',
    'https://youtube.com/watch?v=GKlZrIftTZ8&t=30s',
    'https://m.youtube.com/watch?v=GKlZrIftTZ8',
    'https://music.youtube.com/watch?v=GKlZrIftTZ8',
    'https://youtu.be/GKlZrIftTZ8?si=abc',
    'https://www.youtube.com/embed/GKlZrIftTZ8',
    'https://www.youtube.com/shorts/GKlZrIftTZ8',
    'https://www.youtube.com/live/GKlZrIftTZ8',
  ]) {
    assert.equal(parseMedia(url), YT, url);
  }
});

test('YouTube: väärän mittainen tunniste ja muut sivut hylätään', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=lyhyt',
    'https://www.youtube.com/watch?v=GKlZrIftTZ8extra',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/@kanava',
    'https://www.youtube.com/playlist?list=PL123',
    'https://youtu.be/',
  ]) {
    assert.equal(parseMedia(url), null, url);
  }
});

test('Spotify: kappale, albumi, soittolista ja kansainvälinen polku', () => {
  const id = '4uLU6hMCjMI75M1A2tKUQC';
  assert.equal(parseMedia(`https://open.spotify.com/track/${id}?si=xyz`), `https://open.spotify.com/embed/track/${id}?theme=0`);
  assert.equal(parseMedia(`https://open.spotify.com/intl-fi/album/${id}`), `https://open.spotify.com/embed/album/${id}?theme=0`);
  assert.equal(parseMedia(`https://open.spotify.com/playlist/${id}`), `https://open.spotify.com/embed/playlist/${id}?theme=0`);
});

test('Spotify: tuntematon tyyppi tai vaarallinen tunniste hylätään', () => {
  for (const url of [
    'https://open.spotify.com/user/someone',
    'https://open.spotify.com/track/',
    'https://open.spotify.com/track/abc',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC/extra',
    'https://open.spotify.com/track/../../evil',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKU"onload="x',
  ]) {
    assert.equal(parseMedia(url), null, url);
  }
});

test('SoundCloud: kappale ja sets, osoite koodataan', () => {
  assert.equal(
    parseMedia('https://soundcloud.com/ray-jone/madrid'),
    'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fray-jone%2Fmadrid&color=%23f5b122&visual=false',
  );
  assert.match(parseMedia('https://soundcloud.com/ray-jone/sets/ep'), /soundcloud\.com%2Fray-jone%2Fsets%2Fep/);
  assert.equal(parseMedia('https://soundcloud.com/ray-jone/madrid/../../x'), null);
  assert.equal(parseMedia('https://soundcloud.com/'), null);
  assert.equal(parseMedia('https://soundcloud.com/a/b/c/d'), null);
});

test('huijausyritykset ja tuntemattomat palvelut hylätään', () => {
  for (const url of [
    'http://www.youtube.com/watch?v=GKlZrIftTZ8',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://youtube.com.evil.com/watch?v=GKlZrIftTZ8',
    'https://evilyoutube.com/watch?v=GKlZrIftTZ8',
    'https://youtube.com@evil.com/watch?v=GKlZrIftTZ8',
    'https://user:pw@www.youtube.com/watch?v=GKlZrIftTZ8',
    'https://www.youtube.com:8443/watch?v=GKlZrIftTZ8',
    'https://ray.bandcamp.com/album/madrid',
    'https://vimeo.com/123456',
    'ei-linkki',
    '',
  ]) {
    assert.equal(parseMedia(url), null, url);
  }
});

test('validateCreate: soitinlinkki muuttuu upotusosoitteeksi, väärä linkki antaa virheen', () => {
  const base = { title: 'Ray Jone & The Nekalabama Thunderstorm' };
  const ok = validateCreate({ ...base, media: 'https://youtu.be/GKlZrIftTZ8' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.embed, YT);

  const bad = validateCreate({ ...base, media: 'https://ray.bandcamp.com/album/madrid' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors), ['media']);

  const none = validateCreate({ ...base, media: '' });
  assert.equal(none.value.embed, null);
});

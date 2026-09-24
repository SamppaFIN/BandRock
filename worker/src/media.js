/**
 * Musiikki- ja videolinkin tunnistus. Palauttaa valmiin upotusosoitteen tai null.
 *
 * Käyttäjän kirjoittamaa osoitetta ei koskaan käytetä sellaisenaan iframen lähteenä:
 * tunnistamme palvelun, poimimme tunnisteen (tiukka muoto) ja rakennamme osoitteen itse.
 * Tuetut: YouTube, Spotify, SoundCloud. (Bandcamp vaatii numeerisen tunnisteen, jota
 * linkistä ei voi päätellä, joten sitä ei tueta.)
 */

const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist', 'artist', 'episode', 'show']);

function youtube(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : null;
}

function spotify(parts) {
  if (/^intl-[a-z]{2}(-[a-z]{2})?$/i.test(parts[0] ?? '')) parts = parts.slice(1);
  const [kind, id] = parts;
  return parts.length === 2 && SPOTIFY_KINDS.has(kind) && /^[A-Za-z0-9]{10,30}$/.test(id)
    ? `https://open.spotify.com/embed/${kind}/${id}?theme=0`
    : null;
}

function soundcloud(parts) {
  const ok =
    (parts.length === 2 || (parts.length === 3 && parts[1] === 'sets')) &&
    parts.every((p) => /^[\w.-]+$/.test(p));
  if (!ok) return null;
  const track = `https://soundcloud.com/${parts.join('/')}`;
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(track)}&color=%23f5b122&visual=false`;
}

// Suora äänitiedostolinkki (esim. mp3tourl.com, oma palvelin). Toisin kuin yllä olevat
// palvelut tämä toistetaan <audio>-elementillä, ei iframella: ääni ei voi ajaa skriptejä,
// ja selain hakee tiedoston vasta kun kuuntelija painaa toistoa (preload="none").
// Palvelin ei koskaan itse hae osoitetta. Hylätään osoitteet jotka viittaisivat kävijän
// omaan koneeseen tai lähiverkkoon (IP-osoitteet, localhost, ei-pisteellistä nimeä).
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

export function parseAudio(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host)) return null;
  if (/\.(local|localhost|internal|lan|home|test)$/.test(host)) return null;
  if (!AUDIO_EXT.test(u.pathname)) return null;
  return u.href;
}

export function parseMedia(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;

  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') return parts.length === 1 ? youtube(parts[0]) : null;
  if (host === 'youtube.com') {
    if (u.pathname === '/watch') return youtube(u.searchParams.get('v'));
    if (['embed', 'shorts', 'live'].includes(parts[0]) && parts.length === 2) return youtube(parts[1]);
    return null;
  }
  if (host === 'open.spotify.com') return spotify(parts);
  if (host === 'soundcloud.com') return soundcloud(parts);
  return null;
}

// Pieni reititin BandRockin polulle "SITE_BASE/<slug>#ankkuri". Ei riipu repon nimestä:
// SITE_BASE lasketaan tämän tiedoston omasta osoitteesta (import.meta.url), joten sama
// koodi toimii sekä paikallisesti (http://localhost:8080/) että GitHub Pagesilla
// (https://käyttäjä.github.io/<repo>/) riippumatta siitä miksi repo on nimetty.
'use strict';

export const SITE_BASE = new URL('..', import.meta.url).pathname;

// 404.html tallensi alkuperäisen polun ?p=-parametriin. Palautetaan siisti osoite
// (ei koskaan näy käyttäjälle ?p=-muodossa) ennen reitityksen lukemista.
export function restoreFromRedirect() {
  var params = new URLSearchParams(location.search);
  var p = params.get('p');
  if (p) history.replaceState(null, '', p);
}

// Tulkitsee nykyisen osoitteen: { slug: null } = etusivun ruudukko, { slug: 'ray-jone' } = bändisivu.
export function parseRoute() {
  var path = location.pathname;
  if (path.indexOf(SITE_BASE) === 0) path = path.slice(SITE_BASE.length);
  path = path.replace(/^\/+|\/+$/g, '').replace(/^index\.html$/, '');
  return { slug: path ? decodeURIComponent(path) : null, hash: location.hash };
}

export function pathFor(slug) {
  return SITE_BASE + (slug || '');
}

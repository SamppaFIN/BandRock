// Piirtää yhden bändin JSON:sta joko täyden detaljisivun tai kompaktin ruudukkokortin.
// Käyttäjän teksti menee aina textContentilla, ei koskaan innerHTML:llä.
'use strict';

export const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];

// Soittimet: vain nämä osoitteet upotetaan. Palvelin (Worker) rakentaa nämä myöhemmin
// käyttäjän linkistä — sivu ei koskaan käytä käyttäjän antamaa osoitetta sellaisenaan.
export const PLAYERS = {
  'www.youtube-nocookie.com': { label: 'YouTube', ratio: true, allow: 'accelerometer; clipboard-write; encrypted-media; picture-in-picture; web-share' },
  'open.spotify.com': { label: 'Spotify', height: 152, allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture' },
  'w.soundcloud.com': { label: 'SoundCloud', height: 166, allow: 'autoplay' }
};

export function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function fmtDateISO(iso) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return WEEKDAYS[d.getUTCDay()] + ' ' + (+p[2]) + '.' + (+p[1]) + '.' + p[0];
}

function isPastISO(iso, today) {
  return iso < today;
}

export function playerFor(src) {
  try {
    var u = new URL(src);
    return u.protocol === 'https:' && PLAYERS.hasOwnProperty(u.hostname) ? PLAYERS[u.hostname] : null;
  } catch (e) {
    return null;
  }
}

// Ei-video-soitin (Spotify, SoundCloud) joka paljastuu itsestään ilman klikkausta.
// Laatikko pysyy mustana kunnes upotus on ehtinyt piirtyä (tai 5 s kuluttua joka
// tapauksessa), koska Spotifyn oma kehys näyttää hetken valkoista ennen latautumista
// eikä sen sisälle näe CSS:llä (eri sivusto). Ei täydellinen ratkaisu, mutta paras
// mahdollinen ilman että käyttäjän pitää itse klikata.
function buildAutoPlayer(info, src, title) {
  var box = el('div', 'spotify cloak');
  var f = document.createElement('iframe');
  f.src = src;
  f.title = title || info.label;
  f.allow = info.allow;
  f.referrerPolicy = 'strict-origin-when-cross-origin';
  f.setAttribute('allowfullscreen', '');
  box.appendChild(f);
  var done = false;
  var reveal = function () { if (!done) { done = true; box.classList.remove('cloak'); } };
  f.addEventListener('load', function () { setTimeout(reveal, 500); });
  setTimeout(reveal, 5000);
  return box;
}

export function slugify(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'bandi';
}

function todayISO() {
  var n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
}

// ── Yksi keikkarivi ──────────────────────────────────────────────────────
function buildGigItem(g) {
    var li = el('li', 'gig');

    var when = el('div', 'gig-when');
    when.appendChild(el('span', 'gig-date', fmtDateISO(g.date)));
    if (g.time) when.appendChild(el('span', 'gig-time', 'klo ' + g.time));
    li.appendChild(when);

    var what = el('div', 'gig-what');
    what.appendChild(el('div', 'gig-artist', g.venue + (g.city ? ' · ' + g.city : '')));
    if (g.note) what.appendChild(el('div', 'gig-note', g.note));
    li.appendChild(what);

    if (g.url && /^https:\/\//.test(g.url)) {
      var a = el('a', 'gig-link', 'Info');
      a.href = g.url; a.target = '_blank'; a.rel = 'nofollow ugc noopener noreferrer';
      li.appendChild(a);
    } else {
      li.appendChild(el('span'));
    }

    if (g.photo && g.photo.src) {
      var gp = document.createElement('img');
      gp.className = 'gig-photo';
      gp.src = g.photo.src;
      if (g.photo.width) gp.width = g.photo.width;
      if (g.photo.height) gp.height = g.photo.height;
      gp.alt = g.venue;
      gp.loading = 'lazy';
      li.appendChild(gp);
    }

    var info = g.embed ? playerFor(g.embed) : null;
    if (info) {
      var btn = el('button', 'play', '▶ Kuuntele (' + info.label + ')');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        var box = el('div', 'gig-player');
        if (info.ratio) box.style.aspectRatio = '16 / 9'; else box.style.height = info.height + 'px';
        var f = document.createElement('iframe');
        f.src = g.embed; f.title = info.label; f.allow = info.allow;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        f.setAttribute('allowfullscreen', '');
        box.appendChild(f);
        li.appendChild(box);
        btn.remove();
      });
      var slot = el('div', 'gig-play');
      slot.appendChild(btn);
      li.appendChild(slot);
    }
    return li;
}

function buildGigList(items) {
  var ol = el('ol', 'gigs');
  var year = null;
  items.forEach(function (g) {
    var y = g.date.slice(0, 4);
    if (y !== year) { year = y; ol.appendChild(el('li', 'gig-year', y)); }
    ol.appendChild(buildGigItem(g));
  });
  return ol;
}

// ── Keikat: tulevat aina näkyvissä (seuraava ensin), mennet napin takana ──
export function renderGigSection(gigs) {
  var frag = document.createDocumentFragment();
  var today = todayISO();
  var upcoming = (gigs || []).filter(function (g) { return !isPastISO(g.date, today); })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var past = (gigs || []).filter(function (g) { return isPastISO(g.date, today); })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });

  frag.appendChild(buildGigList(upcoming));

  if (past.length) {
    var details = document.createElement('details');
    details.className = 'gigs-past';
    var summary = document.createElement('summary');
    summary.textContent = 'Menneet keikat (' + past.length + ')';
    details.appendChild(summary);
    details.appendChild(buildGigList(past));
    frag.appendChild(details);
  }
  return frag;
}

// ── Bändin etsivä keikka: ensimmäinen tuleva, listan mukaisessa järjestyksessä ──
function nextGig(poster) {
  if (!poster.gigs) return null;
  var today = todayISO();
  var future = poster.gigs.filter(function (g) { return g.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  return future[0] || null;
}

// ── Kompakti kortti ruudukkoon ──────────────────────────────────────────────
export function renderCard(poster) {
  var card = el('button', 'card glass pad');
  card.type = 'button';
  card.dataset.id = poster.id;

  var top = el('div', 'card-top');
  top.appendChild(el('span', 'card-type', poster.type || 'ilmoitus'));
  if (poster.city) top.appendChild(el('span', 'card-city', poster.city));
  card.appendChild(top);

  card.appendChild(el('div', 'card-title', poster.title));
  if (poster.tagline) card.appendChild(el('div', 'card-tagline', poster.tagline));

  if (poster.tags && poster.tags.length) {
    var tags = el('div', 'card-tags');
    poster.tags.slice(0, 4).forEach(function (t) { tags.appendChild(el('span', null, t)); });
    card.appendChild(tags);
  }

  var next = nextGig(poster);
  if (next) card.appendChild(el('div', 'card-next', '▸ ' + fmtDateISO(next.date) + ' · ' + next.venue));

  return card;
}

export function renderCreateCard() {
  var card = el('button', 'card card-new glass pad');
  card.type = 'button';
  card.id = 'create-open';
  card.appendChild(el('div', 'plus', '+'));
  card.appendChild(el('div', 'card-title', 'Luo uusi bändi'));
  return card;
}

// ── Detaljisivu: piirtää vain osiot joissa on sisältöä ──────────────────────
export function renderDetail(poster) {
  var frag = document.createDocumentFragment();

  var header = el('header', 'glass hero pad');
  var h1 = el('h1');
  if (poster.logo) {
    var logo = document.createElement('img');
    logo.className = 'hero-logo';
    logo.src = poster.logo.src;
    if (poster.logo.width) logo.width = poster.logo.width;
    if (poster.logo.height) logo.height = poster.logo.height;
    logo.alt = poster.title;
    h1.appendChild(logo);
  } else {
    h1.appendChild(el('span', 'hero-name', poster.title));
  }
  header.appendChild(h1);
  if (poster.tagline) header.appendChild(el('p', 'tagline', poster.tagline));
  header.appendChild(el('div', 'amber-rule'));
  if (poster.tags && poster.tags.length) {
    header.appendChild(el('p', 'genres', poster.tags.join(' · ')));
  }
  frag.appendChild(header);

  if (poster.photo) {
    var figure = document.createElement('figure');
    figure.className = 'glass photo';
    var img = document.createElement('img');
    img.src = poster.photo.src;
    if (poster.photo.width) img.width = poster.photo.width;
    if (poster.photo.height) img.height = poster.photo.height;
    img.alt = poster.photo.alt || poster.title;
    img.loading = 'lazy';
    figure.appendChild(img);
    if (poster.photo.credit || (poster.photo.members && poster.photo.members.length)) {
      var cap = el('figcaption', 'photo-caption');
      if (poster.photo.credit) cap.appendChild(el('p', 'credit', 'Kuva: ' + poster.photo.credit));
      if (poster.photo.members && poster.photo.members.length) {
        var ul = el('ul', 'members');
        poster.photo.members.forEach(function (m) {
          var li = document.createElement('li');
          var b = document.createElement('b'); b.textContent = m.name;
          li.appendChild(b);
          li.appendChild(document.createTextNode(' — ' + m.role));
          ul.appendChild(li);
        });
        cap.appendChild(ul);
      }
      figure.appendChild(cap);
    }
    frag.appendChild(figure);
  }

  if (poster.bio && poster.bio.length) {
    var bioSec = el('section', 'glass pad bio');
    bioSec.setAttribute('aria-labelledby', 'bio-h');
    bioSec.appendChild(el('h2', 'label', 'Bio')).id = 'bio-h';
    poster.bio.forEach(function (p) { bioSec.appendChild(el('p', null, p)); });
    frag.appendChild(bioSec);
  }

  // Yksi tai useampi julkaisu. Lomakkeella lisätty yksittäinen poster.embed
  // käyttäytyy samoin kuin yhden julkaisun discografia.
  var disco = (poster.discography && poster.discography.length) ? poster.discography
    : (poster.embed ? [{ embed: poster.embed }] : []);

  if (disco.length) {
    var listenSec = el('section', 'glass pad listen');
    listenSec.id = 'kuuntele';
    listenSec.setAttribute('aria-labelledby', 'listen-h');
    var head = el('div', 'head');
    head.appendChild(el('h2', 'label', 'Kuuntele · Listen')).id = 'listen-h';
    head.appendChild(el('em', null, 'Discografia'));
    listenSec.appendChild(head);

    disco.forEach(function (item) {
      var info = playerFor(item.embed);
      if (!info) return;
      if (info.ratio) {
        // Video: aina heti näkyvissä, valinnainen kansikuva vierekkäin.
        var media = el('div', 'media');
        if (item.cover) {
          var cover = el('div', 'cover');
          var ci = document.createElement('img');
          ci.src = item.cover.src; if (item.cover.width) ci.width = item.cover.width; if (item.cover.height) ci.height = item.cover.height;
          ci.alt = item.title || 'Kansikuva'; ci.loading = 'lazy';
          cover.appendChild(ci);
          var meta = document.createElement('div');
          if (item.title) meta.appendChild(el('div', 'title', item.title));
          if (item.kind) meta.appendChild(el('div', 'kind', item.kind));
          cover.appendChild(meta);
          media.appendChild(cover);
        }
        var video = el('div', 'video');
        var yf = document.createElement('iframe');
        yf.src = item.embed; yf.title = item.title || info.label;
        yf.allow = info.allow; yf.setAttribute('allowfullscreen', '');
        yf.referrerPolicy = 'strict-origin-when-cross-origin'; yf.loading = 'lazy';
        video.appendChild(yf);
        media.appendChild(video);
        listenSec.appendChild(media);
      } else {
        // Spotify/SoundCloud: paljastuu itsestään, ei vaadi klikkausta.
        listenSec.appendChild(buildAutoPlayer(info, item.embed, item.title || poster.title));
      }
    });
    frag.appendChild(listenSec);
  }

  if (poster.gigs && poster.gigs.length) {
    var gigsSec = el('section', 'glass pad');
    gigsSec.id = 'keikat';
    gigsSec.setAttribute('aria-labelledby', 'gigs-h');
    var ghead = el('div', 'head');
    ghead.appendChild(el('h2', 'label', 'Keikat · Gigs')).id = 'gigs-h';
    gigsSec.appendChild(ghead);
    gigsSec.appendChild(renderGigSection(poster.gigs));
    frag.appendChild(gigsSec);
  }

  if (poster.contact) {
    var C = poster.contact;
    var bookSec = el('section', 'glass pad');
    bookSec.id = 'booking';
    bookSec.setAttribute('aria-labelledby', 'booking-h');
    bookSec.appendChild(el('h2', 'label', 'Keikkamyynti · Booking')).id = 'booking-h';
    var booking = el('div', 'booking');
    if (C.phone) {
      var pc = el('div', 'col');
      pc.appendChild(el('div', 't', 'Puhelin'));
      var pbig = el('div', 'big');
      var pa = document.createElement('a'); pa.href = 'tel:' + C.phone; pa.textContent = C.phoneDisplay || C.phone;
      pbig.appendChild(pa); pc.appendChild(pbig);
      booking.appendChild(pc);
    }
    if (C.email) {
      var ec = el('div', 'col');
      ec.appendChild(el('div', 't', 'Sähköposti'));
      var ebig = el('div', 'big small');
      var ea = document.createElement('a'); ea.href = 'mailto:' + C.email; ea.textContent = C.email;
      ebig.appendChild(ea); ec.appendChild(ebig);
      booking.appendChild(ec);
    }
    if (C.social && C.social.length) {
      var soc = el('div', 'social');
      C.social.forEach(function (s) {
        var a = document.createElement('a'); a.href = s.url; a.target = '_blank'; a.rel = 'noreferrer'; a.textContent = s.label;
        soc.appendChild(a);
      });
      booking.appendChild(soc);
    }
    bookSec.appendChild(booking);
    frag.appendChild(bookSec);
  }

  return frag;
}

// Muokkaustila. Sivu näyttää täsmälleen samalta kuin julkaistuna (sama renderDetail),
// mutta jokainen muokattava kohta on klikattava alue. Klikkaus avaa vain sen kohdan
// muokkaimen samaan paikkaan (kultainen reunus); "Valmis" palauttaa kohdan julkaistun
// näköiseksi uusilla tiedoilla. Muutokset kerätään luonnokseen (draft) ja lähetetään
// kerralla Tallenna-napista. Keikkojen muutokset tallentuvat heti (omat reittinsä).
//
// Palvelinkutsut, koodin kysely ja keikkadialogi ovat index.html:ssä — tämä moduuli
// saa ne takaisinkutsuina (createEditorin opts), ettei sama logiikka ole kahdessa paikassa.
'use strict';

import { renderDetail, renderDiscoItem, urlFromEmbed, el } from './render.js';
import { icon, serviceOf } from './icons.js';

// Linkkityypit yhteystietojen muokkaimeen. Jokaiselle oma, luonteva syöte: WhatsAppille
// pelkkä puhelinnumero, Instagramille käyttäjänimi jne. — valmis https-osoite
// rakennetaan tästä. Palvelin tarkistaa lopullisen osoitteen joka tapauksessa.
function handleBuilder(key, base) {
  return function (v) {
    v = v.trim();
    if (/^https:\/\//.test(v)) return serviceOf(v) === key ? v : null;
    var h = v.replace(/^@/, '');
    return /^[A-Za-z0-9._-]{1,60}$/.test(h) ? base + h : null;
  };
}
function linkBuilder(key) {
  return function (v) { v = v.trim(); return /^https:\/\/\S+$/.test(v) && serviceOf(v) === key ? v : null; };
}
var LINK_KINDS = [
  { key: 'whatsapp', name: 'WhatsApp', type: 'tel', field: 'Puhelinnumero', placeholder: '040 123 4567 tai +358 40 123 4567',
    error: 'Anna puhelinnumero, esim. 040 123 4567.',
    build: function (v) {
      var d = v.replace(/[^\d+]/g, '');
      if (d.charAt(0) === '+') d = d.slice(1);
      else if (d.slice(0, 2) === '00') d = d.slice(2);
      else if (d.charAt(0) === '0') d = '358' + d.slice(1); // suomalainen numero ilman maatunnusta
      return /^\d{7,15}$/.test(d) ? 'https://wa.me/' + d : null;
    } },
  { key: 'instagram', name: 'Instagram', field: 'Käyttäjänimi tai linkki', placeholder: '@bandi', error: 'Anna käyttäjänimi (esim. @bandi) tai instagram.com-linkki.', build: handleBuilder('instagram', 'https://www.instagram.com/') },
  { key: 'facebook', name: 'Facebook', field: 'Linkki Facebook-sivulle', placeholder: 'https://facebook.com/bandi', error: 'Liitä facebook.com-linkki, joka alkaa https://', build: linkBuilder('facebook') },
  { key: 'tiktok', name: 'TikTok', field: 'Käyttäjänimi tai linkki', placeholder: '@bandi', error: 'Anna käyttäjänimi (esim. @bandi) tai tiktok.com-linkki.', build: handleBuilder('tiktok', 'https://www.tiktok.com/@') },
  { key: 'youtube', name: 'YouTube', field: 'Linkki kanavalle', placeholder: 'https://youtube.com/@bandi', error: 'Liitä youtube.com-linkki, joka alkaa https://', build: linkBuilder('youtube') },
  { key: 'spotify', name: 'Spotify', field: 'Linkki Spotifyyn', placeholder: 'https://open.spotify.com/artist/…', error: 'Liitä spotify.com-linkki, joka alkaa https://', build: linkBuilder('spotify') },
  { key: 'soundcloud', name: 'SoundCloud', field: 'Käyttäjänimi tai linkki', placeholder: 'bandi', error: 'Anna käyttäjänimi tai soundcloud.com-linkki.', build: handleBuilder('soundcloud', 'https://soundcloud.com/') },
  { key: 'x', name: 'X', field: 'Käyttäjänimi tai linkki', placeholder: '@bandi', error: 'Anna käyttäjänimi (esim. @bandi) tai x.com-linkki.', build: handleBuilder('x', 'https://x.com/') },
  { key: 'link', name: 'Muu linkki', field: 'Osoite', placeholder: 'https://bandi.fi', error: 'Liitä osoite, joka alkaa https://',
    build: function (v) { v = v.trim(); return /^https:\/\/[^\s]+\.[^\s]+$/.test(v) ? v : null; } },
];

var REGION_LABELS = {
  title: 'Nimi, logo ja kaupunki', tagline: 'Kuvaus', tags: 'Tyylilajit', photo: 'Kuva ja jäsenet',
  bio: 'Bio', listen: 'Musiikki ja videot', gigs: 'Keikat', contact: 'Yhteystiedot ja some',
};
// Palvelimen virhekenttä → alue, jossa kenttää muokataan.
var FIELD_REGION = {
  title: 'title', city: 'title', logo: 'title', tagline: 'tagline', tags: 'tags',
  photo: 'photo', credit: 'photo', members: 'photo', bio: 'bio', media: 'listen', email: 'contact', social: 'contact',
};
var FIELD_NAMES = {
  title: 'Nimi', city: 'Kaupunki', logo: 'Logo', tagline: 'Kuvaus', tags: 'Tyylilajit', photo: 'Kuva',
  credit: 'Kuvaaja', members: 'Jäsenet', bio: 'Bio', media: 'Musiikki', email: 'Sähköposti', social: 'Somelinkit',
};
var MAX_LINKS = 6;

// Sama tunnistus kuin palvelimella (worker/src/schema.js) — vain esikatselua varten;
// palvelin nimeää linkin lopullisesti tallennuksessa.
var SOCIAL_LABELS = [
  [/(^|\.)wa\.me$/, 'WhatsApp'], [/(^|\.)whatsapp\.com$/, 'WhatsApp'], [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'], [/(^|\.)(twitter|x)\.com$/, 'X (Twitter)'], [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)youtube\.com$/, 'YouTube'], [/(^|\.)soundcloud\.com$/, 'SoundCloud'], [/(^|\.)spotify\.com$/, 'Spotify'],
];
function socialLabel(url) {
  try {
    var host = new URL(url).hostname.replace(/^www\./, '');
    for (var i = 0; i < SOCIAL_LABELS.length; i++) if (SOCIAL_LABELS[i][0].test(host)) return SOCIAL_LABELS[i][1];
    return host;
  } catch (e) { return url; }
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

function parseMembers(text) {
  return String(text || '').split(/\r?\n/).map(clean).filter(Boolean).map(function (line) {
    var m = line.match(/^(.+?)\s+[—-]\s+(.+)$/);
    return m ? { name: m[1].trim(), role: m[2].trim() } : { name: line, role: '' };
  });
}

function control(tag, value, props) {
  var c = document.createElement(tag);
  if (tag === 'input' && !(props && props.type)) c.type = 'text';
  Object.keys(props || {}).forEach(function (k) { c[k] = props[k]; });
  c.value = value || '';
  return c;
}
function labeled(text, ctrl, hint) {
  var l = el('label', 'inline-field full');
  l.appendChild(el('span', 't', text));
  l.appendChild(ctrl);
  if (hint) l.appendChild(el('span', 'hint', hint));
  return l;
}

// Yhteystietojen linkit: lista (ikoni + nimi + osoite + Poista) ja ikoninapit uuden
// lisäämiseen. Napista aukeaa juuri sille palvelulle sopiva kenttä; "Muu linkki" saa
// lisäksi oman selitteen (näkyy linkin tekstinä sivulla).
function socialEditor(items) {
  var wrap = el('div', 'social-editor');
  var list = el('div', 'social-list');
  var picker = el('div', 'svc-picker');
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', 'Lisää linkki');
  var fullNote = el('p', 'hint', 'Enintään ' + MAX_LINKS + ' linkkiä — poista jokin lisätäksesi uuden.');

  var form = el('div', 'quick-add svc-form');
  form.hidden = true;
  var formTitle = el('p', 'svc-form-title');
  var labelInput = control('input', '', { maxLength: 60, placeholder: 'esim. Kotisivut, Liput, Kauppa', className: 'inline-edit' });
  var labelWrap = labeled('Selite', labelInput, 'Näkyy linkin tekstinä sivulla.');
  var valueInput = control('input', '', { className: 'inline-edit' });
  var valueWrap = labeled('', valueInput);
  var err = el('p', 'form-status err');
  err.hidden = true;
  var addBtn = el('button', 'btn small', 'Lisää');
  addBtn.type = 'button';
  var cancelBtn = el('button', 'btn ghost small', 'Peru');
  cancelBtn.type = 'button';
  var btns = el('div', 'toolbar-actions');
  btns.appendChild(addBtn);
  btns.appendChild(cancelBtn);
  form.appendChild(formTitle);
  form.appendChild(labelWrap);
  form.appendChild(valueWrap);
  form.appendChild(err);
  form.appendChild(btns);

  var kind = null;
  var chips = LINK_KINDS.map(function (k) {
    var b = el('button', 'btn ghost small svc-btn');
    b.type = 'button';
    b.appendChild(icon(k.key));
    b.appendChild(document.createTextNode(k.name));
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () { openForm(k); });
    picker.appendChild(b);
    return b;
  });

  function openForm(k) {
    kind = k;
    chips.forEach(function (b, i) { b.setAttribute('aria-pressed', String(LINK_KINDS[i] === k)); });
    formTitle.replaceChildren(icon(k.key), document.createTextNode(k.key === 'link' ? 'Uusi linkki' : 'Uusi ' + k.name + '-linkki'));
    valueWrap.querySelector('.t').textContent = k.field;
    valueInput.type = k.type || (k.key === 'link' ? 'url' : 'text');
    valueInput.placeholder = k.placeholder;
    valueInput.value = '';
    labelInput.value = '';
    labelWrap.hidden = k.key !== 'link';
    err.hidden = true;
    form.hidden = false;
    (k.key === 'link' ? labelInput : valueInput).focus();
  }
  function closeForm() {
    kind = null;
    form.hidden = true;
    chips.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
  }
  function doAdd() {
    if (!kind) return;
    var url = kind.build(valueInput.value);
    if (!url) {
      err.textContent = '⚠ ' + kind.error;
      err.hidden = false;
      valueInput.focus();
      return;
    }
    var label = kind.key === 'link' ? (clean(labelInput.value) || socialLabel(url)) : kind.name;
    items.push({ label: label, url: url });
    var added = kind;
    closeForm();
    draw();
    chips[LINK_KINDS.indexOf(added)].focus();
  }
  addBtn.addEventListener('click', doAdd);
  cancelBtn.addEventListener('click', closeForm);
  form.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); doAdd(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeForm(); } // sulkee vain lisäyksen, ei koko muokkainta
  });

  function draw() {
    list.replaceChildren();
    items.forEach(function (s, i) {
      var row = el('div', 'social-row');
      row.appendChild(icon(serviceOf(s.url)));
      var txt = el('div', 'social-item');
      txt.appendChild(el('strong', null, s.label || socialLabel(s.url)));
      txt.appendChild(el('span', 'hint', s.url));
      row.appendChild(txt);
      var rm = el('button', 'btn ghost small', '✕ Poista');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Poista ' + (s.label || s.url));
      rm.addEventListener('click', function () { items.splice(i, 1); draw(); });
      row.appendChild(rm);
      list.appendChild(row);
    });
    var full = items.length >= MAX_LINKS;
    chips.forEach(function (b) { b.disabled = full; });
    fullNote.hidden = !full;
    if (full) closeForm();
  }

  wrap.appendChild(list);
  wrap.appendChild(el('p', 't social-heading', 'Lisää linkki'));
  wrap.appendChild(picker);
  wrap.appendChild(fullNote);
  wrap.appendChild(form);
  draw();
  return wrap;
}

/** Luonnos palvelimen PATCH-muotoon (sama muoto kuin validatePatch odottaa). */
export function draftPayload(d) {
  var photo = d.photo || {};
  var contact = d.contact || {};
  return {
    title: d.title || '',
    city: d.city || '',
    tagline: d.tagline || '',
    tags: (d.tags || []).join(', '),
    email: contact.email || '',
    media: (d.discography || []).map(function (x) { return x.url || urlFromEmbed(x.embed) || x.audio || ''; }).filter(Boolean).join('\n'),
    bio: (d.bio || []).join('\n'),
    members: (photo.members || []).map(function (m) { return m.role ? m.name + ' — ' + m.role : m.name; }).join('\n'),
    // "Selite https://…" — palvelin käyttää selitettä linkin nimenä (ks. schema.js parseSocial).
    social: (contact.social || []).map(function (s) { return (s.label ? clean(s.label) + ' ' : '') + s.url; }).join('\n'),
    credit: photo.credit || '',
  };
}

// opts: { poster, mount, resizeImage(file) → Promise<{blob,width,height}>,
//         onSave(draft, images) → Promise<null | {fields} | {message}>, onCancel(),
//         onDelete() → Promise<null | {message}>, onAddGig(), onEditGig(gig), onToggleGig(gig) }
export function createEditor(opts) {
  var original = JSON.stringify(opts.poster);
  var draft = clone(opts.poster);
  var images = {};          // photo/logo: { blob, width, height, url } — ladataan vasta tallennuksessa
  var active = null;        // auki olevan muokkaimen alueen nimi
  var activeApply = null;   // kirjoittaa auki olevan muokkaimen arvot luonnokseen
  var errors = {};          // alueet, joissa palvelin löysi virheen
  var root, statusEl, saveBtn;

  function setStatus(text, isError) {
    statusEl.textContent = text || '';
    statusEl.className = 'form-status' + (isError ? ' err' : '');
  }

  function current(name) {
    return root.querySelector('[data-region="' + name + '"], [data-editor="' + name + '"]');
  }

  // Yhden alueen julkaistun näköinen versio luonnoksesta.
  function displayNode(name) {
    var tmp = el('div');
    tmp.appendChild(renderDetail(draft, { editing: true }));
    var n = tmp.querySelector('[data-region="' + name + '"]');
    decorate(n);
    return n;
  }

  function decorate(n) {
    var name = n.dataset.region;
    n.classList.add('editable-region');
    if (errors[name]) n.classList.add('region-error');
    var btn = el('button', 'region-edit-btn', errors[name] ? '⚠ Korjaa' : '✎ Muokkaa');
    btn.type = 'button';
    btn.setAttribute('aria-label', (errors[name] ? 'Korjaa: ' : 'Muokkaa: ') + REGION_LABELS[name]);
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(name); });
    n.appendChild(btn);
    n.addEventListener('click', function (e) {
      // Soittimen, menneiden keikkojen yms. omat napit toimivat normaalisti.
      if (e.target.closest('button, input, select, textarea, summary')) return;
      e.preventDefault(); // linkit (mailto, some, Info) eivät vie pois muokkaustilasta
      open(name);
    });
  }

  function open(name) {
    if (active === name) return;
    close(false);
    var ed = buildEditor(name);
    ed.node.dataset.editor = name;
    delete errors[name];
    current(name).replaceWith(ed.node);
    active = name;
    activeApply = ed.apply;
    ed.node.scrollIntoView({ block: 'nearest' });
    var first = ed.node.querySelector('[data-autofocus]') || ed.node.querySelector('input:not([type=file]), textarea, button');
    if (first) first.focus({ preventScroll: true });
  }

  function close(focusBack) {
    if (!active) return;
    var name = active;
    if (activeApply) activeApply();
    active = null;
    activeApply = null;
    var n = displayNode(name);
    current(name).replaceWith(n);
    if (focusBack) n.querySelector('.region-edit-btn').focus({ preventScroll: true });
  }

  // Kehys jokaiselle muokkaimelle: kultainen reunus + Valmis. Esc sulkee, Enter
  // yksirivisessä kentässä myös (paitsi linkin lisäysrivillä, jossa Enter lisää).
  function frame(node, hint) {
    node.classList.add('region-editor');
    var foot = el('div', 'region-editor-foot');
    if (hint) foot.appendChild(el('span', 'hint', hint));
    var done = el('button', 'btn small', 'Valmis');
    done.type = 'button';
    done.addEventListener('click', function () { close(true); });
    foot.appendChild(done);
    node.appendChild(foot);
    node.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file' && !e.target.closest('.quick-add')) {
        e.preventDefault();
        close(true);
      }
    });
    return node;
  }

  // Kuvan valinta: pienennys heti (sama funktio kuin lähetyksessä), esikatselu paikallaan.
  function imagePicker(kind, labelText, previewImg, errEl) {
    var file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/jpeg,image/png,image/webp';
    var label = el('label', 'file-label', labelText);
    label.appendChild(file);
    file.addEventListener('change', function () {
      var f = file.files[0];
      if (!f) return;
      errEl.hidden = true;
      opts.resizeImage(f).then(function (r) {
        if (images[kind]) URL.revokeObjectURL(images[kind].url);
        images[kind] = { blob: r.blob, width: r.width, height: r.height, url: URL.createObjectURL(r.blob) };
        previewImg.src = images[kind].url;
        previewImg.hidden = false;
      }).catch(function (err) {
        errEl.textContent = '⚠ ' + err.message;
        errEl.hidden = false;
        file.value = '';
      });
    });
    return label;
  }

  // Linkkilista (musiikki, some): rivit poistonapein + yksi lisäysrivi. Rivin ulkoasun
  // antaa renderItem, jotta musiikkirivit näyttävät oikeilta soittimilta.
  function linkList(items, renderItem, addPlaceholder, addLabel) {
    var wrap = el('div', 'link-list');
    var list = el('div');
    var add = el('div', 'quick-add');
    var input = control('input', '', { type: 'url', placeholder: addPlaceholder, className: 'inline-edit' });
    input.setAttribute('aria-label', addPlaceholder);
    var addBtn = el('button', 'btn ghost small', addLabel);
    addBtn.type = 'button';
    var err = el('p', 'form-status err');
    err.hidden = true;

    function draw() {
      list.replaceChildren();
      items.forEach(function (item, i) {
        var row = el('div', 'link-row');
        row.appendChild(renderItem(item));
        var rm = el('button', 'btn ghost small', '✕ Poista');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Poista ' + (item.title || item.label || item.url));
        rm.addEventListener('click', function () { items.splice(i, 1); draw(); addBtn.focus(); });
        row.appendChild(rm);
        list.appendChild(row);
      });
      var full = items.length >= MAX_LINKS;
      input.disabled = full;
      addBtn.disabled = full;
      input.placeholder = full ? 'Enintään ' + MAX_LINKS + ' linkkiä' : addPlaceholder;
    }
    function doAdd() {
      var v = input.value.trim();
      if (!v) return;
      if (!/^https:\/\/[^\s]+$/.test(v)) {
        err.textContent = '⚠ Linkin pitää alkaa https://';
        err.hidden = false;
        return;
      }
      err.hidden = true;
      items.push({ url: v });
      input.value = '';
      draw();
      input.focus();
    }
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    add.appendChild(input);
    add.appendChild(addBtn);
    wrap.appendChild(list);
    wrap.appendChild(add);
    wrap.appendChild(err);
    draw();
    return wrap;
  }

  function buildEditor(name) {
    var node, apply;
    var fileErr = el('p', 'form-status err');
    fileErr.hidden = true;

    if (name === 'title') {
      // Sivulla on oltava aina täsmälleen yksi h1 myös muokatessa: logo on h1:n sisällä
      // kuten julkaistuna; ilman logoa nimikenttä itse on h1:n sisällä.
      node = el('div', 'title-editor');
      var h1 = el('h1');
      var logoImg = document.createElement('img');
      logoImg.className = 'hero-logo';
      var logoSrc = images.logo ? images.logo.url : (draft.logo && draft.logo.src);
      logoImg.alt = draft.title || '';
      if (logoSrc) logoImg.src = logoSrc; else logoImg.hidden = true;
      h1.appendChild(logoImg);
      node.appendChild(h1);
      node.appendChild(imagePicker('logo', logoSrc ? 'Vaihda logo' : 'Lisää logo (valinnainen)', logoImg, fileErr));
      node.appendChild(fileErr);
      var title = control('input', draft.title, { maxLength: 80, required: true, className: 'inline-edit hero-name-input' });
      title.dataset.autofocus = '';
      if (logoSrc) {
        node.appendChild(labeled('Nimi *', title, 'Logo näkyy otsikkona; nimi näkyy etusivun kortissa ja haussa.'));
      } else {
        title.setAttribute('aria-label', 'Nimi');
        h1.appendChild(title);
      }
      var city = control('input', draft.city, { maxLength: 60, className: 'inline-edit' });
      node.appendChild(labeled('Kaupunki', city, 'Näkyy etusivun kortissa ja kaupunkisuodattimessa.'));
      apply = function () {
        draft.title = clean(title.value);
        draft.city = clean(city.value);
        if (images.logo) draft.logo = { src: images.logo.url, width: images.logo.width, height: images.logo.height };
      };
      return { node: frame(node), apply: apply };
    }

    if (name === 'tagline') {
      node = el('div', 'text-editor');
      var tl = control('textarea', draft.tagline, { maxLength: 400, placeholder: 'Lyhyt esittely tai iskulause', className: 'inline-edit tagline-input' });
      tl.setAttribute('aria-label', 'Kuvaus');
      node.appendChild(tl);
      apply = function () { draft.tagline = clean(tl.value); };
      return { node: frame(node), apply: apply };
    }

    if (name === 'tags') {
      node = el('div', 'text-editor');
      var tg = control('input', (draft.tags || []).join(', '), { maxLength: 120, placeholder: 'esim. country soul, blues', className: 'inline-edit genres-input' });
      tg.setAttribute('aria-label', 'Tyylilajit');
      node.appendChild(tg);
      apply = function () { draft.tags = tg.value.split(',').map(clean).filter(Boolean).slice(0, 6); };
      return { node: frame(node, 'Pilkulla eroteltuna, enintään 6.'), apply: apply };
    }

    if (name === 'photo') {
      node = el('figure', 'glass photo');
      var photo = draft.photo || {};
      var pimg = document.createElement('img');
      pimg.className = 'photo-preview-inline';
      pimg.alt = 'Bändikuvan esikatselu';
      var psrc = images.photo ? images.photo.url : photo.src;
      if (psrc) pimg.src = psrc; else pimg.hidden = true;
      node.appendChild(pimg);
      var fields = el('div', 'photo-editor-fields');
      fields.appendChild(imagePicker('photo', psrc ? 'Vaihda kuva' : 'Lisää bändikuva', pimg, fileErr));
      fields.appendChild(fileErr);
      var credit = control('input', photo.credit, { maxLength: 160, placeholder: 'esim. Elmo Romppanen', className: 'inline-edit' });
      fields.appendChild(labeled('Kuvaaja', credit, '"Kuva: " lisätään eteen automaattisesti.'));
      var mem = control('textarea', (photo.members || []).map(function (m) { return m.role ? m.name + ' — ' + m.role : m.name; }).join('\n'),
        { placeholder: 'Ray Jone — Laulu ja kitara\nMikko Laine — Kitara', className: 'inline-edit' });
      mem.rows = Math.max(3, (photo.members || []).length + 1); // kaikki jäsenet näkyvät ilman vieritystä
      fields.appendChild(labeled('Jäsenet', mem, 'Yksi per rivi: Nimi — Soitin.'));
      node.appendChild(fields);
      apply = function () {
        var p = Object.assign({}, draft.photo || {}, { credit: clean(credit.value), members: parseMembers(mem.value) });
        if (images.photo) { p.src = images.photo.url; p.width = images.photo.width; p.height = images.photo.height; }
        draft.photo = p;
      };
      return { node: frame(node), apply: apply };
    }

    if (name === 'bio') {
      node = el('section', 'glass pad bio');
      node.appendChild(el('h2', 'label', 'Bio'));
      var bio = control('textarea', (draft.bio || []).join('\n\n'), { placeholder: 'Kerro bändistä. Tyhjä rivi aloittaa uuden kappaleen.', className: 'inline-edit bio-input' });
      bio.setAttribute('aria-label', 'Bio');
      node.appendChild(bio);
      apply = function () {
        draft.bio = bio.value.split(/\n\s*\n/).map(clean).filter(Boolean).slice(0, 6);
      };
      return { node: frame(node, 'Tyhjä rivi aloittaa uuden kappaleen (enintään 6).'), apply: apply };
    }

    if (name === 'listen') {
      node = el('section', 'glass pad listen');
      node.id = 'kuuntele';
      var head = el('div', 'head');
      head.appendChild(el('h2', 'label', 'Kuuntele · Listen'));
      head.appendChild(el('em', null, 'Discografia'));
      node.appendChild(head);
      var disco = (draft.discography || []).map(function (d) {
        return Object.assign({}, d, { url: d.url || urlFromEmbed(d.embed) || d.audio || '' });
      });
      node.appendChild(linkList(disco, function (item) {
        var player = (item.embed || item.audio) ? renderDiscoItem(item, draft.title) : null;
        if (player) return player;
        // Uusi linkki: palvelin tunnistaa palvelun ja rakentaa soittimen vasta tallennuksessa
        // (käyttäjän osoitetta ei koskaan upoteta sellaisenaan).
        var box = el('div', 'disco-pending');
        box.appendChild(el('strong', null, 'Uusi: '));
        box.appendChild(document.createTextNode(item.url));
        box.appendChild(el('span', 'hint', ' — soitin näkyy kun tallennat.'));
        return box;
      }, 'Liitä YouTube-, Spotify-, SoundCloud- tai mp3-linkki', '+ Lisää kappale'));
      apply = function () { draft.discography = disco; };
      return { node: frame(node, 'Enintään ' + MAX_LINKS + '. Soitin näkyy juuri tällaisena julkaistulla sivulla.'), apply: apply };
    }

    if (name === 'contact') {
      node = el('section', 'glass pad');
      node.id = 'booking';
      node.appendChild(el('h2', 'label', 'Keikkamyynti · Booking'));
      var C = draft.contact || {};
      if (C.phone) node.appendChild(el('p', 'hint', 'Puhelin: ' + (C.phoneDisplay || C.phone)));
      var email = control('input', C.email, { type: 'email', maxLength: 120, placeholder: 'yhteys@esimerkki.fi', className: 'inline-edit' });
      node.appendChild(labeled('Sähköposti (näkyy julkisesti)', email));
      node.appendChild(el('span', 't social-heading', 'Linkit'));
      var social = (C.social || []).map(function (s) { return { label: s.label, url: s.url }; });
      node.appendChild(socialEditor(social));
      apply = function () {
        draft.contact = Object.assign({}, draft.contact || {}, {
          email: clean(email.value) || null,
          social: social.map(function (s) { return { label: s.label || socialLabel(s.url), url: s.url }; }),
        });
      };
      return { node: frame(node), apply: apply };
    }

    if (name === 'gigs') {
      var tmp = el('div');
      tmp.appendChild(renderDetail(draft, { editing: true, gigsAll: true }));
      node = tmp.querySelector('[data-region="gigs"]');
      delete node.dataset.region;
      var addGig = el('button', 'btn small', '+ Lisää keikka');
      addGig.type = 'button';
      addGig.addEventListener('click', function () { opts.onAddGig(); });
      node.querySelector('.head').appendChild(addGig);
      node.addEventListener('click', function (e) {
        var eb = e.target.closest('.gig-edit-btn');
        var tb = e.target.closest('.gig-toggle-btn');
        if (!eb && !tb) return;
        var li = (eb || tb).closest('.gig');
        var gig = (draft.gigs || []).find(function (g) { return g.id === li.dataset.gigId; });
        if (!gig) return;
        if (eb) opts.onEditGig(gig);
        else { tb.disabled = true; opts.onToggleGig(gig); }
      });
      return { node: frame(node, 'Keikkojen muutokset tallentuvat heti. Piilotettu keikka ei näy sivulla eikä etusivulla.'), apply: function () {} };
    }
    throw new Error('Tuntematon alue: ' + name);
  }

  function draw() {
    root = el('div', 'edit-mode');

    var bar = el('div', 'glass pad edit-bar');
    bar.appendChild(el('p', 'edit-bar-hint', '✎ Muokkaustila — napauta kohtaa, jota haluat muokata. Muutokset tallentuvat vasta Tallenna-napista.'));
    var actions = el('div', 'toolbar-actions');
    saveBtn = el('button', 'btn small', 'Tallenna');
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', save);
    var cancelBtn = el('button', 'btn ghost small', 'Peruuta');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', cancel);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    bar.appendChild(actions);
    statusEl = el('p', 'form-status');
    statusEl.setAttribute('role', 'status');
    bar.appendChild(statusEl);
    root.appendChild(bar);

    var page = el('div');
    page.appendChild(renderDetail(draft, { editing: true }));
    page.querySelectorAll('[data-region]').forEach(decorate);
    root.appendChild(page);

    var danger = el('div', 'danger-zone');
    var del = el('button', 'btn danger small', 'Poista sivu');
    del.type = 'button';
    del.addEventListener('click', function () {
      if (!del.dataset.confirming) {
        del.dataset.confirming = '1';
        del.textContent = 'Varmista: poista pysyvästi?';
        return;
      }
      del.disabled = true;
      del.textContent = 'Poistetaan…';
      opts.onDelete().then(function (res) {
        if (res && res.message) {
          del.disabled = false;
          delete del.dataset.confirming;
          del.textContent = 'Poista sivu';
          setStatus('⚠ ' + res.message, true);
        }
      });
    });
    danger.appendChild(del);
    danger.appendChild(el('p', 'hint', 'Poistaa koko sivun pysyvästi.'));
    root.appendChild(danger);

    opts.mount.replaceChildren(root);
  }

  function dirty() {
    return Boolean(images.photo || images.logo) || JSON.stringify(draft) !== original;
  }

  function cancel() {
    close(false);
    if (dirty() && !window.confirm('Hylätäänkö tallentamattomat muutokset?')) return;
    opts.onCancel();
  }

  function save() {
    close(false);
    setStatus('Tallennetaan…');
    saveBtn.disabled = true;
    return Promise.resolve(opts.onSave(draft, images)).then(function (res) {
      saveBtn.disabled = false;
      if (!res) return;
      if (res.fields) {
        var names = Object.keys(res.fields);
        names.forEach(function (k) { if (FIELD_REGION[k]) errors[FIELD_REGION[k]] = true; });
        Object.keys(errors).forEach(function (r) { var n = current(r); if (n) n.replaceWith(displayNode(r)); });
        setStatus('⚠ Tarkista: ' + names.map(function (k) { return FIELD_NAMES[k] || k; }).join(', ') + ' — ' +
          names.map(function (k) { return res.fields[k]; }).join(' '), true);
        var first = FIELD_REGION[names[0]];
        if (first) open(first);
      } else if (res.message) {
        setStatus('⚠ ' + res.message, true);
      }
    });
  }

  return {
    draw: draw,
    save: save,
    setStatus: setStatus,
    // Keikat tallentuvat palvelimelle heti — päivitetään vain niiden osuus luonnokseen,
    // muut tallentamattomat muutokset säilyvät.
    setGigs: function (gigs) {
      draft.gigs = gigs;
      var o = JSON.parse(original);
      o.gigs = gigs;
      original = JSON.stringify(o);
      if (active === 'gigs') {
        var ed = buildEditor('gigs');
        ed.node.dataset.editor = 'gigs';
        current('gigs').replaceWith(ed.node);
      } else {
        current('gigs').replaceWith(displayNode('gigs'));
      }
    },
  };
}

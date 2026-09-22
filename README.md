# BandRock

Ilmoitustaulu bändeille. Kuka tahansa saa oman sivun ilman kirjautumista — keikat, esittely, yhteystiedot — ja muokkaa sitä myöhemmin 5-merkkisellä koodilla. Ray Jone & The Nekalabama Thunderstorm on ensimmäinen bändi ruudukossa.

Tämä on **vaihe 1**: näkyvä alusta ilman pilvipalvelua. Luonti- ja muokkauslomakkeet ovat käytössä, mutta tallennus sanoo rehellisesti "ei vielä käytössä" — oikea tallennus (Cloudflare Worker + R2) on vaihe 2. Koko suunnitelma: `C:\Users\User\.claude\plans\ok-sitten-mietit-n-t-toasty-seal.md`.

## 1. Nimeä repo uudelleen (tee tämä ensin)

Jotta osoite olisi muotoa `.../BandRock/<nimi>`, GitHubin repo pitää nimetä `Nekalamaba` → `BandRock`:

1. GitHubissa: repo → **Settings** → yleiset asetukset → **Repository name** → `BandRock` → **Rename**.
2. Vanha osoite `samppafin.github.io/Nekalamaba/` lakkaa todennäköisesti toimimasta. Uusi on `samppafin.github.io/BandRock/`.
3. Koodi ei riipu repon nimestä (sivuston juuri lasketaan ajonaikaisesti), joten mitään muuta ei tarvitse muuttaa.

## Miten sivu toimii

```
Kävijä → GitHub Pages (.../BandRock/) → index.html lukee osoitteen → data/<nimi>.json → piirtää sivun
Syvälinkki .../BandRock/ray-jone#kuuntele, jota ei löydy tiedostona → 404.html ohjaa index.html:ään
```

- `public/index.html` on sekä ruudukko että jokaisen bändin sivu — sama tiedosto piirtää kummankin `assets/render.js`:llä riippuen osoitteesta.
- `public/404.html` on GitHub Pagesin oma fallback: kun polkua (esim. `ray-jone`) ei löydy tiedostona, tämä ohjaa `index.html`:ään säilyttäen alkuperäisen polun ja ankkurin. Tavallinen, vakiintunut tapa saada "siistejä" osoitteita staattiselle sivulle ilman build-vaihetta.
- Bändien data on `public/data/`-kansiossa JSON-tiedostoina. `index.json` on kevyt lista ruudukkoon, `<nimi>.json` täysi bändisivu.

## Paikallinen kehitys ja testaus

```
npm test    # yksikkötestit (Node 22, ei riippuvuuksia)
```

Selaintestaus vaatii palvelimen, joka jäljittelee GitHub Pagesin käytöstä (tuntematon polku → `404.html` statuksella 404). Tavallinen tiedostopalvelin ei riitä reititystempun testaamiseen — katso mallia Claude-session scratchpadista tai tee vastaava pieni Node-palvelin.

## Ray Jonen muokkauskoodi

Ensimmäisen bändin (Ray Jone & The Nekalabama Thunderstorm) muokkauskoodi on **00000** — tarkoituksella tunnettu, ei salaisuus. Vaiheessa 1 se vain avaa esitäytetyn lomakkeen; tallennus ei vielä toimi.

---

## Vaihe 2: Worker + R2 (ei vielä tehty)

Kun tämä tehdään, luonti ja muokkaus alkavat oikeasti tallentua. Silloin tarvitset:

```
npm install              # asentaa wranglerin projektin node_modules-kansioon
npx wrangler login       # kirjaudu Cloudflareen selaimella
```
Sen jälkeen R2-ämpärin luonti, `CODE_SECRET`- ja `TURNSTILE_SECRET`-salaisuudet ja `npm run deploy:worker` — tarkat komennot päivitetään tähän kun vaihe 2 on kirjoitettu.

### Vanha keikkalista-Worker (D1) — korvautuu vaiheessa 2

`worker/`-kansiossa on yhä alkuperäinen D1-pohjainen keikkalista-Worker. Sitä ei koskaan julkaistu, ja se korvautuu R2-versiolla vaiheessa 2 — ei kannata ottaa käyttöön nyt.

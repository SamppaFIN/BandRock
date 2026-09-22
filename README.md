# BandRock

Ilmoitustaulu bändeille. Kuka tahansa saa oman sivun ilman kirjautumista — keikat, esittely, yhteystiedot — ja muokkaa sitä myöhemmin 5-merkkisellä koodilla. Ray Jone & The Nekalabama Thunderstorm on ensimmäinen bändi ruudukossa, muokkauskoodi **00000**.

Vaihe 1 (näkyvä alusta) ja vaihe 2 (Worker + R2 -tallennus) on molemmat kirjoitettu ja testattu paikallisesti. **Julkaisu on ainoa asia mikä puuttuu** — se vaatii sinun Cloudflare-tiliäsi, koska tässä ympäristössä ei ole pääsyä siihen. Koko suunnitelma: `C:\Users\User\.claude\plans\ok-sitten-mietit-n-t-toasty-seal.md`.

## 1. Nimeä repo uudelleen (tee tämä ensin)

Jotta osoite olisi muotoa `.../BandRock/<nimi>`, GitHubin repo pitää nimetä `Nekalamaba` → `BandRock`:

1. GitHubissa: repo → **Settings** → yleiset asetukset → **Repository name** → `BandRock` → **Rename**.
2. Vanha osoite `samppafin.github.io/Nekalamaba/` lakkaa todennäköisesti toimimasta. Uusi on `samppafin.github.io/BandRock/`.
3. Koodi ei riipu repon nimestä (sivuston juuri lasketaan ajonaikaisesti), joten mitään muuta ei tarvitse muuttaa.

## 2. Julkaise Worker (Cloudflare)

Aja kaikki `npx wrangler …` -komennot **projektin juuresta**.

```
npm install                # asentaa wranglerin projektin node_modules-kansioon
npx wrangler login         # kirjaudu Cloudflareen selaimella
npx wrangler r2 bucket create bandrock-posters
npx wrangler secret put CODE_SECRET        # anna mikä tahansa pitkä satunnainen merkkijono
npx wrangler secret put TURNSTILE_SECRET   # väliaikainen arvo käy (esim. "ei-kaytossa"), Turnstile ei ole vielä kytketty (ks. alla)
npm run deploy:worker
```
Komento tulostaa Workerin osoitteen, esim. `https://bandrock.TILISI.workers.dev`. Liitä se tiedostoon `public/index.html` vakioon `API_URL` loppuun `/api`:
```js
var API_URL = 'https://bandrock.TILISI.workers.dev/api';
```

**Siemennä Ray Jonen sivu tuotanto-R2:een** (koodi 00000, sama kuin paikallisessa kehityksessä). Käytä samaa arvoa kuin annoit `wrangler secret put CODE_SECRET`:lle — arvo ei koskaan tallennu mihinkään, se on vain ympäristömuuttuja tämän yhden ajon ajan:
```
# PowerShell:
$env:CODE_SECRET = "sama arvo kuin secret put"
node worker/seed-remote.mjs

# Bash:
CODE_SECRET="sama arvo kuin secret put" node worker/seed-remote.mjs
```
`wrangler r2 object put` ei tue R2:n `customMetadata`a komentoriviltä, joten tällä tavalla siemennetyltä ilmoitukselta se puuttuu — Worker huomaa tämän ja lukee tarvittavat kentät (tyyppi, kaupunki, tagit) tarvittaessa suoraan tiedostosta ruudukkoa varten (`worker/src/index.js`, `listPosters`). Normaalisti luodut/muokatut ilmoitukset (lomakkeen kautta) saavat `customMetadata`n aina suoraan, tämä koskee vain käsin siemennettyä dataa.

## 3. Julkaise sivu

- GitHubissa: repo → **Settings** → **Pages** → **Source: GitHub Actions**. Ilmaisella GitHub-tilillä repon pitää olla julkinen.
- Tee commit ja push `main`-haaraan.
- Jos Pagesin osoite on eri kuin `https://samppafin.github.io`, päivitä se `ALLOWED_ORIGINS`-arvoon tiedostossa `wrangler.toml` ja julkaise Worker uudelleen. Muuten selain estää sivun kutsut Workeriin.

## Miten sivu toimii

```
Kävijä → GitHub Pages (.../BandRock/) → index.html lukee osoitteen → API_URL/posters/<nimi> (tai data/<nimi>.json, jos Worker ei ole vielä käytössä) → piirtää sivun
Syvälinkki .../BandRock/ray-jone#kuuntele, jota ei löydy tiedostona → 404.html ohjaa index.html:ään
```

- `public/index.html` on sekä ruudukko että jokaisen bändin sivu — sama tiedosto piirtää kummankin `assets/render.js`:llä riippuen osoitteesta.
- `public/404.html` on GitHub Pagesin oma fallback: kun polkua (esim. `ray-jone`) ei löydy tiedostona, tämä ohjaa `index.html`:ään säilyttäen alkuperäisen polun ja ankkurin. Tavallinen, vakiintunut tapa saada "siistejä" osoitteita staattiselle sivulle ilman build-vaihetta.
- Kunnes `API_URL` on asetettu (yllä, kohta 2), sivu näyttää `public/data/`-kansion staattista esimerkkidataa eivätkä luonti/muokkaus-lomakkeet tallenna mitään — ne kertovat sen rehellisesti.
- `worker/src/index.js` on Cloudflare-puoli: ilmoitukset (posterit) R2:ssa JSON-tiedostoina, ei tietokantaa. Ks. `worker/src/schema.js` (tarkistus), `worker/src/code.js` (muokkauskoodi).

## Paikallinen kehitys ja testaus

```
npm test                 # yksikkötestit: schema, koodin luonti/tarkistus, soitintunnistus
npm run dev:worker        # käynnistää Workerin paikallisesti porttiin 8787, paikallinen R2-emulaatio
npm run seed:local         # kirjoittaa Ray Jonen datan paikalliseen R2:een koodilla 00000
```

Tarvitset `.dev.vars`-tiedoston projektin juureen (ei committoida):
```
CODE_SECRET=paikallinen-testisalaisuus
TURNSTILE_SECRET=ei-kaytossa-viela
```

Avaa sivu paikallisesti osoitteessa `http://localhost:8080/?api=http://localhost:8787/api` (mikä tahansa staattinen palvelin `public/`-kansiolle). Reititystempun (404.html) testaus vaatii palvelimen, joka jäljittelee GitHub Pagesin käytöstä — tavallinen tiedostopalvelin ei riitä siihen.

## Muokkauskoodit

- Jokainen ilmoitus saa oman 5-merkkisen koodin luonnin yhteydessä. Koodi näytetään **kerran**, eikä sitä voi palauttaa — vain sen HMAC-tiiviste (`codeHash`) tallennetaan R2:een.
- Ilmoituksen tunnus (`id`, esim. `ray-jone`) ja muokkauskoodi ovat aina täysin erilliset — koodi ei koskaan esiinny id:ssä, URL:ssa eikä missään julkisessa vastauksessa.
- Ray Jonen koodi on tarkoituksella kiinteä ja tunnettu: **00000**.

## Rajat ja suojat

- Palvelin tarkistaa kaikki kentät (`worker/src/schema.js`). Selaimen tarkistus on vain mukavuutta.
- Nopeusrajoitin (`ratelimits`-sidonta): 20 luontia/muokkausyritystä 60 sekunnissa, erikseen jokaiselle ilmoitukselle muokkauksissa. Hidastaa väärinkäyttöä, ei täydellinen suoja.
- Piilokenttä torjuu yksinkertaiset botit.
- **Ei vielä:** Turnstile-botintorjunta (vaatii oman Turnstile-sivuston Cloudflaren dashboardista — site key sivulle, secret Workeriin), kuvien lataus, ylläpitonäkymä piilotukseen.

### Vanha keikkalista-Worker (D1) — poistettu

Alkuperäinen D1-pohjainen keikkalista-Worker (`worker/src/validate.js`, `worker/migrations/`) on poistettu BandRock-pivotin yhteydessä. Sitä ei koskaan julkaistu, joten mitään ei menetetty.

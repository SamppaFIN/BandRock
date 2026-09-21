# Ray Jone & The Nekalabama Thunderstorm

Bändin julkinen sivu. Kuka tahansa voi lisätä sille keikkailmoituksen.

```
Kävijä → GitHub Pages (public/) → hakee listan → Cloudflare Worker (worker/) → D1-tietokanta
```

- **Sivu** on `public/index.html`. GitHub Actions julkaisee sen GitHub Pagesiin, kun `main`-haaraan tulee muutos ja testit menevät läpi.
- **Worker** on Cloudflaressa. Se ottaa ilmoitukset vastaan, tarkistaa ja siivoaa ne ja palauttaa sivulle valmiin listan. Työn alla on vain tulevat keikat, enintään 200.
- Soitin: ilmoitukseen voi liittää YouTube-, Spotify- tai SoundCloud-linkin. Worker tunnistaa palvelun ja rakentaa upotusosoitteen itse. Soitin latautuu vasta, kun kävijä painaa "Kuuntele".

## Käyttöönotto (kerran)

Tarvitset Cloudflare-tilin ja `main`-haaran GitHubissa. Ilmaistili riittää. Cloudflare-tokenia ei tarvita, kirjautuminen tehdään selaimella.

Aja kaikki `npx wrangler …` -komennot **projektin juuresta**, jossa `wrangler.toml` on. Muualta ajettuna `wrangler` ei löydä asetuksia ja alkaa arvailla projektia.

**0. Asenna työkalut**
```
npm install
```
Tämä asentaa `wrangler`in projektin `node_modules/`-kansioon. Sen jälkeen `npx wrangler …` käyttää projektin omaa kopiota (ei lataa mitään välimuistiin, joten Windowsin `EBUSY`-lukitusvirhe ei tule vastaan).

**1. Kirjaudu Cloudflareen**
```
npx wrangler login
```

**2. Luo tietokanta ja tee taulu**
```
npx wrangler d1 create nekalabama-gigs
```
Kopioi tulosteesta `database_id` tiedostoon `wrangler.toml` (korvaa teksti `REPLACE-WITH-ID-FROM-d1-create`). Jos `wrangler` kysyy, lisätäänkö tietokanta asetustiedostoon, vastaa **ei**: se on jo `wrangler.toml`:ssa. Sitten:
```
npm run migrate:remote
```

**3. Julkaise Worker**
```
npm run deploy:worker
```
Komento tulostaa Workerin osoitteen, esim. `https://nekalabama-gigs.TILISI.workers.dev`. Liitä se tiedostoon `public/index.html` vakioon `API_URL` loppuun `/gigs`:
```js
var API_URL = 'https://nekalabama-gigs.TILISI.workers.dev/gigs';
```

**4. Julkaise sivu**
- GitHubissa: repo → **Settings** → **Pages** → **Source: GitHub Actions**. Ilmaisella GitHub-tilillä repon pitää olla julkinen.
- Tee commit ja push `main`-haaraan. Sivu aukeaa osoitteessa `https://samppafin.github.io/Nekalamaba/`.

Jos Pagesin osoite on eri, päivitä se `ALLOWED_ORIGINS`-arvoon tiedostossa `wrangler.toml` ja julkaise Worker uudelleen (`npm run deploy:worker`). Muuten selain estää sivun kutsut Workeriin.

## Keikan piilotus

Ilmoituksen saa pois listalta ilman koodia. Katso ensin ilmoitusten numerot:
```
npx wrangler d1 execute nekalabama-gigs --remote --command "SELECT id, date, artist, venue FROM gigs ORDER BY id DESC LIMIT 20"
```
Piilota ilmoitus (numero 3) ja tuo se takaisin tarvittaessa:
```
npx wrangler d1 execute nekalabama-gigs --remote --command "UPDATE gigs SET status='hidden' WHERE id=3"
npx wrangler d1 execute nekalabama-gigs --remote --command "UPDATE gigs SET status='visible' WHERE id=3"
```
Saman voi tehdä Cloudflaren dashboardissa D1-tietokannan konsolissa.

## Paikallinen kehitys

```
npm test                      # testit (Node 22, ei riippuvuuksia)
npm run migrate:local         # tee taulu paikalliseen tietokantaan
npx wrangler dev --var "ALLOWED_ORIGINS:http://localhost:8080"
```
Tarjoile `public/` kansio osoitteessa `http://localhost:8080` (mikä tahansa staattinen palvelin) ja avaa `http://localhost:8080/?api=http://localhost:8787/gigs`.

## Rajat ja suojat

- Palvelin tarkistaa kaikki kentät (pituudet, päivämäärä, vain https-linkit, vain tunnetut soittimet). Selaimen tarkistus on vain mukavuutta.
- Koko sivulle yhteinen raja: 30 uutta ilmoitusta tunnissa. Ilmoittajasta ei tallenneta mitään.
- Piilokenttä torjuu yksinkertaiset botit.
- **Ei vielä:** Turnstile-botintorjunta, rekisteröinti ja moderointityökalut. Ne lisätään, kun sivua jaetaan laajemmin.

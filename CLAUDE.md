# 🎸 Roudari — BandRock-projektin säännöt

> Tämä tiedosto **korvaa** kansion `c:\Projects\` yleisen `CLAUDE.md`:n (Aavistus) identiteetin ja vastausprotokollan tässä projektissa.
> Muisti ei säily keskustelujen välillä — tärkeä tieto kirjataan tähän tiedostoon.

## 1. Identiteetti

```json
{
  "kutsumanimi": "Roudari",
  "ikoni": "🎸",
  "rooli": "Roudari: kantaa, kytkee ja pitää bändien sivut pystyssä — nyt yhden bändin sijaan koko talon",
  "malli": "claude-sonnet-5",
  "kehittäjä": "Anthropic",
  "alusta": "Claude Code (VS Code -laajennus)",
  "projektin_omistaja": "Infinite",
  "kieli": ["suomi", "englanti"],
  "luonne": ["suorapuheinen", "utelias", "rehellinen"],
  "tietopohja_asti": "2026-01"
}
```

## 2. Projekti

```json
{
  "projekti": "BandRock",
  "julkinen_nimi": "BandRock — ilmoitustaulu bändeille",
  "versio": "0.2.0-alusta",
  "kuvaus": "Alusta jolla kuka tahansa bändi saa oman sivun ilman kirjautumista: keikat, esittely, yhteystiedot. Ray Jone & The Nekalabama Thunderstorm on ruudukon ensimmäinen bändi.",
  "tila": "toteutus (vaihe 1 valmis, vaihe 2 seuraava)",
  "repo": "https://github.com/SamppaFIN/Nekalamaba.git (uudelleennimeäminen BandRock kesken — ks. kohta 5)",
  "haara": "main",
  "spotify_artisti": "https://open.spotify.com/artist/6MZ5sOhKDci1bYweyqJBj7",
  "osoite": "https://samppafin.github.io/Nekalamaba/ (toistaiseksi; muuttuu .../BandRock/ksi kun repo on nimetty uudelleen)",
  "hosting": "Sivu: GitHub Pages, ei build-vaihetta. Data (vaihe 2): Cloudflare Worker + R2.",
  "julkaisu": "Sivu: GitHub Actions → Pages. Worker: wrangler deploy käsin (kuten Klitoritarissa)."
}
```

**22.9.2026 pivot:** sivu muuttui yhden bändin sivusta monen bändin alustaksi. Suunnitelma on tiedostossa `C:\Users\User\.claude\plans\ok-sitten-mietit-n-t-toasty-seal.md` — lue se ensin, jos jatkat tästä. Ray Jonen käsin kirjoitettu sisältö on nyt `public/data/ray-jone.json`, ja sama malli (`render.js`) piirtää minkä tahansa bändin sivun.

**Lähtötilanne (historiaa):** alkuperäinen sivu oli Claude Designin bundle (`Ray Jone & Nekalabama Thunderstorm.html`), joka nojasi omaan `<x-dc>`-runtimeen. Sitä ei tarjoiltu sellaisenaan — purettiin tavalliseksi HTML:ksi 21.9.2026. Kuvat ja fontit ovat kansiossa `public/` (logo, Madrid-kansi, bändikuva, Gentium Basic latin). Alkuperäistä HTML:ää ja `Madrid_kansi.jpg`:tä (4 Mt) ei muokata eikä commitoida.

**Ulkoasu (uusittu 22.9.2026 AI-Koulun ui-ux-oppien pohjalta):** musta tausta, korostus `#f5b122`, fontti Gentium Basic (serif), pienet isot-kirjaimiset otsikot leveällä `letter-spacing`illa, otsikot muotoa "Kuuntele · Listen".

- **Tokenit** `:root`-lohkossa OKLCH-muodossa. Älä kirjoita värejä suoraan sääntöihin.
- **Kerrokset:** `@layer base, layout, components, state`. Uusi sääntö menee oikeaan kerrokseen.
- **Lasi** (`.glass`): `backdrop-filter: blur(16px) saturate(1.3)` + läpikuultava pinta + `::before`-hiusviiva. Käytössä korteissa, valikossa ja ikkunassa.
- **Metalli:** kromiliukuväri nimessä (`background-clip: text`), kultaliukuväri napeissa, `--edge`-korostus lasin reunassa. Pieni tehoste, ei koko pintaa.
- **Varatilat pakollisia:** `@supports not (backdrop-filter)`, `prefers-reduced-transparency`, `prefers-reduced-motion`, `prefers-contrast: more`.
- **Saavutettavuus:** kosketuskohteet 44 px, `:focus-visible` 2 px, kontrasti ≥ 4,5:1, ohituslinkki, maamerkit (`nav`/`main`/`footer`), virheessä aina ⚠-merkki eikä pelkkä väri. axe-core ilman rikkomuksia.
- **Tilat:** lataus = luuranko, tyhjä = tyhjä (Infiniten päätös), virhe = ohje mitä tehdä, onnistuminen = vihreä palkki.
- **Kenttätarkistus** tehdään kun kenttä menettää fokuksen, ei kesken kirjoittamisen.

## 3. Arkkitehtuuri

**Vaihe 1 (valmis, 22.9.2026): näkyvä alusta ilman pilveä.**

```
Kävijä → GitHub Pages (.../<repo>/) → index.html lukee osoitteen → data/<slug>.json → render.js piirtää
Syvälinkki .../<repo>/ray-jone#kuuntele, jota ei löydy tiedostona → 404.html → ohjaa index.html:ään
  ?p=-parametrilla → router.js palauttaa siistin osoitteen (history.replaceState) ennen piirtoa
Push main → GitHub Actions: testit → julkaisu GitHub Pagesiin
```

- **Ei build-vaihetta**, ei repon nimeen sidottuja polkuja. `public/assets/router.js` laskee sivuston juuren omasta `import.meta.url`:staan (`new URL('..', import.meta.url).pathname`), joten sama koodi toimii sekä paikallisesti että millä tahansa GitHub Pages -alipolulla riippumatta repon nimestä.
- **Reititys:** `public/404.html` on GitHub Pagesin oma fallback tuntemattomille poluille (vakiintunut SPA-temppu, esim. `spa-github-pages`). Se ohjaa `index.html?p=<alkuperäinen polku+ankkuri>`:ään suhteellisella osoitteella (ei kovakoodattua repon nimeä). `router.js`:n `restoreFromRedirect()` palauttaa siistin osoitteen ennen mitään piirtoa, joten `?p=` ei koskaan näy käyttäjälle eikä osoiterivillä.
- **Piirto:** `public/assets/render.js` piirtää JSON:sta joko kompaktin ruudukkokortin (`renderCard`) tai täyden bändisivun (`renderDetail`). Käyttäjän teksti aina `textContent`illä. Osiot (kuva, bio, kuuntele, keikat, yhteystiedot) piirretään vain jos JSON:ssa on sisältöä — sama malli palvelee bändiä ja kevyempää ilmoitusta.
- **Data (vaihe 1):** `public/data/index.json` = kevyt lista ruudukkoon (sama muoto kuin tuleva `GET /api/posters`), `public/data/<slug>.json` = täysi bändi (sama muoto kuin tuleva `GET /api/posters/:id`). Vain `ray-jone` on olemassa juuri nyt.
- **Luonti, muokkaus ja "Lisää keikka"** ovat käyttöliittymässä mukana, mutta tallennus sanoo aina "ei vielä käytössä" — oikea tallennus vaatii Workerin (vaihe 2).
- **Muokkauskoodi:** Ray Jonen sivulla on kiinteä koodi `00000` (`data/ray-jone.json`:n `editCode`), Infiniten oma päätös 22.9.2026. Vaiheessa 1 koodi tarkistetaan vain selaimessa suoraan JSON:n kenttää vasten — ei turvallista, ei tarvitse ollakaan, koska mitään ei silti tallennu. Vaiheessa 2 koodi ei enää koskaan kulje selaimeen: vain sen HMAC-tiiviste (`codeHash`) tallennetaan R2:een, ja Worker vertaa.
- **⚠️ Turvallisuuskorjaus (22.9.2026):** alkuperäisessä suunnitelmassa ilmoituksen `id` olisi sisältänyt saman 5 merkkiä kuin muokkauskoodi (esim. `k7m2p-ray-jone`) — tämä olisi vuotanut koodin julkisesti, koska id näkyy kaikille. Korjattu ennen toteutusta: `id` on pelkkä nimestä johdettu tunnus (`ray-jone`), koodi täysin erillinen eikä koskaan osa id:tä tai mitään julkista vastausta.

**Vaihe 2 (valmis, 22.9.2026, testattu paikallisesti — julkaisu odottaa Infinitiä): Worker R2:ta vasten.**

```
Kävijä        → GitHub Pages → fetch API_URL/posters[...] → Cloudflare Worker → R2 (posters/<id>.json)
Kuka tahansa  → lomake → POST/PATCH/DELETE API_URL/posters[...] → Worker tarkistaa koodin (HMAC) → R2
```

- `worker/src/index.js`: `GET /api/posters` (kevyt lista, R2 `list()` + `customMetadata`, Workerin oma Cache API 30 s), `GET /api/posters/:id` (täysi data, `codeHash`/`editCode` aina poistettu vastauksesta), `POST /api/posters` (luonti, palauttaa koodin kerran), `PATCH /api/posters/:id` (muokkaus koodilla, koskee vain lomakkeen kenttiä — muu sisältö kuten bio/kuvat/keikat säilyy ennallaan), `DELETE /api/posters/:id`, `POST /api/posters/:id/gigs` (yhden keikan lisäys bändin omalle sivulle koodilla).
- `worker/src/schema.js` (korvaa poistetun `validate.js`:n): `validateCreate`, `validatePatch`, `validateGigEntry`. Sama malli kuin ennen — palvelin siivoaa ja tarkistaa aina, pituusrajat, ohjausmerkit pois, vain https-linkit.
- `worker/src/code.js`: `generateCode()` (5 merkkiä aakkostosta `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, `crypto.getRandomValues`), `hashCode`/`verifyCode` (HMAC-SHA256, `crypto.subtle`, aikavakioinen vertailu), `slugify()` (id nimestä).
- `worker/src/media.js` säilyi koskemattomana — testattu, palvelee kaikkia ilmoituksia.
- **Nopeusrajoitin** (`ratelimits`-sidonta, `env.RATE_LIMITER`): 20/60s. Luonnille yhteinen avain, muokkaukselle/poistolle/keikan lisäykselle avain per ilmoitus (`edit:<id>`) — hidastaa yhden koodin arvaamista ilman IP:n tallentamista. Testattu paikallisesti: 21. pyyntö 60 s:n sisällä saa 429:n.
- **Ray Jonen siemendata** (`worker/seed-local.mjs`, `npm run seed:local`): kirjoittaa `public/data/ray-jone.json`:n R2:een `codeHash("00000")`:lla `wrangler`in omalla `unstable_dev`-rajapinnalla (suora Miniflare-kirjaston käyttö ei toiminut, versioristiriita — ks. Opit).
- **Client (`public/index.html`)**: `API_URL`-vakio, sama `REPLACE-ME`-paikkamerkki-malli kuin vanhassa gig-Workerissa. Kun määritetty: ruudukko ja bändisivut haetaan Workerilta, lomakkeet POST/PATCH/DELETE:aavat oikeasti. Kun ei: `data/*.json` ja "ei vielä käytössä" -viestit (Vaiheen 1 käytös säilyy koskemattomana).
- **Muokkaa koodilla -kulku:** vaihe 1 (koodin syöttö) ei enää tarkista mitään paikallisesti kun API on käytössä — koodi vain muistetaan (`pendingEditCode`) ja lähetetään yhdessä muutosten kanssa vaiheessa 2, koska Worker ei tarjoa erillistä "tarkista koodi" -päätepistettä (ei syytä lisätä sellaista — se olisi ylimääräinen arvausoraakkeli). Väärä koodi vaiheessa 2 palauttaa käyttäjän vaiheeseen 1 virheilmoituksella.
- **"Muokkaa tätä sivua koodilla" -nappi näkyy aina** (ei ehdollisesti `poster.editCode`:n mukaan) — palvelin ei koskaan palauta sitä kenttää, joten ehto olisi piilottanut napin kaikilta oikeasti luoduilta ilmoituksilta. Vain Vaiheen 1 staattinen esimerkkidata sisältää `editCode`-kentän suoraan (paikallista tarkistusta varten ilman Workeria).
- **Mallina Klitoritari-FinalFantasy** (luettu 21.9.2026): sama jako Pages + Worker, `wrangler.toml` projektin juuressa.

**Testattu paikallisesti (ei pilveä):** 28 yksikkötestiä (schema/code/media) + 20 selaintarkistusta koko kierrolle oikeaa Workeria vasten (luonti → koodi näkyy kerran → muokkaus koodilla → väärä koodi hylätään ja ohjaa takaisin koodikyselyyn → keikan lisäys koodilla → poisto koodilla, axe-core puhtaana) + 42 selaintarkistusta Vaiheen 1 staattiselle varakäytökselle (kun `API_URL` ei ole määritetty).

**Puuttuu vielä ennen tuotantoa (Infinite):** repo nimetty uudelleen, `wrangler login`, R2-ämpärin luonti, `CODE_SECRET`+`TURNSTILE_SECRET`-salaisuudet, `wrangler deploy`, `API_URL` päivitys `public/index.html`:ään, Ray Jonen siemennys tuotanto-R2:een (README kohta 2). Turnstile itse (widget + siteverify) ei ole vielä koodissa — vaatii oman Turnstile-sivuston luonnin Cloudflaren dashboardista ensin.

```
public/
  404.html                  GH Pages -uudelleenohjaus
  index.html                 reititin + ruudukko + kaikki dialogit (luo/muokkaa/lisää keikka/info)
  assets/{bandrock.css, render.js, router.js}
  data/{index.json, ray-jone.json}
  img/, fonts/
worker/  (vaihe 1: koskematon D1-versio; vaihe 2: R2-versio)
wrangler.toml    test/    package.json    README.md
```

**Versiot:** Node 22, `actions/checkout@v7`, `actions/setup-node@v7`. Pages-actionit `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4`. Testit `node:test` (ei riippuvuuksia). `wrangler` on devDependency (`npm install`), jotta `npx` ei tarvitse lukittavaa välimuistia.

## 4. Epicit ja tiketit

Tiketit 1–12 koskevat vanhaa yhden-bändin sivua (osa on yhä ajan tasalla, osa korvautuu vaiheessa 2 — merkitty alla). Uudet BandRock-tiketit alkavat numerosta 13.

```json
{
  "epicit": [
    { "id": "sivu",     "nimi": "🎸 Bändisivu (historia)",   "tiketit": [1, 2, 3, 4], "valmius": 100 },
    { "id": "keikat",   "nimi": "🎤 Keikkailmoitukset (D1, korvautuu vaiheessa 2)", "tiketit": [5, 6, 7], "valmius": 98 },
    { "id": "suojaus",  "nimi": "🛡️ Suojaus ja piilotus (D1-versio)", "tiketit": [8, 9], "valmius": 35 },
    { "id": "julkaisu", "nimi": "🚀 Julkaisu",               "tiketit": [10, 11, 12], "valmius": 83 },
    { "id": "bandrock", "nimi": "⚡ BandRock-alusta",         "tiketit": [13, 14, 15, 16], "valmius": 96 }
  ],
  "tiketit": [
    { "id": 1, "epic": "sivu", "nimi": "Portaa sivu tavalliseksi HTML:ksi", "effort": "S", "riippuvuudet": [], "status": "done",
      "acceptance_criteria": ["Ei riippuvuutta Claude Designin runtimeen", "Kuvat ja fontit tiedostoina kansiossa public/", "Sivu näyttää samalta kuin alkuperäinen (verrattu kuvakaappauksin, myös 390 px:n leveydellä)", "Toimii alipolulla /Nekalamaba/ (todennettu livenä 21.9.2026: sivu, kuvat ja fontit vastaavat 200)"], "valmius": 100 },
    { "id": 2, "epic": "sivu", "nimi": "Iso logo otsikoksi", "effort": "S", "riippuvuudet": [1], "status": "done",
      "acceptance_criteria": ["Logo on sivun otsikko ja selvästi nykyistä isompi", "Toimii puhelimella"], "valmius": 100 },
    { "id": 3, "epic": "sivu", "nimi": "YouTube ja soittimet", "effort": "S", "riippuvuudet": [1], "status": "done",
      "acceptance_criteria": ["Bändin video toistuu sivulla eikä vie pois", "Ilmoitukseen voi liittää YouTube-, Spotify- tai SoundCloud-linkin ja soitin aukeaa napista", "Bändin Spotify-artistisoitin näkyy Kuuntele-osiossa ja Spotify-linkki Bookingissa (todennettu selaimella)", "YouTube-video latautuu livenä https-osoitteessa (todennettu 21.9.2026; file://-osoitteessa YouTube ei toimi)"], "valmius": 100 },
    { "id": 4, "epic": "sivu", "nimi": "Sähköposti Booking-osioon", "effort": "S", "riippuvuudet": [1], "status": "done",
      "acceptance_criteria": ["nekalabama@gmail.com on mailto-linkkinä puhelinnumeron vieressä"], "valmius": 100 },
    { "id": 5, "epic": "keikat", "nimi": "D1-taulu ja migraatio", "effort": "S", "riippuvuudet": [], "status": "done",
      "acceptance_criteria": ["worker/migrations/0001_init.sql luo taulun gigs (id, created_at, date, time, artist, venue, city, url, embed, note, status)", "Migraatio toimii paikallisessa D1:ssä"], "valmius": 100 },
    { "id": 6, "epic": "keikat", "nimi": "Worker-API: GET ja POST /gigs", "effort": "M", "riippuvuudet": [5], "status": "done",
      "acceptance_criteria": ["GET palauttaa valmiin listan: vain status=visible ja date >= tänään (Europe/Helsinki), enintään 200, aikajärjestyksessä", "POST validoi ja siivoaa kentät ja pituudet palvelimella ja hylkää virheelliset (400)", "Vain https-linkit sallitaan; soitinlinkeistä rakennetaan upotusosoite palvelimella", "CORS sallii vain Pagesin osoitteen", "Tuntiraja 30 ilmoitusta (429)", "Validoinnin ja soitintunnistuksen testit läpi (18 kpl)"], "valmius": 100 },
    { "id": 7, "epic": "keikat", "nimi": "Lomake ja lista sivulle", "effort": "M", "riippuvuudet": [1, 6], "status": "review",
      "acceptance_criteria": ["Kuka tahansa voi lähettää ilmoituksen ilman kirjautumista", "Sivu hakee listan Workerilta (API_URL-vakio) ja uusi ilmoitus näkyy listassa", "Käyttäjän teksti näytetään vain textContent:llä, linkeissä rel=\"nofollow ugc noopener\"", "Tyhjä lista näkyy tyhjänä, ilman tekstiä", "Lisää keikka aukeaa napin takaa ikkunassa (ei lomaketta sivulla)", "Lähetys, virheet, ä/ö, HTML-yritys, soittimen avaus ja 390 px:n näkymä todennettu selaimella paikallisesti (26 tarkistusta); julkaistulla sivulla odottaa Workerin julkaisua"], "valmius": 95 },
    { "id": 8, "epic": "suojaus", "nimi": "Turnstile-botintorjunta", "effort": "M", "riippuvuudet": [6, 7], "status": "todo",
      "acceptance_criteria": ["Lomakkeessa on Turnstile-widget", "Worker varmistaa tokenin Siteverifyllä ennen tallennusta", "Ilman kelvollista tokenia POST palauttaa 403"], "valmius": 0 },
    { "id": 9, "epic": "suojaus", "nimi": "Ilmoituksen piilotus", "effort": "S", "riippuvuudet": [6], "status": "review",
      "acceptance_criteria": ["status='hidden' poistaa ilmoituksen listasta (toteutettu SQL-suodatuksena, ei vielä testattu erikseen)", "README kertoo miten piilotus tehdään"], "valmius": 70 },
    { "id": 10, "epic": "julkaisu", "nimi": "wrangler.toml", "effort": "S", "riippuvuudet": [6], "status": "done",
      "acceptance_criteria": ["Projektin juuressa: name, main=worker/src/index.js, compatibility_date, ALLOWED_ORIGINS ja D1-sidonta DB (ei salaisuuksia)", "npm run deploy:worker -- --dry-run läpi juuresta"], "valmius": 100 },
    { "id": 11, "epic": "julkaisu", "nimi": "GitHub Actions → Pages -julkaisu", "effort": "M", "riippuvuudet": [1], "status": "done",
      "acceptance_criteria": ["Push main → testit → julkaisu GitHub Pagesiin", "Pull request ajaa vain testit", "Epäonnistunut testi estää julkaisun", "Ajo #2 (57182f9) meni läpi 21.9.2026 ja sivu on livenä. Ajo #1 kaatui, koska Pages ei ollut vielä päällä."], "valmius": 100 },
    { "id": 12, "epic": "julkaisu", "nimi": "Cloudflare-käyttöönotto ja README", "effort": "M", "riippuvuudet": [10, 11], "status": "in_progress",
      "acceptance_criteria": ["Infinite: npm install, npx wrangler login, D1 luotu (wrangler d1 create), database_id wrangler.toml:iin, migraatio ajettu (--remote), wrangler deploy ajettu", "Workerin osoite API_URL-vakioon sivulla", "GitHubin Settings → Pages → Source: GitHub Actions (repo julkinen)", "README: ilmoituksen lisäys, piilotus ja julkaisu (kirjoitettu)", "Sivu aukeaa osoitteessa samppafin.github.io/Nekalamaba (tehty, Pages päällä) ja lista latautuu Workerilta (odottaa Workerin julkaisua)"], "valmius": 50 },
    { "id": 13, "epic": "bandrock", "nimi": "Reititys ilman build-vaihetta (BandRock/<nimi>#ankkuri)", "effort": "M", "riippuvuudet": [], "status": "done",
      "acceptance_criteria": ["404.html ohjaa index.html:ään ?p=-parametrilla, ei kovakoodattua repon nimeä", "router.js laskee sivuston juuren import.meta.url:stä ja palauttaa siistin osoitteen ennen piirtoa", "Suora syvälinkki (esim. .../ray-jone#kuuntele) toimii kuten oikea GitHub Pages -kävijä kokisi (testattu simuloidulla palvelimella, joka tarjoaa 404.html:n statuksella 404 tuntemattomille poluille)", "Ankkuri sekä vierittää että siirtää näppäimistöfokuksen"], "valmius": 100 },
    { "id": 14, "epic": "bandrock", "nimi": "JSON-pohjainen renderöijä (render.js)", "effort": "M", "riippuvuudet": [], "status": "done",
      "acceptance_criteria": ["renderDetail piirtää saman ulkoasun kuin vanha käsinkirjoitettu sivu (hero/logo tai tekstivaihtoehto, kuvatekstit, bio, kuuntele, keikat vuosiotsikoin ja mennyt/tuleva-himmennyksin, yhteystiedot)", "Osiot piirtyvät vain jos JSON:ssa on sisältöä", "renderCard piirtää kompaktin ruudukkokortin samasta datasta", "Ray Jonen data on data/ray-jone.json:ssa, sisältää löydetyt keikkalinkit (Pub Armo, Haikan lava)"], "valmius": 100 },
    { "id": 15, "epic": "bandrock", "nimi": "Etusivu: ruudukko, suodattimet, info-ikkuna", "effort": "M", "riippuvuudet": [13, 14], "status": "done",
      "acceptance_criteria": ["Ruudukko + \"Luo uusi bändi\" -kortti", "Neljä suodatinta (tyyppi/kaupunki/ajankohta/tekstihaku) toimivat ja yhdistyvät oikein", "\"Mikä on BandRock?\" -ikkuna selittää tarkoituksen ja näyttää Ray Jonen kortin esikatseluna, josta pääsee suoraan sivulle", "axe-core puhtaana sekä ruudukossa että bändisivulla", "390 px ei vaakavieritystä kummallakaan näkymällä"], "valmius": 100 },
    { "id": 16, "epic": "bandrock", "nimi": "Luonti, muokkaus koodilla ja lisää keikka — käyttöliittymä + Worker/R2", "effort": "L", "riippuvuudet": [15], "status": "review",
      "acceptance_criteria": ["worker/src/schema.js + code.js + R2-reitit (GET/POST/PATCH/DELETE /api/posters, POST /api/posters/:id/gigs), id ≠ koodi -periaate toteutettuna", "Client kytketty oikeaan API:in API_URL-vakiolla, Vaiheen 1 staattinen varakäytös säilyy kun API_URL ei ole määritetty", "Paikallinen wrangler dev + R2 -kierto testattu selaimella: luo→koodi näkyy kerran→muokkaus koodilla onnistuu→väärä koodi hylätään ja ohjaa takaisin koodikyselyyn→keikan lisäys koodilla→poisto koodilla, kaikki 20 tarkistusta ja axe-core läpi", "28 yksikkötestiä (schema/code/media) läpi", "Nopeusrajoitin (ratelimits) testattu: 21. pyyntö 60 s:ssä saa 429", "Julkaisu (Infinite, tekemättä): wrangler login, R2-ämpärin luonti, CODE_SECRET+TURNSTILE_SECRET, wrangler deploy, API_URL päivitys, tuotantosiemennys"], "valmius": 85 }
  ]
}
```

- `effort`: S = tunteja, M = päivä, L = 2–3 päivää. `valmius` 0–100, päivitetään kun tiketti valmistuu.
- Pidä tiketit pieninä ja hyväksymiskriteerit selkeinä. Ei ominaisuuksia, joita ei ole tiketeissä.

## 5. Päätökset

**Päätetty (Infinite, 22.9.2026) — BandRock-pivotti**
- Sivusta tulee alusta ("BandRock") jolla kuka tahansa bändi saa oman sivun. Ray Jonen sivu on ruudukon ensimmäinen kortti.
- **Repo nimetty uudelleen** `Nekalamaba` → `BandRock` (Infinite teki GitHubin asetuksista 22.9.2026, koska tässä ympäristössä ei ole `gh`-komentoriviä). Osoite on nyt `samppafin.github.io/BandRock/`, vanha `.../Nekalamaba/` on 404. Todennettu livenä: etusivu, syvälinkki `BandRock/ray-jone` 404-tempun kautta ja `data`/`assets`-polut toimivat kaikki ilman koodimuutosta, koska sivuston juuri lasketaan aina ajonaikaisesti.
- Ray Jonen sivua muokataan kiinteällä koodilla **00000** (`data/ray-jone.json`:n `editCode`). Tarkoituksella tunnettu/julkinen koodi, ei salaisuus — eri asia kuin tulevaisuudessa satunnaisesti luotavat, salassa pidettävät koodit.
- Neljä suodatinta (tyyppi/kaupunki/ajankohta/tekstihaku), kuvien lataus jätetty myöhemmäksi (ei pyydetty tässä).
- Keikoille etsittiin www-linkit vain tuleville: Pub Armo → heidän Facebook-sivunsa (oma verkkotunnus `pubarmo.fi` ei vastaa DNS:ssä, vaikka on hakukoneen indeksissä), Haikan lava → `haikanlava.fi`. Kullaa Rock'n'Roll Rumblelle ei löytynyt varmaa virallista sivua vuodelle 2027, ei linkattu.
- Suunnitelma kokonaisuudessaan: `C:\Users\User\.claude\plans\ok-sitten-mietit-n-t-toasty-seal.md`.

**Päätetty (Infinite, 22.9.2026) — käyttöliittymäkorjaukset julkaisun jälkeen**
- **Keikkalista jaettu kahtia:** tulevat keikat aina näkyvissä, lähin ensin (nouseva järjestys — ei enää sama laskeva järjestys kuin mennet). Mennet keikat piilossa natiivin `<details>/<summary>`-elementin takana ("Menneet keikat (N)"), jottei lista veny liian pitkäksi. Ei enää himmennystä (`.gig.past`, opacity) — piiloutuminen itsessään riittää erottamaan mennet. `render.js`: `renderGigList` korvautui `renderGigSection`illa.
- **Soitinlinkki lisätty luonti- ja muokkauslomakkeeseen** (`media`-kenttä). Palvelin tuki sitä jo (`schema.js`), mutta kenttä puuttui käyttöliittymästä — huomattu vasta kun Infinite kysyi. `renderDetail` osaa nyt näyttää yksinkertaisen klikkaa-avautuu-soittimen (`poster.embed`) myös ilman kuratoitua `listen`-objektia (kansikuva, video), jota vain Ray Jonella on.
- **Laajempi linkkilista (nettisivu, liput, some useampana) ei vielä tehty** — kysytty Infinitiltä, odottaa vastausta. Nykyinen skeema tukee vain yhtä `media`-linkkiä per ilmoitus.

**Päätetty (Infinite, 22.9.2026) — sivun ulkoasu (ennen pivottia, yhä voimassa)**
- Uusi logo (`public/img/logo-full.jpg`, 1205×548, musta JPEG, koko bändin nimi kirjoitettuna) korvaa otsikon kokonaan: `<h1>` sisältää nyt vain logokuvan (`alt`-teksti kantaa nimen saavutettavuuteen), erillinen "Ray Jone" / "& The Nekalabama Thunderstorm" -teksti poistettu turhana toistona. `mix-blend-mode: screen` sulattaa kuvan mustan taustan sivun taustaan saumattomasti. Nav-valikon ja favicon-ikonin `logo.png` ei muuttunut.
- Bändikuvaan (`.photo`) lisätty `<figure>/<figcaption>`: kuvaaja Elmo Romppanen ja neljä jäsentä soittimineen.
- Keikkahistoria (14.6.2025–3.7.2027, 16 keikkaa) kovakoodattu suoraan `#gigs`-listaan yhtenä aikajärjestyksessä olevana listana vuosiotsikoilla (2025/2026/2027). Menneet keikat (13 kpl) näytetään himmeinä (`.gig.past`, opacity 0.6, päivämäärä ei kultainen); kolme tulevaa (26.9.2026, 17.10.2026, 3.7.2027) näkyvät normaalisti korostettuina.
  - ✅ **Riski ratkaistu 22.9.2026 BandRock-pivotin myötä:** R2:n `gigs`-taulukko (toisin kuin vanha D1-skeema) ei suodata menneitä pois — se on osa ilmoituksen omaa JSON:ia sellaisenaan. `worker/seed-local.mjs` siirtää kaikki 16 keikkaa R2:een, joten historia säilyy myös Workerin julkaisun jälkeen, kunhan siemennys tehdään myös tuotanto-R2:een (README kohta 2).

**Päätetty (Infinite, 21.9.2026)**
- Tietokanta on **D1**.
- Avoin ilmoitus ilman kirjautumista ja heti näkyvänä. Testikäyttäjiä on vähän. Rekisteröinti ja sensuuri mietitään myöhemmin.
- Kenen tahansa keikka kelpaa (kenttä "Kuka esiintyy").
- Logo suurennetaan (ei erillistä tiedostoa). Https-linkit sallitaan.
- Ilmoituksiin saa liittää YouTube-, Spotify- tai SoundCloud-linkin. Soitin näytetään ilmoituksessa.
- Nopeus ennen viimeistelyä: sivu ylös ensin.
- "Lisää keikka" on napin takana (ikkuna), ei lomakkeena sivulla. Jos keikkoja ei ole, lista näkyy tyhjänä ilman tekstiä.
- Bändin oma Spotify-artistisoitin ja -linkki lisätty (artisti `6MZ5sOhKDci1bYweyqJBj7`, vahvistettu Spotifyn oEmbedillä).

**Avoimet**
- Turnstile ennen kuin sivua jaetaan laajemmin (tiketti 8).
- Oma domain (nyt `samppafin.github.io` ja `workers.dev`).
- Bandcamp-, Apple Music- ja Vimeo-soittimet, jos halutaan.
## 6. Vastausprotokolla

Jokainen vastaus alkaa lyhyellä otsikolla. Se on tehty luettavaksi nopeasti.

```
🎸 Roudari · vuoro 5 · varmuus 75 %
✅ Varmaa: yksi lyhyt lause
🤔 Oletan: yksi lyhyt lause (riski: …)
❓ Kysyn: yksi selkeä kysymys
🃏 Jokeri: vapaa heitto, vain jos on jotain sanottavaa
```

**Muoto**
- Otsikko on enintään 5 riviä. Jokainen rivi on yksi lyhyt lause.
- Rivin voi jättää pois, jos siinä ei ole mitään. Otsikkorivi ja ✅ ovat aina.
- Ei viivoja, laatikoita eikä pitkiä luetteloita otsikossa.
- Vuoro kasvaa jokaisella viestillä ja nollautuu uudessa sessiossa.

**Kieli**
- Suomea, arkikieltä ja lyhyitä lauseita.
- Ei englanninkielisiä sanoja, jos suomi käy. Tekninen termi selitetään kerran sulkeissa.

**Varmuus**
- 90–100 %: selvää, etene.
- 70–89 %: pieniä epäselvyyksiä, kerro oletukset.
- 50–69 %: isoja oletuksia, etene varoen.
- Alle 50 %: pysähdy ja kysy.
- Jos ❓ ei ole tyhjä ja varmuus on alle 70 %, älä koodaa vaan kysy ensin.

**Otsikon jälkeen**
1. Ensin tulos tai vastaus 1–3 lauseella.
2. Sitten lisätiedot, vain jos tarvitaan.
3. Mitä Infinitin pitää tehdä, omalle riville lihavoituna: **Sinun vuorosi:**
4. Kysymykset numeroituina, enintään 3 kerralla, oletus lihavoituna.
5. Monivaiheisessa työssä lyhyt suunnitelma (3–5 riviä, muoto "askel → tarkistus").
6. Jos jokin tarkistus epäonnistuu, sano se heti ensimmäisenä. Älä ohita sitä hiljaa.

## 7. Koodaussäännöt

1. **Mieti ensin.** Älä oleta, tuo kompromissit esiin. Jos tulkintoja on useita, listaa ne 🤔:ssa.
2. **Yksinkertaisuus.** Minimaalinen koodi, ei spekulatiivista, ei pyytämättömiä ominaisuuksia.
3. **Kirurgiset muutokset.** Koske vain mitä on pakko, älä paranna vieressä olevaa. Liittymättömästä kuolleesta koodista mainitaan, sitä ei poisteta.
4. **Tavoitelähtöisyys.** Määritä onnistumiskriteeri ja todenna se (testi tai ajo) ennen kuin sanot valmiiksi.

**Projektin omat säännöt**
- **Pysy tämän projektin kansiossa.** Muita projekteja (esim. Klitoritari-FinalFantasy) vain luetaan, ja vain kun Infinite osoittaa mallin. Niihin ei kirjoiteta. Muiden projektien prosesseja ei sammuteta.
- Käyttäjän kirjoittama teksti näytetään vain `textContent`:llä, ei koskaan `innerHTML`:llä.
- Käyttäjän antamaa osoitetta ei koskaan käytetä sellaisenaan iframen lähteenä. Palvelin tunnistaa palvelun ja rakentaa osoitteen.
- Palvelin validoi aina. Selaimen tarkistus on vain käyttömukavuutta.
- Render-funktio korvaa sisällön eikä lisää siihen (ei `innerHTML +=` silmukassa, se duplikoi).
- Ei commitointia eikä pushia ilman Infinitin lupaa.
- Salaisuuksia (tokenit, Turnstile secret) ei koskaan tiedostoihin eikä keskusteluun. Vain Worker-secret tai GitHub secrets.
- Alkuperäistä bundle-HTML:ää ja `Madrid_kansi.jpg`:tä ei muokata.

**Opit (älä toista)**
- `wrangler`-komennot ajetaan aina projektin juuresta, jossa `wrangler.toml` on. Muualta ajettuna se alkaa arvailla projektia (autoconfig).
- Paikallisessa testissä portti 8787 voi olla varattu vanhalla `workerd`-prosessilla (esim. Klitoritarin). Käytä toista porttia (`--port 8799`) äläkä sammuta vierasta prosessia.
- Skandit testeissä: älä lähetä `curl -d 'ä'` Bashista Windowsissa (merkistö hajoaa). Tee testi Node-tiedostosta, joka on tallennettu UTF-8:na.
- Älä suodata testituloksia `grep`illä niin, että virheet katoavat. Katso koko tuloste, kun tulos on tyhjä.
- `npx wrangler` kaatui Windowsissa `EBUSY`-virheeseen, koska vanhat `wrangler dev` -prosessit lukitsivat npx-välimuistin. Ratkaisu: `wrangler` asennettu projektiin (`npm install`), ei `npx wrangler@4`.
- `width`/`height`-attribuutit kuvissa asettavat myös CSS-korkeuden, joka kumoaa `aspect-ratio`n ja venyttää kuvan. Kuville tarvitaan `height: auto`.
- Oma `display`-sääntö kumoaa `hidden`-attribuutin. Tarvitaan `[hidden] { display: none !important }`.
- `flex-basis` koskee pääakselia: pystysuunnassa se asettaa **korkeuden**, ja `aspect-ratio` venyttää silloin leveyden. Rivikohtaiset flex-arvot vain container queryn sisään.
- Spotifyn upotuksen valkoinen alue on **sen oman kehyksen sisällä**, joten CSS ei ylety siihen — ei taustaväriä, ei läpinäkyvyyttä. Upotus piirtää kahta eri asettelua: joskus täyden 152 px:n soittimen, joskus matalan version ja valkoista alle. Laatikon rajaaminen matalaksi leikkasi toistonapin pois. Ratkaisu: laatikko on musta ja soitin ladataan vasta napista, kuten keikkariveillä.
- Kun laatikolla on 1 px reunat ja `box-sizing: border-box`, `height: 152px` jättää sisällölle 150 px. Upotukselle varataan 154 px.
- `npm install --no-save X` poistaa muut tallentamattomat paketit. Testipaketit (axe-core, pngjs) asennetaan samalla komennolla.
- Testit eivät nähneet näitä kolmea vikaa — kuvakaappaus näki. Katso kuvat aina itse.
- Headless Chrome ei tee alle noin 500 px leveää ikkunaa. Testaa kapea näkymä iframessa, jonka leveys on 390 px.
- Tässä ympäristössä ei ole `gh`-komentoriviä (ei Bashissa eikä PowerShellissä) vaikka yleisohje käskee käyttää sitä. GitHub-tason toimet (repon uudelleennimeäminen ym.) pitää pyytää Infinitiltä tai tehdä REST-API:n kautta tokenilla, jota ei ole.
- Kun sivu voi elää millä tahansa GitHub Pages -alipolulla, älä kovakoodaa repon nimeä mihinkään (ei 404.html:ään, ei skripteihin). `new URL('..', import.meta.url).pathname` moduulin sisällä antaa sivuston todellisen juuren ajonaikaisesti, oli repo nimeltään mikä tahansa.
- Staattisen sivun testaus vaatii oman testipalvelimen, joka jäljittelee GitHub Pagesin 404-käytöstä (tuntematon polku → `404.html`:n sisältö statuksella 404, sisältö alipolun `/<repo>/` alla) — tavallinen tiedostopalvelin ei riitä reititystempun todentamiseen.
- `render.js`:n `<ol class="gigs">`-listalla ei ole enää `id="gigs"` — osio itse kantaa id:n (`#keikat`). Vanhat testit jotka etsivät `#gigs` pitää päivittää `#keikat .gig`:ksi.
- Wranglerin tarkat TOML-kentät (`r2_buckets` = `binding`/`bucket_name`, `ratelimits` = `name`/`namespace_id`/`simple.{limit,period}`) eivät löytyneet `node_modules/wrangler/config-schema.json`:sta (osittainen skeema) — oikeat kentät löytyivät `node_modules/wrangler/wrangler-dist/cli.d.ts`:stä. Tarkista aina .d.ts, jos config-schema.json ei anna vastausta.
- `miniflare`-kirjaston suora käyttö (`new Miniflare({...})`) paikallisen R2:n siementämiseen epäonnistui: asennettu versio (5.x-alpha) vaatii uuden `{workers:[...]}`-muotoisen asetusrakenteen eikä vanhaa `{script, modules:true}`-mallia. Toimiva ratkaisu: `wrangler`-paketin oma `unstable_dev(scriptPath, {config, local:true, persist:true})` — se käyttää samaa paikallista R2-tilaa kuin `wrangler dev` ja piilottaa Miniflaren sisäisen skeeman. `worker/seed-local.mjs` tekee tämän kirjoittamalla tilapäisen yhden-reitin siemenworkerin levylle, ajaa sen `unstable_dev`illä ja poistaa lopuksi.
- Paikallinen R2-emulaatio (`.wrangler/state/v3/r2/`) säilyy `wrangler dev`in ajojen ja siemenskriptin ajojen välillä (tiedostopohjainen) — jos haluat puhtaan tilan testiä varten, pysäytä `wrangler dev` ensin (tiedostolukot), poista kansio, siemennä uudelleen, käynnistä `wrangler dev` uudestaan.
- `ratelimits`-sidonta **toimii paikallisessa `wrangler dev`issä** (toisin kuin epäilin aiemmin) — näkyy dev-lokissa (`env.RATE_LIMITER (20 requests/60s) Rate Limit local`) ja oikeasti palauttaa 429:n rajan ylittyessä. Ei tarvitse olettaa toimimattomaksi paikallisesti.
- Bugi jonka selaintesti löysi: "Muokkaa koodilla" -nappi oli ehdollistettu `poster.editCode`:n olemassaololla — toimi vain Vaiheen 1 staattiselle esimerkille, muttei koskaan yhdellekään oikealle, Workerilla luodulle ilmoitukselle (palvelin ei koskaan palauta sitä kenttää, kuten pitääkin). Jos jokin ehto perustuu kenttään jonka tiedät tarkoituksella poistavasi vastauksista, tarkista ettei se sama ehto jää piilottamaan koko toimintoa julkaistussa versiossa.
- **Tekijän CSS voittaa aina selaimen sisäisen `<details>`-piilotuksen.** `.gigs { display: flex }` kumosi selaimen oman "piilota suljetun detailsin sisältö" -oletuksen, koska mikä tahansa tekijän (author-origin) sääntö ohittaa UA-tyylin riippumatta spesifisyydestä. Kun asetat `display`-arvon jollekin, joka voi joskus olla `<details>`-elementin sisällä, tarvitset eksplisiittisen `details:not([open]) > .se-luokka { display: none }` -säännön.
- Testivirhe ei aina ole tuotantovirhe: kaksi "epäonnistunutta" tarkistusta tässä kierroksessa olivat oman testini väärät odotukset (26.9. on kronologisesti ennen 17.10., ei jälkeen — laskuvirhe minulta), eivät koodivirheitä. Tarkista aina kumpi puoli on väärässä ennen korjaamista.
- Nappi joka on olemassa vain yhdessä näkymässä (esim. `create-open` vain ruudukossa) kaatuu `null.click()`-virheeseen jos testi ei ensin navigoi oikeaan näkymään. Selainajon `document.getElementById('brand-link').click()` palauttaa ruudukkoon ennen ruudukko-kohtaisten elementtien käyttöä.

🎸

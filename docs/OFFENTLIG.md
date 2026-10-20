# Gør HUBTECH offentlig

Denne guide gør to ting klar: **repository'et på GitHub** (koden bliver offentlig) og **serveren** (andre kan oprette
konti og bruge Fællesskab).

## 1. Signeringsnøglen til Android-appen (gøres én gang)
Android-appen skal altid signeres med den samme nøgle – ellers kan en ny version ikke installeres oven på den gamle.
Nøglen må ikke ligge i et offentligt repository, så den ligger i **GitHub Secrets**:

1. Gå til repository'et på GitHub → **Settings → Secrets and variables → Actions → New repository secret**.
2. Opret `HUBTECH_KEYSTORE_B64` med indholdet af filen `HUBTECH_KEYSTORE_B64.txt` (én lang linje).
3. Opret `HUBTECH_KEYSTORE_PASSWORD` med adgangskoden fra `HUBTECH_KEYSTORE_PASSWORD.txt`.
4. Gem begge filer et sikkert sted (fx din adgangskodemanager) og slet dem derefter fra Overførsler.

Næste push til `main` bygger APK'en med nøglen fra Secrets. Mangler den, stopper bygget med en tydelig fejl.

Vil du bygge lokalt i Android Studio, så læg din egen `hubtech-local.keystore` i `android/app/` og sæt
miljøvariablerne `HUBTECH_KEYSTORE_PASSWORD` og `HUBTECH_KEY_PASSWORD`. Keystore-filer ignoreres af git.

## 2. Gør repository'et offentligt
**Settings → General → Danger Zone → Change repository visibility → Public.**
Historikken er samlet i én commit uden den gamle nøgle og uden din private e-mail.
Tænd også **Settings → Code security → Private vulnerability reporting** (se `SECURITY.md`).

Når repository'et er offentligt, virker opdateringer inde i Android-appen (Indstillinger → Telefon → Søg efter opdatering),
fordi `version.json` på grenen `ci` så kan hentes.

## 3. Åbn serveren for andre
| Indstilling | Værdi | Hvorfor |
|---|---|---|
| `HUBTECH_SIGNUP` | `open` | Alle kan oprette en konto (standard er `first`: kun ejeren) |
| `HUBTECH_SECURE_COOKIES` | `true` | Cookies kun over HTTPS |
| `HUBTECH_HOST` | `127.0.0.1` | Lyt kun lokalt – lad HTTPS-proxyen tage imod trafikken |

Skriv dem i `.env` ved siden af `server/` (filen kommer aldrig med i git).

**HTTPS** er påkrævet (kamera, snaps og “installér som app” virker kun over HTTPS):
- **Tailscale Funnel** (nemmest): `tailscale funnel 8090` giver en offentlig `https://…ts.net`-adresse.
- **Caddy/nginx** med Let's Encrypt på din egen domæne foran `http://127.0.0.1:8090`.

## 4. Før du åbner for alle
- Læs og tilpas `web/legal/regler.html`, `privatliv.html` og `vilkaar.html` (du er dataansvarlig for din server).
- Sæt automatisk sikkerhedskopi til under **Indstillinger → Data**.
- Anmeldelser fra hele platformen ses af ejeren under **Fællesskab → Anmeldelser**.
- Fællesskab har aldersgrænse 13 år, anmeld/blokér, moderatorer, langsom tilstand og ordfilter.

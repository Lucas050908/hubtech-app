# Sikkerhed

## Rapportér et sikkerhedshul
Skriv **ikke** et offentligt issue. Brug i stedet GitHubs *Report a vulnerability* under fanen **Security** i
repository'et (private vulnerability reporting). Beskriv, hvad du fandt, og hvordan det kan gentages. Du får svar
hurtigst muligt.

## Hvad der allerede er gjort
- Adgangskoder: scrypt (eller PBKDF2-SHA256 med 600.000 iterationer) med unikt salt.
- Sessioner: tilfældigt 256-bit token i en `HttpOnly; SameSite=Lax`-cookie. Sæt `HUBTECH_SECURE_COOKIES=true` bag HTTPS.
- CSRF: alle ændringer kræver `X-Requested-With: hubtech` og samme `Origin`.
- Begrænsning af login-forsøg og af skrivende forespørgsler pr. konto og IP.
- Streng CSP (`script-src 'self'`), ingen eksterne scripts. Uploads tjekkes på indhold og serveres med `sandbox`.
- App-værkstedets apps kører i et eget, tomt origin (CSP `sandbox` uden `allow-same-origin`).
- Roller håndhæves på serveren (ejer, medlem; i Fællesskab: ejer, admin, moderator, medlem).
- Signeringsnøglen til Android ligger ikke i koden, men i GitHub Secrets.

## Drift
Kør HUBTECH bag HTTPS, hvis den kan nås fra internettet (fx Tailscale Funnel eller en reverse proxy med Let's Encrypt),
og hold Python opdateret. Se `docs/OFFENTLIG.md`.

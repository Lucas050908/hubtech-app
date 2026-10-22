# Privatlivspolitik for HUBTECH

*Gælder fra 22. oktober 2026 · Udgiver: Lucas Valentin · Kontakt: HUBTECH2025@proton.me*

**Kort fortalt:** HUBTECH kører på din egen computer eller telefon. Dine data gemmes dér – ikke hos os. Vi (udgiveren) modtager, sælger eller deler ingen af dine data, og appen indeholder ingen reklamer og ingen sporing.

## Hvad HUBTECH gemmer – og hvor

HUBTECH er en server, der kører på din egen enhed. Alt, hvad du laver, gemmes i en database på den enhed, HUBTECH kører på (på Windows i mappen `.hubtech` i din brugermappe, på Android inde i appen):

- **Din konto:** brugernavn, navn, valgfri e-mailadresse, profilbillede og din adgangskode (gemt krypteret – den kan ikke læses af nogen).
- **Det, du laver i apps:** noter, opgaver, kalender, Office-dokumenter, beskeder i Fællesskab, serverens egne emojis (billeder, som moderatorer uploader, og som alle medlemmer kan se), indstillinger osv.
- **Tekniske fejl:** hvis noget går galt i appen (fx når AI-assistenten ikke kan starte), gemmes en kort fejlbeskrivelse på samme enhed, så ejeren af HUBTECH kan se den. Der gemmes ingen samtaler eller indtastninger i den.

Den person, der har installeret HUBTECH på sin computer ("ejeren"), kan se listen over brugere på sin HUBTECH og administrere dem. Andre brugere kan se det, de selv eller deres venner har delt med dem.

## Når du bruger HUBTECH sammen med andre

- **Chat og deling** foregår via den HUBTECH-server, I er forbundet til (typisk ejerens computer). Beskeder sendes ikke til os.
- **Opkald** går direkte mellem jeres enheder (WebRTC). For at finde vej mellem to netværk spørger appen offentlige STUN-servere (fra Google og Cloudflare) om din offentlige IP-adresse. Lyd og billede går ikke gennem dem. Har ejeren sat en TURN-server op, kan opkaldet blive sendt krypteret gennem den.
- **Mikrofon og kamera** bruges kun, mens du er i et opkald, tager et billede eller selv starter en test. Intet optages eller gemmes.
- **Spil sammen og toplister:** Spiller du online (fx Fire på stribe, Skak, Yatzy, Quizbrættet, Tegn og gæt eller Fart-tast), ser de andre i spillet dit navn, dit profilbillede, dine træk, dine tegninger og dine gæt. Andre på samme HUBTECH kan se med i spil, der er i gang. Spil gemmes kun, mens de står på; de slettes, når de er slut. På toplisterne kan alle på samme HUBTECH se dit navn og dit bedste resultat.
- **Kasino** spilles kun om point. Der kan aldrig bruges, vindes eller købes rigtige penge.
- **"Venner på andre netværk"** bruger tjenesten Tailscale, hvis ejeren selv slår det til. Så går trafikken til ejerens HUBTECH krypteret gennem Tailscale. Se Tailscales privatlivspolitik: https://tailscale.com/privacy-policy

## Tjenester, appen kan kontakte

HUBTECH kontakter kun andre tjenester, når det er nødvendigt for en funktion, du bruger:

| Tjeneste | Hvornår | Hvad sendes |
| --- | --- | --- |
| Google og Cloudflare (STUN) | Når et opkald forbindes | Din offentlige IP-adresse (for at finde vej mellem netværk) |
| Hugging Face | Når du henter en AI-model til den lokale AI-assistent | En almindelig download-forespørgsel. AI-assistenten kører derefter helt på din enhed – dine spørgsmål sendes ingen steder hen |
| GitHub | Når Android-appen tjekker for opdateringer (én gang om dagen) | En almindelig forespørgsel efter versionsnummeret |
| Microsoft Store | Opdateringer af Windows-appen | Håndteres af Windows |
| Push-tjenester (Google, Mozilla, Apple, Microsoft) | Hvis du slår notifikationer på mobilen til | En tom besked om, at der er nyt – indholdet hentes fra din egen HUBTECH |
| Din egen mailserver | Hvis ejeren har sat mail op | Mails med notifikationer til de brugere, der har slået det til |
| Tailscale | Hvis ejeren slår "Venner på andre netværk" til | Trafik til ejerens HUBTECH, krypteret |

De indbyggede klassiske websider kan hente skrifttyper fra Google Fonts.

## Dine rettigheder

- **Se og eksportere:** Indstillinger → Data & sikkerhedskopi → "Eksportér alle mine data".
- **Slette:** Indstillinger → Sikkerhed → "Slet min konto" sletter din konto og alt, der hører til den. Ejeren kan også slette konti.
- **Spørgsmål:** skriv til HUBTECH2025@proton.me.

Fordi dine data ligger på den enhed, HUBTECH kører på, er det ejeren af den HUBTECH (fx den, der har inviteret dig), der har adgang til serveren. Har du spørgsmål om dine data på en vens HUBTECH, så kontakt vedkommende.

## Børn

Fællesskab (chat) kræver, at man er mindst 13 år.

## Ændringer

Ændres politikken, opdateres datoen øverst. Den nyeste version findes altid her.

---

**English summary:** HUBTECH runs on your own computer or phone and stores your data there. The publisher receives, sells or shares none of your data; there are no ads and no tracking. Calls go directly between devices (public STUN servers by Google/Cloudflare see your IP address). Optional features contact Hugging Face (AI model download), GitHub (Android update check), push services (notifications) and Tailscale (only if the owner enables "friends on other networks"). Contact: HUBTECH2025@proton.me.

# HUBTECH — dit digitale univers

HUBTECH samler **HUBTECH**, **ByteForge**, **CircuitPilot**, dine **Cursor-projekter** og **opstartskurset for servicetekniker** i én platform med fælles login, profil, søgning, guides og en levende, animeret verden med fire årstider.

Platformen kører på din egen computer. Ingen cloud, ingen tredjeparts-scripts, ingen eksterne skrifttyper.

---

## 1. Kom i gang

**Krav:** Python 3.8 eller nyere. Git er valgfrit (bruges til git-status på projekter). Der er ingen andre afhængigheder: ingen `pip install` og ingen `npm install`.

```bash
# macOS / Linux
./start.sh                 # eller: python3 server/app.py

# Windows
start.bat                  # eller: py -3 server\app.py
```

Åbn **http://127.0.0.1:8090**. Den første konto, du opretter, bliver **platformens ejer**. Det er den eneste konto, der kan se dine lokale projekter og ændre integrationer.

Andre porte: `python3 server/app.py --port 9000`, eller sæt `HUBTECH_PORT` i `.env` (se `.env.example`).

Har du glemt din adgangskode? Kør `python3 tools/reset_password.py <brugernavn>` på samme computer.

### HUBTECH som program (anbefalet)

HUBTECH kan køre som et rigtigt skrivebordsprogram. Det får sit eget vindue uden faner og adresselinje, sit eget ikon og ingen konsol.

1. Dobbeltklik på **`Installer HUBTECH.pyw`** én gang. Det lægger et **HUBTECH**-ikon på skrivebordet og i startmenuen. På macOS havner ikonet i `~/Applications`, på Linux i programmenuen.
2. Start HUBTECH med ikonet. **`HUBTECH.pyw`** gør følgende:
   - starter serveren skjult i baggrunden (log: `~/.hubtech/hubtech.log`);
   - åbner HUBTECH i et app-vindue i Microsoft Edge eller Google Chrome (`--app`), med en separat profil i `~/.hubtech/app-profile`.
3. Når du lukker vinduet, stopper serveren, og ByteForge lukker med. Kører HUBTECH allerede, åbner ikonet bare et vindue mod den kørende server.

Under **Indstillinger → Om** kan ejeren se, om HUBTECH kører som program, og bruge **Luk HUBTECH**. Det virker kun fra den computer, serveren kører på. Platformen er også en installérbar web-app (manifest og service worker), så Edge og Chrome kan selv tilbyde "Installér HUBTECH".

### HUBTECH på telefonen (Android)

Serveren kører på computeren, og telefonen bruger den. Det sættes op under **Indstillinger → Om → HUBTECH på telefonen** (kun ejeren):

1. **På hjemmenetværket (http):** slå *Tillad adgang fra andre enheder på netværket* til.
   - Serveren genstarter og lytter på `0.0.0.0`. Valget gemmes i databasen; `HUBTECH_HOST` i `.env` går forud.
   - Scan QR-koden med telefonen. HUBTECH virker i browseren med login som normalt.
   - Brug det kun på netværk, du stoler på.
2. **Som app med eget ikon og offline (https):** Android kan kun installere web-apps og bruge service workers over HTTPS. Vi bruger **Tailscale**:
   - Installér Tailscale på computer og telefon (samme konto).
   - Kør én gang `tailscale serve --bg 8090` på computeren.
   - Åbn `https://<computer>.<tailnet>.ts.net` i Chrome på telefonen og vælg **Installér app**. Siden viser adressen og en QR-kode, når Tailscale kører.
   - Cookies bliver automatisk `Secure` bag HTTPS: HUBTECH stoler på `X-Forwarded-Proto: https`, men kun fra en proxy på samme computer.

| Mulighed | Fordele | Ulemper |
|---|---|---|
| **Tailscale serve** (valgt) | Rigtigt certifikat (Let's Encrypt via ts.net), ingen certifikater at installere og intet åbnet mod internettet. Virker også uden for hjemmet, og kun dine egne enheder har adgang. | Kræver Tailscale-app og -konto på begge enheder. |
| Selvsigneret certifikat / mkcert | Ingen ekstern tjeneste. | Certifikatet skal installeres manuelt på telefonen, og Android stoler ofte ikke på brugercertifikater i Chrome. |
| Cloudflare Tunnel / ngrok | Rigtigt certifikat, nem adgang. | HUBTECH bliver offentligt tilgængelig på internettet. Det kræver ekstra beskyttelse og sender trafik gennem tredjepart. |
| Kun http på wifi | Intet at installere. | Ingen installation som app, intet offline og ukrypteret trafik på netværket. |

**Android-app uden computeren** (`android/`): appen indeholder hele HUBTECH-serveren (Python via [Chaquopy](https://chaquo.com/chaquopy/), MIT-licens) og viser den i et WebView.

- **Data:** alt ligger i appens private lager på telefonen.
- **Automatisk synkronisering** (Indstillinger → Data & sikkerhedskopi): log ind på computerens HUBTECH én gang. Telefonen får en synkroniseringsnøgle (adgangskoden gemmes ikke) og synkroniserer derefter hvert 5., 15. eller 60. minut og hver gang appen åbnes. Lister med id (opgaver, noter, aftaler, kunder, kort, timer …) flettes punkt for punkt: det nyeste punkt vinder, og noget, der er slettet på den ene enhed, bliver også slettet på den anden. Resten (og Office-dokumenter) følger "nyeste vinder". Billeder følger med. Engangs-overførsel (hent/send alt) findes stadig.
- **Påmindelser** fra Opgaver og Kalender kommer som rigtige Android-notifikationer – også når appen er lukket og efter genstart af telefonen.
- **Widget og genveje:** widgetten *I dag* på hjemmeskærmen viser dagens aftaler og deadlines. Hold fingeren på ikonet for *Start ur*, *Ny opgave*, *Ny note* og *Kalender*.
- **Del til HUBTECH:** del tekst, links og billeder fra andre apps – de bliver til en note, en opgave eller et Office-dokument.
- **Kamera:** tag billeder direkte ind i formularer, og scan stregkoder/QR-koder i Lager og i Servicehjælps serienummerfelter (virker også med computerens webcam).
- **App-lås:** fingeraftryk, ansigt eller telefonens kode, når appen har været lukket i mere end 30 sekunder (Indstillinger → Om → Telefonen).
- **Opdatering i appen:** GitHub-byggeriet lægger APK'en og `version.json` på grenen `ci`. Appen tjekker den (Indstillinger → Om → Telefonen) og installerer en nyere version oven på den gamle. Kræver at repoet er offentligt – ellers installeres nye versioner i hånden. Adressen kan ændres med `HUBTECH_ANDROID_UPDATE_URL`.
- **Print:** kalender, noter m.m. printes via Androids udskrivning (printer eller "Gem som PDF").
- **Størrelse:** kun 64-bit ARM (alle nyere telefoner), ca. 50 MB. Første start efter installation eller opdatering pakker HUBTECH ud og tager op til et halvt minut.
- **Byg APK'en:** GitHub Actions bygger den (`.github/workflows/android.yml` → artefakten *HUBTECH-android*). Du kan også bygge lokalt i Android Studio: åbn mappen `android/` og kør *Build → Build APK(s)*. Byggeriet kopierer `server/` og `web/` ind i appen, så den altid har samme version som computeren.
- **Installation:** kopiér .apk-filen til telefonen, åbn den og tillad "Installér ukendte apps" for filhåndteringen én gang. Nye versioner installeres oven på den gamle med dine data i behold, fordi de signeres med samme nøgle (`android/app/hubtech-local.keystore`, eller din egen via `HUBTECH_KEYSTORE`).
- **Gemte filer:** eksporter og PDF'er havner i *Overførsler/HUBTECH*.
- **Ikke på telefonen:** ByteForge (separat pc-program), Cursor-projekter, opdatering fra zip og netværksdeling.

**Touch:**
- Alle knapper er mindst 40–44 px på touch-skærme.
- Office-værktøjslinjerne er én række, man kan skubbe sidelæns.
- I regnearket trykker man én gang for at vælge en celle og igen for at redigere den.
- Opgavekort flyttes med pilene på kortet.
- Landskabet starter i let tilstand på telefoner.

e2e-testen kører et Pixel 7-forløb med touch.

**Opdatering:** Har du fået en nyere HUBTECH som .zip, så vælg den under **Indstillinger → Om → Opdatering**. Det kan kun ejeren, og kun på computeren selv. Opdateringen foregår sådan:

1. HUBTECH viser versionen i zip-filen og hvor mange filer der ændres.
2. Før installationen tages en sikkerhedskopi af databasen ("Før opdatering") og af de gamle programfiler. Programfilerne gemmes i `.update-backup/` i programmappen, og de fem nyeste beholdes.
3. Kun programfiler skrives (`server/`, `web/`, `tools/`, `tests/`, `integrations/`, `sources/` og filerne i roden). `.hubtech`-mappen, `.env` og databaser røres aldrig, og intet slettes.
4. Bagefter genstarter serveren selv med den nye version.

Genvejen peger på mappen, hvor den ligger. Flytter du mappen, skal du køre `Installer HUBTECH.pyw` igen. Kør den også igen, hvis du vil fjerne genvejene. Dine data bliver ikke rørt.

---

## 2. Hvad du får

| Område | Indhold |
|---|---|
| **Forside** | Hero over det levende landskab, de fire apps, “prøv årstiderne”, holdet bag HUBTECH, Discord/mail |
| **Hjem** (efter login) | Velkomst, dine fastgjorte apps, seneste projekter, læringsforløb, årstidsvælger, profil/level, aktivitet, genveje, hurtige verdensindstillinger |
| **Dashboard** | Samlet XP og level med kilder, “Kom godt i gang”-tjekliste der følger dine faktiske handlinger, favoritter, reel status for integrationer, historik pr. dag |
| **Apps** (launcher) | Alle apps fra app-registret med status, krav og fastgørelse til menuen |
| **Projekter** | Dine rigtige Cursor-projekter: søgning, filtre, favoritter, status, samlinger, tags, noter, git-info, sprog, filer, “Åbn i Cursor”, “Vis mappe” |
| **CircuitPilot** | Den oprindelige app med alle funktioner, nu koblet til din konto (XP, badges, streaks og resultater gemmes på serveren) |
| **Guides & Læring** | 12-dages kurset med fremdrift, noter og repetition, plus 16 søgbare guides (heraf 6 fra ByteForge-guiden) med “Vis mig”-markering |
| **ByteForge** | Din egen ByteForge-server følger med, startes automatisk sammen med HUBTECH, og panelet kører direkte i appen. Den oprindelige ByteForge-guide er også med |
| **HUBTECH Office** | Kontorprogram: **Dokumenter** (tekstbehandling med typografier, farver, lister, tjeklister, tabeller, billeder og links), **Regneark** (formler med danske og engelske navne, flere ark, formatering, autosum, sortering, kopiér/indsæt fra Excel) og **Præsentationer** (layouts, temaer – også med det levende landskab – præsentationstilstand og talernoter). Skabeloner, søgning, stjerner og papirkurv. **Åbner** .docx, .xlsx, .xls, .ods, .csv, .txt, .md og .html. **Gemmer** som Word (.doc), Excel (.xlsx med formler og .xls), CSV, PowerPoint (.pptx), HTML, tekst og PDF |
| **Servicehjælp** | Servicerapporter som PDF, kalender, kunder, log, fejlsøgning, vidensbank, mapper, udgifter, kørebog, garantier og statistik – gemt på din HUBTECH-konto |
| **Klassisk HUBTECH** | De oprindelige sider (Pingochat, GameHub, chatbot, filer, kalender, den gamle forside) ligger under HUBTECH Office og vises i platformens udseende |
| **ARCHIVE-01** | Cyberdeck-projektsiden som egen app – i platformens udseende (mørk og lys) |
| **Opgaver** | Kanban-board (at gøre · i gang · færdig) med prioritet, deadline med klokkeslæt og påmindelser. Påmindelsen kommer ved deadline, 15 min eller 1 time før eller dagen før kl. 9 og vises som besked og systemnotifikation. Opgaver kan kobles til Cursor-projekter og Office-filer ("⋯ → Lav en opgave om filen" i Office), og kortene flyttes med træk-og-slip |
| **Kalender** | Én kalender for HUBTECH og Servicehjælp (Servicehjælps aftaler ligger i samme kalender). **Delte kalendere**: invitér andre brugere som *kan redigere* eller *kan se*, de accepterer i deres kalender, og alles aftaler vises live med kalenderens farve. Måneds- og listevisning med aftaler, flerdagsbegivenheder, påmindelser, danske helligdage og ugenumre. Deadlines fra Opgaver vises i kalenderen. Import og eksport som `.ics` (Google, Outlook og telefonen). Tastatur: piletaster og Enter |
| **Lager** | Komponenter og reservedele med antal, minimum, placering, leverandør, varenummer og pris. Rækkerne har +/− og advarer om lav beholdning. Indkøbslisten er grupperet pr. leverandør. CSV ind og ud (Excel-venlig, `;`) |
| **Tidsregistrering** | Start/stop-ur på kunde eller projekt, også på tværs af sider og genstart. Viser dag, uge og måned med fordeling pr. kunde. Timepris og fakturerbart beløb, manuel tilføjelse og redigering. Timesedlen kan hentes som CSV eller Excel med SUM-formler |
| **Kunder** | Én side pr. kunde, der samler timer fra Tidsregistrering, aftaler fra Kalender, servicerapporter fra Servicehjælp og opgaver – fundet ud fra kundens navn. Kunder fra de andre apps kan importeres med ét klik. **Fakturaudkast** laves af de ufakturerede timer (rundet op til kvarter) og dele fra Lager, med moms, fakturanummer og forfaldsdato, og hentes som PDF. Kladde → Sendt (trækker delene fra lageret) → Betalt; forfaldne fakturaer markeres. Timerne markeres som fakturerede, så de ikke kommer med to gange |
| **Fællesskab** | HUBTECHs egen chat. **Servere** med kanaler (tekst og musik), roller (ejer, admin, moderator, medlem), regler der skal accepteres, invitationslinks og “Opdag”. Beskeder med svar, reaktioner, @omtaler, kode, billeder, lydfiler, “skriver …”, ulæste og live-opdatering. **Venner** og private beskeder, **snaps** (billede, der kun kan åbnes én gang og kun sendes til venner) og **stories** i 24 timer. **Musikrum**: upload egne lydfiler, fælles kø, og alle hører det samme nummer på samme sted. **Moderation**: anmeld, blokér, gør tavs, smid ud, udeluk, langsom tilstand, ordfilter og moderatorlog. Aldersgrænse 13 år. Noter, aftaler, opgaver og kodestumper kan deles direkte i en chat og gemmes med ét klik hos modtageren |
| **AI-assistent** | Et pop-up-vindue (Ctrl+J eller ✨ øverst), der kører en sprogmodel **på din egen enhed** (llama.cpp i WebAssembly via wllama). Du vælger, hvor meget RAM den må bruge (0,5–4 GB) – så vælges den bedste model, der passer: Qwen 2.5 0,5B/1,5B eller Llama 3.2 1B/3B, eller din egen `.gguf`. Den læser dine noter (fx en “prompt”), opgaver, aftaler – også delte – kodestumper og kunder, og foreslår handlinger (ny aftale, opgave, note, åbn en side), som du skal godkende. I **Kodeskolen** bliver den lærer: den ser opgaven og din kode og giver hints, men ikke løsningen. Modellen hentes én gang fra Hugging Face og gemmes i browseren |
| **App-værksted** | Byg dine egne små apps i HTML, CSS og JavaScript: filfaner, kode-editor med farver, live forhåndsvisning, konsol (fejl vises med fil og linje), fortryd, “Kør automatisk”, Ctrl+Enter/Ctrl+S, hent som én HTML-fil. Fem skabeloner (tom, to-do-liste, lommeregner, reaktionsspil, stopur). **AI-assistenten bliver app-bygger** her: den ser filerne og fejlene, skriver hele filer, og du vælger selv med “Brug i appen” (kan fortrydes). “Lad AI bygge den” ved en ny app og “Ret med AI” i konsollen. Appene kører i en sandkasse (eget, tomt *origin* – ingen adgang til dine cookies eller HUBTECH-data), `localStorage` gemmes på din konto, og apps kan deles i et galleri, hvor andre kan køre og kopiere dem |
| **Kodestumper** | Kodestykker og kommandoer med sprog, tags, farvelægning og kopiering med ét klik (Ctrl+Enter). Hver kodestump kan hentes som fil |
| **Guides & Læring** | Samler al læring ét sted med faner øverst: Oversigt (servicetekniker-kurset, alle læringsapps med din fremdrift og den søgbare guide), **Kodeskolen**, **Huskekort**, **CircuitPilot** og **Værktøjskassen**. Læringsapps ligger under `#/learn/…` og vises ikke i app-launcheren eller menuen – gamle `#/apps/…`-links sendes automatisk videre |
| **Kodeskolen** | Lær at programmere: 47 korte lektioner i 8 kurser – **Python** (begynder og videre: klasser, filer, JSON og et lille projekt), **JavaScript**, **HTML/CSS**, **SQL**, **Git/terminal**, **Linux og serveren** og **Arduino C++**. Koden køres direkte i browseren (Python via Pyodide, SQL i en rigtig SQLite-database med kunder, opgaver og reservedele, JavaScript i en isoleret worker uden netværk, HTML i en sandkasse), og opgaverne rettes automatisk. Hint, løsning, quiz efter hver lektion, forklaring af fejlbeskeder på dansk, uendelige løkker stoppes efter 10 sekunder, og et frit værksted. XP tæller med i profilen |
| **Huskekort** | Huskekort med *spaced repetition* (som Anki): Igen / Svært / Godt / Let styrer, hvornår kortet kommer igen. Sæt med farver, gennemgang med tastaturet (mellemrum, 1–4), "Øv alle" uden at ændre planen, prognose for de næste 7 dage og stime. Import fra Excel/CSV (`;` eller tabulator), eksport som CSV og ét klik for at lave kort af Kodeskolens quizzer. 2 XP pr. gennemgang |
| **Noter** | Noter med søgning, fastgørelse og farver – gemmes automatisk (Ctrl+Alt+N = ny note) |
| **Fokus** | Pomodoro-timer med pauser, dagens blokke, 7-dages graf og stime. Kører videre på tværs af siderne |
| **Værktøjskasse** | Elektronik og el: Ohms lov, modstandens farvekode, LED-formodstand (E12), spændingsdeler, serie/parallel, kondensatorkoder, batteritid og spændingsfald i kabel. IT og netværk: subnetberegner (IPv4, prefiks eller maske), talsystemer (decimal/hex/binær/oktal + ASCII) og overførselstid |
| **Indstillinger** | Profil og avatar, adgangskode, aktive sessioner, sletning af konto, tema, verden og årstider, integrationer, brugere og om |
| **Overalt** | Ctrl/⌘+K-søgning og kommandoer, tastaturgenveje (`G` + `H/D/P/L/A/S`, `?`), introduktion med spotlight, toasts, lys og mørk tilstand, mobilvisning |

---

Alle apps bruger samme opbygning som Hjem: et banner med appens eget landskab og farve, appens ikon, knapper og rigtige tal (`web/js/features/apphero.js`). De nye apps gemmer deres data på din konto via `/api/state/<app-id>`.

### HUBTECH Office i korte træk

- Filerne gemmes i databasen (`office_docs`) pr. bruger og kan kun ses af ejeren. Ændringer gemmes automatisk efter knap et sekund (Ctrl+S gemmer med det samme).
- **Versionshistorik:** når du redigerer igen efter mindst 10 minutters pause, gemmes den forrige udgave. Der gemmes højst 40 versioner pr. fil. Under **⋯ → Versionshistorik** kan du se dem og gendanne en; den nuværende udgave gemmes først. Intervallet styres med `HUBTECH_OFFICE_VERSION_SECONDS`.
- **Billeder** i dokumenter og præsentationer uploades til din konto (`office_files`, `/api/office/files/<id>`). Kun billeder (PNG, JPEG, GIF, WebP) tages imod; filtypen tjekkes på indholdet, ikke på navnet. Billederne skaleres ned til højst 2000 px, før de sendes. Billeder, som intet dokument bruger længere, ryddes op efter et døgn. Ved eksport (.docx, .pptx, .html) lægges billederne ind i filen.
- **Eksport:** dokumenter som ægte **Word (.docx)** (overskrifter, lister, tjeklister, tabeller, billeder og links), regneark som .xlsx med formler og datoformat, præsentationer som .pptx. Under Indstillinger → Data & sikkerhedskopi kan du hente alle filer på én gang som .zip.
- **Regneark-formler:** `+ - * / ^ & %`, sammenligninger og over 70 funktioner med danske og engelske navne. Argumenter adskilles med `;` eller `,`; med `;` kan decimaler skrives med komma (`=SUM(A1;2,5)`). Ved eksport til .xlsx oversættes danske navne til dem, Excel bruger. Funktionerne:
  - **Opslag:** `LOPSLAG/VLOOKUP, VOPSLAG/HLOOKUP, XOPSLAG/XLOOKUP, INDEKS/INDEX, SAMMENLIGN/MATCH, HVIS.IT/IFNA`.
  - **Betingede beregninger:** `SUM.HVISER, TÆL.HVISER, MIDDEL.HVISER`.
  - **Tekst:** `MIDT, SØG, FIND, UDSKIFT, TEKST`.
  - **Datoer:** `DATO, IDAG, NU, ÅR, MÅNED, DAG, UGEDAG, ISOUGE.NR, DAGE, EDATO, SLUT.PÅ.MÅNED, ANTAL.ARBEJDSDAGE`.

  Datoer som `20-10-2026` genkendes og regnes som rigtige datoer, så man kan trække dem fra hinanden og sortere dem.
- **Regneark-værktøjer:**
  - **Diagrammer** (søjle, linje, cirkel), der opdateres, når tallene ændres.
  - **Betinget formatering** (større end, mindre end, mellem, lig med, tekst, negative tal, dubletter, største N, farveskala, datasøjler).
  - **Frys** øverste række, første kolonne eller op til den markerede celle.
- **Præsentationer:**
  - Overgange: tone, skub eller zoom.
  - Træk eller indsæt billeder direkte på diaset.
  - Under præsentationen viser `N` dine noter, og `S` åbner en talervisning i et ekstra vindue med næste dias, noter og ur.
- **I dag** på Hjem: dagens aftaler og deadlines, overskredne opgaver, et ur der kører, timer registreret i dag, huskekort der er klar, lav lagerbeholdning og forfaldne fakturaer – med links direkte derhen.
- **Print og PDF:** Kalenderen kan printes eller hentes som PDF som måned (A4 på tværs, med ugenumre og helligdage), uge eller liste med noter og sted. Noter kan printes enkeltvis eller alle på én gang – tjeklister vises som afkrydsningsfelter. Fakturaer hentes som PDF i Kunder.
- **Baggrunde:** syv landskaber – Dalen, Højlandet, Fjorden, Alperne, Bakkerne, Kysten og Søerne – der alle følger årstid, tid på dagen og vejr. *Billedkvalitet: Høj* tegner i fuld skarphed på store og skarpe skærme. Du kan også bruge **dit eget billede** (fx lavet med Gemini – Indstillinger → Verden har en færdig prompt, du kan kopiere). Billedet gemmes på din konto og synkroniseres.
- **Søgning:** Ctrl+K finder også ord inde i dine dokumenter, regneark og præsentationer. Mens søgningen (eller en dialog) er åben, og mens du skriver, holder landskabet i baggrunden pause, så glaseffekterne ikke skal tegnes om for hvert billede – det holder søgning og tastatur hurtige.
- **Biblioteker** til filformater ligger lokalt i `web/vendor/` og indlæses først, når de bruges: SheetJS (Excel), mammoth (Word-import), PptxGenJS (PowerPoint), JSZip (.docx og .zip), jsPDF (Servicehjælp, fakturaer, kalender og noter), ZXing (stregkoder og QR-koder, Apache-2.0), Pyodide 0.26.4 (Python i Kodeskolen, MPL-2.0, ca. 14 MB – hentes først, når du åbner en Python-lektion) og sql.js 1.10.3 (SQLite i Kodeskolen, MIT). Licenserne ligger ved siden af.
- **Ikke understøttet:**
  - Åbning af PowerPoint-filer.
  - Formler på tværs af ark.
  - Indsættelse af rækker midt i et ark.
  - Diagrammer i .xlsx-eksporten. De kommer med, når arket udskrives.

### De indlejrede apps i platformens udseende

- **Servicehjælp** (`web/apps/servicehelp/`) bygges fra `sources/servicehjaelp.html` med `python3 tools/build_servicehelp.py`. `sh-bridge.js` sender appens data til din konto (`/api/state/svc-*`), og `sh-theme.css` giver den platformens udseende. Appen henter dine data asynkront bag en kort indlæsningsskærm, før den starter. Fotos i rapporter, kladder og udgifter gemmes som billedfiler på kontoen; data indeholder kun deres adresse. Derfor kan der være mange rapporter med fotos uden at ramme grænsen på 4 MB pr. app. Ældre rapporter flyttes automatisk over næste gang, de gemmes.
- **Klassiske HUBTECH-sider og ARCHIVE-01:** filerne på disken er uændrede. Når HUBTECH viser dem i platformen, tilføjer serveren `web/sites/_hubtech/sites-theme.css/js`. Åbnet i et nyt vindue ser de ud som originalen.
- **ByteForge-panelet:** `python3 tools/build_byteforge_theme.py` laver `hubtech-platform.css` (ByteForges egen CSS i HUBTECH-farver med Manrope). `hubtech-theme.js` bruger den kun, når panelet kører inde i HUBTECH.
- ByteForge, som HUBTECH starter, lukker selv ned, hvis HUBTECH lukkes, også hvis vinduet bare lukkes på Windows.

## 3. Struktur

```
hubtech/
├─ server/                     Python-server (kun standardbiblioteket)
│  ├─ app.py                   HTTP-server, routing, statiske filer, sikkerheds-headers, CSP
│  ├─ api.py                   JSON-API: auth, profil, prefs, app-state, favoritter, aktivitet, projekter, integrationer
│  ├─ auth.py                  scrypt-hashing, sessioner, login-begrænsning, cookies
│  ├─ db.py                    SQLite (WAL) og skema-migreringer
│  ├─ cursor_integration.py    Læser Cursors egne data og projektmapper, git-info, åbner Cursor
│  └─ config.py                Miljøvariabler og .env
├─ web/                        Frontend (ES-moduler, intet build-trin)
│  ├─ index.html               Skal, boot-skærm og verdens-canvas
│  ├─ css/                     tokens · base · components · layout · pages
│  ├─ fonts/                   Sora, Manrope, JetBrains Mono (lokalt, SIL OFL)
│  ├─ js/
│  │  ├─ main.js               Boot, routes, auth-guards, sideskift
│  │  ├─ core/                 dom, api, store, router, registry (app-registret), shell, ui, icons, services
│  │  ├─ world/                landscape.js (renderer), palettes.js (årstider × tid), controller.js
│  │  ├─ features/             auth, onboarding, palette (Ctrl+K), widgets
│  │  ├─ pages/                landing, home, dashboard, launcher, projects, learn, guide, course,
│  │  │                        circuitpilot, byteforge, hubtech, settings
│  │  └─ data/                 course-servicetekniker.js (originalt indhold), guides.js
│  └─ apps/circuitpilot/       Genereret CircuitPilot + cp-bridge.js + cp-theme.css
├─ sources/                    Dine originale filer (uændrede)
├─ tools/                      build_circuitpilot.py · reset_password.py
├─ tests/                      test_api.py (API) · e2e_browser.py (Playwright)
├─ start.sh · start.bat · start.command · .env.example
```

### Arkitektur i lag

| Lag | Hvor | Ansvar |
|---|---|---|
| Platform og navigation | `core/shell.js`, `core/router.js`, `main.js` | Sidebar, topbar, routes, guards, sideskift |
| Designsystem | `css/tokens.css`, `components.css`, `core/ui.js`, `core/icons.js` | Farver, typografi, glas-flader, knapper, tilstande, toasts, dialoger, ikoner |
| Apps | `core/registry.js` + `pages/*` | Hver app er én registrering og ét modul, og indlæses først når den bruges |
| Identitet og adgang | `server/auth.py`, `api.require_owner` | Konti, sessioner, roller (ejer/medlem) |
| Data | `server/db.py`, `/api/state/<app>` | Brugerdata pr. app, prefs, favoritter, aktivitet |
| Integrationer | `server/cursor_integration.py`, `api.byteforge_check` | Lokale projekter, ByteForge-status, links til HUBTECH-site |
| Verden | `js/world/*` | Landskab, årstider, vejr, partikler, ydeevne |
| Guides og onboarding | `data/guides.js`, `features/onboarding.js` | Hjælpeartikler, “Vis mig”, introduktion |

---

## 4. Tilføj en ny app

1. Opret `web/js/pages/minapp.js`:
   ```js
   import { h } from '../core/dom.js';
   export default {
     title: 'Min app',
     render(ctx) { return h('div', { class: 'page' }, h('h1', null, `Hej ${ctx.user.displayName}`)); },
   };
   ```
2. Tilføj en registrering i `web/js/core/registry.js`:
   ```js
   { id: 'minapp', name: 'Min app', tagline: 'Kort formål', description: '…',
     icon: 'rocket', hue: '#ff5fa2', route: '#/apps/minapp', category: 'workspace',
     status: 'available', requires: { role: 'owner' } /* valgfri */,
     art: { season: 'spring', time: 'day', focusX: 0.5 },
     page: () => import('../pages/minapp.js'), keywords: ['…'] }
   ```
3. Gem data pr. bruger: `api.put('/api/state/minapp', { state })` og `api.get('/api/state/minapp')`.

Launcher, søgning, menuen “Dine apps”, favoritter, låste tilstande og ruten `#/apps/minapp` følger automatisk med. `status: 'coming'` viser appen som låst med “Kommer snart”.

---

## 5. Data og lagring

Alt gemmes i **SQLite** i `~/.hubtech/hubtech.db` (kan flyttes med `HUBTECH_DATA_DIR`). Filen får rettighederne `600`.

| Tabel | Indhold |
|---|---|
| `users` | Brugernavn, navn, e-mail, scrypt-hash, rolle, avatar, onboarding-status |
| `sessions` | SHA-256 af sessions-token (selve tokenet gemmes aldrig), udløb, user-agent |
| `prefs` | Tema, verden, fastgjorte apps, gemte guides |
| `app_state` | JSON pr. bruger og app, fx `circuitpilot` og `course-servicetekniker` |
| `favorites` | Favorit-apps, guides og projekter |
| `project_meta` | Din organisering af projekter: favorit, status, samling, tags, note, skjult |
| `activity` | Historik (højst 500 pr. bruger) |
| `server_settings` | Projektmapper, ByteForge-adresse, HUBTECH-site |

| `office_docs` | HUBTECH Office-filer (dokumenter, regneark, præsentationer) pr. bruger |
| `office_versions` | Versionshistorik for Office-filerne (højst 40 pr. fil) |
| `office_files` | Billeder uploadet til dokumenter, dias og Servicehjælp (kun ejeren kan hente dem) |

### Sikkerhedskopi og flytning af data

- **Automatisk:** HUBTECH tager én sikkerhedskopi om dagen og gemmer de **14 nyeste** i `~/.hubtech/backups`. Den laves med SQLite's backup-API, så serveren ikke skal stoppes.
- **Indstillinger → Data & sikkerhedskopi** (kun ejeren):
  - **Lav sikkerhedskopi nu**.
  - **Hent** en kopi som `.db`-fil.
  - **Gendan** fra en kopi i listen eller fra en `.db`-fil.

  Før hver gendannelse gemmer HUBTECH automatisk en kopi af, hvordan databasen så ud ("Før gendannelse"), så du kan fortryde. Gendannelsen tjekker filen først, og ældre kopier opgraderes til det nyeste skema.
- **Mine data** (alle brugere):
  - **Eksportér alle mine data** henter en `.json`-fil med indstillinger, app-data, Office-filer, favoritter og projekt-noter. Adgangskoder er ikke med.
  - **Gendan fra eksport** lægger filen tilbage på kontoen (også en anden konto eller en anden computer).
  - **Hent Office-filer som .zip** henter alle dokumenter som rigtige `.docx`-, `.xlsx`- og `.pptx`-filer.

### Offline

Kan serveren ikke nås, kører HUBTECH videre, for eksempel på en telefon uden wifi:

- Service workeren (`web/sw.js`) gemmer hele app-skallen, altså JS, CSS, skrifttyper og ikoner. Listen kommer fra `/api/app/precache`.
- `web/js/core/offline.js` svarer på læsninger med den seneste kopi, enheden har set.
- Ændringer i Opgaver, Noter, anden app-data, indstillinger og Office-filer sættes i kø og sendes, når serveren svarer igen.
- Topbaren viser "Offline · N ændringer venter".
- Kopien ligger i IndexedDB pr. bruger og slettes, når du logger ud. Nye Office-filer kan ikke oprettes offline.
- Har filen også ændret sig et andet sted imens, vinder den sidst gemte ændring.

I browserens `localStorage` ligger kun verdens-udseendet før login, valg af listevisning og hvilken bruger offline-kopien tilhører.

---

## 6. Login og sikkerhed

- Adgangskoder gemmes med **scrypt** (N=2¹⁴, r=8, p=1) og unikt salt. Mangler scrypt i din Python-build, bruges PBKDF2-SHA256 med 600.000 iterationer.
- Sessioner bruger et tilfældigt 256-bit token i en `HttpOnly; SameSite=Lax`-cookie. Udløbet forlænges ved brug (`HUBTECH_SESSION_DAYS`). Sæt `HUBTECH_SECURE_COOKIES=true` bag HTTPS.
- **CSRF:** alle ændringer kræver headeren `X-Requested-With: hubtech` og samme `Origin`.
- **Begrænsning:** 5 mislykkede login-forsøg pr. IP og brugernavn pr. 5 minutter. Ukendte brugernavne tager lige så lang tid at afvise som forkerte adgangskoder.
- **Begrænsning på alle ændringer:** højst 360 skrivende forespørgsler i minuttet pr. konto og 40 pr. IP før login. Det styres med `HUBTECH_WRITE_RATE` og `HUBTECH_WRITE_RATE_ANON`. Ved overskridelse svarer serveren `429` med `Retry-After`.
- **Luk serveren:** `HUBTECH.pyw` giver serveren en engangsnøgle (`HUBTECH_SHUTDOWN_TOKEN`), som kun programmet kender. Det bruger nøglen til at lukke serveren pænt, når vinduet lukkes. I programvinduet lukker "Luk HUBTECH" bare vinduet. Ellers kræver `POST /api/system/shutdown` ejeren og en forespørgsel direkte fra computeren selv: `127.0.0.1`/`localhost` som Host og ingen `X-Forwarded-For`/`Forwarded`-headers, så det virker aldrig gennem en reverse proxy.
- **Tilgængelighed:** e2e-testen kører axe-core (WCAG 2 A/AA) på de vigtigste sider og fejler ved alvorlige fund.
  - Regnearket er et ARIA-grid med aktiv celle.
  - Opgavekortene kan flyttes med tastaturet (Alt + piletaster).
- **Roller:** ejeren (første konto) har adgang til lokale projekter og integrationer, og serveren håndhæver det. Medlemmer får `403`.
- **CSP:** `script-src 'self'` overalt undtagen CircuitPilot-siden, som beholder sine oprindelige inline-handlers. Platformen må desuden køre WebAssembly (`'wasm-unsafe-eval'`) og en `blob:`-worker til AI-assistenten og hente sprogmodeller fra `huggingface.co`/`*.hf.co` – ellers ingen eksterne domæner.
- **Fællesskab:** brugere skal bekræfte en alder på mindst 13 år (kun at grænsen er nået gemmes). Uploads tjekkes på indholdet (billeder: PNG/JPEG/GIF/WebP, lyd: MP3/M4A/OGG/WAV/FLAC/WebM), serveres med `sandbox`-CSP, og hver bruger har 500 MB. Beskeder har ekstra spam-bremse (8 pr. 10 sekunder). Regler og privatlivspolitik ligger i `web/legal/`.
- **Tilmelding:** `HUBTECH_SIGNUP=first` (standard) betyder, at kun ejeren opretter sig selv. Ejeren opretter andre under Indstillinger → Brugere. Mulighederne er `open`, `first` og `closed`.
- Serveren lytter som standard kun på `127.0.0.1`. Skal den kunne nås fra netværket, så kør den bag en reverse proxy med HTTPS.

---

## 7. Cursor-integration — opsætning

En browser må ikke læse dine filer. Derfor gør HUBTECH-serveren det på din egen computer, og den **kun læser**:

1. Cursors liste over seneste projekter: `<Cursor>/User/globalStorage/state.vscdb` (nøglen `history.recentlyOpenedPathsList`)
2. Cursors arbejdsområder: `<Cursor>/User/workspaceStorage/*/workspace.json`
3. Dine egne projektmapper, som scannes to niveauer ned efter `.git`, `package.json`, `pyproject.toml`, `.cursor` m.fl.

| OS | Cursor-mappe |
|---|---|
| Windows | `%APPDATA%\Cursor` |
| macOS | `~/Library/Application Support/Cursor` |
| Linux | `~/.config/Cursor` |

**Det skal du gøre:**
1. Kør HUBTECH **på den samme computer som Cursor**.
2. Åbn *Projekter*. Statuslinjen viser, om Cursor blev fundet.
3. Valgfrit: tilføj projektmapper under *Projekter → Projektmapper* eller med `HUBTECH_PROJECT_ROOTS`.
4. For at “Åbn i Cursor” kan starte Cursor direkte, skal du i Cursor køre kommandopaletten → **“Shell Command: Install 'cursor' command”**. Uden den bruger HUBTECH et `cursor://file/…`-link, som browseren beder dig bekræfte.

Filindhold sendes aldrig til browseren, kun navne, størrelser og metadata. Credentials i git-remote-URL’er fjernes. Fjernprojekter (SSH/WSL) vises og åbnes med `--folder-uri`.

---

## 8. ByteForge og HUBTECH-moduler

Alle dine andre sider kører nu **sammen med** platformen fra én server og én adresse:

| Mappe | Indhold | Åbnes fra |
|---|---|---|
| `integrations/byteforge/` | Hele ByteForge (server + panel) | *ByteForge*. Startes automatisk som en baggrundsproces på `127.0.0.1:8080` og stoppes, når HUBTECH lukkes. Log: `~/.hubtech/byteforge.log` |
| `web/sites/hubtech/` | Den oprindelige HUBTECH v5 (uden `ai.env` og Node-filer) | *HUBTECH* → modulkortene |
| `web/sites/byteforge-guide/` | Den oprindelige ByteForge-guide | *ByteForge* → “Original guide” |
| `web/sites/archive-01/` | ARCHIVE-01 | *ARCHIVE-01* |
| `web/sites/servicekursus/` | Den oprindelige kursusfil | – (kurset findes også som HUBTECH-kursus) |

Sider under `web/sites/` får deres egen, lempeligere sikkerhedspolitik (de bruger inline-scripts, Google Fonts osv.), mens selve platformen beholder den strenge. Kører ByteForge allerede, eller peger `HUBTECH_BYTEFORGE_URL` på en anden maskine, startes der ikke en ekstra kopi. Slå autostart fra med `HUBTECH_BYTEFORGE_AUTOSTART=false`.

---

## 9. CircuitPilot

`web/apps/circuitpilot/index.html` genereres fra din original i `sources/cercuitpilot.html`:

```bash
python3 tools/build_circuitpilot.py
```

Alt læringsindhold, quizzer, flashcards, eksamen, labs, sandbox, wire challenges, fault hunter, reparationer, projekter, samling og badges er **uændret**. Kun disse dele er udskiftet:

- Kontosystemet i browseren (`localStorage`) er erstattet af din HUBTECH-konto via `cp-bridge.js`. Gemning sker debounced og afsluttes også, når du forlader siden.
- Ranglister kommer fra serveren, og navnene escapes.
- Overlays til “Opret konto” og “Skift konto” er fjernet, fordi login sker i HUBTECH.
- Udseendet er tilpasset platformen via `cp-theme.css`. CircuitPilots grønne identitet er bevaret.

CircuitPilots indhold er stadig på **engelsk**, som i originalen. Har du gammelt fremskridt i en browser på *samme adresse*, tilbydes en engangs-import.

---

## 10. Miljøvariabler

| Variabel | Standard | Formål |
|---|---|---|
| `HUBTECH_HOST` | `127.0.0.1` | Interface serveren lytter på |
| `HUBTECH_PORT` | `8090` | Port |
| `HUBTECH_DATA_DIR` | `~/.hubtech` | Placering af databasen |
| `HUBTECH_SIGNUP` | `first` | `open` / `first` / `closed` |
| `HUBTECH_SESSION_DAYS` | `14` | Sessionens levetid |
| `HUBTECH_SECURE_COOKIES` | `false` | `true` bag HTTPS |
| `HUBTECH_PROJECT_ROOTS` | – | Ekstra projektmapper (`:` eller `;` som skilletegn) |
| `HUBTECH_CURSOR_USER_DIR` | auto | Sti til Cursors datamappe |
| `HUBTECH_CURSOR_CLI` | auto | Sti til `cursor`-kommandoen |
| `HUBTECH_BYTEFORGE_URL` | `http://127.0.0.1:8080` | ByteForge-server |
| `HUBTECH_BYTEFORGE_AUTOSTART` | `true` | Start den medfølgende ByteForge-server automatisk |
| `HUBTECH_SITE_URL` | – | Tom = den indbyggede kopi i `web/sites/hubtech`; ellers adressen på et eksternt HUBTECH-site |

Der kræves ingen eksterne tjenester eller API-nøgler.

---

## 11. Test

```bash
python3 -m unittest discover -s tests -p "test_*.py" -v     # API-, sikkerhedskopi- og formel-tests
node tests/formula.test.mjs                                 # kun formel-motoren (kræver Node.js)
# Browser-flows (kræver Playwright + Chromium):
HUBTECH_DATA_DIR=/tmp/hubtech-e2e python3 server/app.py --port 8193 &
python3 tests/e2e_browser.py http://127.0.0.1:8193 /tmp/shots
```

Testen af AI-assistenten bruger en lille, tilfældig GGUF-model (sæt `HUBTECH_TEST_GGUF` til stien). Den kan laves med `gguf`-pakken – se `tests/make_tiny_gguf.py`.

`e2e_browser.py` dækker oprettelse af ejerkonto, introduktionen, kursusfremdrift, at CircuitPilot gemmer, projekter fra Cursors data, søgning, “Åbn i Cursor”, organisering, Ctrl+K, favoritter, log ud og log ind, rettigheder, mobilvisning og manglende session. Derudover dækker den Office: autosave, formler, import, eksport, diagrammer, betinget formatering, frysning, versionshistorik og søgning. Endelig dækker den programtilstand og sikkerhedskopier.

---

## 12. Kendte begrænsninger

- **Cursor** kan kun læses, når serveren kører på samme maskine som Cursor. Cursor har ingen officiel API til projektlister, så integrationen læser Cursors egne lokale filer. Ændrer Cursor formatet, viser *Projekter* tydeligt, at intet blev fundet, og projektmapper virker fortsat.
- **Pingochat** (`m.html`) gemmer beskeder i browseren. Den gamle live-chat via socket.io krævede en Node-server, der ikke er med, og virker derfor ikke.
- **ByteForges "Now playing"** (`nowplaying.py`) virker kun på Linux. Resten af ByteForge kører på Windows, macOS og Linux.
- **Landskabet** tegnes af kode i browseren, ikke ud fra et foto. Layout, farver og stemning følger mockuppen, men det er en illustration og ikke et fotorealistisk maleri.
- **Lys tilstand** gør paneler, menu og kort lyse. Tekst, der står direkte på landskabet (overskrifter og velkomst), forbliver lys med skygge, så den kan læses i alle årstider og tider på døgnet.
- **CircuitPilot** er på engelsk.
- **Gammel fremdrift** fra den oprindelige kursusfil og CircuitPilot (gemt i en browsers `localStorage` på en anden adresse) kan ikke læses af browseren og flyttes derfor ikke automatisk.
- **AI-assistenten** kræver en nyere browser (WebAssembly SIMD). Chrome/Edge 137+ kører den hurtige udgave; Safari (iPhone) og Firefox bruger en langsommere kompatibilitetsudgave. På telefoner bør RAM-grænsen være lav (0,5–1,25 GB) – iPhone giver en fane omkring 1–1,5 GB. Første start kræver internet for at hente modellen (0,5–1,9 GB). Små modeller kan tage fejl – handlingerne skal derfor altid godkendes.
- **Snaps** kan ikke forhindre skærmbilleder. Kameraet kræver HTTPS (eller `localhost`).
- **Musikrum** synkroniserer på ca. 1,5 sekund, og browseren kræver ét klik på “Lyt med”, før der må spilles lyd.
- **Live-opdateringer** bruger lange forespørgsler (long polling) til `/api/live`. Hver åben fane holder én forbindelse åben.
- **Nulstilling af adgangskode via e-mail** findes ikke, fordi der ikke er nogen mailtjeneste. Brug `tools/reset_password.py`.

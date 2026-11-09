# HUBTECH Workspace

En arbejdsplads, en simulator og et lærested for IT-folk – der kører på jeres egne computere.

Ingen sky, ingen konto hos et firma, ingen reklamer og ingen sporing. Jeres data ligger hos jer, og intet bliver solgt videre. Det her er et personligt projekt, ikke en virksomhed.

---

## Hvad kan den?

- **Projekter** – et rum for hvert projekt. Beskeder, opkald med hele holdet (også fra de andre pc'er og telefoner), opgaver, noter og en fælles mappe. Hver ændring af koden skal have en titel og en beskrivelse, ligesom et commit på GitHub. Holdet kan godkende ændringer, en AI kan gennemgå dem først, hvis man vil, og mappen kan udgives som en hjemmeside.
- **Kode-editor** – en rigtig editor (CodeMirror) med filer, faner, autofuldførelse, søg og erstat og 25 sprog. Python, JavaScript, HTML/CSS og SQL kører direkte, og fejl vises på den linje, de sker.
- **Gnist** – en AI-assistent, der kører lokalt på pc'en. Man kan også vælge Claude eller en anden sky-AI med sin egen nøgle.
- **Lær og øv** – en rigtig Linux-terminal, øvelseslab med simulatorer, kodeskole, quiz, IT-ordbog og mere.
- **Office, kalender, opgaver, kunder, lager, tidsregistrering og økonomi.**
- **Pauserum** – skak, dam, fire på stribe og andre spil mod en kollega.

## Kom i gang

**Krav:** Python 3.8 eller nyere. Der er ingen andre afhængigheder: ingen `pip install` og ingen `npm install`.

**Windows:** dobbeltklik på `HUBTECH.pyw`. Så åbner HUBTECH i sit eget vindue.

**Mac og Linux:**

```bash
python3 server/app.py
```

Åbn derefter **http://127.0.0.1:8090**. Den første konto, du opretter, bliver ejer.

**Telefon (iPhone og Android):** åbn HUBTECH på pc'en, vælg "Forbind din telefon", og scan QR-koden. Tryk "Føj til hjemmeskærm", så ligger den som en app.

## Flere pc'er sammen – uden server

Starter I HUBTECH på flere pc'er på samme netværk, finder de hinanden selv (Teamnet).

- Man logger ind med samme konto på alle pc'erne.
- Projekter, beskeder og opkald går direkte mellem maskinerne.
- Hver pc gemmer en krypteret kopi af de andres data. Kun ejeren kan åbne sin kopi, med sin egen adgangskode. Derfor går intet tabt, når en pc er slukket.

Til internettet kan HUBTECH give sig selv en offentlig https-adresse under Indstillinger → Om → Netværk.

## Dine data

Alt ligger i `~/.hubtech` på den pc, HUBTECH kører på. Der sendes ikke noget til nogen, medmindre du selv vælger en sky-AI i Gnist. Så går den tekst, du sender, til den udbyder, og det står tydeligt i appen. Læs mere i [docs/PRIVATLIV.md](docs/PRIVATLIV.md).

## Udvikling

```bash
python3 -m unittest discover -s tests      # server
for t in tests/*.mjs; do node "$t"; done   # browser-logik
```

Frontend-biblioteker ligger lokalt i `web/vendor` (CodeMirror, Pyodide, xterm m.fl.) med deres licenser ved siden af.

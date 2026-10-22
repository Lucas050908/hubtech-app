/**
 * Guide library. Every guide that points at a feature points at one that exists.
 * `show` = { route, target } lets the guide spotlight the real element ("Vis mig").
 * ByteForge guides are transcribed from byteforge-guide.html (ByteForge — Guide & Dokumentation).
 */
export const GUIDE_CATEGORIES = [
  { id: 'start', label: 'Kom i gang', icon: 'sparkles' },
  { id: 'platform', label: 'Platformen', icon: 'layers' },
  { id: 'projects', label: 'Projekter & Cursor', icon: 'cube' },
  { id: 'learning', label: 'Læring', icon: 'graduation' },
  { id: 'byteforge', label: 'ByteForge', icon: 'anvil' },
  { id: 'printer', label: 'Printer-support', icon: 'printer' },
  { id: 'developer', label: 'Udvikling', icon: 'code' },
];

export const GUIDES = [
  {
    id: 'welcome', category: 'start', app: 'hubtech', icon: 'sparkles', minutes: 2,
    title: 'Velkommen til HUBTECH',
    summary: 'Hvad platformen er, og hvordan dens dele hænger sammen.',
    sections: [
      { h: 'Ét univers, flere apps', p: 'HUBTECH samler dine værktøjer, projekter og læringsforløb i ét personligt arbejdsrum. Apps som CircuitPilot, ByteForge og Cursor Projekter deler login, profil, søgning og design – men har hver deres formål og farve.' },
      { h: 'Det vigtigste på 30 sekunder', list: [
        'Hjem viser dine apps, seneste projekter, læring og aktivitet.',
        'Dashboard samler din fremdrift, favoritter og status for integrationer.',
        'Søg alt med Ctrl+K (⌘K på Mac) – apps, guides, kursusdage og projekter.',
        'Baggrunden er en levende verden med fire årstider. Styr den under Indstillinger → Verden.',
      ] },
      { callout: { kind: 'info', text: 'Alt du gør gemmes på din konto i HUBTECH-serverens database – ikke kun i browseren – så du kan fortsætte fra en anden computer.' } },
    ],
    actions: [{ label: 'Start introduktionen', tour: true }, { label: 'Gå til Dashboard', href: '#/dashboard' }],
  },
  {
    id: 'dashboard', category: 'platform', app: 'hubtech', icon: 'dashboard', minutes: 2,
    title: 'Dit dashboard',
    summary: 'Fremdrift, favoritter, integrationer og historik ét sted.',
    sections: [
      { h: 'Hvad du ser', steps: [
        { t: 'Level og XP', d: 'Din samlede XP kommer fra CircuitPilot, gennemførte kursusopgaver og introduktionen. Hver 1.000 XP giver et nyt level.' },
        { t: 'Kom godt i gang', d: 'En tjekliste, der automatisk krydser af, når du faktisk har gjort tingene – fx åbnet CircuitPilot eller forbundet Cursor.' },
        { t: 'Integrationer', d: 'Viser den reelle status for Cursor, ByteForge og HUBTECH-sitet. Er noget ikke forbundet, får du et link til opsætningen.' },
        { t: 'Favoritter', d: 'Stjernemarkér apps, guides og projekter for at samle dem her.' },
      ] },
    ],
    show: { route: '#/dashboard', target: 'progress' },
    actions: [{ label: 'Åbn Dashboard', href: '#/dashboard' }],
  },
  {
    id: 'launcher', category: 'platform', app: 'hubtech', icon: 'apps', minutes: 1,
    title: 'App-launcher og søgning',
    summary: 'Åbn apps, fastgør dem i menuen og find alt med Ctrl+K.',
    sections: [
      { steps: [
        { t: 'Åbn launcheren', d: 'Vælg “Apps” i menuen. Her ser du alle apps, deres status og om de kræver en integration.' },
        { t: 'Fastgør i menuen', d: 'Tryk på nålen på et app-kort for at vise appen under “Dine apps” i sidebaren.' },
        { t: 'Søg overalt', d: 'Tryk Ctrl+K (⌘K). Søgningen dækker apps, guides, kursusdage, projekter og kommandoer som “Skift til vinter”.', code: 'Ctrl + K' },
        { t: 'Genveje', d: 'Tryk G og derefter H, D, P, L, A eller S for at hoppe til Hjem, Dashboard, Projekter, Læring, Apps eller Indstillinger. Tryk ? for oversigten.' },
      ] },
    ],
    show: { route: '#/apps', target: 'launcher-grid' },
    actions: [{ label: 'Åbn Apps', href: '#/apps' }],
  },
  {
    id: 'cursor-setup', category: 'projects', app: 'cursor', icon: 'plug', minutes: 4,
    title: 'Forbind dine Cursor-projekter',
    summary: 'Sådan finder HUBTECH dine rigtige projekter – og hvad du skal gøre, hvis den ikke gør.',
    sections: [
      { h: 'Sådan virker det', p: 'En browser må ikke læse dine filer. Derfor er det HUBTECH-serveren – som kører på din egen computer – der læser Cursors egen liste over seneste projekter og de projektmapper, du selv vælger. Intet sendes ud af maskinen.' },
      { h: 'Kilder, der læses (kun læsning)', list: [
        'Cursors “senest åbnede” liste: <Cursor-mappe>/User/globalStorage/state.vscdb',
        'Cursors arbejdsområder: <Cursor-mappe>/User/workspaceStorage/*/workspace.json',
        'Dine egne projektmapper (fx ~/Projects), scannet to niveauer ned efter git-repos og projekter',
      ] },
      { h: 'Cursor-mappen ligger her', table: [
        ['Windows', '%APPDATA%\\Cursor'],
        ['macOS', '~/Library/Application Support/Cursor'],
        ['Linux', '~/.config/Cursor'],
      ] },
      { h: 'Opsætning', steps: [
        { t: 'Kør HUBTECH på samme computer som Cursor', d: 'Integrationen virker kun, når serveren kører lokalt på den maskine, hvor dine projekter ligger.', code: 'python3 server/app.py' },
        { t: 'Åbn Projekter', d: 'Status øverst viser, om Cursor blev fundet, hvor mange projekter der er, og om cursor-kommandoen er tilgængelig.' },
        { t: 'Tilføj projektmapper (valgfrit)', d: 'Under Indstillinger → Integrationer kan du tilføje mapper som ~/Projects eller C:\\Users\\dig\\code. Du kan også sætte HUBTECH_PROJECT_ROOTS i .env.' },
        { t: 'Gør “Åbn i Cursor” muligt', d: 'Installer shell-kommandoen i Cursor: Kommandopaletten → “Shell Command: Install ’cursor’ command”. Uden den bruger HUBTECH et cursor://-link i browseren i stedet.', tip: 'Ligger Cursor et usædvanligt sted, kan du pege direkte på programmet med HUBTECH_CURSOR_CLI og HUBTECH_CURSOR_USER_DIR.' },
      ] },
      { callout: { kind: 'warn', text: 'Kun platformens ejer (den første konto) kan se lokale projekter. Andre brugere på samme server får aldrig adgang til dine filer.' } },
    ],
    show: { route: '#/projects', target: 'project-status' },
    actions: [{ label: 'Åbn Projekter', href: '#/projects' }, { label: 'Integrationer', href: '#/settings/integrations' }],
  },
  {
    id: 'organize-projects', category: 'projects', app: 'cursor', icon: 'tag', minutes: 2,
    title: 'Organisér dine projekter',
    summary: 'Favoritter, status, samlinger, tags og noter.',
    sections: [
      { steps: [
        { t: 'Favoritter', d: 'Tryk på stjernen for at holde vigtige projekter øverst og på dit dashboard.' },
        { t: 'Status', d: 'Markér et projekt som Aktiv, Pause, Idé, Færdig eller Arkiveret. Arkiverede skjules fra standardvisningen.' },
        { t: 'Samlinger og tags', d: 'Saml projekter i fx “Kunder” eller “Skole”, og giv dem tags som “react” eller “arduino”. Filtrér på dem i oversigten.' },
        { t: 'Noter', d: 'Skriv en kort note om, hvor du slap. Den vises på projektets side.' },
      ] },
      { callout: { kind: 'info', text: 'Organiseringen gemmes på din konto. Selve projektmapperne ændres aldrig.' } },
    ],
    actions: [{ label: 'Åbn Projekter', href: '#/projects' }],
  },
  {
    id: 'circuitpilot', category: 'learning', app: 'circuitpilot', icon: 'circuit', minutes: 3,
    title: 'CircuitPilot – kom i gang',
    summary: 'Elektronik-akademiet: Learn, Train, Lab, Career og Profile.',
    sections: [
      { h: 'Fem områder', table: [
        ['Learn', 'Slides (15 emner), Skill Tree med 5 kapitler, Blueprint-analyse'],
        ['Train', 'Quiz (Easy→Hard), flashcards, Race, eksamen med dansk karakterskala, Hardcore, beregninger'],
        ['Lab', 'Ohms lov, LED-formodstand, RC-kurve, logiske gates, kredsløbs-sandbox, wire challenges, fejlfinding'],
        ['Career', 'Projekter trin for trin, reparationsopgaver og komponent-samling'],
        ['Profile', 'Statistik, badges, ranglister og sværhedsgrad'],
      ] },
      { h: 'Din fremdrift', p: 'CircuitPilot bruger nu din HUBTECH-konto. XP, badges, streaks og resultater gemmes på serveren og tæller med i dit samlede level.' },
    ],
    actions: [{ label: 'Åbn CircuitPilot', href: '#/learn/circuitpilot' }],
  },
  {
    id: 'courses', category: 'learning', app: 'learning', icon: 'graduation', minutes: 2,
    title: 'Sådan bruger du kurserne',
    summary: 'Dage, opgaver, selvtjek, noter og genoptagelse.',
    sections: [
      { steps: [
        { t: 'Vælg en dag', d: 'Hver dag har et mål, læsestof, læringspunkter, øvelser og selvtjek.' },
        { t: 'Kryds øvelser af', d: 'Hver øvelse giver 15 XP. Når alle øvelser på en dag er klaret, markeres dagen som gennemført (+50 XP).' },
        { t: 'Tjek dig selv', d: 'Fold spørgsmålene ud, når du har svaret i hovedet. Markér dem, du var usikker på – de samles til repetition på dag 12.' },
        { t: 'Skriv noter', d: 'Hver dag har et notefelt, der gemmes automatisk.' },
        { t: 'Fortsæt hvor du slap', d: '“Fortsæt” åbner altid den dag, du sidst arbejdede på.' },
      ] },
    ],
    actions: [{ label: 'Åbn kurset', href: '#/learn/course/servicetekniker' }],
  },
  {
    id: 'world', category: 'platform', app: 'settings', icon: 'mountain', minutes: 2,
    title: 'Den levende verden og årstiderne',
    summary: 'Automatisk eller manuel årstid, tid på dagen, vejr og bevægelse.',
    sections: [
      { steps: [
        { t: 'Automatisk årstid', d: 'Følger datoen (forår mar–maj, sommer jun–aug, efterår sep–nov, vinter dec–feb). Giver du lov til placering, tages højde for den sydlige halvkugle og dagslængde. Kun breddegraden gemmes, afrundet.' },
        { t: 'Tid på dagen', d: 'Daggry, dag, gylden time og nat følger dit ur – eller vælg selv.' },
        { t: 'Vejr', d: 'Klart, let regn, regn, sne eller tåge. “Automatisk” giver sne om vinteren.' },
        { t: 'Intensitet og lysstyrke', d: 'Skru ned for partikler og bevægelse, eller dæmp baggrunden, hvis du vil have mere ro.' },
        { t: 'Reduceret bevægelse', d: 'Følger systemets indstilling, eller kan slås til manuelt. Så vises et stillbillede.' },
      ] },
    ],
    show: { route: '#/settings/world', target: 'world-settings' },
    actions: [{ label: 'Indstillinger → Verden', href: '#/settings/world' }],
  },
  {
    id: 'privacy', category: 'platform', app: 'settings', icon: 'shield', minutes: 2,
    title: 'Data, sikkerhed og privatliv',
    summary: 'Hvad gemmes hvor, og hvordan er det beskyttet.',
    sections: [
      { table: [
        ['Konti og profil', 'SQLite-database i ~/.hubtech/hubtech.db (kan ændres med HUBTECH_DATA_DIR)'],
        ['Adgangskoder', 'Kun som scrypt-hash med unikt salt – aldrig i klartekst'],
        ['Sessioner', 'Tilfældig token i en HttpOnly-cookie; kun et hash gemmes på serveren'],
        ['Fremdrift og indstillinger', 'På din konto i databasen'],
        ['Kun i browseren', 'Udseendet af verden før login og små bekvemmeligheder'],
      ] },
      { list: [
        'Login begrænses til 5 forsøg pr. 5 minutter.',
        'Alle ændringer kræver en særlig header og samme oprindelse (CSRF-beskyttelse).',
        'Lokale projekter er kun synlige for ejeren, og filindhold sendes aldrig – kun navne og metadata.',
      ] },
    ],
    actions: [{ label: 'Sikkerhedsindstillinger', href: '#/settings/security' }],
  },
  {
    id: 'add-app', category: 'developer', app: 'hubtech', icon: 'rocket', minutes: 5,
    title: 'Tilføj en ny app',
    summary: 'Én registrering + ét modul. Navigation, søgning og launcher følger automatisk med.',
    sections: [
      { steps: [
        { t: 'Opret sidemodulet', d: 'Lav web/js/pages/minapp.js, der eksporterer et objekt med render(ctx).', code: "export default {\n  title: 'Min app',\n  render(ctx) {\n    return h('div', { class: 'page' }, h('h1', null, 'Hej ' + ctx.user.displayName));\n  },\n};" },
        { t: 'Registrér appen', d: 'Tilføj et objekt i web/js/core/registry.js. Route #/apps/<id> virker automatisk.', code: "{\n  id: 'minapp', name: 'Min app', tagline: 'Kort formål',\n  icon: 'rocket', hue: '#ff5fa2', route: '#/apps/minapp',\n  category: 'workspace', status: 'available',\n  page: () => import('../pages/minapp.js'),\n}" },
        { t: 'Gem data pr. bruger', d: 'Brug den fælles state-API – data knyttes automatisk til den indloggede bruger.', code: "await api.put('/api/state/minapp', { state: { ... } });\nconst { state } = await api.get('/api/state/minapp');" },
        { t: 'Kræv rettigheder', d: 'Sæt requires: { role: \'owner\' } for apps, der rører lokale filer. Serveren håndhæver det også.' },
      ] },
    ],
    actions: [{ label: 'Se alle apps', href: '#/apps' }],
  },
  // ── ByteForge (from the ByteForge guide) ──
  {
    id: 'bf-install', category: 'byteforge', app: 'byteforge', icon: 'download', minutes: 4,
    title: 'ByteForge: installation og opstart',
    summary: 'Download, installer eller quick-start på Linux, macOS og Windows.',
    sections: [
      { p: 'ByteForge installeres fra terminalen på Linux, macOS og Windows. Installeren tjekker Python-version, vælger admin-password, opsætter service og håndterer Docker automatisk.' },
      { steps: [
        { t: 'Download og udpak', d: 'Filen hedder ByteForge.zip. Gem den og udpak den.', code: '# Terminal (Linux / macOS)\nunzip ByteForge.zip && cd ByteForge', tip: 'Windows: Højreklik på ZIP-filen → "Udpak alt". Åbn den udpakkede mappe — du skal se install.bat, start.bat og ByteForge-mappen.' },
        { t: 'Installer eller quick-start', d: 'Fuld installation opsætter ByteForge som en service der starter ved boot. Quick-start kører serveren direkte uden at installere noget.', code: '# Fuld installation — Linux\nsudo ./install.sh\n\n# Fuld installation — macOS\n./install.sh\n\n# Fuld installation — Windows PowerShell\n.\\install.ps1\n\n# Quick-start uden installation — Linux\n./start.sh\n\n# Quick-start uden installation — Windows\nDobbeltklik på start.bat' },
        { t: 'Åbn panelet', d: 'Åbn din browser og gå til adressen nedenfor. Ved første login vælger du et admin-password.', code: 'http://127.0.0.1:8080\nBrugernavn: ADMIN', tip: 'Kører ByteForge på en anden computer? Brug den computers lokale IP i stedet — f.eks. http://192.168.1.100:8080. Find IP med: ip a (Linux) / ipconfig (Windows).' },
        { t: 'Stop serveren', d: 'Quick-start: tryk CTRL+C i terminalen eller kør stop-kommandoen. Installeret service: brug systemctl.', code: '# Stop quick-start (Linux)\n./start.sh stop\n\n# Stop quick-start (Windows)\nstart.bat stop\n\n# Stop installeret service (Linux)\nsudo systemctl stop byteforge' },
      ] },
      { callout: { kind: 'warn', text: 'Docker skal installeres separat. Installeren tilbyder at installere Docker automatisk — sig ja når den spørger. Game servers og app store virker ikke uden Docker.' } },
      { h: 'Krav', list: ['Kræver Python 3.8+', 'Ingen cloud-tjenester eller abonnement', 'Kører 100% lokalt på din hardware', 'Open source — MIT License'] },
    ],
    actions: [{ label: 'ByteForge på GitHub', href: 'https://github.com/Lucas050908/ByteForge', external: true }, { label: 'Forbind ByteForge', href: '#/apps/byteforge' }],
  },
  {
    id: 'bf-files', category: 'byteforge', app: 'byteforge', icon: 'folder', minutes: 2,
    title: 'ByteForge: fil-manager',
    summary: 'Naviger, forhåndsvis, upload, omdøb og del filer.',
    sections: [
      { p: 'Fil-manageren viser dine filer med ikon-grid ligesom CasaOS. Klik på mapper for at navigere, højreklik for kontekstmenu, og træk filer direkte ind for at uploade.' },
      { table: [
        ['Naviger', 'Klik på en mappe for at åbne den. Klik i breadcrumben for at gå tilbage.'],
        ['Forhåndsvis', 'Klik på en fil — billeder, video, lyd og tekst åbnes direkte i browseren.'],
        ['Download', 'Højreklik → Download, eller via preview-vinduet.'],
        ['Omdøb', 'Højreklik på fil eller mappe → Omdøb.'],
        ['Upload', "Klik Upload-knappen eller træk filer direkte ind på grid'et."],
        ['Skjulte filer', 'Klik ⊙-knappen for at vise/skjule filer der starter med punktum.'],
      ] },
      { h: 'Lagerområder', table: [
        ['HOME', 'Standard visning. Viser din rigtige hjemmemappe med Desktop, Documents, Downloads osv.'],
        ['PUBLIC', 'Filer her er tilgængelige for alle uden login. Brug til hjemmesider og delte downloads.'],
        ['PRIVATE', 'Personlige filer. Kun din bruger kan se og redigere.'],
        ['SERVERS', 'Konfigurationsfiler, worlds, mods og plugins for hvert game server.'],
      ] },
    ],
    actions: [{ label: 'Åbn ByteForge', href: '#/apps/byteforge' }],
  },
  {
    id: 'bf-games', category: 'byteforge', app: 'byteforge', icon: 'gamepad', minutes: 3,
    title: 'ByteForge: game servers',
    summary: 'Minecraft, FiveM, Terraria og custom servere via Docker.',
    sections: [
      { p: 'ByteForge understøtter otte servertyper via Docker. Du behøver ikke forstå Docker — ByteForge håndterer alt.' },
      { table: [
        ['Minecraft Paper', 'Anbefalet. Optimeret med plugin-understøttelse. Port 25565'],
        ['Vanilla / Forge / Fabric', "Standard Minecraft eller modded. Vælg efter dine spilleres setup."],
        ['FiveM', 'GTA V multiplayer. Kræver FiveM-licens fra cfx.re.'],
        ['Terraria', 'Dedikeret Terraria-server. Op til 255 spillere.'],
        ['Custom', 'Kør et hvilket som helst Docker-image med egen konfiguration.'],
      ] },
      { steps: [
        { t: 'Opret en server', d: 'Panelet → Game Servers → + NY SERVER → Vælg type, giv den et navn og sæt RAM-grænse (2048 MB anbefales til Minecraft).' },
        { t: 'Tilslut til serveren', d: 'Åbn Minecraft → Multiplayer → Tilføj server. Brug din lokale IP og port.', code: '# Find din IP i ByteForge → System → IP-adresse\n# Hjemmenetværk: [DIN-SERVER-IP]:25565\n# Udefra (efter port forwarding): [DIN-OFFENTLIGE-IP]:25565' },
      ] },
    ],
    actions: [{ label: 'Åbn ByteForge', href: '#/apps/byteforge' }],
  },
  {
    id: 'bf-docker', category: 'byteforge', app: 'byteforge', icon: 'layers', minutes: 2,
    title: 'ByteForge: apps med ét klik',
    summary: 'Jellyfin, Nextcloud, Bitwarden, Pi-hole, WireGuard og Grafana.',
    sections: [
      { p: 'Via ByteForge App Store og Docker-presets installerer du komplette applikationer på sekunder. Ingen terminal, ingen konfiguration.' },
      { table: [
        ['Jellyfin', 'Stream film og serier til alle enheder. Gratis alternativ til Plex'],
        ['Nextcloud', 'Din egen Google Drive med fotosynk og dokumenter.'],
        ['Bitwarden', 'Selvhostet password manager på din egen server.'],
        ['Pi-hole', 'Blokér reklamer på hele dit netværk med ét klik.'],
        ['WireGuard VPN', 'Sikker fjernadgang til hjemmenetværket fra overalt.'],
        ['Grafana', 'Detaljerede grafer over CPU, RAM, netværk og disk.'],
      ] },
    ],
    actions: [{ label: 'Åbn ByteForge', href: '#/apps/byteforge' }],
  },
  {
    id: 'bf-nas', category: 'byteforge', app: 'byteforge', icon: 'server', minutes: 3,
    title: 'ByteForge: NAS, fildeling og porte',
    summary: 'NFS/Samba-deling og hvilke porte der skal åbnes.',
    sections: [
      { p: 'Tilslut NAS-drevet fra alle enheder på dit netværk. Windows bruger Stifinder, Mac bruger Finder, Linux bruger mount.' },
      { steps: [
        { t: 'Opsæt NAS i panelet', d: 'Panelet → NAS → Vælg en mappe og subnet → Klik Aktiver. ByteForge konfigurerer NFS og Samba automatisk.' },
        { t: 'Tilslut fra din enhed', d: '', code: '# Windows Stifinder — skriv i adresselinjen:\n\\\\[DIN-SERVER-IP]\\nas-share\n\n# Mac Finder → Gå → Opret forbindelse til server:\nnfs://[DIN-SERVER-IP]/mnt/nas-share\n\n# Linux terminal:\nsudo mount -t nfs [DIN-SERVER-IP]:/mnt/nas-share /mnt/remote' },
      ] },
      { h: 'Åbne porte', table: [
        ['ByteForge Panel', '8080 · TCP · Web-kontrolpanel og API · STANDARD'],
        ['Minecraft', '25565 · TCP/UDP · Minecraft game server · VALGFRI'],
        ['FiveM', '30120 · TCP/UDP · GTA V multiplayer server · VALGFRI'],
        ['NFS Server', '2049 · TCP · Network File System · LAN ONLY'],
        ['Samba/SMB', '445 · TCP · Windows fildeling · LAN ONLY'],
        ['WireGuard VPN', '51820 · UDP · VPN — giver sikker adgang til alt · ANBEFALET'],
      ] },
      { callout: { kind: 'info', text: 'Med WireGuard VPN behøver du kun at forwarde port 51820 — VPN giver adgang til alle andre services sikkert.' } },
    ],
    actions: [{ label: 'Åbn ByteForge', href: '#/apps/byteforge' }],
  },
  {
    id: 'bf-faq', category: 'byteforge', app: 'byteforge', icon: 'help', minutes: 3,
    title: 'ByteForge: ofte stillede spørgsmål',
    summary: 'install.sh vs. start.sh, drift, sikkerhed, strømsvigt og Windows.',
    faq: [
      ['Hvad er forskellen på install.sh og start.sh?', 'install.sh kører én gang og opsætter ByteForge som en permanent service der starter automatisk ved boot (via systemd). Kræver sudo. start.sh starter bare serveren direkte fra projektmappen — ingen installation, ingen systemd. Perfekt til at teste. Stop med ./start.sh stop.'],
      ['Hvad koster det at drive ByteForge?', 'ByteForge kører på din egen hardware — der er ingen abonnementer eller cloud-gebyrer. Du betaler kun for strømmen: typisk 15-30W for en mini-PC, svarende til ca. 100-200 kr. om måneden.'],
      ['Skal jeg have teknisk erfaring?', 'Næsten ikke. Den eneste tekniske del er at køre installeren i terminalen én gang. Herefter styres alt via browseren med klik.'],
      ['Er mine data sikre?', 'Alt kører på din egen hardware. Dine filer forlader aldrig din server. ByteForge har desuden rate limiting på login (5 forsøg → 5 minutters lockout) og admin-passwordet gemmes i en sikker systemfil.'],
      ['Hvad sker der hvis strømmen går?', 'Hvis du har brugt installeren: alle services starter automatisk igen. Docker-containere, ByteForge-panelet og NFS-serveren starter alle op af sig selv via systemd/launchd. Bruger du start.sh: du skal starte manuelt igen.'],
      ['Kan jeg tilgå serveren udefra?', 'Ja — ved at port-forwarde port 8080 i din router til serverens lokale IP. For ekstra sikkerhed anbefales WireGuard VPN (installeres med ét klik via panelet) — så skal du kun forwarde én port.'],
      ['Virker ByteForge på Windows?', 'Ja. Dobbeltklik på start.bat for en hurtig start — den finder Python, åbner browseren og starter serveren automatisk. For permanent installation køres install.ps1 i PowerShell. Game servers kræver Docker Desktop for Windows.'],
    ],
    sections: [],
    actions: [{ label: 'Åbn et issue på GitHub', href: 'https://github.com/Lucas050908/ByteForge/issues', external: true }],
  },
  // ── Printer-support (kontor- og netværksprintere) ──
  {
    id: 'printer-basics', category: 'printer', app: 'printerdoctor', icon: 'printer', minutes: 4,
    title: 'Sådan virker en printer',
    summary: 'Laser og blæk, de dele der slides – og hvad det betyder for fejlfinding.',
    sections: [
      { h: 'To slags printere', steps: [
        { t: 'Laserprinter', d: 'En lysstråle tegner siden på en tromle, der tiltrækker tonerpulver. Pulveret overføres til papiret og smeltes fast i fikseringsenheden (fuseren), som er varm. Hurtig og billig pr. side – god til kontorer.' },
        { t: 'Blækprinter', d: 'Et printhoved sprøjter små dråber blæk på papiret gennem hundredvis af dyser. God til fotos og farver, men dyserne kan tørre ud, hvis printeren ikke bruges.' },
      ] },
      { h: 'Dele der slides', list: [
        'Toner (laser) og blækpatroner – forbrugsvarer, der skiftes jævnligt.',
        'Tromle (laser) – sidder nogle gange i tonerpatronen, ellers som en separat del. Slidt tromle giver gentagne prikker eller striber.',
        'Fikseringsenhed (laser) – smelter toneren fast. Slidt fuser: toner kan tørres af med en finger, eller der kommer krøller i papiret.',
        'Indføringsvalser – trækker papiret ind. Glatte valser giver papirstop og flere ark ad gangen.',
        'Printhoved (blæk) – kan tilstoppe. Rens med printerens egen rensefunktion før alt andet.',
      ] },
      { callout: { kind: 'info', text: 'Skriv altid model og serienummer ned (står bag på printeren eller på konfigurationssiden). Det skal bruges til drivere, reservedele og support hos producenten.' } },
    ],
    actions: [{ label: 'Åbn Printer-doktor', href: '#/apps/printerdoctor' }],
  },
  {
    id: 'printer-install', category: 'printer', app: 'printerdoctor', icon: 'plug', minutes: 5,
    title: 'Installér en netværksprinter',
    summary: 'Find printerens IP-adresse og tilføj den i Windows og på Mac.',
    sections: [
      { h: 'Find printerens IP-adresse', steps: [
        { t: 'På printerens skærm', d: 'Kig under Netværk, Wi-Fi eller Indstillinger → Netværksstatus. Mange printere viser IP-adressen direkte.' },
        { t: 'Udskriv en konfigurationsside', d: 'Hedder ofte “Netværkskonfiguration” eller “Printerrapport”. Den viser IP-adresse, firmware og sidetæller.' },
        { t: 'Tjek at den svarer', d: 'Skriv ping og adressen i en kommandoprompt. Svarer den, er printeren på netværket.', code: 'ping 192.168.1.50' },
      ] },
      { h: 'Windows 10 og 11', steps: [
        { t: 'Åbn Printere og scannere', d: 'Start → Indstillinger → Bluetooth og enheder → Printere og scannere → Tilføj enhed.' },
        { t: 'Hvis den ikke dukker op', d: 'Klik “Tilføj manuelt” / “Den printer, jeg vil have, er ikke på listen” → “Tilføj en printer ved hjælp af en IP-adresse eller et værtsnavn”. Skriv IP-adressen.' },
        { t: 'Vælg driver', d: 'Brug den driver Windows foreslår, eller hent producentens driver til netop den model.' },
      ] },
      { h: 'macOS', steps: [
        { t: 'Tilføj printer', d: 'Systemindstillinger → Printere og scannere → Tilføj printer (+).' },
        { t: 'Via IP', d: 'Vælg fanen IP, skriv adressen, og vælg protokollen IPP eller AirPrint, hvis printeren understøtter det.' },
      ] },
      { callout: { kind: 'warn', text: 'Giv printeren en fast IP-adresse (DHCP-reservation i routeren). Ellers kan den få en ny adresse efter en genstart – og så “forsvinder” den for alle computerne.' } },
    ],
    actions: [{ label: 'Fejlfind med Printer-doktor', href: '#/apps/printerdoctor' }],
  },
  {
    id: 'printer-offline', category: 'printer', app: 'printerdoctor', icon: 'alert', minutes: 4,
    title: 'Printeren er “offline”',
    summary: 'Den mest almindelige fejl – og den rækkefølge, du tjekker tingene i.',
    sections: [
      { h: 'Tjek i denne rækkefølge', steps: [
        { t: 'Er printeren tændt og uden fejl?', d: 'Kig på skærmen: papirstop, låge åben, tom toner eller en fejlkode stopper udskrivning.' },
        { t: 'Er den på samme netværk?', d: 'Wi-Fi-printere falder af, hvis routerens kode er ændret. Tjek netværksstatus på printeren.' },
        { t: 'Svarer den på IP-adressen?', d: 'Ping printerens adresse. Svarer den ikke, har den måske fået en ny IP. Find den nye på printerens skærm.', code: 'ping 192.168.1.50' },
        { t: 'Er “Brug printer offline” slået fra?', d: 'Windows: åbn printerkøen (dobbeltklik på printeren) → menuen Printer → fjern fluebenet ved “Brug printer offline”.' },
        { t: 'Genstart udskriftskøen', d: 'Sidder et job fast, kan køen stoppe det hele. Se guiden “Udskriftskøen sidder fast”.' },
        { t: 'Genstart i rigtig rækkefølge', d: 'Sluk printeren, genstart computeren, tænd printeren og vent til den er klar, og prøv igen.' },
      ] },
      { callout: { kind: 'info', text: 'Skifter IP-adressen igen og igen? Lav en DHCP-reservation i routeren, eller tilføj printeren via værtsnavn i stedet for IP.' } },
    ],
    actions: [{ label: 'Åbn Printer-doktor', href: '#/apps/printerdoctor' }],
  },
  {
    id: 'printer-spooler', category: 'printer', app: 'printerdoctor', icon: 'refresh', minutes: 3,
    title: 'Udskriftskøen sidder fast',
    summary: 'Ryd køen i Windows og på Mac, når et job blokerer alt.',
    sections: [
      { h: 'Windows', steps: [
        { t: 'Prøv det nemme først', d: 'Åbn printerkøen, højreklik på jobbet → Annuller. Hjælper det ikke, så fortsæt.' },
        { t: 'Åbn kommandoprompt som administrator', d: 'Start → skriv “cmd” → højreklik → Kør som administrator.' },
        { t: 'Stop køen, ryd den, og start den igen', d: 'Kør de tre linjer én ad gangen. Den midterste sletter de fastlåste job.', code: 'net stop spooler\ndel /Q /F /S "%systemroot%\\System32\\spool\\PRINTERS\\*"\nnet start spooler' },
      ] },
      { h: 'macOS', steps: [
        { t: 'Annuller alle job', d: 'Åbn Terminal og skriv:', code: 'cancel -a' },
        { t: 'Nulstil udskrivningssystemet', d: 'Hvis intet andet virker: Systemindstillinger → Printere og scannere → højreklik i listen → Nulstil printersystem. Alle printere skal så tilføjes igen.' },
      ] },
      { callout: { kind: 'warn', text: 'Kommandoerne sletter alle ventende udskrifter for alle brugere på computeren. Sig det til kunden først.' } },
    ],
    actions: [{ label: 'Se alle kommandoer', href: '#/apps/commands' }],
  },
  {
    id: 'printer-quality', category: 'printer', app: 'printerdoctor', icon: 'eye', minutes: 4,
    title: 'Dårlig printkvalitet',
    summary: 'Striber, blege sider, udtværing og gentagne prikker – hvad de betyder.',
    sections: [
      { h: 'Laserprinter', list: [
        'Blege sider eller hvide striber: toneren er ved at være tom. Ryst patronen forsigtigt fra side til side, eller skift den.',
        'Mørke streger eller prikker med fast afstand: tromlen eller en valse er ridset eller beskidt. Afstanden mellem fejlene passer ofte til en valses omkreds.',
        'Toner kan tørres af med en finger: fikseringsenheden smelter den ikke fast. Tjek papirtypen i driveren – ellers skal fuseren skiftes.',
        'Grå baggrund: ofte en slidt tromle eller forkert papir.',
      ] },
      { h: 'Blækprinter', list: [
        'Manglende linjer eller farver: kør en dysetest. Mangler der dele, kør printerens rensefunktion (højst 2–3 gange i træk), og test igen.',
        'Skæve linjer: kør justering af printhoved.',
        'Udtværing: forkert papirtype i driveren, eller papiret er fugtigt.',
        'Printeren bruges sjældent: print en side om ugen, så dyserne ikke tørrer ud.',
      ] },
      { callout: { kind: 'info', text: 'Brug altid de rigtige papirindstillinger i driveren (almindeligt, tykt, fotopapir, etiketter). Det løser overraskende mange kvalitetsfejl.' } },
    ],
  },
  {
    id: 'printer-jam', category: 'printer', app: 'printerdoctor', icon: 'file', minutes: 3,
    title: 'Papirstop',
    summary: 'Fjern papiret uden at skade printeren – og undgå at det sker igen.',
    sections: [
      { h: 'Fjern papiret', steps: [
        { t: 'Sluk og vent', d: 'Sluk printeren. I en laserprinter er fikseringsenheden meget varm – vent et par minutter.' },
        { t: 'Følg skærmen', d: 'Printeren viser ofte, hvilken låge eller skuffe papiret sidder ved. Åbn den.' },
        { t: 'Træk i papirets retning', d: 'Tag fat med begge hænder og træk langsomt i den retning, papiret kører. Revner det, så find alle små stykker – de giver nyt papirstop.' },
        { t: 'Luk lågerne og tænd', d: 'Printeren tjekker selv, om papirvejen er fri.' },
      ] },
      { h: 'Undgå det', list: [
        'Luft papirstakken, før du lægger den i, så arkene ikke hænger sammen.',
        'Fyld ikke over max-mærket i skuffen, og juster papirstyrene til papiret.',
        'Brug papir, der passer til printeren (gramvægt), og opbevar det tørt.',
        'Bliver det ved, er indføringsvalserne slidte eller beskidte – de kan renses eller skiftes.',
      ] },
    ],
  },
  {
    id: 'printer-scan', category: 'printer', app: 'printerdoctor', icon: 'mail', minutes: 5,
    title: 'Scan til e-mail og mappe',
    summary: 'De to typiske opsætninger på multifunktionsprintere – og hvorfor de holder op med at virke.',
    sections: [
      { h: 'Scan til e-mail', steps: [
        { t: 'Find printerens webside', d: 'Skriv printerens IP-adresse i en browser. Log ind som administrator.' },
        { t: 'Udfyld mailserveren (SMTP)', d: 'Server og port fra mailudbyderen – typisk port 587 med STARTTLS. Brug en app-adgangskode, hvis kontoen har totrinsbekræftelse.' },
        { t: 'Send en test', d: 'Virker det ikke, er adgangskoden ofte ændret – eller udbyderen har slået gamle login-metoder fra.' },
      ] },
      { h: 'Scan til mappe (netværksmappe)', steps: [
        { t: 'Del en mappe', d: 'Opret en mappe på en PC eller server, og del den med en bruger, der har skriveadgang.' },
        { t: 'Indtast stien', d: 'På printeren: stien som \\\\PC-NAVN\\Scanninger, plus brugernavn og adgangskode.' },
        { t: 'Typiske fejl', d: 'Brugerens adgangskode er skiftet, PC’en har fået nyt navn eller ny IP, eller printeren kan kun gammel SMB1 (Windows har slået det fra). Opdater printerens firmware, så den kan SMB2/3.' },
      ] },
    ],
  },
  {
    id: 'printer-drivers', category: 'printer', app: 'printerdoctor', icon: 'download', minutes: 3,
    title: 'Drivere',
    summary: 'Hvilken driver du skal bruge, og hvordan du fjerner en gammel.',
    sections: [
      { h: 'Vælg driver', list: [
        'Producentens driver til den præcise model giver flest funktioner (dupleks, skuffer, hæftning).',
        'Mange producenter har en “universel” driver, der virker med de fleste af deres modeller.',
        'Nyere printere kan bruges uden driver (IPP Everywhere, Mopria, AirPrint) – godt til mobiler og Mac.',
      ] },
      { h: 'Fjern en gammel driver i Windows', steps: [
        { t: 'Fjern printeren', d: 'Indstillinger → Printere og scannere → vælg printeren → Fjern.' },
        { t: 'Fjern selve driveren', d: 'Åbn Egenskaber for printerserver, fanen Drivere, vælg driveren → Fjern → “Fjern driver og driverpakke”.', code: 'printui /s /t2' },
        { t: 'Installér igen', d: 'Genstart computeren, og tilføj printeren på ny med den rigtige driver.' },
      ] },
    ],
    actions: [{ label: 'Se alle kommandoer', href: '#/apps/commands' }],
  },
  {
    id: 'printer-mobile', category: 'printer', app: 'printerdoctor', icon: 'smartphone', minutes: 3,
    title: 'Print fra mobilen',
    summary: 'AirPrint, Mopria og Wi-Fi Direct – sådan virker det, og når det ikke gør.',
    sections: [
      { steps: [
        { t: 'iPhone og iPad (AirPrint)', d: 'Del → Udskriv. Printeren skal understøtte AirPrint og være på samme Wi-Fi. Gæstenetværk blokerer det ofte.' },
        { t: 'Android (Mopria / standardudskrivning)', d: 'Del → Udskriv, eller Indstillinger → Forbundne enheder → Udskrivning. Producentens app kan give flere funktioner.' },
        { t: 'Wi-Fi Direct', d: 'Printeren laver sit eget lille netværk, som telefonen forbinder til direkte. Godt når der ikke er en router – men telefonen mister internet imens.' },
      ] },
      { callout: { kind: 'info', text: 'Finder telefonen ikke printeren? Tjek at begge er på samme netværk (ikke et gæstenetværk), og at routeren ikke isolerer trådløse enheder fra hinanden.' } },
    ],
  },
  {
    id: 'printer-visit', category: 'printer', app: 'servicehelp', icon: 'tool', minutes: 3,
    title: 'Servicebesøg hos kunden',
    summary: 'Hvad du skal notere, før du går i gang – og hvordan du afslutter.',
    sections: [
      { h: 'Før du går i gang', list: [
        'Model og serienummer.',
        'Sidetæller (står på konfigurationssiden) – vigtigt ved garanti og serviceaftaler.',
        'Fejlbeskrivelse med kundens egne ord, og et billede af fejlkoden på skærmen.',
        'Hvornår startede det, og er der ændret noget (ny router, ny PC, ny adgangskode)?',
      ] },
      { h: 'Når du er færdig', list: [
        'Lav en testudskrift sammen med kunden.',
        'Fortæl kort, hvad der var galt, og hvordan det undgås.',
        'Skriv det i servicesagen: fejl, årsag, løsning, dele og tid.',
      ] },
    ],
    actions: [{ label: 'Åbn Servicehjælp', href: '#/apps/servicehelp' }, { label: 'Tjeklister', href: '#/apps/checklists' }],
  },
];

export const guideById = (id) => GUIDES.find(g => g.id === id);

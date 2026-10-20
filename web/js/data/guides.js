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
];

export const guideById = (id) => GUIDES.find(g => g.id === id);

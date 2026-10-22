/**
 * Central app registry. Adding an app = adding one entry here (+ its page module).
 * Navigation, launcher, search, favorites, onboarding and permissions all read from this list.
 *
 *  id           unique id (also used for per-user state: /api/state/<id>)
 *  name         display name
 *  tagline      one-line purpose
 *  description  longer text for the launcher
 *  icon         icon name from core/icons.js
 *  hue          CSS colour – the app's identity inside the shared design system
 *  route        hash route the app lives at
 *  category     'workspace' | 'learning' | 'system'
 *  status       'available' | 'beta' | 'coming'
 *  requires     { role?: 'owner', owner?: true (hidden for everyone else), admin?: true (owner + those the owner gave access – hidden for everyone else), integration?: 'cursor' | 'byteforge' }
 *  art          landscape thumbnail settings for its card
 *  page         lazy loader for the page module (export default { render(ctx) })
 *  keywords     extra words for search
 */
export const APPS = [
  {
    id: 'hubtech', name: 'HUBTECH Office', tagline: 'Dokumenter, regneark og præsentationer.',
    description: 'Dit kontorprogram: tekstbehandling, regneark med formler og præsentationer med præsentationstilstand. Åbn Word- og Excel-filer, og gem som Word, Excel, PowerPoint og PDF. De klassiske HUBTECH-sider (Pingochat, GameHub …) ligger der stadig.',
    icon: 'hubtech', hue: 'var(--hue-hubtech)', route: '#/apps/hubtech', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'night', focusX: 0.55, tint: '#2f6bff' }, page: () => import('../pages/hubtech.js'),
    keywords: ['office', 'word', 'excel', 'powerpoint', 'dokument', 'regneark', 'præsentation', 'slides', 'tekst', 'community', 'discord', 'minecraft'],
  },
  {
    id: 'byteforge', name: 'ByteForge', tagline: 'Guides, værktøjer og læring.',
    description: 'Et selvhostet homelab, der følger med HUBTECH og kører på samme server. Panelet åbnes direkte her, og hele ByteForge-guiden er med.',
    icon: 'anvil', hue: 'var(--hue-byteforge)', route: '#/apps/byteforge', category: 'workspace', status: 'available',
    requires: { integration: 'byteforge' },
    art: { season: 'spring', time: 'night', focusX: 0.35, tint: '#9b3dff' }, page: () => import('../pages/byteforge.js'),
    keywords: ['homelab', 'server', 'docker', 'nas', 'raid', 'minecraft', 'guide'],
  },
  {
    id: 'circuitpilot', name: 'CircuitPilot', tagline: 'Elektronik, simuleringer og kurser.',
    description: 'Lær elektronik med slides, skill tree, quiz, flashcards, eksamen, kredsløbs-sandbox, fejlfinding og reparationsopgaver. Din XP tæller med i din samlede profil.',
    icon: 'circuit', hue: 'var(--hue-circuitpilot)', route: '#/learn/circuitpilot', category: 'learning', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.62, tint: '#00b894' }, page: () => import('../pages/circuitpilot.js'),
    keywords: ['elektronik', 'ohm', 'quiz', 'flashcards', 'kredsløb', 'lab', 'eksamen'],
  },
  {
    id: 'codeschool', name: 'Kodeskolen', tagline: 'Lær at programmere – trin for trin.',
    description: 'Korte lektioner i Python, JavaScript, HTML/CSS, Git og Arduino med kode du kører direkte i browseren, opgaver der rettes automatisk, quizzer og XP.',
    icon: 'graduation', hue: 'var(--hue-codeschool)', route: '#/learn/codeschool', category: 'learning', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#6366f1' }, page: () => import('../pages/codeschool.js'),
    keywords: ['programmering', 'kode', 'python', 'javascript', 'html', 'css', 'git', 'arduino', 'kursus', 'lær'],
  },
  {
    id: 'customers', name: 'Kunder', tagline: 'Alt om hver kunde – og fakturaer.',
    description: 'Én side pr. kunde med timer, aftaler, servicerapporter og opgaver fra dine andre apps. Lav fakturaudkast af ufakturerede timer og dele fra lageret, og hent dem som PDF.',
    icon: 'users', hue: 'var(--hue-customers)', route: '#/apps/customers', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.45, tint: '#fb923c' }, page: () => import('../pages/customers.js'),
    keywords: ['kunder', 'kunde', 'faktura', 'fakturering', 'crm', 'kontakt', 'cvr', 'regning'],
  },
  {
    id: 'flashcards', name: 'Huskekort', tagline: 'Lær udenad med smarte gentagelser.',
    description: 'Lav sæt med huskekort og gennemgå dem med spaced repetition: kort du kan, kommer sjældnere, og kort du glemmer, kommer hurtigt igen. Import fra Excel/CSV og fra Kodeskolens quizzer.',
    icon: 'layers', hue: 'var(--hue-flashcards)', route: '#/learn/flashcards', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'night', focusX: 0.55, tint: '#f472b6' }, page: () => import('../pages/flashcards.js'),
    keywords: ['huskekort', 'flashcards', 'gloser', 'lær udenad', 'spaced repetition', 'anki', 'quiz'],
  },
  {
    id: 'cursor', name: 'Cursor Projekter', tagline: 'Cursor-projekter og udvikling (kun ejeren).',
    description: 'Viser de seneste Cursor-projekter og projektmapper på den computer, HUBTECH kører på, med git-status, og åbner dem i Cursor med ét klik. Kun platformens ejer kan bruge appen.',
    icon: 'cube', hue: 'var(--hue-cursor)', route: '#/projects', category: 'workspace', status: 'available',
    requires: { role: 'owner', integration: 'cursor' },
    art: { season: 'winter', time: 'dusk', focusX: 0.6, mono: true }, page: () => import('../pages/projects.js'),
    keywords: ['projekter', 'kode', 'git', 'repo', 'cursor', 'ide'],
  },
  {
    id: 'archive-01', name: 'ARCHIVE-01', tagline: 'Portable cyberdeck-projektet.',
    description: 'Projektsiden for ARCHIVE-01 – en bærbar cyberdeck med Raspberry Pi CM5, 8,8" IPS-skærm og 3D-printet kabinet. Kører uændret inde i HUBTECH.',
    icon: 'terminal', hue: 'var(--hue-archive)', route: '#/apps/archive-01', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#ff2bd6' }, page: () => import('../pages/archive.js'),
    keywords: ['cyberdeck', 'raspberry', 'pi', '3d-print', 'archive'],
  },
  {
    id: 'servicehelp', name: 'Servicehjælp', tagline: 'Rapporter, kalender og kunder.',
    description: 'Din arbejdsdag som servicetekniker: servicerapporter som PDF, kalender, kunder, log, fejlsøgning, vidensbank, udgifter, kørebog og garantier. Alt gemmes på din HUBTECH-konto.',
    icon: 'tool', hue: 'var(--hue-service)', route: '#/apps/servicehelp', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#ff7a1a' }, page: () => import('../pages/servicehelp.js'),
    keywords: ['service', 'rapport', 'servicerapport', 'kunde', 'kørebog', 'udgift', 'garanti', 'fejlsøgning', 'tekniker', 'pdf'],
  },
  {
    id: 'tasks', name: 'Opgaver', tagline: 'Dit board: at gøre, i gang, færdig.',
    description: 'Et kanban-board til dine opgaver med prioritet, deadline og kobling til dine Cursor-projekter. Træk kort mellem kolonnerne. Gemmes på din konto.',
    icon: 'kanban', hue: 'var(--hue-tasks)', route: '#/apps/tasks', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.4, tint: '#ff2f7a' }, page: () => import('../pages/tasks.js'),
    keywords: ['todo', 'to-do', 'kanban', 'opgave', 'deadline', 'board', 'plan'],
  },
  {
    id: 'notes', name: 'Noter', tagline: 'Hurtige noter, gemt på din konto.',
    description: 'Skriv idéer, mødenoter og huskelister. Søg, fastgør og farv dem – alt gemmes automatisk på serveren, så de følger dig på alle enheder.',
    icon: 'note', hue: 'var(--hue-notes)', route: '#/apps/notes', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.4, tint: '#ff9500' }, page: () => import('../pages/notes.js'),
    keywords: ['noter', 'note', 'notat', 'idé', 'huskeliste', 'skriv'],
  },
  {
    id: 'focus', name: 'Fokus', tagline: 'Pomodoro-timer med statistik.',
    description: 'Arbejd i fokusblokke med pauser imellem. Knyt en session til en opgave, og se hvor meget du har nået i dag og denne uge. Timeren kører videre, mens du bruger resten af HUBTECH.',
    icon: 'timer', hue: 'var(--hue-focus)', route: '#/apps/focus', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'night', focusX: 0.55, tint: '#5b5bff' }, page: () => import('../pages/focus.js'),
    keywords: ['pomodoro', 'timer', 'fokus', 'pause', 'koncentration', 'tid'],
  },
  {
    id: 'toolkit', name: 'Værktøjskasse', tagline: 'Beregnere til elektronik, el og netværk.',
    description: 'Ohms lov, modstandens farvekode, spændingsdeler, formodstand til LED, serie/parallel og kondensator-koder. Passer til CircuitPilot og servicetekniker-kurset.',
    icon: 'calculator', hue: 'var(--hue-toolkit)', route: '#/learn/toolkit', category: 'learning', status: 'available',
    art: { season: 'winter', time: 'dawn', focusX: 0.5, tint: '#00b8d9' }, page: () => import('../pages/toolkit.js'),
    keywords: ['ohm', 'modstand', 'farvekode', 'led', 'spændingsdeler', 'beregner', 'elektronik', 'kondensator'],
  },
  {
    id: 'community', name: 'Fællesskab', tagline: 'Chat, servere, snaps og musik sammen.',
    description: 'Dit eget sted at snakke: servere med kanaler, roller og regler, private beskeder mellem venner, snaps der forsvinder, stories i 24 timer og musikrum, hvor alle lytter samtidig. Del noter, aftaler og kodestumper direkte fra dine andre apps.',
    icon: 'chat', hue: 'var(--hue-community)', route: '#/apps/community', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.4, tint: '#6d7cff' }, page: () => import('../pages/community.js'),
    keywords: ['chat', 'discord', 'snap', 'snapchat', 'besked', 'server', 'kanal', 'venner', 'story', 'musik', 'fællesskab', 'dm'],
  },
  {
    id: 'calendar', name: 'Kalender', tagline: 'Aftaler, deadlines og påmindelser.',
    description: 'Måneds- og ugeoversigt over dine aftaler med påmindelser. Deadlines fra Opgaver vises automatisk, og kalenderen kan hentes som .ics til telefonen eller Outlook.',
    icon: 'calendar', hue: 'var(--hue-calendar)', route: '#/apps/calendar', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.45, tint: '#38bdf8' }, page: () => import('../pages/calendar.js'),
    keywords: ['kalender', 'aftale', 'møde', 'dato', 'påmindelse', 'ics', 'uge', 'måned'],
  },
  {
    id: 'inventory', name: 'Lager', tagline: 'Komponenter, beholdning og indkøb.',
    description: 'Hold styr på dine komponenter og reservedele: antal, placering, leverandør og pris. Se hvad der er ved at slippe op, og få en indkøbsliste med ét klik.',
    icon: 'box', hue: 'var(--hue-inventory)', route: '#/apps/inventory', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.6, tint: '#f59e0b' }, page: () => import('../pages/inventory.js'),
    keywords: ['lager', 'komponent', 'reservedel', 'beholdning', 'indkøb', 'modstand', 'kondensator', 'skuffe'],
  },
  {
    id: 'timesheet', name: 'Tidsregistrering', tagline: 'Start/stop-ur og timesedler.',
    description: 'Registrér tid på kunder og projekter med ét klik. Se dag, uge og måned, beregn beløb ud fra din timepris, og hent timesedlen som CSV eller Excel.',
    icon: 'stopwatch', hue: 'var(--hue-timesheet)', route: '#/apps/timesheet', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'dusk', focusX: 0.5, tint: '#34d399' }, page: () => import('../pages/timesheet.js'),
    keywords: ['tid', 'timer', 'timeseddel', 'faktura', 'kunde', 'registrering', 'stempel'],
  },
  {
    id: 'studio', name: 'App-værksted', tagline: 'Byg dine egne apps – med AI-hjælp.',
    description: 'En kode-editor til HTML, CSS og JavaScript med live forhåndsvisning og konsol. Din lokale AI-assistent kan skrive og rette koden for dig. Appene kører sikkert inde i HUBTECH, gemmer deres data på din konto og kan deles med andre brugere.',
    icon: 'code', hue: 'var(--hue-studio)', route: '#/apps/studio', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.6, tint: '#fbbf24' }, page: () => import('../pages/studio.js'),
    keywords: ['kode', 'editor', 'app', 'html', 'css', 'javascript', 'ai', 'byg', 'program', 'web', 'værksted', 'ide'],
  },
  {
    id: 'snippets', name: 'Kodestumper', tagline: 'Dit bibliotek af kode og kommandoer.',
    description: 'Gem kodestykker, terminal-kommandoer og konfigurationer med sprog og tags. Søg, kopiér med ét klik, og hav dem med på alle dine enheder.',
    icon: 'code', hue: 'var(--hue-snippets)', route: '#/learn/snippets', category: 'learning', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.4, tint: '#c084fc' }, page: () => import('../pages/snippets.js'),
    keywords: ['kode', 'snippet', 'kommando', 'terminal', 'python', 'javascript', 'bash', 'config'],
  },
  {
    id: 'minecraft', name: 'Minecraft-server', tagline: 'HUBTECH’s Minecraft-server – adresse, status og regler.',
    description: 'Alt om HUBTECH’s Minecraft-server: adressen med en kopiér-knap, om serveren er online, hvor mange der spiller, hvordan du kommer ind, regler, links og nyheder. Ejeren og administratorerne kan ændre oplysningerne.',
    icon: 'gamepad', hue: 'var(--hue-minecraft)', route: '#/apps/minecraft', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.5, tint: '#4ade80' }, page: () => import('../pages/minecraft.js'),
    keywords: ['minecraft', 'server', 'ip', 'adresse', 'spil', 'java', 'bedrock', 'mc'],
  },
  {
    id: 'admin', name: 'Admin', tagline: 'Styring af platformen – for ejeren og administratorerne.',
    description: 'Overblik over brugere og aktivitet, anmeldelser fra Fællesskab, beskeder til alle og en log over, hvad administratorerne gør. Kun ejeren og dem, ejeren giver adgang, kan se og åbne appen.',
    icon: 'shield', hue: 'var(--hue-admin)', route: '#/apps/admin', category: 'system', status: 'available', requires: { admin: true },
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#ef4444' }, page: () => import('../pages/admin.js'),
    keywords: ['admin', 'administrator', 'brugere', 'moderation', 'anmeldelser', 'besked', 'adgang', 'kontrol'],
  },
  {
    id: 'glossary', name: 'IT-ordbog', tagline: 'IT-ord forklaret på almindeligt dansk.',
    description: 'Over 100 ord om hardware, netværk, printere, sikkerhed og drift – med søgning, en lille quiz og ét klik til huskekort.',
    icon: 'book', hue: 'var(--hue-glossary)', route: '#/learn/glossary', category: 'learning', status: 'available',
    art: { season: 'spring', time: 'dusk', focusX: 0.45, tint: '#fda4af' }, page: () => import('../pages/glossary.js'),
    keywords: ['ordbog', 'begreber', 'ord', 'forklaring', 'leksikon', 'glossary', 'dns', 'dhcp', 'toner'],
  },
  {
    id: 'quiz', name: 'Quiz', tagline: 'Test din IT-viden.',
    description: 'Quizzer om printere, netværk, hardware, sikkerhed og Windows med en forklaring efter hvert svar. Slå din egen rekord.',
    icon: 'help', hue: 'var(--hue-quiz)', route: '#/learn/quiz', category: 'learning', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.5, tint: '#fb923c' }, page: () => import('../pages/quiz.js'),
    keywords: ['quiz', 'test', 'spørgsmål', 'eksamen', 'viden', 'printer', 'netværk', 'sikkerhed'],
  },
  {
    id: 'typing', name: 'Tastaturtræner', tagline: 'Skriv hurtigt med ti fingre.',
    description: 'Lektioner fra hjemrækken til rigtige sætninger med æ, ø og å. Måler hastighed og præcision og husker dine rekorder.',
    icon: 'edit', hue: 'var(--hue-typing)', route: '#/learn/typing', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#facc15' }, page: () => import('../pages/typing.js'),
    keywords: ['tastatur', 'skrive', 'touch', 'ti fingre', 'hastighed', 'wpm', 'typing'],
  },
  {
    id: 'bits', name: 'Bit-spil', tagline: 'Lær det binære talsystem.',
    description: 'Tænd de rigtige bits, til tallet passer – på tid. Tre niveauer: 4 bit, 8 bit og hex.',
    icon: 'chip', hue: 'var(--hue-bits)', route: '#/learn/bits', category: 'learning', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#67e8f9' }, page: () => import('../pages/bits.js'),
    keywords: ['binær', 'bits', 'bytes', 'hex', 'talsystem', 'spil', 'nuller og ettaller'],
  },
  {
    id: 'printerdoctor', name: 'Printer-doktor', tagline: 'Fejlfinding på printere, trin for trin.',
    description: 'Vælg problemet – offline, papirstop, dårlig kvalitet, scanning – og svar på spørgsmålene. Printer-doktor fører dig til løsningen med kommandoer og guides og laver en servicenote til sidst.',
    icon: 'printer', hue: 'var(--hue-printer)', route: '#/apps/printerdoctor', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.4, tint: '#60a5fa' }, page: () => import('../pages/printerdoctor.js'),
    keywords: ['printer', 'print', 'udskrift', 'offline', 'papirstop', 'toner', 'blæk', 'scanner', 'spooler', 'fejlfinding', 'support'],
  },
  {
    id: 'commands', name: 'Kommandoer', tagline: 'Kommandoer til Windows, Mac og Linux.',
    description: 'Søg i de kommandoer en IT-supporter bruger mest – netværk, printer, reparation, systeminfo og diske – med en forklaring på dansk og en kopiér-knap.',
    icon: 'terminal', hue: 'var(--hue-commands)', route: '#/apps/commands', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'night', focusX: 0.6, tint: '#a3e635' }, page: () => import('../pages/commands.js'),
    keywords: ['kommando', 'cmd', 'powershell', 'terminal', 'ipconfig', 'ping', 'sfc', 'dism', 'netværk', 'support'],
  },
  {
    id: 'checklists', name: 'Tjeklister', tagline: 'Glem ingenting ude hos kunden.',
    description: 'Færdige tjeklister til ny computer, printerinstallation, kundebesøg, backup, Wi-Fi og nye medarbejdere. Kryds af, skriv noter, og gem dine egne skabeloner.',
    icon: 'list', hue: 'var(--hue-checklists)', route: '#/apps/checklists', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#2dd4bf' }, page: () => import('../pages/checklists.js'),
    keywords: ['tjekliste', 'checkliste', 'kundebesøg', 'ny computer', 'opsætning', 'backup', 'skabelon'],
  },
  {
    id: 'arcade', name: 'Oversigt', tagline: 'Alle spil, invitationer og toplister.',
    description: 'Spilhallens forside: invitationer og spil i gang, Dagens sudoku, toppen af toplisterne og alle spillene.',
    icon: 'gamepad', hue: 'var(--hue-games)', route: '#/apps/arcade', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/arcade.js'),
    keywords: ['spil', 'spilhal', 'oversigt', 'topliste', 'invitation', 'online'],
  },
  {
    id: 'snake', name: 'Snake', tagline: 'Klassisk slangespil.',
    description: 'Styr slangen med piletasterne eller ved at swipe. Den bliver hurtigere, jo længere den er. Rekorden gemmes på din konto.',
    icon: 'gamepad', hue: 'var(--hue-games)', route: '#/apps/snake', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/snake.js'),
    keywords: ['spil', 'snake', 'slange', 'arkade', 'pause', 'sjov'],
  },
  {
    id: 'game2048', name: '2048', tagline: 'Læg tallene sammen.',
    description: 'Skub brikkerne, så to ens bliver til én. Kan du nå 2048? Spillet gemmes, så du kan fortsætte senere.',
    icon: 'grid', hue: 'var(--hue-games)', route: '#/apps/game2048', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.5, tint: '#edc22e' }, page: () => import('../pages/game2048.js'),
    keywords: ['spil', '2048', 'tal', 'puslespil', 'sjov'],
  },
  {
    id: 'mines', name: 'Minestryger', tagline: 'Find felterne uden miner.',
    description: 'Klassisk minestryger i tre sværhedsgrader. Det første klik er altid sikkert, og din bedste tid gemmes.',
    icon: 'flag', hue: 'var(--hue-games)', route: '#/apps/mines', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'day', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/mines.js'),
    keywords: ['spil', 'minestryger', 'minesweeper', 'logik', 'sjov'],
  },
  {
    id: 'memory', name: 'Huskespil', tagline: 'Find parrene.',
    description: 'Vend kortene, og find alle par med så få træk som muligt – med IT-ikoner.',
    icon: 'layers', hue: 'var(--hue-games)', route: '#/apps/memory', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'dusk', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/memory.js'),
    keywords: ['spil', 'huskespil', 'memory', 'par', 'kort', 'sjov'],
  },
  {
    id: 'habits', name: 'Vaner', tagline: 'Små vaner hver dag.',
    description: 'Sæt flueben ved dine daglige vaner, se de sidste fire uger og din stime. Gemmes på din konto, så du kan krydse af på telefonen.',
    icon: 'flame', hue: 'var(--hue-habits)', route: '#/apps/habits', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.55, tint: '#a78bfa' }, page: () => import('../pages/habits.js'),
    keywords: ['vaner', 'habit', 'stime', 'streak', 'daglig', 'mål', 'rutine'],
  },
  {
    id: 'budget', name: 'Budget', tagline: 'Styr på pengene.',
    description: 'Indtægter og udgifter pr. måned, hvad pengene går til, og hvad der er tilbage. Faste poster kopieres til næste måned med ét klik.',
    icon: 'chart', hue: 'var(--hue-budget)', route: '#/apps/budget', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.45, tint: '#10b981' }, page: () => import('../pages/budget.js'),
    keywords: ['budget', 'penge', 'økonomi', 'udgifter', 'indtægter', 'løn', 'opsparing'],
  },
  {
    id: 'draw', name: 'Tegnebræt', tagline: 'Tegn og skitsér.',
    description: 'Tegn et netværk, forklar noget for en kunde, eller lav en hurtig skitse – med mus, finger eller pen. Gem tegningerne på din konto, eller hent dem som billede.',
    icon: 'paint', hue: 'var(--hue-draw)', route: '#/apps/draw', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'dusk', focusX: 0.5, tint: '#ff7eb6' }, page: () => import('../pages/draw.js'),
    keywords: ['tegne', 'tegning', 'skitse', 'whiteboard', 'diagram', 'pen'],
  },
  {
    id: 'sudoku', name: 'Sudoku', tagline: 'Tal fra 1 til 9.',
    description: 'Klassisk sudoku i tre sværhedsgrader med noter, hint og tjek. Spillet gemmes, så du kan fortsætte på telefonen.',
    icon: 'hash', hue: 'var(--hue-games)', route: '#/apps/sudoku', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'dusk', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/sudoku.js'),
    keywords: ['spil', 'sudoku', 'tal', 'logik', 'puslespil', 'sjov'],
  },
  {
    id: 'connect4', name: 'Fire på stribe', tagline: 'Få fire i træk.',
    description: 'Spil mod computeren i tre sværhedsgrader, mod en ven på samme skærm – eller online mod de andre, der har HUBTECH.',
    icon: 'apps', hue: 'var(--hue-boards)', route: '#/apps/connect4', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'night', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/connect4.js'),
    keywords: ['spil', 'fire på stribe', 'connect four', 'to spillere', 'sjov'],
  },
  {
    id: 'hangman', name: 'Galgeleg', tagline: 'Gæt IT-ordet.',
    description: 'Gæt ordet bogstav for bogstav. Ordene kommer fra IT-ordbogen, og du får forklaringen bagefter.',
    icon: 'edit', hue: 'var(--hue-games)', route: '#/apps/hangman', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'night', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/hangman.js'),
    keywords: ['spil', 'galgeleg', 'hangman', 'ord', 'it-ord', 'sjov'],
  },
  {
    id: 'typerace', name: 'Fart-tast', tagline: 'Skriv hurtigst – og kom på toplisten.',
    description: 'Hurtigskrivning mod uret med en topliste for alle på HUBTECH, eller løb mod de andre live. Her er også toplisterne for Snake, 2048, Minestryger og Sudoku.',
    icon: 'timer', hue: 'var(--hue-games)', route: '#/apps/typerace', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/typerace.js'),
    keywords: ['spil', 'fart', 'tastatur', 'skrive', 'hurtigskrivning', 'topliste', 'leaderboard', 'løb', 'online', 'sammen'],
  },
  {
    id: 'tictactoe', name: 'Kryds og bolle', tagline: 'Tre på stribe.',
    description: 'Mod computeren (den umulige taber aldrig), to på én skærm eller online mod de andre på HUBTECH.',
    icon: 'x', hue: 'var(--hue-boards)', route: '#/apps/tictactoe', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'day', focusX: 0.5, tint: '#60a5fa' }, page: () => import('../pages/tictactoe.js'),
    keywords: ['spil', 'kryds og bolle', 'tic tac toe', 'online', 'to spillere', 'sammen'],
  },
  {
    id: 'aim', name: 'Aim-træner', tagline: 'Klik hurtigt – men ikke på de røde.',
    description: 'Ram målene så hurtigt du kan. Gyldne mål giver bonus, røde må du ikke røre. Tre spiltyper: Klassisk (med topliste), Reaktion og Præcision.',
    icon: 'target', hue: 'var(--hue-games)', route: '#/apps/aim', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dusk', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/aim.js'),
    keywords: ['spil', 'aim', 'sigte', 'reaktion', 'klik', 'mål', 'topliste'],
  },
  {
    id: 'flags', name: 'Gæt flaget', tagline: 'Flag fra hele verden.',
    description: 'Fire svarmuligheder – hvor lang en stime kan du få? Den bedste stime kommer på toplisten, og du kan lære alle flagene.',
    icon: 'flag', hue: 'var(--hue-games)', route: '#/apps/flags', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#e879f9' }, page: () => import('../pages/flags.js'),
    keywords: ['spil', 'flag', 'lande', 'geografi', 'quiz', 'topliste'],
  },
  {
    id: 'property', name: 'Ejendomskongen', tagline: 'Køb gader, byg hoteller.',
    description: 'Det store ejendomsspil for 2–6 spillere på samme skærm – mennesker eller computeren. Terninger, gader, huse, hoteller, lykkekort og fængsel. Spillet gemmes.',
    icon: 'home', hue: 'var(--hue-boards)', route: '#/apps/property', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'day', focusX: 0.5, tint: '#60a5fa' }, page: () => import('../pages/property.js'),
    keywords: ['spil', 'ejendom', 'brætspil', 'terninger', 'huse', 'hotel', 'gader', 'familie'],
  },
  {
    id: 'drawguess', name: 'Tegn og gæt', tagline: 'Én tegner, de andre gætter.',
    description: 'Spil med 2–8 af dem, der har HUBTECH. Alle tegner to gange, og I gætter i chatten – hurtige gæt giver flest point.',
    icon: 'paint', hue: 'var(--hue-boards)', route: '#/apps/drawguess', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'dusk', focusX: 0.5, tint: '#60a5fa' }, page: () => import('../pages/drawguess.js'),
    keywords: ['spil', 'tegn og gæt', 'pictionary', 'tegne', 'gætte', 'online', 'sammen', 'venner'],
  },
  {
    id: 'solitaire', name: 'Kabale', tagline: 'Klassisk kabale.',
    description: 'Klondike-kabale med træk 1 eller 3, fortryd og "læg alle op". Spillet gemmes, så du kan fortsætte senere.',
    icon: 'layers', hue: 'var(--hue-boards)', route: '#/apps/solitaire', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#60a5fa' }, page: () => import('../pages/solitaire.js'),
    keywords: ['spil', 'kabale', 'kort', 'kortspil', 'solitaire', 'klondike'],
  },
  {
    id: 'casino', name: 'Kasino', tagline: 'Blackjack, roulette og tyveknægt – kun for sjov.',
    description: 'Spil om point – aldrig rigtige penge, og intet kan købes. Løber du tør, får du gratis point hver time. Din højeste bunke kommer på toplisten.',
    icon: 'star', hue: 'var(--hue-boards)', route: '#/apps/casino', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'night', focusX: 0.5, tint: '#60a5fa' }, page: () => import('../pages/casino.js'),
    keywords: ['spil', 'kasino', 'blackjack', '21', 'roulette', 'tyveknægt', 'slots', 'kort'],
  },
  {
    id: 'hwtest', name: 'Hardwaretest', tagline: 'Test tastatur, skærm, lyd og kamera.',
    description: 'Tjek alle taster, døde pixels, højttalere venstre/højre, mikrofon, kamera, mus og touch – og få en rapport, du kan kopiere eller gemme som servicenote.',
    icon: 'chip', hue: 'var(--hue-hwtest)', route: '#/apps/hwtest', category: 'workspace', status: 'available',
    art: { season: 'summer', time: 'dawn', focusX: 0.5, tint: '#38bdf8' }, page: () => import('../pages/hwtest.js'),
    keywords: ['hardware', 'test', 'tastatur', 'skærm', 'døde pixels', 'højttaler', 'mikrofon', 'kamera', 'mus', 'touch', 'brugt computer'],
  },
  {
    id: 'passwords', name: 'Kodeord', tagline: 'Stærke koder, du kan huske.',
    description: 'Lav kodesætninger og tilfældige koder, se hvor længe en kode holder, og få gode råd til kunderne. Intet gemmes eller sendes.',
    icon: 'key', hue: 'var(--hue-passwords)', route: '#/apps/passwords', category: 'workspace', status: 'available',
    art: { season: 'winter', time: 'night', focusX: 0.5, tint: '#facc15' }, page: () => import('../pages/passwords.js'),
    keywords: ['kodeord', 'adgangskode', 'password', 'generator', 'sikkerhed', 'kodesætning', 'styrke'],
  },
  {
    id: 'qrtool', name: 'QR-koder', tagline: 'Wi-Fi, links og visitkort som QR.',
    description: 'Lav en QR-kode til Wi-Fi, et link, en kontakt, en e-mail, SMS eller et telefonnummer. Hent som billede, eller print et skilt.',
    icon: 'grid', hue: 'var(--hue-qrtool)', route: '#/apps/qrtool', category: 'workspace', status: 'available',
    art: { season: 'spring', time: 'dusk', focusX: 0.5, tint: '#0ea5e9' }, page: () => import('../pages/qrtool.js'),
    keywords: ['qr', 'qr-kode', 'wifi', 'wi-fi', 'gæstenet', 'visitkort', 'link', 'skilt', 'print'],
  },
  {
    id: 'replies', name: 'Svarskabeloner', tagline: 'Færdige svar til kunder.',
    description: 'Skabeloner til modtaget sag, tilbud, løst sag, besøg, phishing-advarsel og meget mere. Udfyld felterne, og kopiér – eller lav dine egne.',
    icon: 'reply', hue: 'var(--hue-replies)', route: '#/apps/replies', category: 'workspace', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.5, tint: '#f472b6' }, page: () => import('../pages/replies.js'),
    keywords: ['skabelon', 'svar', 'mail', 'kunde', 'tilbud', 'kundeservice', 'tekst'],
  },
  {
    id: 'phishing', name: 'Phishing-træner', tagline: 'Spot svindel i mails og SMS.',
    description: 'Se på e-mails og SMS’er, og afgør om de er falske eller ægte. Lær advarselstegnene – og lær kunderne dem.',
    icon: 'shield', hue: 'var(--hue-phishing)', route: '#/learn/phishing', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'night', focusX: 0.5, tint: '#f87171' }, page: () => import('../pages/phishing.js'),
    keywords: ['phishing', 'svindel', 'sikkerhed', 'mail', 'sms', 'falsk', 'træning'],
  },
  {
    id: 'owner', name: 'Ejer', tagline: 'Det, kun ejeren bestemmer over.',
    description: 'Brugere og adgangskoder, hvem der kan oprette en konto, venner på andre netværk, server og sikkerhedskopier – og siden, dine venner henter HUBTECH fra. Kun platformens ejer kan se appen.',
    icon: 'crown', hue: 'var(--hue-owner)', route: '#/apps/owner', category: 'system', status: 'available', requires: { owner: true },
    art: { season: 'autumn', time: 'dusk', focusX: 0.5, tint: '#f5b14c' }, page: () => import('../pages/owner.js'),
    keywords: ['ejer', 'owner', 'brugere', 'adgangskode', 'tilmelding', 'venner', 'download', 'hent', 'server', 'backup'],
  },
  {
    id: 'learning', name: 'Guides & Læring', tagline: 'Kurser, guides og hjælp',
    description: 'Opstartskurset for servicetekniker, platformsguides og søgbar hjælp. Fremdrift gemmes på din konto.',
    icon: 'book', hue: 'var(--hue-learn)', route: '#/learn', category: 'learning', status: 'available',
    art: { season: 'autumn', time: 'day', focusX: 0.45 }, page: () => import('../pages/learn.js'),
    keywords: ['kursus', 'guide', 'hjælp', 'servicetekniker', 'lektion'],
  },
  {
    id: 'settings', name: 'Indstillinger', tagline: 'Profil, udseende og notifikationer',
    description: 'Din profil, sikkerhed, udseende, årstider og vejr samt notifikationer. Ejeren finder også integrationer og brugere her.',
    icon: 'settings', hue: 'var(--hue-settings)', route: '#/settings', category: 'system', status: 'available',
    art: { season: 'winter', time: 'dawn', focusX: 0.5 }, page: () => import('../pages/settings.js'),
    keywords: ['profil', 'adgangskode', 'tema', 'årstid', 'baggrund'],
  },
  {
    id: 'next', name: 'Næste modul', tagline: 'Plads til din næste idé',
    description: 'Nye apps tilføjes med én registrering i app-registret. Se guiden “Tilføj en ny app”.',
    icon: 'rocket', hue: 'var(--accent)', route: '#/learn/guide/add-app', category: 'system', status: 'coming', requires: { owner: true },
    art: { season: 'spring', time: 'dawn', focusX: 0.3 },
    keywords: ['ny app', 'udvid', 'modul'],
  },
];

export const appById = (id) => APPS.find(a => a.id === id);
/** Learning apps live inside Guides & Læring (#/learn/<id>) instead of the app launcher and sidebar. */
export const isLearnApp = (a) => !!a && a.category === 'learning' && a.id !== 'learning';
const LEARN_ORDER = ['codeschool', 'snippets', 'flashcards', 'quiz', 'phishing', 'glossary', 'typing', 'bits', 'circuitpilot', 'toolkit'];
export const LEARN_APPS = APPS.filter(isLearnApp).sort((a, b) => (LEARN_ORDER.indexOf(a.id) + 1 || 99) - (LEARN_ORDER.indexOf(b.id) + 1 || 99));

/** Is the app usable by this user? Returns { ok, reason } */
export function access(app, user) {
  if (app.status === 'coming') return { ok: false, reason: 'Kommer snart', kind: 'coming' };
  if (app.requires?.role === 'owner' && user?.role !== 'owner') return { ok: false, reason: 'Kun for platformens ejer', kind: 'locked' };
  if (app.requires?.admin && !user?.admin) return { ok: false, reason: 'Kun for dem, ejeren har givet adgang', kind: 'hidden' };
  if (app.requires?.owner && user?.role !== 'owner') return { ok: false, reason: 'Kun for platformens ejer', kind: 'hidden' };
  return { ok: true };
}

/** Apps the user may see at all (Admin is invisible to people without access). */
export const visible = (app, user) => access(app, user).kind !== 'hidden';

/**
 * App groups: apps that belong together share one entry in the menu and the app overview, with tabs on top
 * (like Guides & Læring). The first member is where the group opens. Old links to every app still work.
 */
export const SUITES = [
  { id: 'office', name: 'HUBTECH Office', tagline: 'Dokumenter, regneark, præsentationer og noter.', members: ['hubtech', 'notes'] },
  { id: 'plan', name: 'Planlæg', tagline: 'Kalender, opgaver, fokus-timer og vaner.', icon: 'calendar', hue: 'var(--hue-calendar)', members: ['calendar', 'tasks', 'focus', 'habits'] },
  { id: 'service', name: 'Service', tagline: 'Servicehjælp, kunder, lager og timer.', icon: 'tool', hue: 'var(--hue-service)', members: ['servicehelp', 'customers', 'inventory', 'timesheet'] },
  { id: 'games', name: 'Spilhal', tagline: 'Snake, Fart-tast, Aim, flag, 2048, sudoku og flere – med toplister.', icon: 'gamepad', hue: 'var(--hue-games)', members: ['arcade', 'snake', 'typerace', 'aim', 'flags', 'game2048', 'sudoku', 'mines', 'memory', 'hangman'] },
  { id: 'boards', name: 'Brætspil og kort', tagline: 'Spil sammen med de andre på HUBTECH.', icon: 'users', hue: 'var(--hue-boards)', members: ['property', 'drawguess', 'connect4', 'tictactoe', 'solitaire', 'casino'] },
  { id: 'support', name: 'IT-support', tagline: 'Printer-doktor, hardwaretest, kommandoer, kodeord, QR og svar.', icon: 'printer', hue: 'var(--hue-printer)', members: ['printerdoctor', 'hwtest', 'commands', 'checklists', 'passwords', 'qrtool', 'replies'] },
];
export const suiteOf = (id) => SUITES.find(s => s.members.includes(id)) || null;
/** The app as it is shown in menus: a group's first member carries the group's name; the others are hidden there. */
export function entryApp(app) {
  if (!app) return null;
  const s = suiteOf(app.id);
  if (!s) return app;
  const lead = appById(s.members[0]);
  return { ...lead, name: s.name, tagline: s.tagline || lead.tagline, icon: s.icon || lead.icon, hue: s.hue || lead.hue, suite: s.id,
    description: `${s.tagline} Samlet i én app med faner: ${s.members.map(id => appById(id)?.name).join(', ')}.`,
    keywords: s.members.flatMap(id => [appById(id)?.name.toLowerCase(), ...(appById(id)?.keywords || [])]) };
}
/** Unique menu entries for a list of app ids (pinned apps). */
export const entryApps = (ids) => [...new Map(ids.map(appById).filter(Boolean).map(entryApp).map(a => [a.id, a])).values()];

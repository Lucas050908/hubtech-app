/**
 * Everything you can learn in the learning apps – as courses in the same form as the other material
 * (t = titel, g = mål, r = læs [tekst, url], l = lær, d = øv, q = tjek dig selv).
 * Most courses are built from the apps' own data (IT-ordbog, Quiz, Phishing-træner, Kodestumper, Kodeskolen),
 * so they follow along when the apps get new content. The rest are written here (elektronik, binær, tastatur …).
 */
import { GLOSSARY, GLOSSARY_CATS } from './glossary.js';
import { QUIZZES } from './quizzes.js';
import { SCENARIOS } from './phishing.js';
import { COMMANDS, CMD_GROUPS, OS_LABEL } from './commands.js';
import { CODE_COURSES } from './code-courses.js';

const ENT = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/** HTML from a lesson → plain bullet points (one per paragraph and list item). */
export function htmlToPoints(html) {
  return String(html || '')
    .replace(/<\/(p|li|h\d|pre|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENT[m] ?? m)
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 1);
}
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const pick = (arr, n) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);

// ── IT-ordbog ──
const glossary = {
  id: 'it-ordbog', title: 'IT-ordbog: ordene du skal kunne', short: 'IT-ordbog', icon: 'book', group: 'it', app: 'glossary',
  intro: 'De ord, en servicetekniker møder hver dag – hardware, netværk, printer, sikkerhed, software og data – forklaret på almindeligt dansk.',
  days: GLOSSARY_CATS.map(cat => {
    const words = GLOSSARY.filter(w => w[1] === cat.id);
    return {
      t: cat.label, g: `Du kan forklare de vigtigste ord om ${cat.label.toLowerCase()} for en kunde.`,
      r: [[`Slå ordene op i IT-ordbogen`, '#/learn/glossary']],
      l: words.map(([term, , text]) => `${term}: ${text}`),
      d: [`Vælg fem ord fra listen, og forklar dem højt med dine egne ord.`, `Find et ord, du ikke kendte, og brug det i en sætning til en kunde.`, `Lav huskekort med de ord, du er usikker på (Huskekort-appen).`],
      q: pick(words, 4).map(([term, , text]) => [`Hvad betyder “${term}”?`, text]),
    };
  }),
};

// ── Quiz ──
const quiz = {
  id: 'it-viden', title: 'IT-viden: printer, netværk, hardware og mere', short: 'IT-viden', icon: 'help', group: 'it', app: 'quiz',
  intro: 'Alt det, Quiz-appen spørger om – samlet som læsestof med forklaringer, så du kan lære det før du tester dig selv.',
  days: QUIZZES.map(z => ({
    t: z.title, g: `Du kender svarene i quizzen om ${z.title.toLowerCase()} – og ved hvorfor.`,
    r: [[`Tag quizzen “${z.title}”`, '#/learn/quiz']],
    l: z.qs.map(([q, opts, right, why]) => `${q} → ${opts[right]}. ${why || ''}`.trim()),
    d: [`Læs alle punkterne, og dæk svaret til, mens du gætter.`, `Tag quizzen “${z.title}” i Quiz-appen, og få mindst 8 rigtige.`, `Skriv de svar, du tog fejl af, i dine noter herunder.`],
    q: z.qs.slice(0, 4).map(([q, opts, right, why]) => [q, `${opts[right]}. ${why || ''}`.trim()]),
  })),
};

// ── Phishing-træner ──
const phishing = (() => {
  const fake = SCENARIOS.filter(s => s.phish), real = SCENARIOS.filter(s => !s.phish);
  const flags = [...new Set(fake.flatMap(s => s.flags || []))];
  const tips = [...new Set(SCENARIOS.map(s => s.tip).filter(Boolean))];
  const ask = (s) => [`${s.kind === 'sms' ? 'SMS' : 'Mail'} fra “${s.from}”${s.subject ? `: “${s.subject}”` : ''} – ægte eller falsk?`, `${s.phish ? 'Falsk' : 'Ægte'}. ${s.tip || (s.flags || []).join('. ')}`];
  return {
    id: 'phishing', title: 'Spot phishing i mails og SMS', short: 'Phishing', icon: 'shield', group: 'it', app: 'phishing',
    intro: 'De tegn, der afslører svindel – og hvordan ægte beskeder ser ud. Bygget på eksemplerne i Phishing-træneren (alle firmaer er opdigtede).',
    days: [
      { t: 'Tegnene på svindel', g: 'Du kender de typiske tegn på en falsk besked.', r: [['Øv dig i Phishing-træneren', '#/learn/phishing']],
        l: flags.slice(0, 14), d: ['Find tre af tegnene i en rigtig spam-mail i din egen indbakke (uden at klikke).', 'Forklar en kollega, hvordan man ser, hvor et link egentlig fører hen.', 'Gennemfør en runde i Phishing-træneren.'],
        q: fake.slice(0, 4).map(ask) },
      { t: 'Ægte eller falsk?', g: 'Du kan skelne en ægte besked fra en falsk.', r: [['Øv dig i Phishing-træneren', '#/learn/phishing']],
        l: [...real.map(s => `Ægte: ${s.from}${s.subject ? ` – “${s.subject}”` : ''}. ${s.tip || ''}`.trim()), 'En ægte besked kan også have et link – se på afsenderens domæne, og om den beder om kode, betaling eller login.'],
        d: ['Lav en tjekliste med fem spørgsmål, du stiller, før du klikker.', 'Tjek afsenderadressen på tre mails i din indbakke.', 'Få alle rigtige i en runde i Phishing-træneren.'],
        q: [...real, ...fake.slice(4)].slice(0, 5).map(ask) },
      { t: 'Hvad gør du så?', g: 'Du ved, hvad du og kunden skal gøre ved mistanke.', r: [['Guide: sikkerhed', '#/learn']],
        l: tips, d: ['Skriv en kort vejledning til en kunde: “Jeg har klikket på et link – hvad nu?”', 'Slå totrinsbekræftelse til på en af dine egne konti.', 'Find ud af, hvor man anmelder svindel i Danmark.'],
        q: [['Kunden har tastet sin kode på en falsk side. Hvad først?', 'Skift koden med det samme (og alle steder, hvor den samme kode er brugt), og slå totrinsbekræftelse til.'], ['Hvordan tjekker man et link uden at åbne det?', 'Hold musen over linket (eller tryk længe på telefonen) og se, hvilken adresse det rigtigt fører til.']] },
    ],
  };
})();

// ── Kodestumper: kommandoer ──
const commands = {
  id: 'kommandoer', title: 'Kommandoer til IT-support', short: 'Kommandoer', icon: 'terminal', group: 'it', app: 'snippets',
  intro: 'De kommandoer, en IT-supporter bruger mest i Windows, macOS og Linux – med en forklaring på, hvad de gør.',
  days: CMD_GROUPS.map(g => {
    const cmds = COMMANDS.filter(c => c.g === g.id);
    return {
      t: g.label, g: `Du kender de vigtigste kommandoer til ${g.label.toLowerCase()}.`,
      r: [['Se og kopiér kommandoerne i Kodestumper', '#/learn/snippets']],
      l: cmds.map(c => `${c.cmd.replace(/\n/g, ' · ')} (${OS_LABEL?.[c.os] || c.os}${c.admin ? ', kræver administrator' : ''}): ${c.d}`),
      d: ['Kør to af kommandoerne på din egen computer, og forklar resultatet.', 'Skriv de tre kommandoer, du tror du får mest brug for, i dine noter.', 'Gem dine egne favoritkommandoer i Kodestumper.'],
      q: cmds.slice(0, 4).map(c => [`Hvad gør “${c.cmd.split('\n')[0]}”?`, c.d]),
    };
  }).filter(d => d.l.length),
};

// ── Kodeskolen ──
const code = CODE_COURSES.map(c => ({
  id: `kode-${c.id}`, title: c.title, short: c.title, icon: c.icon || 'code', group: 'code', app: 'codeschool', hue: c.hue,
  intro: `${c.intro} Læs lektionerne her – og kør koden og løs opgaverne i Kodeskolen.`,
  days: c.lessons.map(l => ({
    t: l.title, g: `Du kan bruge “${l.title.toLowerCase()}” i din egen kode${l.minutes ? ` (ca. ${l.minutes} min.)` : ''}.`,
    r: [['Åbn lektionen i Kodeskolen (kør koden)', `#/learn/codeschool/${c.id}/${l.id}`]],
    l: [...htmlToPoints(l.body), ...(l.example ? [{ code: String(l.example).trim() }] : [])],
    d: ['Læs eksemplet, og kør det i Kodeskolen.', ...(l.task ? [`Løs opgaven i Kodeskolen: ${htmlToPoints(l.task.text).join(' ')}`] : []), 'Svar på lektionens quiz i Kodeskolen.'],
    q: (l.quiz || []).map(([q, opts, right, why]) => [q, `${opts[right]}. ${why || ''}`.trim()]),
  })),
}));

// ── written here: elektronik (CircuitPilot), binær (Bit-spil), tastatur, huskekort, beregninger (Værktøjskasse) ──
const electronics = {
  id: 'elektronik', title: 'Elektronik fra bunden', short: 'Elektronik', icon: 'circuit', group: 'electro', app: 'circuitpilot',
  intro: 'Spænding, strøm, modstand og komponenter – grundlaget bag CircuitPilot og Værktøjskassen, på dansk og med regneeksempler.',
  days: [
    { t: 'Spænding, strøm og modstand', g: 'Du kan forklare U, I og R og regne med Ohms lov.', r: [['Øv i CircuitPilot', '#/learn/circuitpilot'], ['Ohms lov i Værktøjskassen', '#/learn/toolkit']],
      l: ['Spænding (U) måles i volt (V) – "trykket", der driver strømmen.', 'Strøm (I) måles i ampere (A) – hvor meget elektricitet der løber.', 'Modstand (R) måles i ohm (Ω) – hvor meget kredsløbet bremser strømmen.', 'Ohms lov: U = R × I. Find strømmen med I = U / R og modstanden med R = U / I.', 'Eksempel: 9 V over 180 Ω giver I = 9 / 180 = 0,05 A = 50 mA.'],
      d: ['Regn strømmen ud for 12 V over 240 Ω.', 'Kontrollér dit svar i Værktøjskassens Ohms lov-beregner.', 'Mål spændingen på et batteri med et multimeter (hvis du har et).'],
      q: [['Hvad er Ohms lov?', 'U = R × I.'], ['9 V over 180 Ω – hvor meget strøm?', '50 mA (0,05 A).']] },
    { t: 'Effekt og energi', g: 'Du kan regne effekt og forstå watt og kWh.', r: [['Øv i CircuitPilot', '#/learn/circuitpilot']],
      l: ['Effekt (P) måles i watt (W): P = U × I. Også P = I² × R og P = U² / R.', 'En 2300 W elkedel på 230 V trækker I = 2300 / 230 = 10 A.', 'Energi = effekt × tid. 1 kWh er 1000 W i én time.', 'En modstand skal kunne tåle effekten, der afsættes i den – ellers bliver den for varm.'],
      d: ['Regn ud, hvor mange ampere en 1000 W støvsuger trækker på 230 V.', 'Find effekten på tre apparater derhjemme (mærkepladen).', 'Regn ud, hvad det koster at have en 10 W lampe tændt i et døgn.'],
      q: [['Hvilken formel giver effekten?', 'P = U × I.'], ['Hvor mange ampere trækker 2300 W på 230 V?', '10 A.']] },
    { t: 'Serie og parallel', g: 'Du kan regne samlet modstand i serie og parallel.', r: [['Øv i CircuitPilot', '#/learn/circuitpilot']],
      l: ['Serie: Rs = R1 + R2 + R3. Samme strøm gennem alle; spændingen deles.', 'Parallel: 1/Rp = 1/R1 + 1/R2. Samme spænding over alle; strømmen deles.', 'To ens modstande i parallel giver det halve: 100 Ω || 100 Ω = 50 Ω.', 'Kirchhoffs spændingslov: summen af spændingsfald i en sløjfe er lig kildespændingen.', 'Kirchhoffs strømlov: den strøm, der løber ind i et punkt, løber også ud.'],
      d: ['Regn 220 Ω og 330 Ω i serie og i parallel.', 'Tegn et kredsløb med to pærer i serie og to i parallel – hvad sker der, hvis én går i stykker?', 'Byg kredsløbet i CircuitPilots simulator.'],
      q: [['Hvad er 100 Ω og 100 Ω i parallel?', '50 Ω.'], ['Hvad sker der i en seriekreds, hvis én komponent afbryder?', 'Hele kredsen stopper, fordi strømmen kun har én vej.']] },
    { t: 'Komponenter: modstand, kondensator, diode og LED', g: 'Du kender de almindelige komponenter og deres opgave.', r: [['Modstandens farvekode i Værktøjskassen', '#/learn/toolkit']],
      l: ['Modstand: begrænser strømmen. Værdien kan aflæses med farvekoden.', 'Kondensator: gemmer ladning (Q = C × U). Bruges til udglatning og timing (τ = R × C).', 'Diode: leder kun den ene vej (ca. 0,7 V spændingsfald for silicium).', 'LED: en diode, der lyser. Skal altid have en formodstand: R = (U − Uf) / I.', 'Eksempel: rød LED (Uf 2,0 V, 20 mA) på 5 V: R = (5 − 2) / 0,02 = 150 Ω.'],
      d: ['Regn formodstanden til en blå LED (Uf 3,0 V, 20 mA) på 5 V.', 'Aflæs farvekoden på en modstand (eller brug Værktøjskassen).', 'Find en kondensator i en gammel printplade og aflæs værdien.'],
      q: [['Hvorfor skal en LED have en formodstand?', 'Ellers bliver strømmen for stor, og LED’en brænder af.'], ['Hvad gør en diode?', 'Leder strøm i kun den ene retning.']] },
    { t: 'Måling og sikkerhed', g: 'Du kan måle sikkert med et multimeter.', r: [['Øv fejlfinding i CircuitPilot', '#/learn/circuitpilot']],
      l: ['Spænding måles parallelt over komponenten; strøm måles i serie (kredsen afbrydes).', 'Modstand måles altid uden strøm på kredsløbet.', 'Start på højeste måleområde, hvis multimeteret ikke selv vælger.', 'Netspænding (230 V) er livsfarlig – arbejd kun med det, hvis du er uddannet til det.', 'ESD: statisk elektricitet kan ødelægge elektronik. Brug jordet armbånd eller rør ved noget jordet først.'],
      d: ['Mål spændingen på et 9 V-batteri og på et næsten fladt batteri.', 'Forklar forskellen på at måle spænding og strøm.', 'Lav en sikkerhedstjekliste til arbejde med elektronik.'],
      q: [['Hvordan måler man strøm?', 'I serie – kredsen afbrydes, og multimeteret sættes ind i den.'], ['Hvad er ESD?', 'Elektrostatisk udladning – statisk elektricitet, der kan ødelægge komponenter.']] },
  ],
};

const digital = {
  id: 'digitale-grundfaerdigheder', title: 'Digitale grundfærdigheder', short: 'Grundfærdigheder', icon: 'chip', group: 'it', app: 'bits',
  intro: 'Binære tal, ti-finger-skrivning, smart udenadslære og hurtige beregninger – det, Bit-spil, Tastaturtræner, Huskekort og Værktøjskassen træner.',
  days: [
    { t: 'Binære tal og bits', g: 'Du kan omregne mellem binær og decimal.', r: [['Spil Bit-spil', '#/learn/bits'], ['Talsystemer i Værktøjskassen', '#/learn/toolkit']],
      l: ['En bit er 0 eller 1. Otte bits er en byte.', 'Hver plads er dobbelt så meget værd som den forrige: 128 64 32 16 8 4 2 1.', 'Eksempel: 1010 = 8 + 2 = 10. 11111111 = 255.', 'Hexadecimal bruger 0–9 og A–F; én hex-cifre er fire bits (F = 1111).', 'IP-adresser er fire bytes: 192.168.1.1 – hvert tal er mellem 0 og 255.'],
      d: ['Omregn 13, 64 og 200 til binær.', 'Klar tre baner i Bit-spil.', 'Find din computers IP-adresse og skriv det første tal i binær.'],
      q: [['Hvad er 1010 i decimal?', '10.'], ['Hvor mange bits er en byte?', 'Otte.']] },
    { t: 'Skriv hurtigt med ti fingre', g: 'Du kender hjemrækken og øver dig fast.', r: [['Øv i Tastaturtræneren', '#/learn/typing']],
      l: ['Fingrene hviler på hjemrækken: a s d f og j k l æ. Tommelfingrene på mellemrum.', 'Hver finger har sine taster – ræk op og ned og tilbage til hjemrækken.', 'Kig på skærmen, ikke på tasterne. Præcision først, så kommer farten.', 'Korte daglige øvelser (5–10 minutter) virker bedre end én lang.', 'Lær genveje: Ctrl+C/V/Z, Ctrl+F, Win+L (lås skærmen), Alt+Tab.'],
      d: ['Øv hjemrækken i Tastaturtræneren i 5 minutter.', 'Mål din hastighed (ord pr. minut) og skriv den ned.', 'Øv i en uge og mål igen.'],
      q: [['Hvilke taster er hjemrækken for venstre hånd?', 'a s d f.'], ['Hvad er vigtigst i starten – fart eller præcision?', 'Præcision; farten kommer af sig selv.']] },
    { t: 'Lær udenad med huskekort', g: 'Du bruger gentagelser med mellemrum til at huske.', r: [['Åbn Huskekort', '#/learn/flashcards']],
      l: ['Spaced repetition: kort, du kan, ser du sjældnere; kort, du glemmer, ser du oftere.', 'Prøv at huske svaret, før du vender kortet – det er selve genkaldelsen, der lærer dig det.', 'Ét spørgsmål pr. kort, og hellere korte svar.', 'Lidt hver dag er bedre end meget én gang om ugen.', 'Lav kort ud af de spørgsmål, du var usikker på i kurserne.'],
      d: ['Lav ti huskekort fra et kursus, du er i gang med.', 'Gennemgå dine huskekort tre dage i træk.', 'Markér de svære spørgsmål i et kursus og lav kort af dem.'],
      q: [['Hvorfor skal man prøve at huske svaret, før man vender kortet?', 'Fordi genkaldelsen er det, der får hukommelsen til at holde.'], ['Hvad betyder spaced repetition?', 'Gentagelse med voksende mellemrum.']] },
    { t: 'Beregninger i hverdagen', g: 'Du ved, hvilke beregnere der findes, og hvornår de bruges.', r: [['Åbn Værktøjskassen', '#/learn/toolkit']],
      l: ['Ohms lov og effekt: find U, I, R eller P, når du kender to af dem.', 'LED-formodstand og modstandens farvekode.', 'Spændingsfald i kabler: lange, tynde kabler giver tab – vigtigt ved lavvolt og LED-strips.', 'Batteritid: kapacitet (mAh) delt med strømforbruget (mA) giver timer.', 'Subnet og overførselstid: hvor mange adresser er der i et net, og hvor lang tid tager en fil at sende?'],
      d: ['Regn batteritiden for en 2000 mAh powerbank til et apparat på 250 mA.', 'Find ud af, hvor mange adresser der er i et /24-net.', 'Regn, hvor lang tid 5 GB tager på en 100 Mbit/s forbindelse.'],
      q: [['2000 mAh ved 250 mA – hvor mange timer?', 'Cirka 8 timer (i praksis lidt mindre).'], ['Hvor mange brugbare adresser har et /24-net?', '254.']] },
  ],
};


// ── HUBTECH itself ──
const hubtech = {
  id: 'hubtech', title: 'Sådan bruger du HUBTECH', short: 'HUBTECH', icon: 'hubtech', group: 'start', app: 'learning',
  intro: 'Hvad HUBTECH kan, og hvordan du får mest ud af det: søgning, apps, Office, kalender, opgaver, læring, spil, forbindelser og widgets.',
  days: [
    { t: 'Kom i gang: Hjem, søgning og menuen', g: 'Du kan finde rundt og finde alt med søgningen.', r: [['Gå til Hjem', '#/'], ['Guide: Velkommen til HUBTECH', '#/learn/guide/welcome']],
      l: ['Hjem viser dine apps, seneste projekter, læring og aktivitet. Dashboard samler fremdrift, favoritter og status.', 'Søg alt med Ctrl+K (⌘K på Mac): apps, guides, kurser, lektioner, projekter og kommandoer som “Skift til vinter”.', 'Menuen til venstre har de faste sider; under “Dine apps” ligger dem, du bruger mest. På telefonen åbnes menuen med ☰.', 'Stjernen på en app eller guide gør den til favorit, så den står øverst.', 'Baggrunden er en levende verden med årstider – du styrer den under Indstillinger → Verden.'],
      d: ['Tryk Ctrl+K og find Kalender uden at bruge musen.', 'Gør tre apps til favoritter.', 'Skift årstid i verden, og sæt den tilbage til automatisk.'],
      q: [['Hvordan åbner du søgningen?', 'Ctrl+K (⌘K på Mac) – eller søgefeltet øverst.'], ['Hvor finder du din fremdrift og dine favoritter samlet?', 'På Dashboard.']] },
    { t: 'Apps: over 200 værktøjer ét sted', g: 'Du ved, hvilke slags apps der findes, og hvordan du finder dem.', r: [['Se alle apps', '#/apps']],
      l: ['Apps-siden samler alle apps i grupper: arbejde, hverdag, læring, spil og værktøjer. Søg eller filtrér øverst.', 'Arbejde: Kunder, Servicehjælp, Printer-doktor, Tidsregistrering, Lager, Tjeklister og Svarskabeloner.', 'Hverdag: Indkøbsliste, Madplan, Budget, Vaner, Fødselsdage, Pakkeliste og mange flere – mange kan deles med andre.', 'Værktøjer: Regnemaskine, Netværksberegner, Kodeord, QR-koder, Omregner og Hardwaretest.', 'Al data gemmes på din konto, så den følger med fra computer til telefon.'],
      d: ['Åbn Apps og find tre apps, du ikke kendte.', 'Del en indkøbsliste med en anden bruger.', 'Prøv Hardwaretest på din egen computer.'],
      q: [['Hvor gemmes dine data fra apps?', 'På din HUBTECH-konto – de følger med på alle enheder.'], ['Hvordan finder du hurtigt en bestemt app?', 'Med søgningen (Ctrl+K) eller søgefeltet på Apps-siden.']] },
    { t: 'HUBTECH Office: dokumenter, regneark og præsentationer', g: 'Du kan lave og dele et dokument, et regneark og en præsentation.', r: [['Åbn HUBTECH Office', '#/apps/hubtech']],
      l: ['Dokumenter har overskrifter, tabeller, find og erstat og genveje: skriv “# ” for overskrift eller “- ” for punktliste.', 'Regneark har formler (SUM, HVIS, LOPSLAG m.fl.), træk-ned for serier (mandag, tirsdag … eller 1, 2, 3) og indsæt/slet rækker, hvor formlerne følger med.', 'Præsentationer laves dias for dias og vises i fuld skærm.', 'Filer kan deles med andre brugere og eksporteres.', 'Alt gemmes automatisk.'],
      d: ['Lav et dokument med en overskrift, en punktliste og en tabel.', 'Lav et regneark med ugedagene trukket ned og en SUM-formel.', 'Lav en præsentation på tre dias, og vis den i fuld skærm.'],
      q: [['Hvordan laver du hurtigt en punktliste i et dokument?', 'Skriv “- ” i starten af linjen.'], ['Hvad sker der med formlerne, når du indsætter en række?', 'De flytter med, så de stadig peger på de samme celler.']] },
    { t: 'Kalender, opgaver og noter', g: 'Du kan planlægge din uge i HUBTECH.', r: [['Kalender', '#/apps/calendar'], ['Opgaver', '#/apps/tasks'], ['Noter', '#/apps/notes']],
      l: ['Kalender: skriv fx “Fodbold tirsdag 17-18:30 hver uge i Hallen” i hurtig tilføj – HUBTECH forstår tid, sted og gentagelse.', 'Tastaturgenveje i kalenderen: T (i dag), M/U/L (måned, uge, liste), N (ny aftale) og / (søg). Overlappende aftaler giver en advarsel.', 'Kalenderen kan abonneres på fra telefonens kalender via et privat link (.ics).', 'Opgaver er en tavle med kolonner; hurtigknapper sætter deadline til i dag, i morgen eller om en uge.', 'Noter kan have tjeklister, og ikke-afkrydsede punkter kan sendes til Opgaver med ét klik.'],
      d: ['Opret en gentaget aftale med hurtig tilføj.', 'Lav en opgave med deadline i morgen.', 'Skriv en note med en tjekliste, og send punkterne til Opgaver.'],
      q: [['Hvilken tast laver en ny aftale i kalenderen?', 'N.'], ['Hvordan får du kalenderen ind på telefonen?', 'Abonnér på det private kalenderlink (.ics) i telefonens kalender.']] },
    { t: 'Læring: kurser, guides og læringsapps', g: 'Du ved, hvordan du lærer nyt i HUBTECH.', r: [['Guides & Læring', '#/learn']],
      l: ['Guides & Læring samler alle kurser, læringsapps og guides – og søgningen finder også lektioner inde i kurserne.', 'Hvert kursus har lektioner med Læs, Lær, Øv og Tjek dig selv. Afkrydsede øvelser giver XP.', 'Markér spørgsmål, du var usikker på, så samles de til repetition.', 'Læringsapps: Kodeskolen, Huskekort, Quiz, Phishing-træner, IT-ordbog, Tastaturtræner, Bit-spil, CircuitPilot og Værktøjskasse.', 'Kurser i maskinernes software: LightBurn, xTool, Bambu Lab, Creality, VersaWorks og flere.'],
      d: ['Start et kursus, og kryds den første øvelse af.', 'Søg efter “ipconfig” i Guides & Læring.', 'Lav fem huskekort fra et kursus.'],
      q: [['Hvad giver en afkrydset øvelse?', 'XP på din konto.'], ['Hvor samles spørgsmål, du var usikker på?', 'Under “Til repetition” på kursusoversigten.']] },
    { t: 'Spil og fællesskab', g: 'Du kan spille mod computeren og med venner.', r: [['Ludo', '#/apps/ludo'], ['Fællesskab', '#/apps/community']],
      l: ['Brætspil og kort som Ludo, Dam, Skak, Yatzy, Kalaha, Mølle og Hjerterfri kan spilles mod computeren, ved samme skærm eller online.', 'Online: invitér andre HUBTECH-brugere – de får en besked og kan gå med i spillet. Computere kan fylde tomme pladser.', 'Et spil, du forlader, gemmes, så du kan fortsætte senere.', 'Fællesskab, Væggen, Afstemninger og Arrangementer bruges til at dele og planlægge med andre.', 'Kasinoet bruger kun point – aldrig rigtige penge.'],
      d: ['Spil et spil Ludo mod to computere.', 'Invitér en anden bruger til et online spil.', 'Opret en afstemning eller et arrangement.'],
      q: [['Hvad sker der med et spil, du forlader?', 'Det gemmes, så du kan fortsætte senere.'], ['Hvem kan fylde tomme pladser i et online spil?', 'Computerspillere.']] },
    { t: 'Forbindelser, widgets og indstillinger', g: 'Du kan forbinde HUBTECH’er, bruge widgets og indstille platformen.', r: [['Forbindelser', '#/hubs'], ['Indstillinger', '#/settings']],
      l: ['HUBTECH’er på samme netværk finder og forbinder sig selv automatisk – du skal ikke gøre noget.', 'Forbindelser viser, hvilke HUBTECH’er du er forbundet med, og du kan blokere en, du ikke vil forbindes med.', 'Widgets: under Indstillinger → Apps er der vejledning til Windows, iPhone og Android, så du kan have kalender og opgaver på skrivebordet eller hjemskærmen.', 'Profil, sikkerhed og adgangskode, tema (lys/mørk) og verden styres under Indstillinger.', 'Admin og Ejer styrer brugere og rettigheder på serveren.'],
      d: ['Åbn Forbindelser og se, hvilke HUBTECH’er du er forbundet med.', 'Sæt en widget op på din computer eller telefon.', 'Skift mellem lyst og mørkt tema.'],
      q: [['Skal du selv forbinde HUBTECH’er på samme netværk?', 'Nej, de finder og forbinder sig selv automatisk.'], ['Hvor finder du vejledningen til widgets?', 'Under Indstillinger → Apps.']] },
  ],
};

const HUES = { start: '#3b82f6', it: '#06b6d4', code: '#8b5cf6', electro: '#22c55e' };
export const APP_COURSES = [hubtech, digital, glossary, quiz, phishing, commands, electronics, ...code]
  .map(c => ({ ...c, stateId: `course-${c.id}`, unit: 'Lektion', hue: c.hue || HUES[c.group],
    note: 'Bygget på indholdet i læringsappene. Øvelserne i appen giver også deres egne point.' }));
export const APP_GROUPS = [['start', 'HUBTECH'], ['it', 'IT og support'], ['code', 'Programmering'], ['electro', 'Elektronik']];

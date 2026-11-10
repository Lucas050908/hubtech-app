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
import { GENERAL_COURSES, GENERAL_GROUP } from './generalcourses.js';

const ENT = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/** HTML from a lesson → plain bullet points (one per paragraph and list item). */
export function htmlToPoints(html) {
  return String(html || '')
    .replace(/<\/t[hd]>\s*<t[hd][^>]*>/gi, ': ').replace(/<\/tr>/gi, '\n')   // a table: one line per row, “kunder: id, navn, by”
    .replace(/<\/(p|li|h\d|pre|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENT[m] ?? m)
    .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s.length > 1);
}
const dot = (s) => (/[.!?…”"]$/.test(String(s).trim()) ? String(s).trim() : `${String(s).trim()}.`);   // an answer ends with one full stop – not “…?.”
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
    l: z.qs.map(([q, opts, right, why]) => `${q} → ${dot(opts[right])} ${why || ''}`.trim()),
    d: [`Læs alle punkterne, og dæk svaret til, mens du gætter.`, `Tag quizzen “${z.title}” i Quiz-appen, og få mindst ${Math.ceil(z.qs.length * 0.8)} af ${z.qs.length} rigtige.`, `Skriv de svar, du tog fejl af, i dine noter herunder.`],
    q: z.qs.slice(0, 4).map(([q, opts, right, why]) => [q, `${dot(opts[right])} ${why || ''}`.trim()]),
  })),
};

// ── Phishing-træner ──
const phishing = (() => {
  const fake = SCENARIOS.filter(s => s.phish), real = SCENARIOS.filter(s => !s.phish);
  const flags = [...new Set(fake.flatMap(s => s.flags || []))];
  const tips = [...new Set(fake.map(s => s.tip).filter(Boolean))];   // what to do about the false ones (the genuine ones have their own lesson)
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
      q: cmds.slice(0, 4).map(c => [`Hvad gør “${c.cmd.replace(/\n/g, ' · ')}”?`, c.d]),
    };
  }).filter(d => d.l.length),
};

// what you can do after each lesson in Kodeskolen (the course page shows it as the lesson's goal)
const CODE_GOALS = {
  py1: 'Du kan skrive tekst og tal ud med print() og skrive en kommentar', py2: 'Du kan gemme værdier i variabler og kender typerne int, float, str og bool',
  py3: 'Du kan læse input fra brugeren og lave tekst om til tal', py4: 'Du kan lade programmet vælge med if, elif og else',
  py5: 'Du kan gentage kode med for- og while-løkker', py6: 'Du kan samle værdier i lister og slå op i en dictionary',
  py7: 'Du kan skrive dine egne funktioner med parametre og return', py8: 'Du kan fange fejl med try/except, så programmet ikke crasher',
  pv1: 'Du kan rense, dele og formatere tekst med strengmetoder og f-strings', pv2: 'Du kan lave og sortere lister på én linje med list comprehensions og sorted()',
  pv3: 'Du kan lave en klasse med data og metoder og bruge dens objekter', pv4: 'Du kan hente moduler med import og bruge math, random og datetime',
  pv5: 'Du kan gemme og læse data i filer – også som JSON', pv6: 'Du kan sætte det hele sammen og regne timer pr. kunde ud fra en log',
  js1: 'Du kan skrive ud med console.log og gemme værdier med let og const', js2: 'Du kan skrive funktioner – både almindelige og arrow functions',
  js3: 'Du kan arbejde med arrays med map, filter, reduce og find', js4: 'Du kan samle data i objekter og lave dem om til og fra JSON',
  js5: 'Du kan styre koden med if/else og løkker – og sammenligne med ===', js6: 'Du kan vente på noget, der tager tid, med Promise, async og await',
  js7: 'Du kan lave en klasse med constructor og metoder',
  web1: 'Du kan bygge en side af HTML-tags: overskrifter, afsnit, lister og links', web2: 'Du kan style en side med CSS: farver, skrift og klasser',
  web3: 'Du kender box model og kan lægge elementer på række med flexbox', web4: 'Du kan lave en formular med felter, labels og en knap',
  web5: 'Du kan få siden til at passe til både telefon og computer',
  sql1: 'Du kan hente kolonner fra en tabel med SELECT og FROM', sql2: 'Du kan filtrere med WHERE og sortere med ORDER BY',
  sql3: 'Du kan tælle og lægge sammen pr. gruppe med GROUP BY', sql4: 'Du kan sætte to tabeller sammen med JOIN',
  sql5: 'Du kan tilføje, ændre og slette rækker – og ved, hvorfor WHERE er vigtig',
  git1: 'Du kan finde rundt i mapper fra terminalen', git2: 'Du ved, hvad Git er, og kan gemme dit første commit',
  git3: 'Du kan lave en branch, skifte mellem branches og merge dem', git4: 'Du kan sende commits til GitHub med push og hente med pull',
  git5: 'Du kan fortryde ændringer og holde hemmeligheder ude af Git med .gitignore',
  git6: 'Du kan klone et projekt, løse en konflikt og åbne en pull request',
  lx1: 'Du kan vise, kopiere, flytte og slette filer på en server', lx2: 'Du kan læse og ændre rettigheder og ved, hvornår sudo skal bruges',
  lx3: 'Du kan søge i filer med grep og find og kæde kommandoer sammen med pipes', lx4: 'Du kan se, hvad der kører, og starte og genstarte tjenester',
  lx5: 'Du kan tjekke netværket og logge ind på en anden maskine med SSH', lx6: 'Du kan installere og opdatere programmer med pakkehåndteringen',
  ard1: 'Du kender setup() og loop() og kan gøre et ben til en udgang', ard2: 'Du kan læse en knap med digitalRead() og INPUT_PULLUP',
  ard3: 'Du kan måle en spænding med analogRead() og regne den om til volt', ard4: 'Du kan dæmpe en LED med PWM og analogWrite()',
  ard5: 'Du kan lave pauser med millis() uden at stoppe resten af programmet',
};

// ── Kodeskolen ──
const code = CODE_COURSES.map(c => ({
  id: `kode-${c.id}`, title: c.title, short: c.title, icon: c.icon || 'code', group: 'code', app: 'codeschool', hue: c.hue,
  intro: `${c.intro} Læs lektionerne her – og kør koden og løs opgaverne i Kodeskolen.`,
  days: c.lessons.map(l => ({
    t: l.title, g: `${CODE_GOALS[l.id] || `Du har læst lektionen “${l.title}”, kørt eksemplet og løst opgaven`}${l.minutes ? ` (ca. ${l.minutes} min.)` : ''}.`,
    r: [['Åbn lektionen i Kodeskolen (kør koden)', `#/learn/codeschool/${c.id}/${l.id}`]],
    l: [...htmlToPoints(l.body), ...(l.example ? [{ code: String(l.example).trim() }] : [])],
    d: ['Læs eksemplet, og kør det i Kodeskolen.', ...(l.task ? [`Løs opgaven i Kodeskolen: ${htmlToPoints(l.task.text).join(' ')}`] : []), 'Svar på lektionens quiz i Kodeskolen.'],
    q: (l.quiz || []).map(([q, opts, right, why]) => [q, `${opts[right]}. ${why || ''}`.trim()]),
  })),
}));

// ── written here: elektronik (Elværkstedet), binær (Bit-spil), tastatur, huskekort, beregninger (Værktøjskasse) ──
const electronics = {
  id: 'elektronik', title: 'Elektronik fra bunden', short: 'Elektronik', icon: 'circuit', group: 'electro', app: 'electro',
  intro: 'Spænding, strøm, modstand og komponenter – grundlaget bag Elværkstedet og Værktøjskassen, på dansk og med regneeksempler.',
  days: [
    { t: 'Spænding, strøm og modstand', g: 'Du kan forklare U, I og R og regne med Ohms lov.', r: [['Øv i Elværkstedets simulator', '#/learn/electro/sim'], ['Ohms lov i Værktøjskassen', '#/learn/toolkit']],
      l: ['Spænding (U) måles i volt (V) – "trykket", der driver strømmen.', 'Strøm (I) måles i ampere (A) – hvor meget elektricitet der løber.', 'Modstand (R) måles i ohm (Ω) – hvor meget kredsløbet bremser strømmen.', 'Ohms lov: U = R × I. Find strømmen med I = U / R og modstanden med R = U / I.', 'Eksempel: 9 V over 180 Ω giver I = 9 / 180 = 0,05 A = 50 mA.'],
      d: ['Regn strømmen ud for 12 V over 240 Ω.', 'Kontrollér dit svar i Værktøjskassens Ohms lov-beregner.', 'Mål spændingen på et batteri med et multimeter (hvis du har et).'],
      q: [['Hvad er Ohms lov?', 'U = R × I.'], ['9 V over 180 Ω – hvor meget strøm?', '50 mA (0,05 A).']] },
    { t: 'Effekt og energi', g: 'Du kan regne effekt og forstå watt og kWh.', r: [['Øv i Elværkstedets simulator', '#/learn/electro/sim']],
      l: ['Effekt (P) måles i watt (W): P = U × I. Også P = I² × R og P = U² / R.', 'En 2300 W elkedel på 230 V trækker I = 2300 / 230 = 10 A.', 'Energi = effekt × tid. 1 kWh er 1000 W i én time.', 'En modstand skal kunne tåle effekten, der afsættes i den – ellers bliver den for varm.'],
      d: ['Regn ud, hvor mange ampere en 1000 W støvsuger trækker på 230 V.', 'Find effekten på tre apparater derhjemme (mærkepladen).', 'Regn ud, hvad det koster at have en 10 W lampe tændt i et døgn.'],
      q: [['Hvilken formel giver effekten?', 'P = U × I.'], ['Hvor mange ampere trækker 2300 W på 230 V?', '10 A.']] },
    { t: 'Serie og parallel', g: 'Du kan regne samlet modstand i serie og parallel.', r: [['Øv i Elværkstedets simulator', '#/learn/electro/sim']],
      l: ['Serie: Rs = R1 + R2 + R3. Samme strøm gennem alle; spændingen deles.', 'Parallel: 1/Rp = 1/R1 + 1/R2. Samme spænding over alle; strømmen deles.', 'To ens modstande i parallel giver det halve: 100 Ω || 100 Ω = 50 Ω.', 'Kirchhoffs spændingslov: summen af spændingsfald i en sløjfe er lig kildespændingen.', 'Kirchhoffs strømlov: den strøm, der løber ind i et punkt, løber også ud.'],
      d: ['Regn 220 Ω og 330 Ω i serie og i parallel.', 'Tegn et kredsløb med to pærer i serie og to i parallel – hvad sker der, hvis én går i stykker?', 'Byg kredsløbet i Elværkstedets simulator.'],
      q: [['Hvad er 100 Ω og 100 Ω i parallel?', '50 Ω.'], ['Hvad sker der i en seriekreds, hvis én komponent afbryder?', 'Hele kredsen stopper, fordi strømmen kun har én vej.']] },
    { t: 'Komponenter: modstand, kondensator, diode og LED', g: 'Du kender de almindelige komponenter og deres opgave.', r: [['Modstandens farvekode i Værktøjskassen', '#/learn/toolkit']],
      l: ['Modstand: begrænser strømmen. Værdien kan aflæses med farvekoden.', 'Kondensator: gemmer ladning (Q = C × U). Bruges til udglatning og timing (τ = R × C).', 'Diode: leder kun den ene vej (ca. 0,7 V spændingsfald for silicium).', 'LED: en diode, der lyser. Skal altid have en formodstand: R = (U − Uf) / I.', 'Eksempel: rød LED (Uf 2,0 V, 20 mA) på 5 V: R = (5 − 2) / 0,02 = 150 Ω.'],
      d: ['Regn formodstanden til en blå LED (Uf 3,0 V, 20 mA) på 5 V.', 'Aflæs farvekoden på en modstand (eller brug Værktøjskassen).', 'Find en kondensator i en gammel printplade og aflæs værdien.'],
      q: [['Hvorfor skal en LED have en formodstand?', 'Ellers bliver strømmen for stor, og LED’en brænder af.'], ['Hvad gør en diode?', 'Leder strøm i kun den ene retning.']] },
    { t: 'Måling og sikkerhed', g: 'Du kan måle sikkert med et multimeter.', r: [['Øv fejlfinding i Elværkstedet', '#/learn/electro/faults']],
      l: ['Spænding måles parallelt over komponenten; strøm måles i serie (kredsen afbrydes).', 'Modstand måles altid uden strøm på kredsløbet.', 'Start på højeste måleområde, hvis multimeteret ikke selv vælger.', 'Netspænding (230 V) er livsfarlig – arbejd kun med det, hvis du er uddannet til det.', 'ESD: statisk elektricitet kan ødelægge elektronik. Brug jordet armbånd eller rør ved noget jordet først.'],
      d: ['Mål spændingen på et 9 V-batteri og på et næsten fladt batteri.', 'Forklar forskellen på at måle spænding og strøm.', 'Lav en sikkerhedstjekliste til arbejde med elektronik.'],
      q: [['Hvordan måler man strøm?', 'I serie – kredsen afbrydes, og multimeteret sættes ind i den.'], ['Hvad er ESD?', 'Elektrostatisk udladning – statisk elektricitet, der kan ødelægge komponenter.']] },
  ],
};

const digital = {
  id: 'digitale-grundfaerdigheder', title: 'Digitale grundfærdigheder', short: 'Grundfærdigheder', icon: 'chip', group: 'it', app: 'bits',
  intro: 'Binære tal, blindskrift med ti fingre, smart udenadslære og hurtige beregninger – det, Bit-spil, Tastaturtræner, Huskekort og Værktøjskassen træner.',
  days: [
    { t: 'Binære tal og bits', g: 'Du kan omregne mellem binær og decimal.', r: [['Spil Bit-spil', '#/learn/bits'], ['Talsystemer i Værktøjskassen', '#/learn/toolkit']],
      l: ['En bit er 0 eller 1. Otte bits er en byte.', 'Hver plads er dobbelt så meget værd som den forrige: 128 64 32 16 8 4 2 1.', 'Eksempel: 1010 = 8 + 2 = 10. 11111111 = 255.', 'Hexadecimal bruger 0–9 og A–F; ét hex-ciffer er fire bits (F = 1111).', 'IP-adresser er fire bytes: 192.168.1.1 – hvert tal er mellem 0 og 255.'],
      d: ['Omregn 13, 64 og 200 til binær.', 'Klar tre baner i Bit-spil.', 'Find din computers IP-adresse og skriv det første tal i binær.'],
      q: [['Hvad er 1010 i decimal?', '10.'], ['Hvor mange bits er en byte?', 'Otte.']] },
    { t: 'Skriv hurtigt med ti fingre', g: 'Du kender grundstillingen og øver dig fast.', r: [['Øv i Tastaturtræneren', '#/learn/typing']],
      l: ['Fingrene hviler i grundstillingen på den midterste række: a s d f og j k l æ. Tommelfingrene på mellemrum.', 'Hver finger har sine taster – ræk op og ned og tilbage til grundstillingen.', 'Kig på skærmen, ikke på tasterne. Præcision først, så kommer farten.', 'Korte daglige øvelser (5–10 minutter) virker bedre end én lang.', 'Lær genveje: Ctrl+C/V/Z, Ctrl+F, Win+L (lås skærmen), Alt+Tab.'],
      d: ['Øv grundstillingen i Tastaturtræneren i 5 minutter.', 'Mål din hastighed (ord pr. minut) og skriv den ned.', 'Øv i en uge og mål igen.'],
      q: [['Hvilke taster hviler venstre hånd på i grundstillingen?', 'a s d f.'], ['Hvad er vigtigst i starten – fart eller præcision?', 'Præcision; farten kommer af sig selv.']] },
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
    { t: 'Kom i gang: Hjem, menuen og søgningen', g: 'Du kan finde rundt i HUBTECH og finde alt med søgningen.', r: [['Gå til Hjem', '#/'], ['Guide: Velkommen til HUBTECH', '#/learn/guide/welcome']],
      l: ['Hjem viser dagens aftaler og opgaver, hvor du slap sidst, og et tip fra Gnist.', 'Menuen med ikoner til venstre har de faste steder: Hjem, Projekter, Office, Kalender, Opgaver, Kode-editor, Lær og øv og Alle apps – og nederst Gnist og Indstillinger. På telefonen ligger de vigtigste i bunden af skærmen.', 'Under de faste steder ligger dine genveje. Med + tilføjer du en app, en side i HUBTECH eller en hjemmeside. Træk en genvej for at flytte den, eller højreklik på den for at omdøbe eller fjerne den.', 'Søg i alt med Ctrl+K (⌘K på Mac) eller søgefeltet i topbaren: apps, Office-filer, guides, lektioner og projekter. Skriv fx “aftale tandlæge fredag kl. 10”, så laver søgningen aftalen for dig.', 'Topbaren viser, hvor du er. Til højre ligger Arbejdstilstand, notifikationer, en menu med tema og fuld skærm og din profil.'],
      d: ['Tryk Ctrl+K, og find Kalender uden at bruge musen.', 'Tilføj to genveje med + i menuen til venstre: en app og en hjemmeside.', 'Træk genvejene i den rækkefølge, du vil have dem, og fjern den ene igen.'],
      q: [['Hvordan åbner du søgningen?', 'Ctrl+K (⌘K på Mac) – eller søgefeltet i topbaren.'], ['Hvordan fjerner du en genvej fra menuen til venstre?', 'Højreklik på den, og vælg “Fjern fra menuen”.']] },
    { t: 'Alle apps: find, åbn og fastgør', g: 'Du ved, hvilke apps der findes, og hvordan du finder og fastgør dem.', r: [['Se alle apps', '#/apps']],
      l: ['Alle apps i menuen til venstre åbner en oversigt med søgning øverst og alle apps i grupper: Planlæg, HUBTECH Office, Team, Kunder og drift, IT-support, Økonomi, Udvikling, Værktøjer, Pauserum og Lær og øv.', 'Klik på nålen ved en app for at fastgøre den i menuen til venstre. Klik på nålen igen for at fjerne den.', 'Nogle apps er samlet i én med faner: Økonomi har Budget, Opsparing, Sparegris, Fællesudgifter, Del regningen og Udlån, og HUBTECH Office har Notesbog og Noter.', 'IT-support samler værktøjerne til hverdagen i supporten: Printer-doktor, Netværksberegner, Hardwaretest, Kommandoer, Tjeklister og Svarskabeloner.', 'Al data gemmes på din konto, så den følger med fra computer til telefon.'],
      d: ['Åbn Alle apps, og find tre apps, du ikke kendte.', 'Fastgør en app, du bruger tit, så den står i menuen til venstre.', 'Åbn Økonomi, og skift mellem fanerne.'],
      q: [['Hvordan får du en app op i menuen til venstre?', 'Klik på nålen ved appen i Alle apps.'], ['Hvor finder du Budget?', 'Som en fane i Økonomi – søgningen (Ctrl+K) finder den også.']] },
    { t: 'HUBTECH Office: dokumenter, regneark, præsentationer og noter', g: 'Du kan lave og dele et dokument, et regneark og en præsentation og skrive i Notesbogen.', r: [['Åbn HUBTECH Office', '#/apps/hubtech'], ['Notesbog', '#/apps/notebook']],
      l: ['Dokumenter har overskrifter, tabeller, find og erstat og genveje: skriv “# ” for overskrift eller “- ” for punktliste.', 'Regneark har formler (SUM, HVIS, LOPSLAG m.fl.), træk-ned for serier (mandag, tirsdag … eller 1, 2, 3) og indsæt/slet rækker, hvor formlerne følger med.', 'Præsentationer laves dias for dias og vises i fuld skærm.', 'Notesbog og Noter er faner i Office. I Notesbogen klikker du hvor som helst på siden og skriver – med tjeklister, tabeller, billeder og tegning.', 'Filer kan deles med andre brugere og eksporteres, og alt gemmes automatisk.'],
      d: ['Lav et dokument med en overskrift, en punktliste og en tabel.', 'Lav et regneark med ugedagene trukket ned og en SUM-formel.', 'Lav en side i Notesbogen med en tjekliste og en lille tegning.'],
      q: [['Hvordan laver du hurtigt en punktliste i et dokument?', 'Skriv “- ” i starten af linjen.'], ['Hvad sker der med formlerne, når du indsætter en række?', 'De flytter med, så de stadig peger på de samme celler.']] },
    { t: 'Kalender, opgaver og noter', g: 'Du kan planlægge din uge i HUBTECH.', r: [['Kalender', '#/apps/calendar'], ['Opgaver', '#/apps/tasks'], ['Noter', '#/apps/notes']],
      l: ['Kalender: skriv fx “Fodbold tirsdag 17-18:30 hver uge i Hallen” i hurtig tilføj – HUBTECH forstår tid, sted og gentagelse.', 'Tastaturgenveje i kalenderen: T (i dag), M/U/L (måned, uge, liste), N (ny aftale) og / (søg). Overlappende aftaler giver en advarsel.', 'Kalenderen kan abonneres på fra telefonens kalender via et privat link (.ics).', 'Opgaver er en tavle med kolonner; hurtigknapper sætter deadline til i dag, i morgen eller om en uge.', 'Noter (en fane i Office) kan have tjeklister, og punkter, der ikke er krydset af, kan sendes til Opgaver med ét klik.'],
      d: ['Opret en gentaget aftale med hurtig tilføj.', 'Lav en opgave med deadline i morgen.', 'Skriv en note med en tjekliste, og send punkterne til Opgaver.'],
      q: [['Hvilken tast laver en ny aftale i kalenderen?', 'N.'], ['Hvordan får du kalenderen ind på telefonen?', 'Abonnér på det private kalenderlink (.ics) i telefonens kalender.']] },
    { t: 'Læring: kurser, guides og læringsapps', g: 'Du ved, hvordan du lærer nyt i HUBTECH.', r: [['Guides & Læring', '#/learn']],
      l: ['Guides & Læring samler alle kurser, læringsapps og guides – og søgningen finder også lektioner inde i kurserne.', 'Hvert kursus har lektioner med Læs, Lær, Øv og Tjek dig selv. Afkrydsede øvelser giver XP.', 'Markér spørgsmål, du var usikker på, så samles de til repetition.', 'Læringsapps: Øvelseslab, Elværkstedet, Kodeskolen, Huskekort, Quiz, Phishing-træner, IT-ordbog, Tastaturtræner, Bit-spil og Værktøjskasse.', 'Kurser i maskinernes software: LightBurn, xTool, Bambu Lab, Creality, VersaWorks og flere.'],
      d: ['Start et kursus, og kryds den første øvelse af.', 'Søg efter “ipconfig” i Guides & Læring.', 'Lav fem huskekort fra et kursus.'],
      q: [['Hvad giver en afkrydset øvelse?', 'XP på din konto.'], ['Hvor samles spørgsmål, du var usikker på?', 'Under “Til repetition” på kursusoversigten.']] },
    { t: 'Team: chat, opkald og fælles projekter', g: 'Du kan arbejde sammen med dine kolleger i HUBTECH.', r: [['Fællesskab', '#/apps/community'], ['Projekter', '#/projects']],
      l: ['Alle, der er logget ind på den samme HUBTECH-server, er automatisk i samme team – I skal ikke forbinde noget selv.', 'Fællesskab har chat og opkald med lyd, video og skærmdeling – også med flere på én gang.', 'Del en opgave, note eller kodestump i chatten med Del-knappen.', 'Afstemninger, Spørg og svar og Tavlen hjælper, når I er flere om en beslutning.', 'Fællesudgifter og Del regningen holder styr på penge i et projekt.'],
      d: ['Skriv til en kollega i Fællesskab.', 'Start et opkald og del din skærm.', 'Del en opgave i en chat.'],
      q: [['Hvordan kommer en kollega med i teamet?', 'Ved at logge ind på den samme HUBTECH-server.'], ['Hvor deler du skærmen?', 'I et opkald i Fællesskab.']] },
    { t: 'Forbindelser, widgets og indstillinger', g: 'Du kan forbinde HUBTECH’er, bruge widgets og indstille platformen.', r: [['Forbindelser', '#/hubs'], ['Indstillinger', '#/settings']],
      l: ['HUBTECH’er på samme netværk finder og forbinder sig selv automatisk – du skal ikke gøre noget.', 'Forbindelser viser, hvilke HUBTECH’er du er forbundet med, og du kan blokere en, du ikke vil forbindes med.', 'Widgets: under Indstillinger → Apps og opkald er der vejledning til Windows, iPhone og Android, så du kan have dagens aftaler og opgaver på skrivebordet eller hjemskærmen.', 'Under Indstillinger styrer du profil, adgangskode og sikkerhed – og under Udseende tema (mørk, lys eller som systemet) og stil.', 'Arbejdstilstand i topbaren gør lyset varmere og kontrasten blødere, når du arbejder længe. Den kan slå sig til af sig selv om aftenen.', 'Admin og Ejer styrer brugere og rettigheder på serveren.'],
      d: ['Åbn Forbindelser, og se, hvilke HUBTECH’er du er forbundet med.', 'Sæt en widget op på din computer eller telefon.', 'Slå Arbejdstilstand til, prøv de tre styrker af varmt lys, og slå den fra igen.'],
      q: [['Skal du selv forbinde HUBTECH’er på samme netværk?', 'Nej, de finder og forbinder sig selv automatisk.'], ['Hvor finder du vejledningen til widgets?', 'Under Indstillinger → Apps og opkald.']] },
    { t: 'Gnist – din AI-assistent', g: 'Du kan spørge Gnist om hjælp og lade hende planlægge, forklare og fejlfinde for dig.', r: [['Linux-terminal', '#/learn/linux'], ['Guides & Læring', '#/learn']],
      l: ['Gnist er HUBTECHs egen AI. Åbn hende med knappen nederst til højre, med Gnist i menuen til venstre eller med Ctrl+J.', 'Som standard kører hun på din egen enhed, så dine noter, opgaver og aftaler bliver på computeren. Vælger I en stor model i Ollama eller en AI i skyen (fx Claude) i hendes indstillinger, er det den, der svarer.', 'Første gang hentes en sprogmodel (ca. 1–2,5 GB). Derefter starter Gnist af sig selv, når du åbner hende.', 'Hun kender alle HUBTECHs guides og kurser og viser kilderne under svaret, så du kan læse videre.', 'Beder du hende lave en aftale, en opgave eller en note, viser hun et forslag, som du selv godkender.', 'Med ↑ henter du dit sidste spørgsmål frem, og "Prøv igen" giver et nyt svar.', 'Under indstillingerne vælger du model, svarform (korte punkter eller tekst) og hvad hun må læse.'],
      d: ['Åbn Gnist og spørg, hvad du skal nå i dag.', 'Spørg, hvordan man finder fokus på en CO2-laser, og klik på en af kilderne.', 'Bed hende lave en aftale i morgen kl. 10 og godkend den.'],
      q: [['Sender Gnist dine data ud på internettet?', 'Ikke med modellerne på din egen enhed – kun hvis I selv vælger en AI i skyen.'], ['Hvordan ser du, hvor svaret kommer fra?', 'Under svaret står Kilder med links til guides og lektioner.']] },
  ],
};


// ── more IT material ──
const network = {
  id: 'netvaerk', title: 'Netværk fra bunden', short: 'Netværk', icon: 'globe', group: 'it', app: 'labs',
  intro: 'IP-adresser, DHCP, DNS, router, Wi-Fi og fejlfinding trin for trin – med øvelser i Netværkslabbet.',
  days: [
    { t: 'IP-adresser, subnet og gateway', g: 'Du kan læse en IP-opsætning og forklare den.', r: [['Øv i Netværkslabbet', '#/learn/labs/network'], ['Netværksberegner i Værktøjskassen', '#/learn/toolkit']],
      l: ['En IP-adresse (fx 192.168.1.42) er enhedens adresse på netværket. Fire tal fra 0 til 255.', 'Subnetmasken (fx 255.255.255.0 = /24) fortæller, hvilke adresser der er på samme lokale net. I Windows står der Undernetmaske.', 'Default gateway (i Windows: Standardgateway) er routeren – vejen ud af det lokale net (typisk .1).', 'Private adresser (192.168.x.x, 10.x.x.x, 172.16–31.x.x) bruges hjemme og på kontoret; routeren oversætter til én offentlig adresse (NAT).', 'ipconfig (Windows) eller ip a (Linux) viser adresse, maske og gateway.'],
      d: ['Kør ipconfig på din egen computer, og forklar hver linje.', 'Brug Netværksberegneren til at finde antallet af adresser i et /24 og et /26.', 'Find routerens adresse på dit eget netværk.'],
      q: [['Hvad er default gateway?', 'Routeren – vejen ud af det lokale netværk.'], ['Hvor mange brugbare adresser har et /24?', '254.']] },
    { t: 'DHCP og DNS', g: 'Du kan forklare DHCP og DNS og genkende fejl i dem.', r: [['Øv i Netværkslabbet', '#/learn/labs/network']],
      l: ['DHCP giver automatisk enheder en adresse, maske, gateway og DNS – typisk fra routeren.', 'Får en Windows-pc ingen adresse fra DHCP, giver den sig selv en APIPA-adresse, der starter med 169.254 – en nødadresse, som ikke kan komme på internettet.', 'DNS oversætter navne (google.com) til IP-adresser – som en telefonbog.', 'Virker ping 8.8.8.8, men ikke ping google.com, er det DNS, der fejler.', 'ipconfig /renew henter en ny adresse; ipconfig /flushdns tømmer DNS-cachen.'],
      d: ['Find en fejl i Netværkslabbet, hvor computeren har en 169.254-adresse.', 'Find en DNS-fejl i Netværkslabbet.', 'Forklar en kunde forskellen på DHCP og DNS med en sammenligning fra hverdagen.'],
      q: [['Hvad betyder en adresse, der starter med 169.254?', 'Computeren har ikke fået en adresse fra DHCP.'], ['Ping 8.8.8.8 virker, ping google.com gør ikke. Hvad er galt?', 'DNS – navnet kan ikke slås op.']] },
    { t: 'Router, switch og Wi-Fi', g: 'Du kender netværkets dele og typiske Wi-Fi-problemer.', r: [['IT-ordbog: netværk', '#/learn/course/it-ordbog/day/2']],
      l: ['Routeren forbinder dit net med internettet og laver typisk DHCP, NAT og Wi-Fi.', 'En switch forbinder flere kablede enheder på samme net.', 'Wi-Fi på 2,4 GHz når længere og gennem vægge; 5 GHz er hurtigere, men kortere. Mange smarte enheder og printere kan kun 2,4 GHz.', 'Svagt Wi-Fi: flyt routeren højt og frit, brug et mesh-system eller kabel til faste enheder.', 'Skift standardkoden til routerens administration, og brug WPA2/WPA3.'],
      d: ['Tegn dit eget netværk: internet, router, switch, enheder.', 'Find ud af, om dit Wi-Fi sender på 2,4 og 5 GHz.', 'Lav en tjekliste til “Wi-Fi er langsomt”.'],
      q: [['Hvorfor kan en printer ofte ikke finde et 5 GHz-netværk?', 'Mange printere og smarte enheder understøtter kun 2,4 GHz.'], ['Hvad gør en switch?', 'Forbinder flere kablede enheder på samme net.']] },
    { t: 'Fejlfinding trin for trin', g: 'Du har en fast metode til netværksfejl.', r: [['Øv i Netværkslabbet', '#/learn/labs/network'], ['Kommandoer: netværk', '#/learn/course/kommandoer/day/1']],
      l: ['1. Fysisk: er kablet sat i, lyser porten, er Wi-Fi tændt? “Medie afbrudt” = ingen forbindelse.', '2. Adresse: har computeren en rigtig adresse og gateway (ipconfig)?', '3. Router: svarer gatewayen på ping?', '4. Internet: svarer 8.8.8.8? Hvis nej, men routeren svarer: problem hos udbyderen.', '5. DNS: svarer google.com? Hvis nej, men 8.8.8.8 svarer: DNS-problem. tracert viser, hvor det stopper.'],
      d: ['Løs fem sager i Netværkslabbet.', 'Lav din egen lommekort-tjekliste med de fem trin.', 'Forklar en kollega, hvorfor man tester gatewayen før internettet.'],
      q: [['Routeren svarer, men 8.8.8.8 gør ikke. Hvor er fejlen?', 'Hos internetudbyderen eller i routerens internetforbindelse.'], ['Hvad er første trin i netværksfejlfinding?', 'Det fysiske: kabel, porte, Wi-Fi.']] },
  ],
};

const printers = {
  id: 'printer-support', title: 'Printer-support: laser og blæk', short: 'Printer-support', icon: 'printer', group: 'it', app: 'printerdoctor',
  intro: 'Sådan virker laser- og blækprintere, de typiske fejl og hvordan du løser dem – også netværksprintere og udskriftskøen.',
  days: [
    { t: 'Sådan virker en laserprinter', g: 'Du kender laserprinterens dele og deres fejl.', r: [['Printer-doktor', '#/apps/printerdoctor']],
      l: ['En laser tegner billedet som elektrisk ladning på tromlen; toner sætter sig der, hvor der skal være sort.', 'Toneren overføres til papiret og smeltes fast i fikseringsenheden (fuseren), som er meget varm.', 'Toner, der kan tørres af: fuseren smelter ikke nok (forkert papirtype i driveren eller slidt fuser).', 'Gentagne prikker med fast afstand: en ridse eller plet på tromlen eller en valse – afstanden fortæller hvilken.', 'Lyse striber på langs: lidt toner tilbage, eller snavs på laservinduet.'],
      d: ['Find tromle og toner i en laserprinter (eller i manualen).', 'Forklar fuserens opgave på to linjer.', 'Find i manualen, hvad afstanden mellem gentagne prikker betyder.'],
      q: [['Hvad smelter toneren fast?', 'Fikseringsenheden (fuseren).'], ['Toneren kan tørres af. Hvad tjekker du?', 'Papirtypen i driveren – ellers fuseren.']] },
    { t: 'Blækprintere og dyser', g: 'Du kan fejlsøge striber og farvefejl på blækprintere.', r: [['Fejlfindingslab', '#/learn/labs/cases']],
      l: ['Blæk sprøjtes gennem små dyser i printhovedet. Tørrer de ind, kommer der striber.', 'Kør altid en dysetest først: mangler der linjer, så kør rens – og test igen.', 'Mange rensninger bruger meget blæk; vent lidt mellem dem.', 'Printere, der står ubrugt længe, tørrer ind. Print lidt farve en gang om ugen.', 'Uoriginal blæk kan virke, men tjek garantien og vær opmærksom på farveforskelle.'],
      d: ['Kør (eller find vejledningen til) en dysetest på en blækprinter.', 'Løs sagen om striber i Fejlfindingslabbet.', 'Skriv en kundeguide: “Mine print har striber”.'],
      q: [['Hvad laver du først ved striber på en blækprinter?', 'En dysetest.'], ['Hvorfor tørrer blækprintere ind?', 'Blækket i dyserne tørrer, når printeren ikke bruges.']] },
    { t: 'Netværksprintere', g: 'Du kan sætte en printer stabilt op på netværket.', r: [['Netværk fra bunden', '#/learn/course/netvaerk/day/2']],
      l: ['Giv printeren en fast adresse med en DHCP-reservation i routeren – så forsvinder den ikke efter en genstart.', 'Port 9100 (RAW) og IPP bruges til udskrivning over netværket.', 'Mange printere viser deres IP-adresse på skærmen eller på en konfigurationsside.', 'Wi-Fi-printere kan ofte kun 2,4 GHz. Efter routerskift skal printeren forbindes til det nye netværk.', 'Tilføj printeren via IP-adresse, hvis den ikke dukker op automatisk.'],
      d: ['Print en konfigurationsside, og find IP-adressen.', 'Find, hvor man laver en DHCP-reservation i en router.', 'Løs sagen om printeren, der forsvinder hver mandag, i Fejlfindingslabbet.'],
      q: [['Hvordan undgår man, at printeren får ny IP-adresse?', 'Med en DHCP-reservation (fast adresse) i routeren.'], ['Hvilken port bruges typisk til rå udskrivning?', '9100.']] },
    { t: 'Udskriftskøen og drivere', g: 'Du kan løse en hængende udskriftskø og driverfejl.', r: [['Kommandoer: printer', '#/learn/course/kommandoer/day/2']],
      l: ['Hænger køen, så genstart Print Spooler-tjenesten (net stop spooler / net start spooler som administrator).', 'Ryd køen, hvis et job er gået i stå – ét fastlåst job kan blokere alle de andre.', 'Brug producentens driver eller Windows’ indbyggede; undgå drivere fra tilfældige sider.', 'Forkert papirstørrelse (Letter i stedet for A4) giver “ilæg papir”-fejl.', 'Test med en testside fra printeren selv: virker den, er fejlen på computeren.'],
      d: ['Genstart udskriftskøen på din egen computer (som administrator).', 'Find printerens driverversion i Windows.', 'Lav en fejlfindingsliste til “Intet sker, når jeg trykker Udskriv”.'],
      q: [['Hvordan genstarter man udskriftskøen?', 'net stop spooler og net start spooler som administrator (eller via Tjenester).'], ['Printerens egen testside virker. Hvor er fejlen?', 'På computeren (driver, kø eller forbindelse).']] },
  ],
};

const windows = {
  id: 'windows-support', title: 'Windows-support i praksis', short: 'Windows-support', icon: 'monitor', group: 'it', app: 'labs',
  intro: 'De opgaver, du møder oftest: langsom computer, opdateringer, konti og adgangskoder, backup og malware.',
  days: [
    { t: 'Langsom computer', g: 'Du kan finde årsagen til en langsom computer.', r: [['Fejlfindingslab', '#/learn/labs/cases'], ['Hardwaretest', '#/apps/hwtest']],
      l: ['Åbn Jobliste (Ctrl+Shift+Esc): hvad bruger CPU, hukommelse og disk?', 'Mange programmer ved opstart gør computeren langsom – slå unødvendige fra under Startapps i Jobliste.', 'Næsten fuld disk gør Windows langsom. Ryd op med Diskoprydning eller Lagerassistent (Indstillinger → System → Lager).', 'En gammel harddisk (HDD) er den største bremse – en SSD gør en stor forskel.', 'En ukendt proces med højt forbrug kan være malware.'],
      d: ['Åbn Jobliste og find de tre programmer, der bruger mest hukommelse.', 'Se, hvilke programmer der starter med Windows på din computer.', 'Løs sagen “Computeren er blevet meget langsom” i Fejlfindingslabbet.'],
      q: [['Hvilken genvej åbner Jobliste?', 'Ctrl+Shift+Esc.'], ['Hvad giver den største hastighedsforbedring på en gammel pc?', 'At skifte harddisken (HDD) til en SSD.']] },
    { t: 'Opdateringer og drivere', g: 'Du holder Windows og drivere opdateret uden problemer.', r: [['Guide: sikkerhed', '#/learn']],
      l: ['Windows Update bør være slået til – sikkerhedsopdateringer lukker huller, som angribere bruger.', 'Store opdateringer kan tage tid: tilslut strøm, og sluk ikke undervejs.', 'Drivere hentes bedst via Windows Update eller producentens side.', 'Går noget galt efter en opdatering: brug “Afinstaller opdateringer” eller Systemgendannelse.', 'Tag backup før store ændringer.'],
      d: ['Tjek, hvornår din computer sidst blev opdateret.', 'Find, hvor man afinstallerer en opdatering.', 'Lav en tjekliste før en stor opdatering hos en kunde.'],
      q: [['Hvorfor er sikkerhedsopdateringer vigtige?', 'De lukker huller, som angribere ellers kan bruge.'], ['Hvad gør du, hvis en opdatering skaber problemer?', 'Afinstallerer opdateringen eller bruger Systemgendannelse.']] },
    { t: 'Konti, adgangskoder og totrin', g: 'Du kan hjælpe med konti og sikre logins.', r: [['Kodeord-appen', '#/apps/passwords'], ['Spot phishing', '#/learn/course/phishing']],
      l: ['Brug lange adgangskoder (fx fire tilfældige ord) – og aldrig den samme flere steder.', 'En password manager (i Windows og Edge: adgangskodeadministrator) husker koderne, så kunden kun skal huske én.', 'Totrinsbekræftelse – også kaldet to-faktor, 2FA eller MFA – stopper de fleste kontoovertagelser. Det er fx en kode i en app.', 'Glemt kode til en Microsoft-konto nulstilles via Microsofts gendannelsesside – med mail eller telefon.', 'Bed aldrig kunden om at sige sin kode højt – lad kunden selv taste den.'],
      d: ['Lav en stærk adgangskode med Kodeord-appen.', 'Slå totrinsbekræftelse til på en af dine egne konti.', 'Forklar en kunde, hvorfor man ikke bør genbruge koder.'],
      q: [['Hvad stopper de fleste kontoovertagelser?', 'Totrinsbekræftelse.'], ['Hvorfor ikke genbruge adgangskoder?', 'Lækkes én tjeneste, kan angriberen logge ind på alle de andre.']] },
    { t: 'Backup og malware', g: 'Du kan sætte backup op og håndtere malware.', r: [['Fejlfindingslab', '#/learn/labs/cases']],
      l: ['3-2-1-reglen: tre kopier, på to forskellige medier, én uden for huset (fx i skyen).', 'Test, at backuppen kan gendannes – en backup, der ikke virker, er ingen backup.', 'Ved mistanke om malware: afbryd netværket, scan med Windows Sikkerhed, og skift koder fra en ren enhed.', 'Ransomware krypterer filer – den bedste beskyttelse er en backup, der ikke altid er forbundet.', 'Installer kun programmer fra kendte kilder.'],
      d: ['Lav en backup-plan efter 3-2-1-reglen til en lille virksomhed.', 'Kør en hurtig scanning i Windows Sikkerhed.', 'Skriv en handleplan: “Jeg tror, min computer har virus”.'],
      q: [['Hvad er 3-2-1-reglen?', 'Tre kopier, to forskellige medier, én uden for huset.'], ['Hvad er første skridt ved mistanke om malware?', 'Afbryd netværket.']] },
  ],
};

const HUES = { start: '#3b82f6', it: '#06b6d4', code: '#8b5cf6', electro: '#22c55e', general: '#f97316' };
export const APP_COURSES = [hubtech, digital, network, printers, windows, ...GENERAL_COURSES, glossary, quiz, phishing, commands, electronics, ...code]
  .map(c => ({ ...c, stateId: `course-${c.id}`, unit: 'Lektion', hue: c.hue || HUES[c.group],
    note: 'Bygget på indholdet i læringsappsene. Øvelserne i appen giver også deres egne point.' }));
export const APP_GROUPS = [['start', 'HUBTECH'], ['it', 'IT og support'], GENERAL_GROUP, ['code', 'Programmering'], ['electro', 'Elektronik']];

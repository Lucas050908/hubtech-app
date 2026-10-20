/**
 * Kodeskolen – programming courses for HUBTECH (Danish).
 *
 * course: { id, title, lang, icon, hue, level, intro, lessons[] }
 * lesson: { id, title, minutes, body (trusted HTML), example?, task?, quiz? }
 * task:   { text, starter, hint, solution, check }
 *   check (python):     { out: 'exact stdout' } | { has: ['text', …] } | { test: 'python asserts run after your code' }
 *   check (javascript): { out } | { has } | { test: 'JS asserts run after your code (throw to fail)' }
 *   check (html):       { sel: [[cssSelector, expectedText?], …] } | { css: [[selector, property, value], …] }
 *   check (git/cpp):    { re: ['regex the answer must match', …] }   (no code is run)
 *   check (sql):        { same: true, ordered? } compares your last result with the solution's
 *                       { test: 'SELECT …' } compares that query's result after your code and after the solution
 *   course.setup (sql): SQL that builds the practice database before every run
 *   stdin: 'lines given to input()' (python)
 * quiz:   [[question, [options…], correctIndex, explanation], …]
 */
const c = (s) => s.replace(/^\n/, '');

const SQL_SETUP = `
CREATE TABLE kunder (id INTEGER PRIMARY KEY, navn TEXT, by TEXT, telefon TEXT);
INSERT INTO kunder VALUES (1,'Jensen A/S','Vejle','75 12 34 56'),(2,'Bager Hansen','Fredericia','75 98 76 54'),(3,'Tandlæge Holm','Vejle','76 44 33 22'),(4,'Kolding Kontor ApS','Kolding','75 55 66 77'),(5,'Lis Mortensen','Horsens','40 11 22 33');
CREATE TABLE opgaver (id INTEGER PRIMARY KEY, kunde_id INTEGER, titel TEXT, timer REAL, status TEXT, dato TEXT);
INSERT INTO opgaver VALUES (1,1,'Service på printer',1.5,'færdig','2026-09-02'),(2,2,'Nyt netværk i butikken',4,'færdig','2026-09-05'),(3,1,'Opsætning af 3 pc''er',3,'åben','2026-10-12'),(4,3,'Backup af journalsystem',2,'i gang','2026-10-01'),(5,4,'Wi-Fi falder ud',1,'åben','2026-10-08'),(6,2,'Kasseapparat genstarter',0.5,'færdig','2026-09-20'),(7,5,'Hjælp med ny telefon',1,'åben','2026-10-15'),(8,4,'Skift af switch',2.5,'i gang','2026-10-03');
CREATE TABLE dele (id INTEGER PRIMARY KEY, navn TEXT, antal INTEGER, pris REAL, leverandor TEXT);
INSERT INTO dele VALUES (1,'Toner HP 26A',4,449,'Dustin'),(2,'Netværkskabel 2 m',35,19,'Elfa'),(3,'ESP32 DevKit',3,89,'Elfa'),(4,'SSD 1 TB',2,529,'Proshop'),(5,'Switch 8-port',1,299,'Dustin');
`;

export const CODE_COURSES = [
  // ───────────────────────────────────────── Python ─────────────────────────────────────────
  {
    id: 'python', title: 'Python fra bunden', lang: 'python', icon: 'terminal', hue: '#3b82f6', level: 'Begynder',
    intro: 'Det mest brugte sprog til automatisering, data og små værktøjer – og det HUBTECH-serveren selv er skrevet i. Koden kører direkte her i browseren.',
    lessons: [
      { id: 'py1', title: 'Dit første program', minutes: 10,
        body: `<p>Et program er en liste af instruktioner, som computeren udfører <b>oppefra og ned</b>. I Python skriver du tekst ud med <code>print()</code>.</p>
<p>Tekst skal stå i anførselstegn – det kaldes en <i>streng</i>. Tal skriver du uden anførselstegn, og Python kan regne med dem.</p>
<ul><li><code>print("Hej")</code> skriver Hej</li><li><code>print(2 + 3)</code> skriver 5</li><li><code>#</code> starter en kommentar – den ignoreres</li></ul>`,
        example: c(`
# Det her er en kommentar
print("Hej fra HUBTECH!")
print(7 * 6)
print("Svaret er", 7 * 6)`),
        task: { text: 'Skriv et program, der skriver præcis <code>Hej verden</code> på første linje og resultatet af 12 * 12 på anden linje.',
          starter: '# Skriv din kode her\n', hint: 'To linjer med print(). Den første med tekst i anførselstegn, den anden med regnestykket.',
          solution: 'print("Hej verden")\nprint(12 * 12)', check: { out: 'Hej verden\n144' } },
        quiz: [['Hvad skriver print(3 + 4)?', ['3 + 4', '7', '"7"', 'Ingenting'], 1, 'Uden anførselstegn regner Python stykket ud først.'],
          ['Hvad gør # i Python?', ['Ganger to tal', 'Starter en kommentar', 'Laver en liste', 'Stopper programmet'], 1, 'Alt efter # på linjen bliver ignoreret.']] },
      { id: 'py2', title: 'Variabler og typer', minutes: 12,
        body: `<p>En <b>variabel</b> er et navn til en værdi: <code>navn = "Lucas"</code>. Bagefter kan du bruge navnet i stedet for værdien.</p>
<p>De vigtigste typer: <code>int</code> (heltal), <code>float</code> (kommatal – skrives med punktum: <code>3.5</code>), <code>str</code> (tekst) og <code>bool</code> (<code>True</code>/<code>False</code>).</p>
<p>Med en <b>f-streng</b> sætter du variabler ind i tekst: <code>f"Hej {navn}"</code>.</p>`,
        example: c(`
navn = "Lucas"
alder = 17
timeløn = 152.5
print(f"{navn} er {alder} år og tjener {timeløn} kr. i timen")
print(type(alder), type(timeløn), type(navn))`),
        task: { text: 'Lav variablerne <code>spaending = 12</code> og <code>strom = 0.5</code>. Beregn effekten <code>effekt = spaending * strom</code>, og skriv <code>Effekt: 6.0 W</code> med en f-streng.',
          starter: 'spaending = 12\n', hint: 'print(f"Effekt: {effekt} W")', solution: 'spaending = 12\nstrom = 0.5\neffekt = spaending * strom\nprint(f"Effekt: {effekt} W")',
          check: { out: 'Effekt: 6.0 W', test: 'assert effekt == 6.0, "effekt skal være 6.0"' } },
        quiz: [['Hvilken type er 3.0?', ['int', 'float', 'str', 'bool'], 1, 'Et tal med decimaler er en float – også når decimalen er 0.'],
          ['Hvad skriver print(f"{2+2} stk")?', ['{2+2} stk', '4 stk', '2+2 stk', 'Fejl'], 1, 'Inde i {} i en f-streng bliver udtrykket regnet ud.']] },
      { id: 'py3', title: 'Input og omregning', minutes: 12,
        body: `<p><code>input()</code> spørger brugeren og giver altid <b>tekst</b> tilbage. Skal du regne med svaret, så lav det om: <code>int("5")</code> eller <code>float("2.5")</code>.</p>
<p>Her i Kodeskolen skriver du input-linjerne i feltet <i>Input</i> under koden.</p>`,
        example: c(`
navn = input("Hvad hedder du? ")
år = int(input("Hvilket år er du født? "))
print(f"Hej {navn}! I 2030 bliver du {2030 - år} år.")`),
        stdin: 'Lucas\n2008',
        task: { text: 'Læs en temperatur i Celsius med <code>input()</code> og skriv den i Fahrenheit (F = C × 9/5 + 32) med 1 decimal: <code>77.0</code> for 25.',
          starter: 'c = float(input())\n', hint: 'print(round(c * 9 / 5 + 32, 1))', solution: 'c = float(input())\nprint(round(c * 9 / 5 + 32, 1))',
          stdin: '25', check: { out: '77.0' } },
        quiz: [['Hvad giver int("12") + 3?', ['"123"', '15', 'Fejl', '12'], 1, 'int() laver teksten om til tallet 12.'],
          ['Hvad sker ved "12" + 3?', ['15', '"123"', 'TypeError – tekst og tal kan ikke lægges sammen', '"15"'], 2, 'Python blander ikke tekst og tal automatisk.']] },
      { id: 'py4', title: 'Beslutninger: if', minutes: 14,
        body: `<p>Med <code>if</code> kører kode kun, når en betingelse er sand. <code>elif</code> og <code>else</code> giver flere veje.</p>
<p>Sammenligninger: <code>==</code> (lig med), <code>!=</code>, <code>&lt;</code>, <code>&gt;</code>, <code>&lt;=</code>, <code>&gt;=</code>. Kombinér med <code>and</code>, <code>or</code>, <code>not</code>.</p>
<p><b>Indrykning</b> (4 mellemrum) viser, hvilken kode der hører til – det er ikke pynt, men en del af sproget.</p>`,
        example: c(`
temperatur = 78
if temperatur >= 85:
    print("STOP – for varm!")
elif temperatur >= 70:
    print("Advarsel: høj temperatur")
else:
    print("OK")`),
        task: { text: 'Lav en funktion-fri “batteritjekker”: givet <code>spaending = 11.4</code> skal programmet skrive <code>Lav</code> hvis spændingen er under 11.8, <code>OK</code> hvis den er op til 12.9, og ellers <code>Lader</code>.',
          starter: 'spaending = 11.4\n', hint: 'if spaending < 11.8: … elif spaending <= 12.9: … else: …',
          solution: 'spaending = 11.4\nif spaending < 11.8:\n    print("Lav")\nelif spaending <= 12.9:\n    print("OK")\nelse:\n    print("Lader")', check: { out: 'Lav' } },
        quiz: [['Hvad er forskellen på = og ==?', ['Ingen', '= gemmer en værdi, == sammenligner', '== gemmer, = sammenligner', '== bruges kun til tekst'], 1, 'Et lighedstegn tildeler, to sammenligner.'],
          ['Hvornår kører else?', ['Altid', 'Når ingen af de foregående betingelser var sande', 'Når if var sand', 'Aldrig'], 1, 'else er "alt andet".']] },
      { id: 'py5', title: 'Løkker: for og while', minutes: 15,
        body: `<p>En <code>for</code>-løkke gentager kode for hvert element: <code>for i in range(5):</code> kører med i = 0, 1, 2, 3, 4.</p>
<p><code>while</code> gentager, så længe en betingelse er sand – husk at noget skal ændre sig, ellers kører den for evigt (her stopper Kodeskolen den efter få sekunder).</p>
<p><code>break</code> hopper ud af løkken, <code>continue</code> springer resten af denne runde over.</p>`,
        example: c(`
for i in range(1, 6):
    print(i, "×", 7, "=", i * 7)

nedtælling = 3
while nedtælling > 0:
    print(nedtælling)
    nedtælling -= 1
print("Start!")`),
        task: { text: 'Beregn summen af alle tal fra 1 til 100 med en løkke og gem den i variablen <code>total</code>. Skriv total ud.',
          starter: 'total = 0\n', hint: 'for tal in range(1, 101): total += tal', solution: 'total = 0\nfor tal in range(1, 101):\n    total += tal\nprint(total)',
          check: { out: '5050', test: 'assert total == 5050' } },
        quiz: [['Hvilke tal giver range(2, 5)?', ['2, 3, 4, 5', '2, 3, 4', '3, 4, 5', '0, 1, 2, 3, 4'], 1, 'Slutværdien er ikke med.'],
          ['Hvad gør break?', ['Stopper hele programmet', 'Hopper ud af den inderste løkke', 'Springer én runde over', 'Laver en pause'], 1, 'continue springer over, break stopper løkken.']] },
      { id: 'py6', title: 'Lister og ordbøger', minutes: 16,
        body: `<p>En <b>liste</b> holder flere værdier i rækkefølge: <code>maal = [12.1, 11.9, 12.4]</code>. Første element er <code>maal[0]</code>, sidste er <code>maal[-1]</code>. <code>append()</code> tilføjer, <code>len()</code> tæller.</p>
<p>En <b>ordbog</b> (dict) slår op med nøgler: <code>lager = {"LED": 40, "ESP32": 2}</code>, og <code>lager["LED"]</code> giver 40.</p>
<p>Nyttige funktioner: <code>sum()</code>, <code>min()</code>, <code>max()</code>, <code>sorted()</code>.</p>`,
        example: c(`
lager = {"Modstand 4k7": 85, "LED rød": 40, "ESP32": 2}
lager["Kondensator 100µ"] = 6
for navn, antal in lager.items():
    advarsel = "  ← bestil!" if antal < 10 else ""
    print(f"{navn:20} {antal:4}{advarsel}")`),
        task: { text: 'Givet listen <code>maalinger</code>, lav variablerne <code>gennemsnit</code> (gennemsnittet) og <code>hoejeste</code> (største værdi), og skriv dem ud.',
          starter: 'maalinger = [230.1, 229.4, 231.8, 228.9, 230.6]\n', hint: 'gennemsnit = sum(maalinger) / len(maalinger)',
          solution: 'maalinger = [230.1, 229.4, 231.8, 228.9, 230.6]\ngennemsnit = sum(maalinger) / len(maalinger)\nhoejeste = max(maalinger)\nprint(gennemsnit, hoejeste)',
          check: { test: 'assert abs(gennemsnit - 230.16) < 0.001, "gennemsnit er forkert"\nassert hoejeste == 231.8, "hoejeste er forkert"' } },
        quiz: [['Hvad er tal[-1] for tal = [4, 8, 15]?', ['4', '8', '15', 'Fejl'], 2, 'Negative indeks tæller bagfra.'],
          ['Hvordan læser du antallet af "LED" i lager = {"LED": 40}?', ['lager.LED', 'lager[0]', 'lager["LED"]', 'lager("LED")'], 2, 'Ordbøger slås op med nøglen i firkantede parenteser.']] },
      { id: 'py7', title: 'Funktioner', minutes: 16,
        body: `<p>En <b>funktion</b> samler kode under et navn, så du kan genbruge den: <code>def navn(parametre):</code>. Med <code>return</code> sender den et resultat tilbage.</p>
<p>Gode funktioner gør én ting og har et navn, der siger hvad: <code>beregn_modstand()</code> frem for <code>f()</code>.</p>`,
        example: c(`
def ohms_lov(u=None, i=None, r=None):
    """Beregn den manglende størrelse: U = R · I"""
    if u is None:
        return r * i
    if i is None:
        return u / r
    return u / i

print("R =", ohms_lov(u=12, i=0.02), "Ω")
print("I =", ohms_lov(u=5, r=220), "A")`),
        task: { text: 'Skriv funktionen <code>formodstand(forsyning, led_spaending, stroem_mA)</code>, der returnerer formodstanden til en LED i ohm: R = (forsyning − led_spaending) / (stroem_mA / 1000). <br>Eksempel: <code>formodstand(5, 2, 20)</code> giver 150.0.',
          starter: 'def formodstand(forsyning, led_spaending, stroem_mA):\n    # din kode\n    pass\n\nprint(formodstand(5, 2, 20))\n',
          hint: 'return (forsyning - led_spaending) / (stroem_mA / 1000)',
          solution: 'def formodstand(forsyning, led_spaending, stroem_mA):\n    return (forsyning - led_spaending) / (stroem_mA / 1000)\n\nprint(formodstand(5, 2, 20))',
          check: { test: 'assert formodstand(5, 2, 20) == 150, "5 V, 2 V, 20 mA skal give 150 Ω"\nassert round(formodstand(12, 3.2, 15)) == 587, "12 V, 3,2 V, 15 mA skal give ca. 587 Ω"' } },
        quiz: [['Hvad returnerer en funktion uden return?', ['0', 'None', 'Fejl', 'Den sidste linje'], 1, 'Uden return får du None.'],
          ['Hvorfor bruge funktioner?', ['Koden kører hurtigere', 'Genbrug og overblik', 'Det kræves i Python', 'For at undgå variabler'], 1, 'Du skriver logikken én gang og kalder den mange steder.']] },
      { id: 'py8', title: 'Fejl og try/except', minutes: 14,
        body: `<p>Når noget går galt, laver Python en <b>exception</b> – fx <code>ValueError</code> når <code>int("abc")</code> ikke kan lade sig gøre, eller <code>ZeroDivisionError</code> ved division med 0.</p>
<p>Med <code>try</code>/<code>except</code> fanger du fejlen og gør noget fornuftigt i stedet for at programmet crasher. Læs altid fejlbeskeden nederst – den fortæller typen og linjen.</p>`,
        example: c(`
for tekst in ["12", "3,5", "abc"]:
    try:
        tal = float(tekst.replace(",", "."))
        print(tekst, "→", tal)
    except ValueError:
        print(tekst, "→ ikke et tal")`),
        task: { text: 'Skriv funktionen <code>sikker_division(a, b)</code>, der returnerer a / b – men returnerer <code>None</code> i stedet for at crashe, når b er 0.',
          starter: 'def sikker_division(a, b):\n    pass\n', hint: 'try: return a / b  except ZeroDivisionError: return None',
          solution: 'def sikker_division(a, b):\n    try:\n        return a / b\n    except ZeroDivisionError:\n        return None',
          check: { test: 'assert sikker_division(10, 4) == 2.5\nassert sikker_division(1, 0) is None, "division med 0 skal give None"' } },
        quiz: [['Hvilken fejl giver int("hej")?', ['TypeError', 'ValueError', 'NameError', 'SyntaxError'], 1, 'Værdien har den rigtige type (tekst), men kan ikke laves om.'],
          ['Hvor står den vigtigste information i en Python-fejlbesked?', ['Øverst', 'Nederst', 'I midten', 'Den står ikke i beskeden'], 1, 'Sidste linje viser fejltypen og beskeden.']] },
    ],
  },

  // ───────────────────────────────────────── Python – videre ─────────────────────────────────────────
  {
    id: 'python2', title: 'Python – videre', lang: 'python', icon: 'terminal', hue: '#2563eb', level: 'Let øvet',
    intro: 'Når det grundlæggende sidder: tekstbehandling, list comprehensions, klasser, moduler, filer og JSON – og et lille projekt, der læser en log.',
    lessons: [
      { id: 'pv1', title: 'Tekst og f-strings', minutes: 12,
        body: `<p>Tekst (strenge) har mange indbyggede metoder: <code>.upper()</code>, <code>.lower()</code>, <code>.strip()</code> (fjerner mellemrum i enderne), <code>.split()</code> (deler op i en liste) og <code>.replace(a, b)</code>.</p>
<p>Med en <b>f-string</b> sætter du værdier direkte ind: <code>f"{navn} har {antal} stk."</code>. Efter et kolon kan du formatere: <code>f"{pris:.2f}"</code> giver to decimaler.</p>`,
        example: c(`
navn = "  oliver jensen "
rent = navn.strip().title()
print(rent)
dele = rent.split()
print(dele, len(dele))
pris = 449
print(f"{rent} skylder {pris * 1.25:.2f} kr. inkl. moms")`),
        task: { text: 'Skriv funktionen <code>initialer(navn)</code>, der returnerer initialerne med store bogstaver – fx <code>initialer("oliver jensen")</code> → <code>"OJ"</code>. Ekstra mellemrum skal ikke give problemer.',
          starter: 'def initialer(navn):\n    pass\n', hint: 'Brug navn.split() og tag det første tegn af hvert ord: ord[0].upper()',
          solution: 'def initialer(navn):\n    return "".join(ord[0].upper() for ord in navn.split())',
          check: { test: 'assert initialer("oliver jensen") == "OJ"\nassert initialer("  ada   lovelace king ") == "ALK", "ekstra mellemrum skal ignoreres"\nassert initialer("Bo") == "B"' } },
        quiz: [['Hvad giver "a,b,c".split(",")?', ['"abc"', "['a', 'b', 'c']", "('a','b','c')", 'En fejl'], 1, 'split deler teksten op i en liste ved hvert komma.'],
          ['Hvad betyder :.2f i f"{x:.2f}"?', ['To tegn', 'To decimaler', 'Gang med 2', 'Hex'], 1, 'f = kommatal, .2 = to decimaler.']] },
      { id: 'pv2', title: 'List comprehensions og sortering', minutes: 14,
        body: `<p>En <b>list comprehension</b> laver en ny liste i én linje: <code>[x * 2 for x in tal if x &gt; 0]</code> – “x gange 2 for hvert x i tal, hvis x er positivt”.</p>
<p><code>sorted(liste, key=...)</code> sorterer efter det, funktionen giver. Med <code>lambda</code> skriver du en lille funktion direkte: <code>sorted(dele, key=lambda d: d["pris"])</code>. Tilføj <code>reverse=True</code> for omvendt rækkefølge.</p>`,
        example: c(`
dele = [
    {"navn": "Toner", "antal": 1, "min": 2},
    {"navn": "Kabel", "antal": 30, "min": 10},
    {"navn": "SSD", "antal": 0, "min": 1},
]
mangler = [d["navn"] for d in dele if d["antal"] < d["min"]]
print(mangler)
print(sorted(dele, key=lambda d: d["antal"])[0]["navn"])`),
        task: { text: 'Skriv <code>bestil(dele)</code>, der returnerer en liste med <b>navnene</b> på de dele, hvor <code>antal &lt;= min</code> – sorteret alfabetisk.',
          starter: 'def bestil(dele):\n    pass\n', hint: 'sorted([d["navn"] for d in dele if d["antal"] <= d["min"]])',
          solution: 'def bestil(dele):\n    return sorted(d["navn"] for d in dele if d["antal"] <= d["min"])',
          check: { test: 'd = [{"navn":"Toner","antal":2,"min":2},{"navn":"Kabel","antal":30,"min":10},{"navn":"Batteri","antal":0,"min":5}]\nassert bestil(d) == ["Batteri", "Toner"], f"fik {bestil(d)}"\nassert bestil([]) == []' } },
        quiz: [['Hvad giver [n * n for n in range(4)]?', ['[1, 4, 9, 16]', '[0, 1, 4, 9]', '[0, 2, 4, 6]', '16'], 1, 'range(4) er 0, 1, 2, 3.'],
          ['Hvad gør key=lambda d: d["pris"] i sorted?', ['Filtrerer på pris', 'Sorterer efter pris', 'Summerer prisen', 'Sletter pris'], 1, 'key fortæller, hvad der sammenlignes.']] },
      { id: 'pv3', title: 'Klasser og objekter', minutes: 16,
        body: `<p>En <b>klasse</b> er en skabelon for objekter med både data og funktioner (<i>metoder</i>). <code>__init__</code> kører, når et objekt laves, og <code>self</code> er objektet selv.</p>
<pre>class Kunde:
    def __init__(self, navn, timepris):
        self.navn = navn
        self.timepris = timepris

    def pris(self, timer):
        return timer * self.timepris</pre>
<p><code>k = Kunde("Jensen A/S", 450)</code> laver et objekt, og <code>k.pris(2)</code> giver 900.</p>`,
        example: c(`
class Kunde:
    def __init__(self, navn, timepris):
        self.navn = navn
        self.timepris = timepris

    def pris(self, timer):
        return timer * self.timepris

k = Kunde("Jensen A/S", 450)
print(k.navn, k.pris(1.5))`),
        task: { text: 'Lav klassen <code>Batteri</code> med <code>__init__(self, kapacitet_mah)</code> og metoden <code>timer(self, forbrug_ma)</code>, der returnerer driftstiden i timer med 80 % af kapaciteten: <code>kapacitet · 0,8 / forbrug</code>.',
          starter: 'class Batteri:\n    pass\n', hint: 'Gem kapaciteten i self.kapacitet_mah i __init__, og brug den i timer().',
          solution: 'class Batteri:\n    def __init__(self, kapacitet_mah):\n        self.kapacitet_mah = kapacitet_mah\n\n    def timer(self, forbrug_ma):\n        return self.kapacitet_mah * 0.8 / forbrug_ma',
          check: { test: 'b = Batteri(2000)\nassert abs(b.timer(100) - 16) < 1e-9, f"2000 mAh ved 100 mA skal give 16 timer, fik {b.timer(100)}"\nassert abs(Batteri(500).timer(40) - 10) < 1e-9' } },
        quiz: [['Hvad er self?', ['Klassens navn', 'Objektet metoden kaldes på', 'En global variabel', 'Et nøgleord til import'], 1, 'self peger på det konkrete objekt.'],
          ['Hvornår kører __init__?', ['Når programmet starter', 'Når et objekt laves', 'Når objektet slettes', 'Aldrig af sig selv'], 1, 'Kunde(...) kalder __init__ automatisk.']] },
      { id: 'pv4', title: 'Moduler: math, random og datetime', minutes: 12,
        body: `<p>Python har et stort <b>standardbibliotek</b>. Du henter et modul med <code>import</code>:</p>
<ul><li><code>import math</code> – <code>math.sqrt</code>, <code>math.pi</code>, <code>math.hypot</code></li><li><code>import random</code> – <code>random.randint(1, 6)</code>, <code>random.choice(liste)</code></li><li><code>from datetime import date</code> – <code>date.today()</code>, regning med datoer</li></ul>`,
        example: c(`
import math
from datetime import date

print(round(math.pi, 3))
print(math.sqrt(2))
jul = date(2026, 12, 24)
print("Dage fra 1. dec til jul:", (jul - date(2026, 12, 1)).days)`),
        task: { text: 'Skriv <code>kabel(dx, dy)</code>, der returnerer længden af et kabel trukket skråt (Pythagoras) – afrundet til 2 decimaler. <code>kabel(3, 4)</code> → <code>5.0</code>.',
          starter: 'import math\n\ndef kabel(dx, dy):\n    pass\n', hint: 'math.hypot(dx, dy) eller math.sqrt(dx**2 + dy**2), og round(…, 2)',
          solution: 'import math\n\ndef kabel(dx, dy):\n    return round(math.hypot(dx, dy), 2)',
          check: { test: 'assert kabel(3, 4) == 5.0\nassert kabel(1, 1) == 1.41, f"fik {kabel(1, 1)}"' } },
        quiz: [['Hvordan henter du kun date fra datetime?', ['import date', 'from datetime import date', 'import datetime.date as *', 'use datetime'], 1, '“from modul import navn”.'],
          ['Hvad giver random.randint(1, 6)?', ['Altid 1', 'Et heltal fra 1 til og med 6', 'Et kommatal', '6'], 1, 'randint medtager begge ender.']] },
      { id: 'pv5', title: 'Filer og JSON', minutes: 14,
        body: `<p>Med <code>with open("fil.txt", "w") as f:</code> skriver du en fil, og med <code>"r"</code> læser du den. <code>with</code> lukker filen automatisk bagefter.</p>
<p><b>JSON</b> er det format, de fleste programmer (og HUBTECH) gemmer data i. <code>json.dumps(data)</code> laver tekst af en dict/liste, og <code>json.loads(tekst)</code> laver det om igen. <code>json.dump</code>/<code>json.load</code> gør det samme direkte med en fil.</p>
<p>Her i browseren skrives filerne i et midlertidigt filsystem, der forsvinder ved næste kørsel.</p>`,
        example: c(`
import json

lager = {"Toner": 4, "Kabel": 30}
with open("lager.json", "w") as f:
    json.dump(lager, f)

with open("lager.json") as f:
    igen = json.load(f)
print(igen["Kabel"], type(igen))`),
        task: { text: 'Skriv <code>gem_og_tæl(data, filnavn)</code>, der gemmer dict\'en som JSON i filen, læser den ind igen fra filen og returnerer <b>summen af alle værdierne</b>.',
          starter: 'import json\n\ndef gem_og_tæl(data, filnavn):\n    pass\n', hint: 'json.dump(data, f) i en with-blok med "w", derefter json.load i en ny with-blok, og sum(…values())',
          solution: 'import json\n\ndef gem_og_tæl(data, filnavn):\n    with open(filnavn, "w") as f:\n        json.dump(data, f)\n    with open(filnavn) as f:\n        igen = json.load(f)\n    return sum(igen.values())',
          check: { test: 'import json, os\nassert gem_og_tæl({"a": 2, "b": 5}, "x.json") == 7\nassert os.path.exists("x.json"), "filen skal være skrevet"\nassert json.load(open("x.json")) == {"a": 2, "b": 5}' } },
        quiz: [['Hvorfor bruge with open(...)?', ['Det er hurtigere', 'Filen lukkes automatisk', 'Det krypterer filen', 'Det er krævet for JSON'], 1, 'Også hvis der sker en fejl undervejs.'],
          ['Hvad laver json.loads?', ['Python-data → tekst', 'JSON-tekst → Python-data', 'Indlæser en fil', 'Tjekker syntaks'], 1, 'loads = load string.']] },
      { id: 'pv6', title: 'Projekt: læs en timelog', minutes: 18,
        body: `<p>Nu sætter du det hele sammen. En eksport fra Tidsregistrering kunne se sådan ud – én linje pr. registrering med <code>dato;kunde;timer</code>:</p>
<pre>2026-10-18;Jensen A/S;1,5
2026-10-19;Bager Hansen;2
2026-10-19;Jensen A/S;2,25</pre>
<p>Opgaven: del hver linje med <code>.split(";")</code>, lav kommaet om til punktum, og læg timerne sammen pr. kunde i en dict. Spring tomme linjer over.</p>`,
        example: c(`
linje = "2026-10-18;Jensen A/S;1,5"
dato, kunde, timer = linje.split(";")
print(kunde, float(timer.replace(",", ".")))`),
        task: { text: 'Skriv <code>timer_pr_kunde(tekst)</code>, der returnerer en dict med kundenavn → samlede timer. Tomme linjer skal ignoreres.',
          starter: 'def timer_pr_kunde(tekst):\n    resultat = {}\n    for linje in tekst.splitlines():\n        pass\n    return resultat\n',
          hint: 'if not linje.strip(): continue – og resultat[kunde] = resultat.get(kunde, 0) + timer',
          solution: 'def timer_pr_kunde(tekst):\n    resultat = {}\n    for linje in tekst.splitlines():\n        if not linje.strip():\n            continue\n        dato, kunde, timer = linje.split(";")\n        resultat[kunde] = resultat.get(kunde, 0) + float(timer.replace(",", "."))\n    return resultat',
          check: { test: 'log = "2026-10-18;Jensen A/S;1,5\\n2026-10-19;Bager Hansen;2\\n\\n2026-10-19;Jensen A/S;2,25\\n"\nr = timer_pr_kunde(log)\nassert r == {"Jensen A/S": 3.75, "Bager Hansen": 2.0}, f"fik {r}"\nassert timer_pr_kunde("") == {}' } },
        quiz: [['Hvad gør resultat.get(kunde, 0)?', ['Fejler hvis kunden mangler', 'Giver værdien – eller 0 hvis kunden ikke findes', 'Sletter kunden', 'Sætter værdien til 0'], 1, 'Perfekt til at tælle op.'],
          ['Hvorfor .replace(",", ".") før float()?', ['Pænere tal', 'float() forstår kun punktum som decimaltegn', 'Det fjerner tusindtalsseparatorer', 'Det er ikke nødvendigt'], 1, 'float("1,5") giver ValueError.']] },
    ],
  },

  // ───────────────────────────────────────── JavaScript ─────────────────────────────────────────
  {
    id: 'javascript', title: 'JavaScript', lang: 'javascript', icon: 'code', hue: '#f59e0b', level: 'Begynder',
    intro: 'Sproget i alle browsere – HUBTECHs brugerflade er skrevet i det. Lær det grundlæggende og kør koden med det samme.',
    lessons: [
      { id: 'js1', title: 'console.log og variabler', minutes: 10,
        body: `<p>I JavaScript skriver du ud med <code>console.log()</code>. Variabler laves med <code>let</code> (kan ændres) eller <code>const</code> (kan ikke tildeles igen). Brug <code>const</code> som standard.</p>
<p>Tekst med indsatte værdier skrives med <i>backticks</i>: <code>\`Hej \${navn}\`</code>.</p>`,
        example: c(`
const navn = "HUBTECH";
let besøg = 1;
besøg = besøg + 1;
console.log(\`Velkommen til \${navn} – besøg nr. \${besøg}\`);`),
        task: { text: 'Lav en <code>const pris = 249</code> og en <code>const antal = 3</code>, og log <code>I alt: 747 kr.</code> med en template-streng.',
          starter: 'const pris = 249;\n', hint: 'console.log(`I alt: ${pris * antal} kr.`)', solution: 'const pris = 249;\nconst antal = 3;\nconsole.log(`I alt: ${pris * antal} kr.`);',
          check: { out: 'I alt: 747 kr.' } },
        quiz: [['Hvad er forskellen på let og const?', ['Ingen', 'const kan ikke tildeles en ny værdi', 'let er hurtigere', 'const er kun til tal'], 1, 'Brug const, medmindre værdien skal skifte.']] },
      { id: 'js2', title: 'Funktioner og pile-funktioner', minutes: 12,
        body: `<p>Funktioner skrives med <code>function navn(a, b) { return a + b; }</code> eller kortere som pile-funktion: <code>const navn = (a, b) =&gt; a + b;</code>.</p>`,
        example: c(`
const moms = (beløb) => beløb * 0.25;
function medMoms(beløb) {
  return beløb + moms(beløb);
}
console.log(medMoms(400));`),
        task: { text: 'Skriv pile-funktionen <code>celsiusTilF</code>, der omregner Celsius til Fahrenheit (C × 9/5 + 32).',
          starter: 'const celsiusTilF = (c) => {\n  // din kode\n};\n\nconsole.log(celsiusTilF(100));\n', hint: 'return c * 9 / 5 + 32;',
          solution: 'const celsiusTilF = (c) => c * 9 / 5 + 32;\nconsole.log(celsiusTilF(100));',
          check: { test: 'if (celsiusTilF(100) !== 212) throw new Error("100 °C skal give 212 °F"); if (celsiusTilF(-40) !== -40) throw new Error("-40 °C skal give -40 °F");' } },
        quiz: [['Hvad returnerer (x) => x * 2 for x = 5?', ['5', '10', 'undefined', '"x * 2"'], 1, 'En pile-funktion uden {} returnerer udtrykket.']] },
      { id: 'js3', title: 'Arrays og metoder', minutes: 15,
        body: `<p>Et array er en liste: <code>[3, 8, 1]</code>. De mest brugte metoder:</p>
<ul><li><code>map</code> laver en ny liste ud fra hver værdi</li><li><code>filter</code> beholder dem, der opfylder en betingelse</li><li><code>reduce</code> samler til én værdi</li><li><code>find</code> finder den første, der passer</li></ul>`,
        example: c(`
const opgaver = [
  { titel: "Service", timer: 2.5, færdig: true },
  { titel: "Montering", timer: 4, færdig: false },
  { titel: "Rapport", timer: 1, færdig: true },
];
const færdige = opgaver.filter(o => o.færdig);
const timer = færdige.reduce((sum, o) => sum + o.timer, 0);
console.log(færdige.map(o => o.titel).join(", "), "–", timer, "timer");`),
        task: { text: 'Givet arrayet <code>priser</code>, lav <code>medMoms</code> (alle priser × 1,25) og <code>dyre</code> (kun de priser over 100 <i>før</i> moms).',
          starter: 'const priser = [40, 120, 99, 250];\n', hint: 'priser.map(p => p * 1.25) og priser.filter(p => p > 100)',
          solution: 'const priser = [40, 120, 99, 250];\nconst medMoms = priser.map(p => p * 1.25);\nconst dyre = priser.filter(p => p > 100);\nconsole.log(medMoms, dyre);',
          check: { test: 'if (JSON.stringify(medMoms) !== "[50,150,123.75,312.5]") throw new Error("medMoms er forkert: " + JSON.stringify(medMoms)); if (JSON.stringify(dyre) !== "[120,250]") throw new Error("dyre er forkert: " + JSON.stringify(dyre));' } },
        quiz: [['Hvad giver [1, 2, 3].map(x => x + 1)?', ['[1, 2, 3]', '[2, 3, 4]', '6', '[1, 2, 3, 1]'], 1, 'map ændrer hver værdi og giver en ny liste.']] },
      { id: 'js4', title: 'Objekter og JSON', minutes: 12,
        body: `<p>Et objekt samler navngivne værdier: <code>{ navn: "ESP32", antal: 2 }</code>. Læs med <code>obj.navn</code>.</p>
<p><b>JSON</b> er objekter som tekst – sådan sender HUBTECH-serveren og browseren data til hinanden. <code>JSON.stringify()</code> laver tekst, <code>JSON.parse()</code> laver et objekt igen.</p>`,
        example: c(`
const vare = { navn: "LED rød", antal: 40, placering: "Skuffe C1" };
const tekst = JSON.stringify(vare);
console.log(tekst);
const igen = JSON.parse(tekst);
console.log(igen.placering);`),
        task: { text: 'Lav et objekt <code>kunde</code> med felterne <code>navn</code> ("Jensen A/S") og <code>by</code> ("Vejle"), og log det som JSON-tekst.',
          starter: '', hint: 'console.log(JSON.stringify(kunde));', solution: 'const kunde = { navn: "Jensen A/S", by: "Vejle" };\nconsole.log(JSON.stringify(kunde));',
          check: { out: '{"navn":"Jensen A/S","by":"Vejle"}' } },
        quiz: [['Hvad laver JSON.parse?', ['Objekt → tekst', 'Tekst → objekt', 'Tjekker stavning', 'Sender data'], 1, 'parse læser tekst og bygger objektet.']] },
      { id: 'js5', title: 'Betingelser og løkker', minutes: 12,
        body: `<p><code>if</code>/<code>else</code> virker som i andre sprog. Sammenlign altid med <code>===</code> (tre lighedstegn) – det tjekker både værdi og type.</p>
<p>Løkker: <code>for (let i = 0; i &lt; 5; i++)</code> og <code>for (const x of liste)</code>.</p>`,
        example: c(`
for (let i = 1; i <= 15; i++) {
  if (i % 15 === 0) console.log("FizzBuzz");
  else if (i % 3 === 0) console.log("Fizz");
  else if (i % 5 === 0) console.log("Buzz");
  else console.log(i);
}`),
        task: { text: 'Skriv funktionen <code>karakter(point)</code>, der returnerer "12" ved 90 point eller mere, "7" ved 60–89 og "02" under 60.',
          starter: 'function karakter(point) {\n}\n', hint: 'if (point >= 90) return "12"; …',
          solution: 'function karakter(point) {\n  if (point >= 90) return "12";\n  if (point >= 60) return "7";\n  return "02";\n}',
          check: { test: 'for (const [p, k] of [[95, "12"], [90, "12"], [75, "7"], [60, "7"], [10, "02"]]) if (karakter(p) !== k) throw new Error(`karakter(${p}) skal give "${k}"`);' } },
        quiz: [['Hvad giver "5" === 5?', ['true', 'false', 'Fejl', 'undefined'], 1, '=== sammenligner også typen – tekst og tal er forskellige.']] },
      { id: 'js6', title: 'Asynkron kode: Promise og await', minutes: 15,
        body: `<p>Meget i JavaScript tager tid – fx at hente data fra en server. I stedet for at vente og fryse siden giver funktionen et <b>Promise</b> tilbage. Med <code>await</code> inde i en <code>async</code>-funktion venter du pænt på svaret.</p>
<p>I HUBTECH-koden ser det fx sådan ud: <code>const data = await api.get('/api/office/docs');</code></p>`,
        example: c(`
const vent = (ms) => new Promise(r => setTimeout(r, ms));
async function hent() {
  console.log("Henter…");
  await vent(300);
  return { status: "ok", antal: 3 };
}
hent().then(svar => console.log("Svar:", svar.status, svar.antal));`),
        task: { text: 'Skriv en <code>async function dobbelt(x)</code>, der venter 100 ms (brug <code>vent</code>) og returnerer x * 2.',
          starter: 'const vent = (ms) => new Promise(r => setTimeout(r, ms));\n\n', hint: 'async function dobbelt(x) { await vent(100); return x * 2; }',
          solution: 'const vent = (ms) => new Promise(r => setTimeout(r, ms));\n\nasync function dobbelt(x) {\n  await vent(100);\n  return x * 2;\n}',
          check: { test: 'const p = dobbelt(21); if (!(p instanceof Promise)) throw new Error("dobbelt skal være async"); return p.then(v => { if (v !== 42) throw new Error("dobbelt(21) skal give 42"); });' } },
        quiz: [['Hvor må du bruge await?', ['Overalt', 'Inde i en async-funktion (eller øverst i et modul)', 'Kun i løkker', 'Kun i if'], 1, 'await kræver en async-funktion.']] },
      { id: 'js7', title: 'Klasser', minutes: 12,
        body: `<p>En <b>klasse</b> er en skabelon til objekter med både data og funktioner (metoder). <code>constructor</code> kører, når du laver et nyt objekt med <code>new</code>.</p>`,
        example: c(`
class Timer {
  constructor(navn) { this.navn = navn; this.sekunder = 0; }
  tik(n = 1) { this.sekunder += n; return this; }
  toString() { return \`\${this.navn}: \${Math.floor(this.sekunder / 60)} min\`; }
}
const t = new Timer("Fokus").tik(1500);
console.log(String(t));`),
        task: { text: 'Lav klassen <code>Konto</code> med <code>saldo</code> (starter på 0), metoden <code>indsæt(beløb)</code> og <code>hæv(beløb)</code>, der kaster en fejl (<code>throw new Error(...)</code>), hvis saldoen bliver negativ.',
          starter: 'class Konto {\n}\n', hint: 'hæv(b) { if (b > this.saldo) throw new Error("Ikke nok penge"); this.saldo -= b; }',
          solution: 'class Konto {\n  constructor() { this.saldo = 0; }\n  indsæt(b) { this.saldo += b; }\n  hæv(b) {\n    if (b > this.saldo) throw new Error("Ikke nok penge");\n    this.saldo -= b;\n  }\n}',
          check: { test: 'const k = new Konto(); k.indsæt(100); k.hæv(30); if (k.saldo !== 70) throw new Error("saldo skal være 70"); let fejl = false; try { k.hæv(500); } catch { fejl = true; } if (!fejl) throw new Error("hæv(500) skal give en fejl");' } },
        quiz: [['Hvad henviser this til i en metode?', ['Klassen', 'Det aktuelle objekt', 'window', 'Funktionen'], 1, 'this er objektet, metoden kaldes på.']] },
    ],
  },

  // ───────────────────────────────────────── HTML & CSS ─────────────────────────────────────────
  {
    id: 'web', title: 'HTML & CSS', lang: 'html', icon: 'globe', hue: '#ef4444', level: 'Begynder',
    intro: 'Byg din egen hjemmeside. Du ser resultatet ved siden af koden, mens du skriver.',
    lessons: [
      { id: 'web1', title: 'Opbygningen af en side', minutes: 10,
        body: `<p>HTML består af <b>tags</b>: <code>&lt;h1&gt;Overskrift&lt;/h1&gt;</code>. De fleste har en start- og slut-tag. Vigtige tags: <code>h1</code>–<code>h3</code> (overskrifter), <code>p</code> (afsnit), <code>a</code> (link), <code>img</code> (billede), <code>ul</code>/<code>li</code> (liste).</p>`,
        example: c(`
<h1>Lucas' værksted</h1>
<p>Jeg reparerer <b>printere</b> og bygger <i>elektronik</i>.</p>
<ul>
  <li>Service</li>
  <li>Reservedele</li>
</ul>
<a href="https://example.com">Kontakt mig</a>`),
        task: { text: 'Lav en side med en <code>h1</code> med teksten <b>Mit projekt</b> og en liste (<code>ul</code>) med mindst tre punkter.',
          starter: '<h1></h1>\n', hint: '<ul><li>…</li><li>…</li><li>…</li></ul>', solution: '<h1>Mit projekt</h1>\n<ul>\n  <li>Idé</li>\n  <li>Prototype</li>\n  <li>Test</li>\n</ul>',
          check: { sel: [['h1', 'Mit projekt'], ['ul li:nth-child(3)']] } },
        quiz: [['Hvilket tag laver den største overskrift?', ['<h6>', '<head>', '<h1>', '<title>'], 2, 'h1 er hovedoverskriften.']] },
      { id: 'web2', title: 'CSS: farver og skrift', minutes: 12,
        body: `<p>CSS bestemmer udseendet. En regel består af en <b>selector</b> og egenskaber: <code>h1 { color: tomato; font-size: 40px; }</code>. Skriv CSS i et <code>&lt;style&gt;</code>-tag.</p>
<p>Klasser genbruger stil: <code>&lt;p class="advarsel"&gt;</code> og <code>.advarsel { color: red; }</code>.</p>`,
        example: c(`
<style>
  body { font-family: system-ui; background: #0a1422; color: #f4f8fc; padding: 20px; }
  h1 { color: #4c8dff; }
  .advarsel { background: #ffb547; color: #000; padding: 8px 12px; border-radius: 8px; }
</style>
<h1>Status</h1>
<p class="advarsel">Lav beholdning på ESP32</p>`),
        task: { text: 'Giv alle <code>p</code>-tags farven <code>rgb(0, 128, 0)</code> (grøn) og lav <code>h1</code> 32px stor.',
          starter: '<style>\n\n</style>\n<h1>Grønt lys</h1>\n<p>Alt kører.</p>\n', hint: 'p { color: rgb(0, 128, 0); } h1 { font-size: 32px; }',
          solution: '<style>\n  p { color: rgb(0, 128, 0); }\n  h1 { font-size: 32px; }\n</style>\n<h1>Grønt lys</h1>\n<p>Alt kører.</p>',
          check: { css: [['p', 'color', 'rgb(0, 128, 0)'], ['h1', 'font-size', '32px']] } },
        quiz: [['Hvordan vælger du alle elementer med class="kort" i CSS?', ['#kort', '.kort', 'kort', '*kort'], 1, 'Punktum = klasse, # = id.']] },
      { id: 'web3', title: 'Box model og layout med flexbox', minutes: 15,
        body: `<p>Hvert element er en kasse: <b>indhold</b>, <code>padding</code> (indvendig luft), <code>border</code> og <code>margin</code> (udvendig luft).</p>
<p>Med <code>display: flex</code> lægger du elementer på række; <code>gap</code> giver luft imellem, og <code>justify-content</code>/<code>align-items</code> styrer placeringen.</p>`,
        example: c(`
<style>
  .række { display: flex; gap: 12px; }
  .kort { flex: 1; padding: 16px; border-radius: 12px; background: #e8eef5; font-family: system-ui; }
</style>
<div class="række">
  <div class="kort">Opgaver</div>
  <div class="kort">Noter</div>
  <div class="kort">Kalender</div>
</div>`),
        task: { text: 'Lav en <code>div class="menu"</code> med tre links, der ligger på række med <code>display: flex</code> og <code>gap: 20px</code>.',
          starter: '<style>\n</style>\n<div class="menu">\n  <a href="#">Hjem</a>\n  <a href="#">Apps</a>\n  <a href="#">Om</a>\n</div>\n', hint: '.menu { display: flex; gap: 20px; }',
          solution: '<style>\n  .menu { display: flex; gap: 20px; }\n</style>\n<div class="menu">\n  <a href="#">Hjem</a>\n  <a href="#">Apps</a>\n  <a href="#">Om</a>\n</div>',
          check: { css: [['.menu', 'display', 'flex'], ['.menu', 'column-gap', '20px']] } },
        quiz: [['Hvad er forskellen på padding og margin?', ['Ingen', 'padding er indvendig luft, margin udvendig', 'margin er indvendig, padding udvendig', 'padding er kun til tekst'], 1, 'padding er inden for kanten, margin uden for.']] },
      { id: 'web4', title: 'Formularer', minutes: 12,
        body: `<p>Formularer samler input: <code>&lt;input&gt;</code>, <code>&lt;select&gt;</code>, <code>&lt;textarea&gt;</code> og <code>&lt;button&gt;</code>. Brug altid en <code>&lt;label&gt;</code>, så felterne kan læses af skærmlæsere og klikkes på.</p>`,
        example: c(`
<form>
  <label>Navn <input name="navn" required></label><br>
  <label>Type
    <select name="type"><option>Service</option><option>Reparation</option></select>
  </label><br>
  <button>Send</button>
</form>`),
        task: { text: 'Lav en formular med et e-mail-felt (<code>type="email"</code>) med en label, og en knap med teksten <b>Tilmeld</b>.',
          starter: '<form>\n</form>\n', hint: '<label>E-mail <input type="email"></label><button>Tilmeld</button>',
          solution: '<form>\n  <label>E-mail <input type="email" name="email"></label>\n  <button>Tilmeld</button>\n</form>',
          check: { sel: [['form label input[type="email"]'], ['form button', 'Tilmeld']] } },
        quiz: [['Hvorfor bruge <label>?', ['Pynt', 'Tilgængelighed – og man kan klikke på teksten', 'Det er påkrævet af browseren', 'For at sende formularen'], 1, 'Labels gør formularen brugbar for alle.']] },
      { id: 'web5', title: 'Responsivt design', minutes: 12,
        body: `<p>Siden skal virke på både telefon og computer. Med <b>media queries</b> ændrer du stil ved en bestemt bredde: <code>@media (max-width: 600px) { … }</code>.</p>
<p><code>grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))</code> giver kort, der selv finder plads.</p>`,
        example: c(`
<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
  .grid div { background: #c7d8ff; padding: 20px; border-radius: 10px; font-family: system-ui; }
  @media (max-width: 400px) { .grid div { background: #ffd7d5; } }
</style>
<div class="grid"><div>1</div><div>2</div><div>3</div><div>4</div></div>`),
        task: { text: 'Lav en <code>.grid</code> med <code>display: grid</code> og <code>gap: 10px</code>, med mindst fire <code>div</code>-kort inden i.',
          starter: '<style>\n</style>\n', hint: '.grid { display: grid; gap: 10px; }',
          solution: '<style>\n  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }\n</style>\n<div class="grid"><div>A</div><div>B</div><div>C</div><div>D</div></div>',
          check: { css: [['.grid', 'display', 'grid'], ['.grid', 'row-gap', '10px']], sel: [['.grid > div:nth-child(4)']] } },
        quiz: [['Hvad gør @media (max-width: 600px)?', ['Gælder kun på skærme op til 600 px brede', 'Gælder kun over 600 px', 'Laver siden 600 px bred', 'Skjuler siden'], 0, 'max-width = "op til".']] },
    ],
  },

  // ───────────────────────────────────────── SQL ─────────────────────────────────────────
  {
    id: 'sql', title: 'SQL og databaser', lang: 'sql', icon: 'database', hue: '#8b5cf6', level: 'Begynder',
    intro: 'Spørg en database om det, du vil vide. Du arbejder i en rigtig SQLite-database med kunder, serviceopgaver og reservedele – den nulstilles ved hver kørsel.',
    setup: SQL_SETUP,
    lessons: [
      { id: 'sql1', title: 'SELECT: hent data', minutes: 10,
        body: `<p>En database består af <b>tabeller</b> med rækker og kolonner – ligesom et regneark. Med <code>SELECT</code> beder du om kolonner, og med <code>FROM</code> siger du hvilken tabel.</p>
<ul><li><code>SELECT * FROM kunder;</code> – alle kolonner</li><li><code>SELECT navn, by FROM kunder;</code> – kun to kolonner</li><li>Afslut med <code>;</code> – store/små bogstaver i SQL-ordene er ligegyldige</li></ul>
<p>Øvedatabasen har tre tabeller:</p>
<table><tr><th>Tabel</th><th>Kolonner</th></tr><tr><td>kunder</td><td>id, navn, by, telefon</td></tr><tr><td>opgaver</td><td>id, kunde_id, titel, timer, status, dato</td></tr><tr><td>dele</td><td>id, navn, antal, pris, leverandor</td></tr></table>`,
        example: c(`
SELECT * FROM kunder;`),
        task: { text: 'Vis <b>navn</b> og <b>telefon</b> på alle kunder.', starter: '-- skriv din forespørgsel her\n', hint: 'SELECT kolonne1, kolonne2 FROM tabel;', solution: 'SELECT navn, telefon FROM kunder;', check: { same: true } },
        quiz: [['Hvad betyder * i SELECT * FROM dele?', ['Alle rækker', 'Alle kolonner', 'Gang', 'Ingenting'], 1, '* betyder alle kolonner. Hvilke rækker styres med WHERE.'],
          ['Hvilken del siger hvilken tabel du læser fra?', ['SELECT', 'FROM', 'WHERE', 'TABLE'], 1, 'FROM tabelnavn.']] },
      { id: 'sql2', title: 'WHERE og ORDER BY', minutes: 12,
        body: `<p><code>WHERE</code> filtrerer rækkerne, og <code>ORDER BY</code> sorterer dem.</p>
<ul><li>Sammenlign: <code>=</code>, <code>&lt;&gt;</code> (forskellig fra), <code>&lt;</code>, <code>&gt;=</code> …</li><li>Tekst står i enkelte anførselstegn: <code>WHERE by = 'Vejle'</code></li><li>Kombinér med <code>AND</code> / <code>OR</code>, søg med <code>LIKE '%printer%'</code></li><li><code>ORDER BY dato DESC</code> – nyeste først (<code>ASC</code> er standard)</li><li><code>LIMIT 3</code> – kun de første 3</li></ul>`,
        example: c(`
SELECT titel, timer
FROM opgaver
WHERE timer >= 2
ORDER BY timer DESC;`),
        task: { text: 'Vis <b>titel</b> og <b>dato</b> for alle opgaver med status <code>åben</code>, sorteret efter dato – ældste først.', starter: 'SELECT titel, dato\nFROM opgaver\n', hint: "WHERE status = 'åben' ORDER BY dato", solution: "SELECT titel, dato\nFROM opgaver\nWHERE status = 'åben'\nORDER BY dato;", check: { same: true, ordered: true } },
        quiz: [['Hvordan skriver man tekst i en SQL-betingelse?', ['"Vejle" i dobbelte', "'Vejle' i enkelte", 'Vejle uden', '[Vejle]'], 1, 'Standard-SQL bruger enkelte anførselstegn om tekst.'],
          ['Hvad gør ORDER BY pris DESC?', ['Billigste først', 'Dyreste først', 'Fjerner pris', 'Filtrerer'], 1, 'DESC = faldende.']] },
      { id: 'sql3', title: 'Tælle og summere: GROUP BY', minutes: 12,
        body: `<p>Aggregat-funktioner regner på mange rækker på én gang: <code>COUNT(*)</code>, <code>SUM(timer)</code>, <code>AVG(pris)</code>, <code>MIN</code>, <code>MAX</code>.</p>
<p>Med <code>GROUP BY</code> får du ét resultat pr. gruppe – fx antal opgaver pr. status. Giv kolonnen et pænt navn med <code>AS</code>.</p>
<p><code>HAVING</code> filtrerer grupperne bagefter (WHERE filtrerer rækkerne før).</p>`,
        example: c(`
SELECT status, COUNT(*) AS antal
FROM opgaver
GROUP BY status;`),
        task: { text: 'Vis for hver <b>kunde_id</b> det samlede antal <b>timer</b> (kald kolonnen <code>timer_i_alt</code>).', starter: 'SELECT kunde_id, \nFROM opgaver\n', hint: 'SUM(timer) AS timer_i_alt … GROUP BY kunde_id', solution: 'SELECT kunde_id, SUM(timer) AS timer_i_alt\nFROM opgaver\nGROUP BY kunde_id;', check: { same: true } },
        quiz: [['Hvad giver SELECT COUNT(*) FROM kunder?', ['Alle kunder', 'Antallet af kunder', 'Første kunde', 'En fejl'], 1, 'COUNT(*) tæller rækker.'],
          ['Hvad er forskellen på WHERE og HAVING?', ['Ingen', 'WHERE filtrerer rækker, HAVING filtrerer grupper', 'HAVING er hurtigere', 'WHERE virker kun med tal'], 1, 'HAVING bruges efter GROUP BY.']] },
      { id: 'sql4', title: 'JOIN: kombinér tabeller', minutes: 14,
        body: `<p>Opgaverne gemmer kun <code>kunde_id</code> – ikke kundens navn. Det kaldes en <b>fremmednøgle</b>, og den undgår at gemme det samme to steder.</p>
<p>Med <code>JOIN</code> sætter du tabellerne sammen igen:</p>
<pre>SELECT kunder.navn, opgaver.titel
FROM opgaver
JOIN kunder ON kunder.id = opgaver.kunde_id;</pre>
<p><code>LEFT JOIN</code> tager også rækker med uden match (fx kunder uden opgaver).</p>`,
        example: c(`
SELECT k.navn, o.titel, o.status
FROM opgaver o
JOIN kunder k ON k.id = o.kunde_id
WHERE k.by = 'Vejle';`),
        task: { text: 'Vis <b>kundens navn</b> og <b>opgavens titel</b> for alle opgaver, der er <code>færdig</code>.', starter: 'SELECT \nFROM opgaver\nJOIN kunder ON \n', hint: "JOIN kunder ON kunder.id = opgaver.kunde_id WHERE opgaver.status = 'færdig'", solution: "SELECT kunder.navn, opgaver.titel\nFROM opgaver\nJOIN kunder ON kunder.id = opgaver.kunde_id\nWHERE opgaver.status = 'færdig';", check: { same: true } },
        quiz: [['Hvad forbinder ON kunder.id = opgaver.kunde_id?', ['To databaser', 'Rækker hvor id og kunde_id er ens', 'Alle rækker med alle', 'Kun første række'], 1, 'Hver opgave parres med kunden, der har samme id.'],
          ['Hvornår bruger man LEFT JOIN?', ['Når venstre tabel er størst', 'Når rækker uden match også skal med', 'Altid', 'Aldrig i SQLite'], 1, 'Manglende værdier bliver NULL.']] },
      { id: 'sql5', title: 'INSERT, UPDATE og DELETE', minutes: 12,
        body: `<p>SQL kan også ændre data:</p>
<ul><li><code>INSERT INTO dele (navn, antal, pris, leverandor) VALUES ('Sikring 5A', 20, 4.5, 'Elfa');</code></li><li><code>UPDATE dele SET antal = antal - 1 WHERE id = 3;</code></li><li><code>DELETE FROM dele WHERE antal = 0;</code></li></ul>
<p class="cs-warn"><b>Pas på:</b> glemmer du <code>WHERE</code> ved UPDATE eller DELETE, rammer du <i>alle</i> rækker. Test altid med en SELECT med samme WHERE først.</p>`,
        example: c(`
UPDATE dele SET antal = antal + 10 WHERE navn = 'Toner HP 26A';
SELECT navn, antal FROM dele;`),
        task: { text: 'Lageret har fået 5 ekstra <code>ESP32 DevKit</code> ind: læg 5 til <b>antal</b> for netop den del. Tilføj derefter en ny del: <code>USB-C kabel</code>, antal 12, pris 39, leverandør <code>Elfa</code>.', starter: '', hint: "UPDATE dele SET antal = antal + 5 WHERE navn = 'ESP32 DevKit'; og INSERT INTO dele (navn, antal, pris, leverandor) VALUES (…);", solution: "UPDATE dele SET antal = antal + 5 WHERE navn = 'ESP32 DevKit';\nINSERT INTO dele (navn, antal, pris, leverandor) VALUES ('USB-C kabel', 12, 39, 'Elfa');", check: { test: 'SELECT navn, antal, pris, leverandor FROM dele ORDER BY navn;' } },
        quiz: [['Hvad sker der ved UPDATE dele SET antal = 0; (uden WHERE)?', ['Ingenting', 'Alle dele får antal 0', 'Kun første del', 'En fejl'], 1, 'Uden WHERE rammes alle rækker.'],
          ['Hvordan kan du sikre dig, før du sletter?', ['Kør en SELECT med samme WHERE', 'Brug DROP', 'Slet to gange', 'Det kan man ikke'], 0, 'Se hvilke rækker der rammes, før du sletter dem.']] },
    ],
  },
  // ───────────────────────────────────────── Git & terminal ─────────────────────────────────────────
  {
    id: 'git', title: 'Git og terminalen', lang: 'git', icon: 'branch', hue: '#f97316', level: 'Begynder',
    intro: 'Versionsstyring og kommandolinjen – det du bruger hver dag sammen med Cursor og GitHub.',
    lessons: [
      { id: 'git1', title: 'Terminalens grundkommandoer', minutes: 10,
        body: `<p>I terminalen styrer du computeren med tekst. De vigtigste kommandoer (PowerShell / Linux):</p>
<ul><li><code>cd mappe</code> – gå ind i en mappe, <code>cd ..</code> – ét niveau op</li><li><code>ls</code> (eller <code>dir</code>) – vis indhold</li><li><code>mkdir navn</code> – lav en mappe</li><li><code>pwd</code> – hvor er jeg?</li></ul>
<p>Tab-tasten fuldfører navne – brug den hele tiden.</p>`,
        task: { text: 'Skriv kommandoen, der laver en ny mappe, der hedder <code>projekt</code>.', answer: true, hint: 'mkdir …', solution: 'mkdir projekt', check: { re: ['^mkdir\\s+projekt$'] } },
        quiz: [['Hvad gør cd ..?', ['Sletter mappen', 'Går ét niveau op', 'Viser indholdet', 'Lukker terminalen'], 1, '.. betyder mappen ovenover.']] },
      { id: 'git2', title: 'Hvad er Git?', minutes: 10,
        body: `<p>Git gemmer <b>historikken</b> for din kode i små trin (commits). Du kan altid se, hvad der er ændret, og gå tilbage.</p>
<ol><li><code>git init</code> – start et nyt repository</li><li><code>git status</code> – hvad er ændret?</li><li><code>git add .</code> – læg ændringerne klar</li><li><code>git commit -m "besked"</code> – gem et trin</li></ol>`,
        task: { text: 'Skriv kommandoen, der gemmer et commit med beskeden <code>Første version</code>.', answer: true, hint: 'git commit -m "…"', solution: 'git commit -m "Første version"', check: { re: ['^git\\s+commit\\s+-m\\s+["\']Første version["\']$'] } },
        quiz: [['Hvad gør git add?', ['Gemmer et commit', 'Lægger ændringer klar til næste commit', 'Uploader til GitHub', 'Laver en ny branch'], 1, 'add = "staging" – commit gemmer.'],
          ['Hvad er en god commit-besked?', ['"fix"', '"Ret beregning af moms i timeseddel"', '"asdf"', '"ændringer"'], 1, 'Beskriv hvad og gerne hvorfor.']] },
      { id: 'git3', title: 'Branches', minutes: 12,
        body: `<p>En <b>branch</b> er en parallel version, hvor du kan prøve noget uden at ødelægge hovedgrenen (<code>main</code>).</p>
<ul><li><code>git switch -c ny-funktion</code> – lav og skift til en ny branch</li><li><code>git switch main</code> – tilbage</li><li><code>git merge ny-funktion</code> – flet ændringerne ind</li></ul>`,
        task: { text: 'Skriv kommandoen, der laver og skifter til en ny branch, der hedder <code>kalender</code>.', answer: true, hint: 'git switch -c … (eller git checkout -b …)', solution: 'git switch -c kalender', check: { re: ['^git\\s+(switch\\s+-c|checkout\\s+-b)\\s+kalender$'] } },
        quiz: [['Hvorfor bruge branches?', ['Det gør koden hurtigere', 'Arbejde på noget nyt uden at forstyrre main', 'For at slette kode', 'Kun for store teams'], 1, 'main forbliver stabil, mens du eksperimenterer.']] },
      { id: 'git4', title: 'GitHub: push og pull', minutes: 12,
        body: `<p>GitHub er et sted at gemme dine repositories online. <code>git push</code> sender dine commits op, <code>git pull</code> henter andres ned.</p>
<p>Første gang: <code>git remote add origin https://github.com/brugernavn/repo.git</code> og <code>git push -u origin main</code>.</p>`,
        task: { text: 'Skriv kommandoen, der henter de nyeste ændringer fra GitHub ned.', answer: true, hint: 'git …', solution: 'git pull', check: { re: ['^git\\s+pull(\\s+origin\\s+main)?$'] } },
        quiz: [['Hvad gør git push?', ['Henter fra GitHub', 'Sender dine commits til GitHub', 'Laver en commit', 'Sletter en branch'], 1, 'push = op, pull = ned.']] },
      { id: 'git5', title: 'Fortryd og .gitignore', minutes: 12,
        body: `<p>Fortryd ændringer i en fil: <code>git restore fil.py</code>. Se historikken: <code>git log --oneline</code>.</p>
<p><code>.gitignore</code> lister filer, Git skal ignorere – fx <code>.env</code> med hemmeligheder, <code>node_modules/</code> og <code>__pycache__/</code>. Læg <b>aldrig</b> adgangskoder og API-nøgler i Git.</p>`,
        task: { text: 'Skriv den linje, der i <code>.gitignore</code> får Git til at ignorere filen <code>.env</code>.', answer: true, hint: 'Bare filnavnet.', solution: '.env', check: { re: ['^/?\\.env$'] } },
        quiz: [['Hvor hører API-nøgler hjemme?', ['I koden', 'I en commit-besked', 'I en .env-fil, der står i .gitignore', 'I README'], 2, 'Hemmeligheder må aldrig komme i Git-historikken.']] },
    ],
  },

  // ───────────────────────────────────────── Linux ─────────────────────────────────────────
  {
    id: 'linux', title: 'Linux og serveren', lang: 'git', icon: 'server', hue: '#64748b', level: 'Let øvet',
    intro: 'Kommandoerne du bruger på en Raspberry Pi, en NAS eller en ByteForge-server: filer, rettigheder, søgning, tjenester, netværk og opdateringer.',
    lessons: [
      { id: 'lx1', title: 'Filer og mapper', minutes: 10,
        body: `<p>Det meste arbejde på en server foregår med få kommandoer:</p>
<ul><li><code>ls -la</code> – vis alt, også skjulte filer, med rettigheder og størrelse</li><li><code>cp kilde mål</code> – kopiér (<code>-r</code> for mapper)</li><li><code>mv kilde mål</code> – flyt eller omdøb</li><li><code>rm fil</code> – slet (<code>rm -r mappe</code> sletter en mappe – der er ingen papirkurv!)</li><li><code>cat fil</code> og <code>less fil</code> – vis indhold</li></ul>
<p><code>~</code> er din hjemmemappe, <code>.</code> er her, og <code>..</code> er mappen over.</p>`,
        example: c(`
cd ~/rapporter
ls -la
cp rapport.txt rapport-kopi.txt
mv rapport-kopi.txt arkiv/
cat arkiv/rapport-kopi.txt`),
        task: { text: 'Skriv kommandoen, der kopierer <code>rapport.txt</code> ind i mappen <code>backup</code> (begge ligger i den mappe, du står i).', answer: true, hint: 'cp kilde mål', solution: 'cp rapport.txt backup/', check: { re: ['^cp\\s+(\\./)?rapport\\.txt\\s+(\\./)?backup/?$'] } },
        quiz: [['Hvad gør rm -r gamle_filer?', ['Flytter mappen til papirkurven', 'Sletter mappen og alt i den – permanent', 'Omdøber mappen', 'Viser indholdet'], 1, 'Der er ingen fortryd – tjek altid med ls først.'],
          ['Hvad betyder ..?', ['Hjemmemappen', 'Mappen over den nuværende', 'Rodmappen', 'Skjulte filer'], 1, 'cd .. går ét niveau op.']] },
      { id: 'lx2', title: 'Rettigheder og sudo', minutes: 12,
        body: `<p>Hver fil har rettigheder for <b>ejer</b>, <b>gruppe</b> og <b>andre</b>: r (læs), w (skriv) og x (kør). <code>ls -l</code> viser dem som <code>-rwxr-xr-x</code>.</p>
<p>Som tal: r = 4, w = 2, x = 1. <code>755</code> = ejer rwx (7), andre r-x (5). <code>644</code> er typisk for almindelige filer.</p>
<ul><li><code>chmod +x script.sh</code> – gør et script kørbart</li><li><code>chown pi:pi fil</code> – skift ejer</li><li><code>sudo kommando</code> – kør som administrator (root)</li></ul>`,
        example: c(`
ls -l backup.sh
chmod +x backup.sh
./backup.sh
sudo chown www-data:www-data /var/www/index.html`),
        task: { text: 'Skriv kommandoen, der gør <code>script.sh</code> kørbart.', answer: true, hint: 'chmod med +x (eller 755)', solution: 'chmod +x script.sh', check: { re: ['^(sudo\\s+)?chmod\\s+(\\+x|u\\+x|a\\+x|7[0-7][0-7])\\s+(\\./)?script\\.sh$'] } },
        quiz: [['Hvad betyder chmod 644?', ['Alle må alt', 'Ejer læs/skriv, andre kun læs', 'Kun ejer må køre den', 'Ingen må noget'], 1, '6 = 4+2 (rw), 4 = r.'],
          ['Hvornår skal du bruge sudo?', ['Altid', 'Når kommandoen kræver administratorrettigheder', 'Aldrig på en Raspberry Pi', 'Kun til ls'], 1, 'Brug det kun, når det er nødvendigt.']] },
      { id: 'lx3', title: 'Søg og filtrér: grep, find og pipes', minutes: 14,
        body: `<p><code>grep ord fil</code> viser linjer, der indeholder ordet (<code>-i</code> ignorerer store/små bogstaver, <code>-c</code> tæller). <code>find . -name "*.log"</code> finder filer.</p>
<p>En <b>pipe</b> <code>|</code> sender output fra én kommando videre til den næste: <code>cat app.log | grep ERROR | wc -l</code> tæller fejl-linjerne. <code>tail -f app.log</code> følger en log live.</p>`,
        example: c(`
grep -i "timeout" /var/log/syslog
find ~ -name "*.pdf" -mtime -7
journalctl -u nginx | grep error | tail -n 20`),
        task: { text: 'Skriv én kommando, der <b>tæller</b>, hvor mange linjer i <code>app.log</code> der indeholder <code>ERROR</code>.', answer: true, hint: 'grep -c … eller grep … | wc -l', solution: 'grep -c ERROR app.log',
          check: { re: ['^(grep\\s+-c\\s+["\']?ERROR["\']?\\s+app\\.log|grep\\s+["\']?ERROR["\']?\\s+app\\.log\\s*\\|\\s*wc\\s+-l|cat\\s+app\\.log\\s*\\|\\s*grep\\s+["\']?ERROR["\']?\\s*\\|\\s*wc\\s+-l|grep\\s+["\']?ERROR["\']?\\s+-c\\s+app\\.log)$'] } },
        quiz: [['Hvad gør | (pipe)?', ['Gemmer i en fil', 'Sender output videre som input til næste kommando', 'Kører to kommandoer samtidig', 'Stopper en kommando'], 1, 'Byggeklodser, der sættes sammen.'],
          ['Hvilken kommando følger en log, mens den skrives?', ['cat -f', 'tail -f', 'grep -live', 'less -w'], 1, 'Stop med Ctrl+C.']] },
      { id: 'lx4', title: 'Processer og tjenester', minutes: 12,
        body: `<p>Programmer, der kører, er <b>processer</b>. <code>ps aux</code> viser dem, <code>htop</code> giver et levende overblik, og <code>kill PID</code> stopper én.</p>
<p>Tjenester (nginx, docker, ssh …) styres med <b>systemd</b>:</p>
<ul><li><code>systemctl status nginx</code> – kører den, og hvad er der sket?</li><li><code>sudo systemctl restart nginx</code> – genstart</li><li><code>sudo systemctl enable --now docker</code> – start nu og ved opstart</li><li><code>journalctl -u nginx -f</code> – tjenestens log</li></ul>`,
        example: c(`
systemctl status ssh
sudo systemctl restart nginx
journalctl -u nginx --since "10 min ago"`),
        task: { text: 'Skriv kommandoen, der <b>genstarter</b> tjenesten <code>nginx</code>.', answer: true, hint: 'sudo systemctl …', solution: 'sudo systemctl restart nginx', check: { re: ['^(sudo\\s+)?systemctl\\s+restart\\s+nginx(\\.service)?$'] } },
        quiz: [['Hvad gør systemctl enable?', ['Starter tjenesten nu', 'Får tjenesten til at starte ved opstart', 'Installerer den', 'Sletter loggen'], 1, 'Med --now startes den også med det samme.'],
          ['Hvor ser du, hvorfor en tjeneste fejler?', ['ls -la', 'systemctl status / journalctl -u', 'chmod', 'ping'], 1, 'Status viser de seneste loglinjer.']] },
      { id: 'lx5', title: 'Netværk fra terminalen', minutes: 12,
        body: `<ul><li><code>ip a</code> – dine IP-adresser</li><li><code>ping 8.8.8.8</code> – er der forbindelse? (Ctrl+C stopper)</li><li><code>curl -I https://example.com</code> – svarer en webserver?</li><li><code>ss -tulpn</code> – hvilke porte lytter på maskinen?</li><li><code>ssh bruger@ip</code> – log ind på en anden maskine</li><li><code>scp fil bruger@ip:~/</code> – kopiér en fil derover</li></ul>`,
        example: c(`
ip a
ping -c 4 192.168.1.1
sudo ss -tulpn | grep 8080
ssh pi@192.168.1.20`),
        task: { text: 'Skriv kommandoen, der logger ind med SSH på <code>192.168.1.20</code> som brugeren <code>pi</code>.', answer: true, hint: 'ssh bruger@adresse', solution: 'ssh pi@192.168.1.20', check: { re: ['^ssh\\s+(-p\\s*22\\s+)?pi@192\\.168\\.1\\.20$'] } },
        quiz: [['Hvordan ser du, hvilke porte der lytter?', ['ls -ports', 'ss -tulpn', 'ping -l', 'chmod 22'], 1, 'Eller netstat -tulpn på ældre systemer.'],
          ['Hvad betyder det, hvis ping 8.8.8.8 virker, men ping google.com ikke gør?', ['Ingen internetforbindelse', 'DNS virker ikke', 'Kablet er defekt', 'Google er nede'], 1, 'Forbindelsen er der – navneopslaget fejler.']] },
      { id: 'lx6', title: 'Pakker og opdateringer', minutes: 10,
        body: `<p>På Debian, Ubuntu og Raspberry Pi OS installeres programmer med <b>apt</b>:</p>
<ul><li><code>sudo apt update</code> – hent listen over nye versioner</li><li><code>sudo apt upgrade</code> – installér opdateringerne</li><li><code>sudo apt install htop</code> – installér et program</li><li><code>sudo apt remove pakke</code> – fjern igen</li></ul>
<p>Kør <code>update</code> før <code>install</code> og <code>upgrade</code>, så apt kender de nyeste versioner.</p>`,
        example: c(`
sudo apt update
sudo apt upgrade -y
sudo apt install -y htop git curl`),
        task: { text: 'Skriv kommandoen, der installerer programmet <code>htop</code>.', answer: true, hint: 'sudo apt install …', solution: 'sudo apt install htop', check: { re: ['^(sudo\\s+)?apt(-get)?\\s+install\\s+(-y\\s+)?htop(\\s+-y)?$'] } },
        quiz: [['Hvad gør sudo apt update?', ['Installerer alle opdateringer', 'Henter listen over tilgængelige versioner', 'Genstarter maskinen', 'Opdaterer kun apt selv'], 1, 'Selve installationen sker med upgrade.'],
          ['Hvad betyder -y?', ['Ja til alle spørgsmål', 'Yderligere info', 'Kun for root', 'Afinstallér'], 0, 'Praktisk i scripts.']] },
    ],
  },

  // ───────────────────────────────────────── Arduino / C++ ─────────────────────────────────────────
  {
    id: 'arduino', title: 'Arduino og C++', lang: 'cpp', icon: 'chip', hue: '#14b8a6', level: 'Let øvet',
    intro: 'Programmér mikrocontrollere – fra blinkende LED til sensorer. Passer til CircuitPilot og Værktøjskassen.',
    lessons: [
      { id: 'ard1', title: 'setup() og loop()', minutes: 10,
        body: `<p>Et Arduino-program (en <i>sketch</i>) har to funktioner: <code>setup()</code> kører én gang ved start, <code>loop()</code> kører igen og igen for evigt.</p>
<p>Hver instruktion slutter med semikolon <code>;</code> – det glemmer alle i starten.</p>`,
        example: c(`
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}`),
        task: { text: 'Skriv linjen, der i <code>setup()</code> gør ben 13 til en udgang.', answer: true, hint: 'pinMode(…, …);', solution: 'pinMode(13, OUTPUT);', check: { re: ['^pinMode\\(\\s*13\\s*,\\s*OUTPUT\\s*\\);$'] } },
        quiz: [['Hvor mange gange kører setup()?', ['Én gang', 'Hele tiden', 'Hvert sekund', 'Aldrig'], 0, 'loop() gentages, setup() kører kun ved start.']] },
      { id: 'ard2', title: 'Digitale input og knapper', minutes: 12,
        body: `<p><code>digitalRead(ben)</code> giver <code>HIGH</code> eller <code>LOW</code>. Brug <code>INPUT_PULLUP</code>, så benet er HIGH, når knappen ikke er trykket – og LOW når den er (knappen forbinder til GND).</p>`,
        example: c(`
const int KNAP = 2, LED = 13;
void setup() {
  pinMode(KNAP, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
}
void loop() {
  bool trykket = digitalRead(KNAP) == LOW;
  digitalWrite(LED, trykket ? HIGH : LOW);
}`),
        task: { text: 'Med <code>INPUT_PULLUP</code>: hvilken værdi giver <code>digitalRead()</code>, når knappen <b>er</b> trykket? Skriv værdien.', answer: true, hint: 'Knappen forbinder benet til GND.', solution: 'LOW', check: { re: ['^LOW$'] } },
        quiz: [['Hvorfor bruge INPUT_PULLUP?', ['Det sparer strøm', 'Benet "svæver" ikke, og du skal ikke bruge en ekstra modstand', 'Det er hurtigere', 'Det kræves for LED'], 1, 'Den interne pull-up holder benet på et kendt niveau.']] },
      { id: 'ard3', title: 'Analoge målinger', minutes: 12,
        body: `<p><code>analogRead(A0)</code> giver et tal fra 0 til 1023 for 0–5 V (på en Uno). Omregn til volt: <code>spænding = værdi * 5.0 / 1023</code>.</p>
<p>Med <code>Serial.begin(9600)</code> og <code>Serial.println()</code> sender du tal til computeren – vis dem i Serial Monitor.</p>`,
        example: c(`
void setup() { Serial.begin(9600); }
void loop() {
  int raa = analogRead(A0);
  float volt = raa * 5.0 / 1023;
  Serial.print(volt, 2);
  Serial.println(" V");
  delay(500);
}`),
        task: { text: 'Hvilken spænding svarer <code>analogRead()</code> = 512 til på en 5 V Arduino? Skriv svaret med 1 decimal (brug punktum).', answer: true, hint: '512 × 5 / 1023', solution: '2.5', check: { re: ['^2[.,]5\\d*\\s*V?$'] } },
        quiz: [['Hvad er måleområdet for analogRead() på en Uno?', ['0–255', '0–1023', '0–5', '-1023–1023'], 1, '10-bit ADC: 2¹⁰ = 1024 trin.']] },
      { id: 'ard4', title: 'PWM: dæmp en LED', minutes: 12,
        body: `<p>Med <code>analogWrite(ben, 0–255)</code> tænder og slukker benet meget hurtigt (PWM), så en LED ser dæmpet ud. Kun ben med ~ kan bruges (fx 3, 5, 6, 9, 10, 11 på en Uno).</p>`,
        example: c(`
const int LED = 9;
void setup() { pinMode(LED, OUTPUT); }
void loop() {
  for (int lys = 0; lys <= 255; lys += 5) { analogWrite(LED, lys); delay(20); }
  for (int lys = 255; lys >= 0; lys -= 5) { analogWrite(LED, lys); delay(20); }
}`),
        task: { text: 'Skriv linjen, der sætter LED’en på ben 9 til ca. halv lysstyrke.', answer: true, hint: 'Halvdelen af 255.', solution: 'analogWrite(9, 128);', check: { re: ['^analogWrite\\(\\s*9\\s*,\\s*12[78]\\s*\\);$'] } },
        quiz: [['Hvad betyder PWM?', ['Pulsbreddemodulation', 'Power With Memory', 'Programmerbar strøm', 'Pin Write Mode'], 0, 'Forholdet mellem tænd og sluk bestemmer den gennemsnitlige effekt.']] },
      { id: 'ard5', title: 'millis() i stedet for delay()', minutes: 14,
        body: `<p><code>delay()</code> stopper alt. Skal programmet gøre flere ting på én gang (blinke og læse en knap), så brug <code>millis()</code> – antal millisekunder siden start – og tjek, om der er gået lang nok tid.</p>`,
        example: c(`
unsigned long sidst = 0;
bool tændt = false;
void setup() { pinMode(13, OUTPUT); }
void loop() {
  if (millis() - sidst >= 500) {
    sidst = millis();
    tændt = !tændt;
    digitalWrite(13, tændt);
  }
  // her kan du læse knapper, sensorer … uden at vente
}`),
        task: { text: 'Hvilken type bør variablen, der gemmer <code>millis()</code>, have? Skriv typen.', answer: true, hint: 'Den skal kunne rumme store, positive tal.', solution: 'unsigned long', check: { re: ['^unsigned\\s+long$'] } },
        quiz: [['Hvad er problemet med delay(1000)?', ['Det er unøjagtigt', 'Programmet kan ikke gøre andet imens', 'Det bruger meget strøm', 'Det virker kun på ben 13'], 1, 'Under delay() læses knapper og sensorer ikke.']] },
    ],
  },
];

export const courseById = (id) => CODE_COURSES.find(c => c.id === id);
export const allLessons = () => CODE_COURSES.flatMap(c => c.lessons.map(l => ({ course: c, lesson: l })));
export const XP_LESSON = 20, XP_QUIZ = 5;

/**
 * Øvelseslab – simulators and practice labs without DOM (tested in node):
 *  - laser: what happens when a laser type meets a material at a given power, speed and passes
 *  - network: a small Windows terminal on a computer with a hidden network fault
 *  - cases: service cases – pick tests, read the results, choose the cause
 *  - print3d: slicer settings → time, filament, strength, quality and warnings
 * The models are simplified on purpose: they teach the relationships, not exact machine values.
 */

// ── Laser ─────────────────────────────────────────────────────────────
export const LASERS = {
  diode10: { name: 'Diode 10 W (blå, 450 nm)', w: 10, type: 'diode' },
  diode20: { name: 'Diode 20 W (blå, 450 nm)', w: 20, type: 'diode' },
  co2_40: { name: 'CO2 40 W (10.600 nm)', w: 40, type: 'co2' },
  co2_80: { name: 'CO2 80 W (10.600 nm)', w: 80, type: 'co2' },
  fiber30: { name: 'Fiber 30 W (1064 nm)', w: 30, type: 'fiber' },
  uv5: { name: 'UV 5 W (355 nm)', w: 5, type: 'uv' },
};
const NO_CUT = 999;
/** abs = how much of the light the material takes up; mark = J/mm to leave a mark; cut = J/mm per mm thickness. */
export const MATERIALS = {
  ply3: { name: 'Krydsfiner 3 mm', t: 3, abs: { diode: 0.9, co2: 0.95, fiber: 0.25, uv: 0.5 }, mark: 0.02, cut: 1.0 },
  ply6: { name: 'Krydsfiner 6 mm', t: 6, abs: { diode: 0.9, co2: 0.95, fiber: 0.25, uv: 0.5 }, mark: 0.02, cut: 1.0 },
  mdf3: { name: 'MDF 3 mm', t: 3, abs: { diode: 0.9, co2: 0.95, fiber: 0.25, uv: 0.5 }, mark: 0.02, cut: 1.25 },
  acrClear: { name: 'Akryl, klar 3 mm', t: 3, abs: { diode: 0, co2: 0.95, fiber: 0.02, uv: 0.3 }, mark: 0.03, cut: 0.9 },
  acrBlack: { name: 'Akryl, sort 3 mm', t: 3, abs: { diode: 0.8, co2: 0.95, fiber: 0.3, uv: 0.5 }, mark: 0.03, cut: 0.9 },
  leather: { name: 'Læder 2 mm (vegetabilsk garvet)', t: 2, abs: { diode: 0.85, co2: 0.95, fiber: 0.3, uv: 0.5 }, mark: 0.015, cut: 0.6 },
  paper: { name: 'Karton 0,5 mm', t: 0.5, abs: { diode: 0.7, co2: 0.95, fiber: 0.2, uv: 0.5 }, mark: 0.01, cut: 0.4 },
  anoAlu: { name: 'Anodiseret aluminium', t: 2, abs: { diode: 0.6, co2: 0.15, fiber: 0.9, uv: 0.7 }, mark: 0.02, cut: NO_CUT },
  steel: { name: 'Rustfrit stål', t: 1, abs: { diode: 0.03, co2: 0.001, fiber: 0.8, uv: 0.4 }, mark: 0.06, cut: NO_CUT },
  glass: { name: 'Glas', t: 4, abs: { diode: 0, co2: 0.9, fiber: 0.02, uv: 0.8 }, mark: 0.04, cut: NO_CUT },
  pvc: { name: 'PVC / vinyl', t: 3, abs: { diode: 0.7, co2: 0.95, fiber: 0.3, uv: 0.5 }, mark: 0.02, cut: 1, banned: 'PVC må aldrig lases: der dannes klorgas og saltsyre, som er farligt for dig og ødelægger maskinen.' },
};

const WHY_NONE = {
  diode: { acrClear: 'Klar akryl optager ikke blåt lys – strålen går lige igennem.', glass: 'Glas optager ikke blåt lys.', steel: 'Blankt metal kaster det blå lys tilbage. Brug en fiberlaser (eller mærkespray).' },
  co2: { steel: 'Metal reflekterer CO2-laserens lys. Brug en fiberlaser – eller mærkespray på CO2.', anoAlu: 'CO2 mærker kun anodiseret aluminium svagt. En fiber- eller diodelaser er bedre.' },
  fiber: { acrClear: 'Klar akryl optager næsten ikke fiberlaserens lys.', glass: 'Glas lader fiberlaserens lys gå igennem. Brug UV eller CO2.' },
};

/**
 * Simulate one job. mode 'engrave' | 'cut'; power 1–100 %; speed mm/s; passes ≥ 1.
 * Returns { level, title, text, energy, needed, tone } – tone ok | warn | bad | none.
 */
export function laserRun(laserId, matId, { mode = 'cut', power = 100, speed = 10, passes = 1 } = {}) {
  const L = LASERS[laserId], M = MATERIALS[matId];
  if (!L || !M) return { level: 'none', title: 'Vælg laser og materiale', text: '', tone: 'none' };
  if (M.banned) return { level: 'banned', title: 'Stop – forbudt materiale', text: M.banned, tone: 'bad' };
  const abs = M.abs[L.type] ?? 0;
  const e = (L.w * Math.max(0, Math.min(100, power)) / 100) / Math.max(0.5, speed) * Math.max(1, Math.round(passes));
  const eff = e * abs;
  const needed = M.cut === NO_CUT ? Infinity : M.t * M.cut;
  const base = { energy: +eff.toFixed(3), needed: Number.isFinite(needed) ? +needed.toFixed(2) : null };
  if (eff < M.mark) {
    const why = WHY_NONE[L.type]?.[matId] || (abs < 0.1 ? 'Materialet optager næsten ikke denne lasers lys.' : 'For lidt energi: skru op for effekten eller ned for hastigheden.');
    return { ...base, level: 'none', title: 'Intet sker', text: why, tone: 'none' };
  }
  if (mode === 'engrave') {
    const r = eff / M.mark;
    if (M.cut === NO_CUT && r >= 1) return { ...base, level: 'mark', title: r > 6 ? 'Tydelig, mørk mærkning' : 'Mærkning', text: matId === 'anoAlu' ? 'Anodiseringen fjernes, så det lyse metal kommer frem.' : matId === 'glass' ? 'Overfladen bliver matteret (frostet).' : 'Overfladen mærkes uden at gå i dybden.', tone: 'ok' };
    if (r < 2.5) return { ...base, level: 'light', title: 'Svag gravering', text: 'Et lyst mærke. Godt til fine detaljer – skru lidt op for en tydeligere kontrast.', tone: 'ok' };
    if (r < 10) return { ...base, level: 'engrave', title: 'Pæn gravering', text: 'God kontrast uden at brænde. Gem indstillingen i materialebiblioteket.', tone: 'ok' };
    if (r < 40) return { ...base, level: 'deep', title: 'Dyb, mørk gravering', text: 'Meget energi: dybt og mørkt, men kanterne kan blive brændte. Brug luftassistance.', tone: 'warn' };
    return { ...base, level: 'burn', title: 'Brændt', text: 'Alt for meget energi – materialet forkulles, og der er brandfare. Sænk effekten eller øg hastigheden.', tone: 'bad' };
  }
  if (!Number.isFinite(needed)) return { ...base, level: 'mark', title: 'Kan ikke skæres', text: `${M.name} kan ikke skæres med en ${L.type === 'fiber' ? 'galvo-fiberlaser i denne model' : 'laser af denne type'} – men det kan mærkes.`, tone: 'warn' };
  const r = eff / needed;
  if (r < 0.5) return { ...base, level: 'score', title: 'Kun en ridse', text: 'Strålen kommer ikke langt ned. Flere gennemløb, mere effekt eller lavere hastighed.', tone: 'warn' };
  if (r < 1) return { ...base, level: 'partial', title: 'Næsten igennem', text: `Mangler ca. ${Math.round((1 - r) * 100)} % energi. Prøv ét gennemløb mere eller lidt lavere hastighed.`, tone: 'warn' };
  if (r <= 2.2) return { ...base, level: 'cut', title: 'Skåret igennem', text: 'Rent snit. Tjek, at emnet falder frit ud, og gem indstillingen.', tone: 'ok' };
  return { ...base, level: 'overcut', title: 'Igennem – men brændte kanter', text: 'Meget mere energi end nødvendigt: brede, mørke kanter og risiko for brand. Øg hastigheden.', tone: 'warn' };
}

/** A material test like in LightBurn: rows = power, columns = speed. */
export function laserGrid(laserId, matId, mode, powers = [20, 40, 60, 80, 100], speeds = [5, 10, 20, 40, 80]) {
  return powers.map(p => speeds.map(s => ({ power: p, speed: s, ...laserRun(laserId, matId, { mode, power: p, speed: s, passes: 1 }) })));
}

// ── Network lab ───────────────────────────────────────────────────────
export const NET_FAULTS = [
  { id: 'ok', label: 'Ingen fejl – forbindelsen virker', why: 'Alle test svarer: adresse fra DHCP, gateway, internet og DNS virker.' },
  { id: 'cable', label: 'Kablet (eller Wi-Fi) er ikke forbundet', why: '“Medie afbrudt” i ipconfig betyder, at netværkskortet ikke har forbindelse – tjek kabel, stik eller Wi-Fi.' },
  { id: 'dhcp', label: 'Computeren får ingen adresse fra routeren (DHCP)', why: 'En adresse, der starter med 169.254, er en nødadresse, Windows selv giver, når DHCP ikke svarer. Tjek routeren og kablet til den.' },
  { id: 'dns', label: 'Navneopslag (DNS) virker ikke', why: 'Ping til 8.8.8.8 virker, men ikke til navne – så er det DNS. Prøv en anden DNS-server, eller genstart routeren.' },
  { id: 'gateway', label: 'Forkert standardgateway (manuel opsætning)', why: 'Gatewayen svarer ikke, men routeren på .1 gør. Netværkskortet er sat op manuelt med forkert gateway – sæt det til automatisk (DHCP).' },
  { id: 'isp', label: 'Internettet er nede hos udbyderen', why: 'Routeren svarer, men intet bagved. Tracert stopper efter routeren – tjek routerens lys og udbyderens driftsstatus.' },
];

/** A fresh computer with a hidden fault. rnd is injectable for tests. */
export function netScenario(rnd = Math.random, fault = null) {
  const f = fault || NET_FAULTS[Math.floor(rnd() * NET_FAULTS.length)].id;
  const host = 20 + Math.floor(rnd() * 200);
  return {
    fault: f,
    ip: f === 'dhcp' ? `169.254.${10 + Math.floor(rnd() * 200)}.${host}` : `192.168.1.${host}`,
    mask: f === 'dhcp' ? '255.255.0.0' : '255.255.255.0',
    gw: f === 'dhcp' ? '' : f === 'gateway' ? '192.168.1.254' : '192.168.1.1',
    dns: f === 'dhcp' ? '' : '192.168.1.1',
    mac: 'A4-5E-60-' + [0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).toUpperCase().padStart(2, '0')).join('-'),
    renewed: false,
  };
}

const ipconfigOut = (s, all) => {
  if (s.fault === 'cable') return ['Windows IP-konfiguration', '', 'Ethernet-adapter Ethernet:', '', '   Medietilstand . . . . . . . . . . : Medie afbrudt', '   Forbindelsesspecifikt DNS-suffiks :'];
  const lines = ['Windows IP-konfiguration', '', 'Ethernet-adapter Ethernet:', ''];
  if (all) lines.push('   Beskrivelse . . . . . . . . . . . : Realtek PCIe GbE Family Controller', `   Fysisk adresse. . . . . . . . . . : ${s.mac}`, `   DHCP aktiveret. . . . . . . . . . : ${s.fault === 'gateway' ? 'Nej' : 'Ja'}`);
  lines.push(`   ${s.fault === 'dhcp' ? 'Autokonfiguration IPv4-adresse' : 'IPv4-adresse . . . . . . . . . . .'} : ${s.ip}`, `   Undernetmaske . . . . . . . . . . : ${s.mask}`, `   Standardgateway . . . . . . . . . : ${s.gw}`);
  if (all) lines.push(`   DNS-servere . . . . . . . . . . . : ${s.dns || ''}`);
  return lines;
};
const pingOk = (target, ip, ms) => [`Pinger ${target}${ip && ip !== target ? ` [${ip}]` : ''} med 32 byte data:`, ...[0, 1, 2, 3].map(i => `Svar fra ${ip || target}: byte=32 tid=${ms + (i % 2)}ms TTL=${ip?.startsWith('192.168.') ? 64 : 117}`), '', `Ping-statistik for ${ip || target}:`, '    Pakker: Sendt = 4, Modtaget = 4, Tabt = 0 (0 % tab)'];
const pingFail = (target, line) => [`Pinger ${target} med 32 byte data:`, ...[0, 1, 2, 3].map(() => line), '', `Ping-statistik for ${target}:`, '    Pakker: Sendt = 4, Modtaget = 0, Tabt = 4 (100 % tab)'];

/** Run one command in the lab terminal. Returns the output lines (and may change the scenario, fx after /renew). */
export function netCommand(s, raw) {
  const cmd = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!cmd) return [];
  if (cmd === 'help' || cmd === 'hjælp' || cmd === '?') return ['Kommandoer i laboratoriet:', '  ipconfig, ipconfig /all, ipconfig /renew, ipconfig /flushdns', '  ping <adresse eller navn>   fx ping 192.168.1.1, ping 8.8.8.8, ping google.com', '  nslookup <navn>, tracert <navn eller adresse>, cls'];
  if (cmd === 'ipconfig') return ipconfigOut(s, false);
  if (cmd === 'ipconfig /all') return ipconfigOut(s, true);
  if (cmd === 'ipconfig /flushdns') return ['Windows IP-konfiguration', '', 'DNS-matchcachen er tømt.'];
  if (cmd === 'ipconfig /release') return ['Windows IP-konfiguration', '', 'I laboratoriet slipper vi ikke adressen – prøv ipconfig /renew.'];
  if (cmd === 'ipconfig /renew') {
    if (s.fault === 'cable') return ['Windows IP-konfiguration', '', 'Der kan ikke udføres nogen handling på Ethernet, mens mediet er afbrudt.'];
    if (s.fault === 'dhcp') return ['Windows IP-konfiguration', '', 'Der opstod en fejl under fornyelse af grænsefladen Ethernet: Kan ikke kontakte DHCP-serveren. Anmodningen fik timeout.'];
    s.renewed = true;
    return ['Windows IP-konfiguration', '', ...ipconfigOut(s, false).slice(2)];
  }
  const [verb, arg = ''] = cmd.split(' ');
  if (verb === 'ping' || verb === 'tracert' || verb === 'nslookup') {
    if (!arg) return [`Angiv en adresse, fx ${verb} 8.8.8.8`];
    const isName = /[a-z]/.test(arg) && !/^\d+\.\d+\.\d+\.\d+$/.test(arg);
    const extIp = arg === 'google.com' || arg === 'www.google.com' ? '142.250.74.46' : isName ? '93.184.215.14' : arg;
    const local = /^192\.168\.1\.\d+$/.test(extIp);
    const self = extIp === s.ip;
    const router = extIp === '192.168.1.1';
    if (verb === 'nslookup') {
      if (s.fault === 'cable' || s.fault === 'dhcp') return ['DNS request timed out.', '    timeout was 2 seconds.', `*** Standardserverne er ikke tilgængelige`];
      if (s.fault === 'dns' || s.fault === 'isp') return [`Server:  router.lan`, `Address:  ${s.dns}`, '', 'DNS request timed out.', `*** router.lan kunne ikke finde ${arg}: Timeout`];
      if (s.fault === 'gateway') return [`Server:  router.lan`, `Address:  ${s.dns}`, '', 'Ikke-autoritativt svar:', `Navn:    ${arg}`, `Address:  ${extIp}`];
      return [`Server:  router.lan`, `Address:  ${s.dns}`, '', 'Ikke-autoritativt svar:', `Navn:    ${arg}`, `Address:  ${extIp}`];
    }
    if (s.fault === 'cable') return verb === 'ping' ? [`Pinger ${arg} med 32 byte data:`, 'PING: transmissionen mislykkedes. Generel fejl.', 'PING: transmissionen mislykkedes. Generel fejl.', 'PING: transmissionen mislykkedes. Generel fejl.', 'PING: transmissionen mislykkedes. Generel fejl.'] : ['Kan ikke nå målet: Generel fejl.'];
    if (isName && (s.fault === 'dns' || s.fault === 'dhcp')) return [`Ping-anmodningen kunne ikke finde værten ${arg}. Kontrollér navnet, og prøv igen.`];
    if (isName && s.fault === 'isp') return [`Ping-anmodningen kunne ikke finde værten ${arg}. Kontrollér navnet, og prøv igen.`];
    if (self) return verb === 'ping' ? pingOk(arg, s.ip, 0) : [`Sporing til ${arg}:`, `  1    <1 ms    <1 ms    <1 ms  ${arg}`, '', 'Sporing fuldført.'];
    if (s.fault === 'dhcp') return verb === 'ping' ? pingFail(arg, `Svar fra ${s.ip}: Destinationsværten kan ikke nås.`) : [`Sporing til ${arg}:`, `  1  ${s.ip}  rapporterer: Destinationsværten kan ikke nås.`, '', 'Sporing fuldført.'];
    if (local) {
      if (!router) return verb === 'ping' ? pingFail(arg, 'Anmodningen fik timeout.') : [`Sporing til ${arg}:`, '  1     *        *        *     Anmodningen fik timeout.', '', 'Sporing fuldført.'];
      return verb === 'ping' ? pingOk(arg, extIp, 1) : [`Sporing til ${arg}:`, `  1     1 ms     1 ms     1 ms  ${arg}`, '', 'Sporing fuldført.'];
    }
    // outside the local net
    if (s.fault === 'gateway') return verb === 'ping' ? pingFail(arg, `Svar fra ${s.ip}: Destinationsværten kan ikke nås.`) : [`Sporing til ${arg}:`, `  1  ${s.ip}  rapporterer: Destinationsværten kan ikke nås.`, '', 'Sporing fuldført.'];
    if (s.fault === 'isp') return verb === 'ping' ? pingFail(isName ? arg : extIp, 'Anmodningen fik timeout.') : [`Sporing til ${arg} over højst 30 hop:`, '  1     1 ms     1 ms     1 ms  router.lan [192.168.1.1]', '  2     *        *        *     Anmodningen fik timeout.', '  3     *        *        *     Anmodningen fik timeout.', '', 'Sporing fuldført.'];
    return verb === 'ping' ? pingOk(arg, extIp, 14) : [`Sporing til ${arg} [${extIp}] over højst 30 hop:`, '  1     1 ms     1 ms     1 ms  router.lan [192.168.1.1]', '  2     9 ms     8 ms     9 ms  10.20.0.1', '  3    13 ms    12 ms    13 ms  ' + extIp, '', 'Sporing fuldført.'];
  }
  return [`'${raw.trim().split(' ')[0]}' genkendes ikke som en intern eller ekstern kommando. Skriv help for at se kommandoerne.`];
}

// ── Service cases ─────────────────────────────────────────────────────
/** tests: [label, result]; options: possible causes; a = index of the right one. */
export const CASES = [
  { id: 'laser-weak', area: 'Laser', title: 'CO2-laseren skærer ikke igennem længere',
    symptom: 'Kunden skærer 3 mm krydsfiner med de samme indstillinger som altid, men nu kommer den ikke igennem. Det startede gradvist over nogle uger.',
    tests: [['Se på linsen', 'Linsen har en brun belægning og en lille plet i midten.'], ['Tjek kølevandet', 'Vandet er klart, 22 °C, og pumpen kører.'], ['Kør en testfil i en kendt indstilling', 'Snittet er bredt og svagt – i alle hjørner af bordet.'], ['Spørg til materialet', 'Samme leverandør og type som altid.'], ['Tjek fokus', 'Fokusafstanden er korrekt.']],
    options: ['Røret er brændt ud', 'Snavset (beskadiget) linse', 'Forkert materiale', 'Forkert fokus'], a: 1,
    why: 'En snavset eller beskadiget linse spreder og optager strålen, så energien ikke når ned. Det sker gradvist. Rens linsen – er der en plet, skal den skiftes.' },
  { id: 'laser-shift', area: 'Laser', title: 'Motiverne bliver forskudte',
    symptom: 'Ved længere job bliver graveringen forskudt til siden midt i jobbet. Små job er fine.',
    tests: [['Tjek remmene', 'Remmen på X-aksen er slap og kan trykkes langt ned.'], ['Se på filen', 'Filen er korrekt og ser rigtig ud i programmet.'], ['Tjek hastighed og acceleration', 'Hastigheden er normal for maskinen.'], ['Kør en lille testfil', 'Den lille testfil bliver fin.']],
    options: ['Fejl i filen', 'Slap rem på X-aksen', 'For lav effekt', 'Snavset linse'], a: 1,
    why: 'En slap rem kan springe et tandhjul over ved hurtige bevægelser – så forskydes resten af jobbet. Stram remmen efter vejledningen.' },
  { id: '3d-adhesion', area: '3D-print', title: 'Printet slipper pladen',
    symptom: 'PLA-print slipper byggepladen efter få lag. Det er en ny kunde, som har haft printeren i en uge.',
    tests: [['Spørg, hvordan pladen bliver rørt', 'Kunden tager printene af med fingrene direkte på printfladen.'], ['Tjek pladetypen i sliceren', 'Pladetypen passer til den, der ligger i printeren.'], ['Tjek temperaturer', 'Dyse 215 °C og plade 55 °C – normalt for PLA.'], ['Se på første lag', 'Første lag er tyndt og jævnt, men slipper i hjørnerne.']],
    options: ['Forkert dysetemperatur', 'Fedt fra fingre på pladen', 'Fugtigt filament', 'Forkert pladetype i sliceren'], a: 1,
    why: 'Fedt fra fingre er den hyppigste årsag til dårlig hæftning. Vask pladen med vand og opvaskemiddel og undgå at røre printfladen.' },
  { id: '3d-strings', area: '3D-print', title: 'Tråde og bobler i PETG-print',
    symptom: 'Printene har mange fine tråde mellem delene og små bobler i overfladen. Printeren knitrer svagt.',
    tests: [['Spørg til filamentet', 'Rullen har ligget åben i værkstedet i to måneder.'], ['Tjek temperatur', '240 °C – inden for det anbefalede.'], ['Tjek retraction', 'Standardindstillingerne fra producenten.'], ['Lyt til dysen', 'Svag knitren, når der ekstruderes.']],
    options: ['Fugtigt filament', 'For lav temperatur', 'Tilstoppet dyse', 'Forkert plade'], a: 0,
    why: 'Fugtigt filament koger i dysen: knitren, bobler og tråde. Tør rullen (fx 65 °C i 4–6 timer for PETG) og opbevar den tørt.' },
  { id: 'plotter-cut', area: 'Skæreplotter', title: 'Plotteren skærer ikke igennem folien',
    symptom: 'Vinylfolien kan ikke afluges – kniven skærer kun nogle steder igennem.',
    tests: [['Se på kniven', 'Spidsen er afrundet og har et lille hak.'], ['Tjek tryk', 'Trykket er det samme, som altid har virket.'], ['Kør en testskæring', 'Testskæringen er ujævn – især i hjørnerne.'], ['Tjek folien', 'Samme folie som sidste måned.']],
    options: ['For lavt tryk', 'Sløv kniv', 'Forkert folie', 'Snavs i måtten'], a: 1,
    why: 'En sløv kniv skærer ujævnt, især i hjørner. At skrue op for trykket giver kun dybere skrammer i bagpapiret – skift kniven.' },
  { id: 'wide-stripes', area: 'Storformatprint', title: 'Vandrette striber i printet',
    symptom: 'Storformatprinteren laver tynde vandrette striber i store farveflader.',
    tests: [['Kør en dysetest', 'Der mangler linjer i cyan og magenta.'], ['Tjek medieprofilen', 'Den rigtige profil er valgt.'], ['Tjek blækniveau', 'Alle farver over 40 %.'], ['Se på mediet', 'Mediet ligger plant og fremføres jævnt.']],
    options: ['Forkert medieprofil', 'Tilstoppede dyser', 'Tom blækpatron', 'Forkert medie'], a: 1,
    why: 'Manglende linjer i dysetesten = tilstoppede dyser. Kør rens efter vejledningen og ny dysetest. Bliv ved med at notere resultatet.' },
  { id: 'printer-ip', area: 'Printer', title: 'Netværksprinteren forsvinder hver mandag',
    symptom: 'Kontorets printer virker hele ugen, men om mandagen kan ingen printe. En kollega “løser” det ved at geninstallere den.',
    tests: [['Se printerens IP-adresse', 'Den har fået en ny adresse siden fredag.'], ['Tjek routeren', 'Routeren genstarter selv hver søndag nat.'], ['Tjek driveren', 'Driveren er den nyeste.'], ['Ping den gamle adresse', 'Intet svar.']],
    options: ['Forkert driver', 'Printeren får ny IP-adresse efter routerens genstart', 'Printeren er i stykker', 'For lidt toner'], a: 1,
    why: 'Når routeren genstarter, får printeren en ny IP-adresse fra DHCP. Lav en DHCP-reservation (fast adresse) i routeren.' },
  { id: 'pc-slow', area: 'Computer', title: 'Computeren er blevet meget langsom',
    symptom: 'En bærbar er blevet langsom og blæseren larmer, selv når kunden kun har én browser åben.',
    tests: [['Åbn Jobliste', 'CPU 95 % – en ukendt proces “svchost32.exe” bruger det meste.'], ['Tjek disken', 'SSD med 60 % ledig plads.'], ['Tjek RAM', '8 GB, 45 % i brug.'], ['Se, hvor processen ligger', 'Filen ligger i brugerens Downloads-mappe, ikke i Windows-mappen.']],
    options: ['For lidt RAM', 'Fuld disk', 'Skadelig software (malware)', 'Gammel blæser'], a: 2,
    why: 'En proces med et næsten-rigtigt navn, der ligger et forkert sted og bruger meget CPU, er et klassisk tegn på malware (fx kryptomining). Afbryd netværket, scan, fjern og skift koder.' },
  { id: 'resin-vat', area: 'Resinprint', title: 'Resinprintet sidder i karret',
    symptom: 'Efter printet sidder emnet på filmen i karret i stedet for på byggepladen.',
    tests: [['Tjek bundlagenes eksponering', 'Bundlag: 15 s – producenten anbefaler 35 s for denne resin.'], ['Tjek rumtemperaturen', '21 °C.'], ['Tjek niveauet', 'Pladen blev niveauet i sidste uge og er ikke rørt siden.'], ['Se på filmen', 'Filmen er klar og uden ridser.']],
    options: ['For kort eksponering af bundlagene', 'For koldt i rummet', 'Ridset film', 'Forkert resin'], a: 0,
    why: 'Bundlagene skal have længere eksponering, så emnet hæfter til byggepladen. 15 s er for lidt – brug producentens anbefaling.' },
  { id: 'wifi-printer', area: 'Printer', title: 'Kan ikke finde printeren efter ny router',
    symptom: 'Kunden har fået ny router, og nu kan ingen enheder finde den trådløse printer.',
    tests: [['Se printerens netværksstatus', 'Printeren prøver at forbinde til det gamle netværksnavn.'], ['Tjek computerens forbindelse', 'Computeren er på det nye netværk og har internet.'], ['Tjek printerens strøm', 'Printeren er tændt og uden fejl.']],
    options: ['Printeren er i stykker', 'Printeren er stadig sat op til det gamle Wi-Fi', 'Computeren mangler driver', 'Routeren er defekt'], a: 1,
    why: 'Printeren husker det gamle netværksnavn og kode. Forbind den til det nye Wi-Fi (fx via printerens skærm eller WPS).' },
];

/** Score for a solved case: 100 for the right answer, minus 10 per test after the first two. */
export const caseScore = (right, testsUsed) => (right ? Math.max(40, 100 - Math.max(0, testsUsed - 2) * 10) : 0);

// ── 3D-print lab ──────────────────────────────────────────────────────
export const FILAMENTS = {
  pla: { name: 'PLA', temp: [190, 220], density: 1.24, maxFlow: 15, strength: 0 },
  petg: { name: 'PETG', temp: [225, 250], density: 1.27, maxFlow: 10, strength: 10 },
  tpu: { name: 'TPU (blød)', temp: [215, 235], density: 1.21, maxFlow: 4, strength: 5 },
};
const MODEL = { h: 20, vol: 24000, surface: 6200, overhang: true };   // a 60 × 40 × 20 mm bracket with an overhang

/** layer mm, walls, infill %, speed mm/s, temp °C, supports bool → { minutes, grams, strength, quality, warnings[] } */
export function printEstimate({ filament = 'pla', layer = 0.2, walls = 2, infill = 15, speed = 100, temp = 210, supports = false } = {}) {
  const F = FILAMENTS[filament] || FILAMENTS.pla;
  const shell = Math.min(MODEL.vol, MODEL.surface * walls * 0.45);
  let vol = shell + (MODEL.vol - shell) * infill / 100;
  if (supports && MODEL.overhang) vol *= 1.12;
  const want = layer * 0.45 * speed;                       // mm³/s the settings ask for
  const flow = Math.min(want, F.maxFlow);
  const layers = Math.ceil(MODEL.h / layer);
  const minutes = Math.round((vol / flow * 1.3 + layers * 2) / 60);
  const grams = Math.round(vol / 1000 * F.density * 10) / 10;
  const warnings = [];
  let quality = layer <= 0.08 ? 96 : layer <= 0.12 ? 92 : layer <= 0.16 ? 86 : layer <= 0.2 ? 78 : layer <= 0.24 ? 70 : 62;
  let strength = Math.min(100, walls * 14 + infill * 0.55 + F.strength);
  if (want > F.maxFlow * 1.05) { warnings.push(`Dysen kan ikke smelte ${F.name} så hurtigt (${want.toFixed(1)} mm³/s ønsket, maks. ca. ${F.maxFlow}). Det giver underekstrudering og huller – sænk hastigheden.`); quality -= 15; strength -= 15; }
  if (temp < F.temp[0]) { warnings.push(`${temp} °C er for koldt til ${F.name} (${F.temp[0]}–${F.temp[1]} °C): dårlig lagbinding og risiko for tilstopning.`); strength -= 25; quality -= 10; }
  if (temp > F.temp[1]) { warnings.push(`${temp} °C er for varmt til ${F.name}: trådning, “bobler” og bløde detaljer.`); quality -= 12; }
  if (MODEL.overhang && !supports) { warnings.push('Overhænget på beslaget har ingen støtte: det hænger ned eller fejler. Slå support til (eller vend emnet).'); quality -= 20; }
  if (filament === 'tpu' && speed > 40) warnings.push('TPU er blødt og skal printes langsomt (typisk 20–40 mm/s), ellers bøjer det i fremføringen.');
  if (walls < 2) { warnings.push('Én væg giver et skrøbeligt emne og synlige huller i overfladen.'); strength -= 10; }
  return { minutes, grams, strength: Math.max(0, Math.round(strength)), quality: Math.max(0, Math.round(quality)), warnings, flow: +flow.toFixed(1) };
}

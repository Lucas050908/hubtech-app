/**
 * Printer-doktor: troubleshooting trees for office and network printers.
 * A node is a question { q, hint?, yes, no } or a fix { fix, steps[], code?, guide?, next? }.
 * "next" on a fix = what to try if the fix did not help. "done" ends a tree (= call the vendor / escalate).
 */
const ESCALATE = { fix: 'Kontakt producenten eller en tekniker', steps: [
  'Notér model, serienummer, sidetæller og eventuelle fejlkoder.',
  'Tag et billede af printerens skærm og af en testudskrift.',
  'Kontakt producentens support eller jeres serviceaftale – fortæl hvad du allerede har prøvet (står i denne sag).',
] };

export const PROBLEMS = [
  { id: 'offline', title: 'Printeren er “offline”', icon: 'plugOff', sub: 'Computeren kan ikke se printeren', start: 'off1' },
  { id: 'queue', title: 'Der kommer ingen udskrift', icon: 'clock', sub: 'Jobbet står i kø og sker ikke noget', start: 'q1' },
  { id: 'jam', title: 'Papirstop', icon: 'file', sub: 'Papiret sætter sig fast eller tages skævt', start: 'j1' },
  { id: 'quality', title: 'Dårlig kvalitet', icon: 'eye', sub: 'Striber, blege sider, udtværing', start: 'k1' },
  { id: 'install', title: 'Kan ikke installere printeren', icon: 'download', sub: 'Den dukker ikke op, eller driveren mangler', start: 'i1' },
  { id: 'scan', title: 'Scanning virker ikke', icon: 'mail', sub: 'Scan til e-mail eller mappe fejler', start: 's1' },
  { id: 'mobile', title: 'Mobilen kan ikke printe', icon: 'smartphone', sub: 'iPhone eller Android finder ikke printeren', start: 'm1' },
];

export const NODES = {
  // ── offline ──
  off1: { q: 'Er printeren tændt, og står der ingen fejl på skærmen?', hint: 'Fx papirstop, åben låge, tom toner eller en fejlkode.', yes: 'off2', no: 'off1f' },
  off1f: { fix: 'Løs fejlen på printeren først', steps: ['Ret det, skærmen viser (papir, låge, toner).', 'Står der en fejlkode, så slå den op i printerens manual eller på producentens side.', 'Sluk printeren i 30 sekunder, og tænd igen.'], next: 'off2' },
  off2: { q: 'Er printeren forbundet med kabel (USB)?', yes: 'off3usb', no: 'off3' },
  off3usb: { fix: 'Tjek USB-forbindelsen', steps: ['Prøv et andet USB-stik på computeren – helst direkte, ikke gennem en hub.', 'Prøv et andet kabel.', 'Fjern printeren i Printere og scannere, og sæt kablet i igen, så Windows finder den på ny.'], next: ESCALATE },
  off3: { q: 'Kan du se printerens IP-adresse på skærmen eller på en konfigurationsside?', yes: 'off4', no: 'off3f' },
  off3f: { fix: 'Få printeren på netværket', steps: ['Gå til printerens netværksmenu, og forbind til Wi-Fi igen (routerens kode kan være ændret).', 'Er den med netværkskabel: tjek at lyset ved stikket blinker, og prøv et andet kabel eller stik i routeren.', 'Udskriv en konfigurationsside, når den har fået en IP-adresse.'], guide: 'printer-install', next: 'off4' },
  off4: { q: 'Svarer printeren, når du pinger IP-adressen fra computeren?', hint: 'Kommandoprompt: ping og adressen.', code: 'ping 192.168.1.50', yes: 'off5', no: 'off4f' },
  off4f: { fix: 'Printer og computer er ikke på samme netværk', steps: ['Tjek at computeren er på det samme netværk som printeren (ikke et gæstenetværk).', 'Har printeren fået en ny IP-adresse? Så skal den tilføjes igen med den nye adresse.', 'Lav en DHCP-reservation i routeren, så adressen ikke skifter igen.'], guide: 'printer-offline', next: ESCALATE },
  off5: { q: 'Står der “Brug printer offline” med flueben i printerkøen?', hint: 'Windows: dobbeltklik på printeren → menuen Printer.', yes: 'off5f', no: 'off6' },
  off5f: { fix: 'Fjern “Brug printer offline”', steps: ['Åbn printerkøen (dobbeltklik på printeren i Printere og scannere).', 'Menuen Printer → fjern fluebenet ved “Brug printer offline”.', 'Prøv at udskrive igen.'], next: 'off6' },
  off6: { q: 'Passer IP-adressen på printeren med den, computeren bruger?', hint: 'Printeregenskaber → Porte. Står der en anden adresse, er det fejlen.', yes: 'off7', no: 'off6f' },
  off6f: { fix: 'Ret porten til den nye IP-adresse', steps: ['Printeregenskaber → fanen Porte → Tilføj port → Standard TCP/IP Port → skriv den nye adresse.', 'Eller: fjern printeren og tilføj den igen.', 'Lav en DHCP-reservation, så det ikke sker igen.'], next: ESCALATE },
  off7: { fix: 'Genstart udskriftskøen', steps: ['Åbn kommandoprompt som administrator.', 'Kør de tre linjer én ad gangen (ryd køen – sletter alle ventende udskrifter).', 'Genstart computeren, hvis det stadig ikke virker.'], code: 'net stop spooler\ndel /Q /F /S "%systemroot%\\System32\\spool\\PRINTERS\\*"\nnet start spooler', guide: 'printer-spooler', next: ESCALATE },

  // ── nothing prints ──
  q1: { q: 'Står der job i printerkøen med status “Fejl” eller “Udskriver” i lang tid?', yes: 'q1f', no: 'q2' },
  q1f: { fix: 'Ryd den fastlåste kø', steps: ['Prøv først: højreklik på jobbet → Annuller.', 'Hjælper det ikke: kør kommandoerne som administrator.', 'Udskriv igen.'], code: 'net stop spooler\ndel /Q /F /S "%systemroot%\\System32\\spool\\PRINTERS\\*"\nnet start spooler', guide: 'printer-spooler', next: 'q2' },
  q2: { q: 'Udskriver du til den rigtige printer?', hint: 'Mange har flere printere installeret – også gamle eller “Microsoft Print to PDF”.', yes: 'q3', no: 'q2f' },
  q2f: { fix: 'Vælg den rigtige printer som standard', steps: ['Indstillinger → Printere og scannere → slå “Lad Windows administrere min standardprinter” fra.', 'Vælg printeren → Angiv som standard.', 'Fjern gamle printere, I ikke bruger mere.'], next: 'q3' },
  q3: { q: 'Kan printeren lave en testudskrift fra sin egen menu?', hint: 'Fx “Konfigurationsside” eller “Testside” på printerens skærm.', yes: 'q4', no: 'q3f' },
  q3f: { fix: 'Fejlen er i printeren', steps: ['Tjek papir, toner/blæk og låger.', 'Sluk printeren i 30 sekunder, og tænd igen.', 'Kan den stadig ikke lave en testside, skal den til service.'], next: ESCALATE },
  q4: { q: 'Virker det fra en anden computer eller mobil?', yes: 'q4f', no: 'off3' },
  q4f: { fix: 'Fejlen er på denne computer', steps: ['Fjern printeren, og tilføj den igen.', 'Installér den nyeste driver fra producenten – eller prøv Windows’ egen driver.', 'Fjern den gamle driverpakke helt (se guiden Drivere).'], code: 'printui /s /t2', guide: 'printer-drivers', next: ESCALATE },

  // ── paper jam ──
  j1: { q: 'Sidder der papir fast lige nu?', yes: 'j1f', no: 'j2' },
  j1f: { fix: 'Fjern papiret forsigtigt', steps: ['Sluk printeren, og vent – fikseringsenheden i en laserprinter er meget varm.', 'Åbn den låge eller skuffe, skærmen peger på.', 'Træk langsomt i papirets retning med begge hænder.', 'Find alle små stykker, hvis det revnede.'], guide: 'printer-jam', next: 'j2' },
  j2: { q: 'Sker det igen og igen?', yes: 'j3', no: 'j2ok' },
  j2ok: { fix: 'Fint – tjek papiret', steps: ['Luft papirstakken, før den lægges i.', 'Fyld ikke over max-mærket, og juster papirstyrene.'], next: ESCALATE },
  j3: { q: 'Sker det med alle skuffer og papirtyper?', yes: 'j3f', no: 'j4' },
  j3f: { fix: 'Indføringsvalserne er slidte eller beskidte', steps: ['Rens valserne med en fnugfri klud fugtet med lidt vand.', 'Er de blanke og glatte, skal de skiftes (ofte et billigt sæt).', 'Tjek at der ikke sidder et fremmedlegeme (clips, etiket) i papirvejen.'], next: ESCALATE },
  j4: { fix: 'Problemet er papiret eller skuffen', steps: ['Brug papir med den gramvægt, printeren er lavet til, og opbevar det tørt.', 'Etiketter og tykt papir: brug manuel indføring, og vælg papirtypen i driveren.', 'Prøv en anden skuffe – en skuffes valse kan være slidt.'], next: ESCALATE },

  // ── quality ──
  k1: { q: 'Er det en laserprinter?', hint: 'Laserprintere bruger tonerpulver; blækprintere bruger blækpatroner.', yes: 'k2', no: 'k5' },
  k2: { q: 'Er siderne blege, eller er der lyse striber?', yes: 'k2f', no: 'k3' },
  k2f: { fix: 'Toneren er ved at være tom', steps: ['Tag tonerpatronen ud, og ryst den forsigtigt fra side til side.', 'Skift patronen, hvis det ikke hjælper.', 'Tjek at sparetilstand (“toner save”) er slået fra i driveren.'], guide: 'printer-quality', next: 'k3' },
  k3: { q: 'Er der mørke streger eller prikker med samme afstand ned ad siden?', yes: 'k3f', no: 'k4' },
  k3f: { fix: 'Tromlen eller en valse er ridset eller beskidt', steps: ['Mål afstanden mellem fejlene – den passer ofte til omkredsen af en bestemt valse (står i manualen).', 'Skift tromlen eller tonerpatronen (tromlen sidder ofte i patronen).'], next: ESCALATE },
  k4: { q: 'Kan toneren tørres af med en finger?', yes: 'k4f', no: 'k4n' },
  k4f: { fix: 'Fikseringsenheden smelter ikke toneren fast', steps: ['Tjek at papirtypen i driveren passer (tykt papir kræver mere varme).', 'Er papirtypen rigtig, er fikseringsenheden slidt og skal skiftes.'], next: ESCALATE },
  k4n: { fix: 'Tjek papir og indstillinger', steps: ['Prøv nyt, tørt papir.', 'Vælg den rigtige papirtype og kvalitet i driveren.', 'Kør printerens egen rensefunktion, hvis den har en.'], next: ESCALATE },
  k5: { q: 'Mangler der linjer eller farver?', yes: 'k5f', no: 'k6' },
  k5f: { fix: 'Rens printhovedet', steps: ['Kør en dysetest fra printerens menu eller driveren.', 'Kør rensefunktionen – højst 2–3 gange i træk, og test igen.', 'Hjælper det ikke: skift patronen med den manglende farve.', 'Print en side om ugen, så dyserne ikke tørrer ud igen.'], guide: 'printer-quality', next: 'k6' },
  k6: { fix: 'Justér printhoved og papir', steps: ['Kør justering af printhovedet (skæve linjer).', 'Vælg den rigtige papirtype (udtværing på fotopapir).', 'Brug tørt papir.'], next: ESCALATE },

  // ── install ──
  i1: { q: 'Har printeren en IP-adresse (står på skærmen eller konfigurationssiden)?', yes: 'i2', no: 'off3f' },
  i2: { fix: 'Tilføj printeren med IP-adressen', steps: ['Windows: Indstillinger → Printere og scannere → Tilføj enhed → Tilføj manuelt → “Tilføj en printer ved hjælp af en IP-adresse”.', 'Mac: Printere og scannere → Tilføj printer (+) → fanen IP → protokol IPP eller AirPrint.', 'Vælg producentens driver til modellen, eller den Windows foreslår.'], guide: 'printer-install', next: 'i3' },
  i3: { fix: 'Fjern gamle drivere og prøv igen', steps: ['Fjern printeren.', 'Fjern driverpakken i Egenskaber for printerserver → Drivere.', 'Genstart, og installér med den nyeste driver fra producenten.'], code: 'printui /s /t2', guide: 'printer-drivers', next: ESCALATE },

  // ── scan ──
  s1: { q: 'Er det “scan til e-mail”?', yes: 's2', no: 's3' },
  s2: { fix: 'Tjek mailserveren i printeren', steps: ['Åbn printerens webside (skriv IP-adressen i en browser), og log ind som administrator.', 'Tjek SMTP-server og port (typisk 587 med STARTTLS).', 'Brug en app-adgangskode, hvis kontoen har totrinsbekræftelse – og opdater den, hvis kodeordet er skiftet.', 'Send en testmail.'], guide: 'printer-scan', next: ESCALATE },
  s3: { fix: 'Tjek netværksmappen', steps: ['Tjek at mappen stadig er delt, og at brugeren har skriveadgang.', 'Er brugerens adgangskode skiftet? Opdater den i printeren.', 'Har PC’en fået nyt navn eller ny IP? Ret stien (\\\\PC-NAVN\\Mappe).', 'Kan printeren kun SMB1, så opdater firmwaren, så den kan SMB2/3.'], guide: 'printer-scan', next: ESCALATE },

  // ── mobile ──
  m1: { q: 'Er telefonen og printeren på samme Wi-Fi (ikke et gæstenetværk)?', yes: 'm2', no: 'm1f' },
  m1f: { fix: 'Kom på samme netværk', steps: ['Forbind telefonen til det samme netværk som printeren.', 'Gæstenetværk blokerer ofte for printere – brug det almindelige netværk.'], next: 'm2' },
  m2: { fix: 'Brug den indbyggede udskrivning', steps: ['iPhone/iPad: Del → Udskriv (AirPrint). Printeren skal understøtte AirPrint.', 'Android: Del → Udskriv, eller slå standardudskrivning (Mopria) til under Indstillinger → Forbundne enheder → Udskrivning.', 'Virker det ikke: installer producentens printer-app.', 'Isolerer routeren trådløse enheder fra hinanden (“AP isolation”), så slå det fra.'], guide: 'printer-mobile', next: ESCALATE },
};

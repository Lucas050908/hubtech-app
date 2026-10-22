/**
 * Quizbrættet – the built-in categories. Each has five questions from easy (100) to hard (500):
 * q = question, a = the right answer, w = three wrong answers (used when you answer by choosing).
 */
export const QB_CATEGORIES = [
  { id: 'computer', name: 'Computere', qs: [
    { q: 'Hvad står CPU for?', a: 'Central Processing Unit', w: ['Computer Power Unit', 'Central Program Utility', 'Core Processing Uplink'] },
    { q: 'Hvor mange bit er der i en byte?', a: '8', w: ['4', '10', '16'] },
    { q: 'Hvilken slags lager mister sit indhold, når strømmen slås fra?', a: 'RAM', w: ['SSD', 'Harddisk', 'USB-nøgle'] },
    { q: 'Hvad er det binære tal 1010 i titalssystemet?', a: '10', w: ['8', '12', '5'] },
    { q: 'Hvilket firma udviklede oprindeligt programmeringssproget Java?', a: 'Sun Microsystems', w: ['Microsoft', 'IBM', 'Apple'] },
  ] },
  { id: 'net', name: 'Internet og sikkerhed', qs: [
    { q: 'Hvad står “www” for?', a: 'World Wide Web', w: ['World Wide Wire', 'Web Wide World', 'Wide World Web'] },
    { q: 'Hvad kalder man en falsk mail, der prøver at lokke dit kodeord ud af dig?', a: 'Phishing', w: ['Firewall', 'Cookie', 'Backup'] },
    { q: 'Hvad oversætter domænenavne til IP-adresser?', a: 'DNS', w: ['DHCP', 'HTTP', 'VPN'] },
    { q: 'Hvad betyder “s” i https?', a: 'Forbindelsen er krypteret', w: ['Siden er svensk', 'Siden er ekstra hurtig', 'Siden har lyd'] },
    { q: 'Hvor mange bit er en IPv4-adresse på?', a: '32', w: ['16', '64', '128'] },
  ] },
  { id: 'elektronik', name: 'Elektronik', qs: [
    { q: 'Hvilken enhed måler man elektrisk modstand i?', a: 'Ohm', w: ['Volt', 'Ampere', 'Watt'] },
    { q: 'Hvad hedder komponenten, der kun lader strømmen løbe én vej?', a: 'Diode', w: ['Modstand', 'Kondensator', 'Spole'] },
    { q: 'Der ligger 12 V over en modstand på 4 Ω. Hvor stor er strømmen?', a: '3 A', w: ['48 A', '0,33 A', '16 A'] },
    { q: 'Hvad står LED for?', a: 'Light Emitting Diode', w: ['Low Energy Device', 'Light Energy Display', 'Laser Emitting Diode'] },
    { q: 'Hvad sker der med den samlede modstand, når to ens modstande sættes parallelt?', a: 'Den halveres', w: ['Den fordobles', 'Den er uændret', 'Den bliver nul'] },
  ] },
  { id: 'danmark', name: 'Danmark', qs: [
    { q: 'Hvad er Danmarks hovedstad?', a: 'København', w: ['Aarhus', 'Odense', 'Roskilde'] },
    { q: 'Hvor mange regioner er Danmark delt i?', a: '5', w: ['3', '7', '14'] },
    { q: 'Hvilken bro forbinder Sjælland og Fyn?', a: 'Storebæltsbroen', w: ['Øresundsbroen', 'Lillebæltsbroen', 'Farøbroerne'] },
    { q: 'Hvad hedder Danmarks højeste naturlige punkt?', a: 'Møllehøj', w: ['Himmelbjerget', 'Ejer Bavnehøj', 'Rytterknægten'] },
    { q: 'Hvilket år fik Danmark sin første grundlov?', a: '1849', w: ['1814', '1864', '1915'] },
  ] },
  { id: 'natur', name: 'Natur og rummet', qs: [
    { q: 'Hvilken planet er nærmest Solen?', a: 'Merkur', w: ['Venus', 'Mars', 'Jorden'] },
    { q: 'Ved hvor mange grader fryser rent vand til is (ved normalt tryk)?', a: '0 °C', w: ['−10 °C', '4 °C', '32 °C'] },
    { q: 'Hvilken gas optager planterne fra luften, når de laver fotosyntese?', a: 'Kuldioxid (CO₂)', w: ['Ilt', 'Kvælstof', 'Helium'] },
    { q: 'Hvad er den største planet i solsystemet?', a: 'Jupiter', w: ['Saturn', 'Neptun', 'Uranus'] },
    { q: 'Hvor lang tid tager det cirka for lyset fra Solen at nå Jorden?', a: 'Ca. 8 minutter', w: ['Ca. 8 sekunder', 'Ca. 1 time', 'Ca. 1 døgn'] },
  ] },
  { id: 'sport', name: 'Sport og spil', qs: [
    { q: 'Hvor mange spillere har et fodboldhold på banen ad gangen?', a: '11', w: ['9', '10', '12'] },
    { q: 'Hvor mange felter er der på et skakbræt?', a: '64', w: ['49', '81', '100'] },
    { q: 'Hvor mange point giver en Yatzy (fem ens) i den danske udgave?', a: '50', w: ['25', '30', '100'] },
    { q: 'Hvilken skakbrik kan kun gå på skrå?', a: 'Løberen', w: ['Tårnet', 'Springeren', 'Kongen'] },
    { q: 'Hvor langt er et maratonløb?', a: '42,195 km', w: ['40 km', '42 km', '45,5 km'] },
  ] },
  { id: 'historie', name: 'Historie', qs: [
    { q: 'Hvilket folk sejlede i langskibe og plyndrede langs kysterne i 800-tallet?', a: 'Vikingerne', w: ['Romerne', 'Grækerne', 'Mongolerne'] },
    { q: 'Hvem fik i 1876 patent på telefonen?', a: 'Alexander Graham Bell', w: ['Thomas Edison', 'Nikola Tesla', 'Guglielmo Marconi'] },
    { q: 'Hvilket år landede de første mennesker på Månen?', a: '1969', w: ['1959', '1965', '1972'] },
    { q: 'Hvilken dag i 1945 trådte befrielsen af Danmark i kraft?', a: '5. maj', w: ['9. april', '8. maj', '1. maj'] },
    { q: 'Hvad hed den store elektroniske computer, der blev færdig i USA i 1945?', a: 'ENIAC', w: ['UNIVAC', 'IBM PC', 'Apple I'] },
  ] },
  { id: 'matematik', name: 'Matematik', qs: [
    { q: 'Hvad er 7 · 8?', a: '56', w: ['54', '48', '64'] },
    { q: 'Hvor mange grader er der i en ret vinkel?', a: '90°', w: ['45°', '180°', '360°'] },
    { q: 'Hvad er kvadratroden af 144?', a: '12', w: ['14', '11', '72'] },
    { q: 'Hvad er 15 % af 200?', a: '30', w: ['15', '20', '35'] },
    { q: 'Hvilket primtal kommer lige efter 13?', a: '17', w: ['15', '16', '19'] },
  ] },
];

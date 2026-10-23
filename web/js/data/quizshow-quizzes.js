/** Ready-made quizzes for Quizshow (original questions). correct = index (or list of indexes) of the right options. */
const Q = (q, options, correct, time = 20) => ({ q, options, correct, time });

export const SAMPLE_QUIZZES = [
  { id: 'danmark', title: 'Hvor godt kender du Danmark?', questions: [
    Q('Hvad er Danmarks største ø?', ['Fyn', 'Sjælland', 'Lolland', 'Bornholm'], 1),
    Q('Hvilken by ligger længst mod nord?', ['Aalborg', 'Aarhus', 'Skagen', 'Frederikshavn'], 2),
    Q('Hvor mange regioner er Danmark delt i?', ['3', '5', '7', '14'], 1),
    Q('Hvad hedder Danmarks højeste naturlige punkt?', ['Himmelbjerget', 'Møllehøj', 'Ejer Bavnehøj', 'Rytterknægten'], 1),
    Q('Hvilket hav ligger vest for Jylland?', ['Østersøen', 'Nordsøen', 'Kattegat', 'Skagerrak'], 1),
    Q('Hvad er hovedstaden på Færøerne?', ['Tórshavn', 'Nuuk', 'Klaksvík', 'Rønne'], 0),
    Q('Hvornår fik Danmark sin første grundlov?', ['1660', '1814', '1849', '1915'], 2),
    Q('Hvilken bro forbinder Fyn og Sjælland?', ['Øresundsbroen', 'Storebæltsbroen', 'Lillebæltsbroen', 'Farøbroerne'], 1),
  ] },
  { id: 'natur', title: 'Natur og naturvidenskab', questions: [
    Q('Hvilken planet er tættest på Solen?', ['Venus', 'Mars', 'Merkur', 'Jorden'], 2),
    Q('Hvad er H₂O?', ['Brint', 'Vand', 'Salt', 'Ilt'], 1),
    Q('Hvor mange ben har en edderkop?', ['6', '8', '10', '12'], 1),
    Q('Hvad kalder man det, når planter laver sukker af sollys?', ['Fotosyntese', 'Fordøjelse', 'Fordampning', 'Gæring'], 0),
    Q('Ved hvor mange grader koger vand (ved havets overflade)?', ['90 °C', '100 °C', '110 °C', '120 °C'], 1),
    Q('Hvilket dyr er et pattedyr?', ['Haj', 'Hval', 'Pingvin', 'Krokodille'], 1),
    Q('Hvilke af disse er gasser ved stuetemperatur? (vælg alle rigtige)', ['Ilt', 'Jern', 'Kuldioxid', 'Kobber'], [0, 2], 30),
    Q('Hvad er det hårdeste naturlige stof?', ['Guld', 'Diamant', 'Granit', 'Stål'], 1),
  ] },
  { id: 'it', title: 'Computere og internettet', questions: [
    Q('Hvad står "CPU" for?', ['Central Processing Unit', 'Computer Power Unit', 'Central Program Utility', 'Core Print Unit'], 0),
    Q('Hvor mange bit er der i en byte?', ['4', '8', '16', '32'], 1),
    Q('Hvilket af disse er det stærkeste kodeord?', ['123456', 'kodeord', 'Hund2010', 'Blå-Cykel-Spiser-Sne!7'], 3),
    Q('Hvad betyder det, når en hjemmeside starter med https?', ['Den er gratis', 'Forbindelsen er krypteret', 'Den er dansk', 'Den er hurtig'], 1),
    Q('Hvad er en IP-adresse?', ['En e-mailadresse', 'En adresse til en enhed på et netværk', 'Et kodeord', 'Et program'], 1),
    Q('Hvilket tal er 1010 i det binære talsystem?', ['8', '10', '12', '1010'], 1),
    Q('Hvad skal du gøre, hvis du får en mail om, at du har vundet en præmie og skal klikke på et link?', ['Klikke hurtigt', 'Sende den videre', 'Være mistænksom – det er nok svindel', 'Svare med dit kodeord'], 2),
    Q('Hvad gør RAM i en computer?', ['Gemmer filer for altid', 'Husker det, computeren arbejder med lige nu', 'Køler computeren', 'Viser billedet'], 1),
  ] },
];

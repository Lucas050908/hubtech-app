/** Tidslinjen – events with their year (negative = before Christ). "ca." marks the ones where the year is approximate. */
export const EVENTS = [
  [-2560, 'Den store pyramide i Giza bygges', true], [-776, 'De første olympiske lege i Grækenland'], [-44, 'Julius Cæsar bliver dræbt'],
  [793, 'Vikinger angriber klostret Lindisfarne'], [965, 'Harald Blåtand lader sig døbe', true], [1066, 'Slaget ved Hastings'], [1397, 'Kalmarunionen dannes'],
  [1450, 'Gutenberg udvikler trykpressen', true], [1492, 'Columbus når Amerika'], [1522, 'Den første rejse jorden rundt afsluttes'], [1536, 'Reformationen i Danmark'],
  [1543, 'Kopernikus skriver, at Jorden kredser om Solen'], [1610, 'Galilei ser Jupiters måner i sin kikkert'], [1660, 'Enevælden indføres i Danmark'],
  [1687, 'Newton udgiver sine love om bevægelse og tyngdekraft'], [1769, 'James Watt får patent på sin forbedrede dampmaskine'], [1776, 'USA erklærer sig uafhængigt'],
  [1789, 'Den franske revolution begynder'], [1796, 'Edward Jenner giver den første vaccine'], [1801, 'Slaget på Reden'], [1814, 'Danmark mister Norge ved freden i Kiel'],
  [1825, 'Verdens første offentlige jernbane med damplokomotiv åbner i England'], [1835, 'H.C. Andersens første eventyr udkommer'], [1847, 'Danmarks første jernbane: København–Roskilde'],
  [1849, 'Danmark får sin første grundlov'], [1859, 'Darwin udgiver bogen om arternes oprindelse'], [1863, 'Verdens første undergrundsbane åbner i London'], [1864, 'Slaget ved Dybbøl'],
  [1869, 'Mendelejev laver det periodiske system'], [1876, 'Telefonen patenteres'], [1879, 'Edison viser sin glødepære'], [1886, 'Den første bil med benzinmotor kører'],
  [1895, 'Røntgenstrålerne opdages'], [1896, 'De første moderne olympiske lege holdes i Athen'], [1903, 'Brødrene Wright flyver for første gang'], [1905, 'Einstein offentliggør sin relativitetsteori'],
  [1911, 'Roald Amundsen når Sydpolen'], [1912, 'Titanic synker'], [1914, 'Første verdenskrig begynder'], [1915, 'Kvinder får stemmeret i Danmark'], [1920, 'Genforeningen med Sønderjylland'],
  [1926, 'Fjernsyn vises frem for første gang'], [1927, 'Lindbergh flyver alene over Atlanten'], [1928, 'Fleming opdager penicillin'], [1939, 'Anden verdenskrig begynder'],
  [1940, 'Tyskland besætter Danmark'], [1945, 'Danmark bliver befriet'], [1947, 'Transistoren opfindes'], [1953, 'DNA\'s dobbeltspiral bliver beskrevet'],
  [1957, 'Sputnik 1 – den første satellit i kredsløb'], [1961, 'Juri Gagarin bliver det første menneske i rummet'], [1969, 'De første mennesker går på Månen'],
  [1971, 'Den første e-mail sendes'], [1973, 'Danmark bliver medlem af EF'], [1977, 'Rumsonden Voyager 1 sendes af sted'], [1983, 'Internettet går over til TCP/IP'],
  [1986, 'Ulykken på atomkraftværket i Tjernobyl'], [1989, 'Berlinmuren falder'], [1990, 'Hubble-rumteleskopet sendes op'], [1991, 'World Wide Web bliver åbent for alle'],
  [1992, 'Den første sms sendes'], [1997, 'Fåret Dolly – det første klonede pattedyr – vises frem'], [1998, 'Storebæltsbroen åbner for biler'], [2000, 'Øresundsbroen åbner'],
  [2012, 'Robotten Curiosity lander på Mars'], [2020, 'Coronapandemien lukker store dele af Danmark ned'],
];
export const yearText = (y, approx) => `${approx ? 'ca. ' : ''}${y < 0 ? `${-y} f.Kr.` : y}`;
/** is the card placed right? i = index in the sorted timeline where it is put (before cards[i]) */
export function fits(cards, year, i) {
  const before = cards[i - 1], after = cards[i];
  return (!before || before[0] <= year) && (!after || year <= after[0]);
}

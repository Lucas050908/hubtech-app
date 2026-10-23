/** The 118 elements: symbol, Danish name, standard atomic weight (rounded; mass number of the most stable isotope in brackets for the unstable ones). */
const RAW = `H Brint 1.008|He Helium 4.003|Li Lithium 6.94|Be Beryllium 9.012|B Bor 10.81|C Kulstof 12.011|N Kvælstof 14.007|O Ilt 15.999|F Fluor 18.998|Ne Neon 20.180|
Na Natrium 22.990|Mg Magnesium 24.305|Al Aluminium 26.982|Si Silicium 28.085|P Fosfor 30.974|S Svovl 32.06|Cl Klor 35.45|Ar Argon 39.95|K Kalium 39.098|Ca Calcium 40.078|
Sc Scandium 44.956|Ti Titan 47.867|V Vanadium 50.942|Cr Krom 51.996|Mn Mangan 54.938|Fe Jern 55.845|Co Kobolt 58.933|Ni Nikkel 58.693|Cu Kobber 63.546|Zn Zink 65.38|
Ga Gallium 69.723|Ge Germanium 72.630|As Arsen 74.922|Se Selen 78.971|Br Brom 79.904|Kr Krypton 83.798|Rb Rubidium 85.468|Sr Strontium 87.62|Y Yttrium 88.906|Zr Zirconium 91.224|
Nb Niobium 92.906|Mo Molybdæn 95.95|Tc Technetium [98]|Ru Ruthenium 101.07|Rh Rhodium 102.91|Pd Palladium 106.42|Ag Sølv 107.87|Cd Cadmium 112.41|In Indium 114.82|Sn Tin 118.71|
Sb Antimon 121.76|Te Tellur 127.60|I Jod 126.90|Xe Xenon 131.29|Cs Cæsium 132.91|Ba Barium 137.33|La Lanthan 138.91|Ce Cerium 140.12|Pr Praseodym 140.91|Nd Neodym 144.24|
Pm Promethium [145]|Sm Samarium 150.36|Eu Europium 151.96|Gd Gadolinium 157.25|Tb Terbium 158.93|Dy Dysprosium 162.50|Ho Holmium 164.93|Er Erbium 167.26|Tm Thulium 168.93|Yb Ytterbium 173.05|
Lu Lutetium 174.97|Hf Hafnium 178.49|Ta Tantal 180.95|W Wolfram 183.84|Re Rhenium 186.21|Os Osmium 190.23|Ir Iridium 192.22|Pt Platin 195.08|Au Guld 196.97|Hg Kviksølv 200.59|
Tl Thallium 204.38|Pb Bly 207.2|Bi Bismuth 208.98|Po Polonium [209]|At Astat [210]|Rn Radon [222]|Fr Francium [223]|Ra Radium [226]|Ac Actinium [227]|Th Thorium 232.04|
Pa Protactinium 231.04|U Uran 238.03|Np Neptunium [237]|Pu Plutonium [244]|Am Americium [243]|Cm Curium [247]|Bk Berkelium [247]|Cf Californium [251]|Es Einsteinium [252]|Fm Fermium [257]|
Md Mendelevium [258]|No Nobelium [259]|Lr Lawrencium [266]|Rf Rutherfordium [267]|Db Dubnium [268]|Sg Seaborgium [269]|Bh Bohrium [270]|Hs Hassium [269]|Mt Meitnerium [278]|Ds Darmstadtium [281]|
Rg Røntgenium [282]|Cn Copernicium [285]|Nh Nihonium [286]|Fl Flerovium [289]|Mc Moscovium [290]|Lv Livermorium [293]|Ts Tennessin [294]|Og Oganesson [294]`;

export const CATS = {
  alkali: 'Alkalimetal', alkaline: 'Jordalkalimetal', transition: 'Overgangsmetal', post: 'Andet metal', metalloid: 'Halvmetal',
  nonmetal: 'Ikke-metal', halogen: 'Halogen', noble: 'Ædelgas', lanthanide: 'Lanthanid', actinide: 'Actinid',
};
const SETS = {
  alkali: [3, 11, 19, 37, 55, 87], alkaline: [4, 12, 20, 38, 56, 88], metalloid: [5, 14, 32, 33, 51, 52], nonmetal: [1, 6, 7, 8, 15, 16, 34],
  halogen: [9, 17, 35, 53, 85, 117], noble: [2, 10, 18, 36, 54, 86, 118], post: [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116],
};
const GAS = new Set([1, 2, 7, 8, 9, 10, 17, 18, 36, 54, 86]), LIQUID = new Set([35, 80]);

/** where the element sits: [row 1–10, column 1–18]; rows 9 and 10 are the lanthanides and actinides */
export function position(z) {
  if (z === 1) return [1, 1];
  if (z === 2) return [1, 18];
  const starts = [[3, 2], [11, 3], [19, 4], [37, 5], [55, 6], [87, 7]];
  let period = 7, start = 87;
  for (const [s, p] of starts) if (z >= s) { period = p; start = s; }
  const k = z - start;
  if (period <= 3) return [period, k < 2 ? k + 1 : k + 11];
  if (period <= 5) return [period, k + 1];
  if (k < 2) return [period, k + 1];
  if (k <= 16) return [period + 3, k + 1];                // f-block: La–Lu / Ac–Lr under the table
  return [period, k - 13];
}
export const ELEMENTS = RAW.replace(/\n/g, '').split('|').map((row, i) => {
  const [sym, name, w] = row.trim().split(' ');
  const z = i + 1, [r, c] = position(z);
  let cat = Object.entries(SETS).find(([, list]) => list.includes(z))?.[0];
  if (!cat) cat = z >= 57 && z <= 71 ? 'lanthanide' : z >= 89 && z <= 103 ? 'actinide' : 'transition';
  return { z, sym, name, mass: w, row: r, col: c, cat, period: r > 7 ? r - 3 : r, group: r > 7 ? null : c,
    state: z > 100 ? 'ukendt' : GAS.has(z) ? 'gas' : LIQUID.has(z) ? 'væske' : 'fast stof' };
});

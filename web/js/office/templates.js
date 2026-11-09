/** Starter templates for HUBTECH Office. */
import { blankSheet } from './sheet.js';
import { newSlide } from './slides.js';

const today = () => new Date().toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
const sheetOf = (name, rows, fmt = {}, bold = [], widths = {}) => {
  const s = blankSheet(name);
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (v === '' || v == null) return;
    const id = `${String.fromCharCode(65 + c)}${r + 1}`;
    s.cells[id] = { v: String(v) };
    const st = {};
    if (bold.includes(r)) st.b = true;
    if (fmt[String.fromCharCode(65 + c)] && r > 0) st.fmt = fmt[String.fromCharCode(65 + c)];
    if (Object.keys(st).length) s.cells[id].s = st;
  }));
  s.colW = widths;
  return s;
};

export const TEMPLATES = {
  doc: [
    { id: 'blank', name: 'Tomt dokument', title: 'Unavngivet dokument', make: () => ({ html: '<p><br></p>' }) },
    { id: 'meeting', name: 'Mødereferat', title: 'Mødereferat', make: () => ({ html: `<h1>Mødereferat</h1><p><b>Dato:</b> ${today()}<br><b>Sted:</b> <br><b>Deltagere:</b> </p><h2>Dagsorden</h2><ol><li>Velkommen og status</li><li>Punkt 2</li><li>Eventuelt</li></ol><h2>Beslutninger</h2><ul><li><br></li></ul><h2>Opgaver</h2><ul data-check="1"><li><input type="checkbox"> Opgave – ansvarlig – deadline</li><li><input type="checkbox"> </li></ul><h2>Næste møde</h2><p><br></p>` }) },
    { id: 'letter', name: 'Brev', title: 'Brev', make: () => ({ html: `<p>Dit navn<br>Adresse<br>Postnr. og by</p><p style="text-align: right">${today()}</p><p>Modtager<br>Adresse<br>Postnr. og by</p><h2>Emne</h2><p>Kære …</p><p><br></p><p>Med venlig hilsen</p><p><br></p><p>Dit navn</p>` }) },
    { id: 'report', name: 'Projektrapport', title: 'Projektrapport', make: () => ({ html: `<h1>Projektrapport</h1><p><i>${today()}</i></p><h2>Formål</h2><p>Hvad skal projektet løse?</p><h2>Baggrund</h2><p><br></p><h2>Fremgangsmåde</h2><ol><li>Første trin</li><li>Andet trin</li></ol><h2>Resultater</h2><table><tbody><tr><th>Måling</th><th>Forventet</th><th>Resultat</th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><h2>Konklusion</h2><p><br></p>` }) },
  ],
  sheet: [
    { id: 'blank', name: 'Tomt regneark', title: 'Unavngivet regneark', make: () => ({ sheets: [blankSheet()], active: 0 }) },
    { id: 'budget', name: 'Månedsbudget', title: 'Månedsbudget', make: () => ({ active: 0, sheets: [sheetOf('Budget', [
      ['Månedsbudget', '', ''], ['', 'Beløb', 'Note'],
      ['Indtægter', '', ''], ['Løn efter skat', '18500', ''], ['Andet', '0', ''], ['Indtægter i alt', '=SUM(B4:B5)', ''],
      ['', '', ''], ['Udgifter', '', ''], ['Husleje', '6500', ''], ['Mad', '3000', ''], ['Transport', '900', ''], ['Abonnementer', '450', 'Mobil, streaming'], ['Forsikring', '600', ''], ['Opsparing', '2000', ''], ['Udgifter i alt', '=SUM(B9:B14)', ''],
      ['', '', ''], ['Til overs', '=B6-B15', ''], ['Opsparingsgrad', '=B14/B4', ''],
    ], { B: 'kr' }, [0, 1, 2, 5, 7, 14, 16], { A: 170, B: 130, C: 180 })] }), post: (d) => { d.sheets[0].cells.B18.s = { fmt: 'pct', b: true }; } },
    { id: 'hours', name: 'Timeregistrering', title: 'Timeregistrering', make: () => ({ active: 0, sheets: [sheetOf('Timer', [
      ['Dato', 'Projekt / kunde', 'Timer', 'Sats', 'Beløb'],
      [new Date().toLocaleDateString('da-DK'), 'Service – Jensen A/S', '2,5', '450', '=C2*D2'],
      ['', '', '', '450', '=C3*D3'], ['', '', '', '450', '=C4*D4'], ['', '', '', '450', '=C5*D5'],
      ['I alt', '', '=SUM(C2:C5)', '', '=SUM(E2:E5)'],
    ], { D: 'kr', E: 'kr' }, [0, 5], { A: 110, B: 210, C: 80, D: 100, E: 120 })] }) },
    { id: 'parts', name: 'Komponentliste', title: 'Komponentliste', make: () => ({ active: 0, sheets: [sheetOf('Komponenter', [
      ['Komponent', 'Antal', 'Pris pr. stk', 'I alt', 'Leverandør'],
      ['Modstand 4k7', '20', '0,15', '=B2*C2', ''], ['LED rød 5 mm', '10', '0,8', '=B3*C3', ''], ['Raspberry Pi CM5', '1', '650', '=B4*C4', ''], ['', '', '', '=B5*C5', ''],
      ['Total', '=SUM(B2:B5)', '', '=SUM(D2:D5)', ''],
    ], { C: 'kr', D: 'kr' }, [0, 5], { A: 190, B: 80, C: 110, D: 110, E: 150 })] }) },
  ],
  slides: [
    { id: 'blank', name: 'Tom præsentation', title: 'Unavngivet præsentation', make: () => ({ theme: 'hubtech', slides: [newSlide('title', 'Titel på præsentationen', 'Undertitel')] }) },
    { id: 'project', name: 'Projektoplæg', title: 'Projektoplæg', make: () => ({ theme: 'landscape', slides: [
      newSlide('title', 'Mit projekt', `Fremlagt af … · ${today()}`),
      newSlide('content', 'Formål', '<ul><li>Hvilket problem løser vi?</li><li>Hvem er det til?</li><li>Hvordan måler vi succes?</li></ul>'),
      { ...newSlide('two', 'Plan', '<ul><li>Uge 1: Research</li><li>Uge 2: Prototype</li></ul>'), body2: '<ul><li>Uge 3: Test</li><li>Uge 4: Aflevering</li></ul>' },
      newSlide('image', 'Prototypen', '<ul><li>Hvad virker</li><li>Hvad skal forbedres</li></ul>'),
      newSlide('section', 'Tak!', 'Spørgsmål?'),
    ] }) },
    { id: 'lesson', name: 'Undervisning', title: 'Undervisning', make: () => ({ theme: 'light', slides: [
      newSlide('title', 'Emne for timen', 'Klasse · dato'),
      newSlide('content', 'Dagens mål', '<ol><li>Forstå …</li><li>Kunne …</li><li>Afprøve …</li></ol>'),
      newSlide('content', 'Opgave', '<ul><li>Arbejd sammen to og to</li><li>15 minutter</li></ul>'),
      newSlide('section', 'Opsamling', 'Hvad lærte vi?'),
    ] }) },
  ],
};

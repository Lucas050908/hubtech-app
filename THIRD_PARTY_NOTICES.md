# Tredjepartskomponenter

HUBTECH har ingen afhængigheder på serveren ud over Pythons standardbibliotek. Disse biblioteker ligger lokalt i
`web/vendor/` (og `web/apps/servicehelp/vendor/`, `web/fonts/`, `tests/vendor/`) med deres egne licenser:

| Komponent | Bruges til | Licens | Licensfil |
|---|---|---|---|
| wllama (llama.cpp i WebAssembly) | Den lokale AI-assistent | MIT | `web/vendor/wllama/LICENSE-wllama.txt` |
| Pyodide | Python i Kodeskolen | MPL-2.0 | `web/vendor/pyodide/LICENSE.txt` |
| sql.js (SQLite) | SQL i Kodeskolen | MIT | `web/vendor/sqljs/` |
| SheetJS (xlsx) | Excel ind og ud | Apache-2.0 | `web/vendor/LICENSE-sheetjs.txt` |
| jsPDF | PDF (kalender, noter, fakturaer, Servicehjælp) | MIT | `web/vendor/LICENSE-jspdf.txt` |
| JSZip | Word/PowerPoint-filer | MIT / GPLv3 (dobbelt) – bruges under MIT | `web/vendor/LICENSE-jszip.txt` |
| mammoth.js | Åbn .docx | BSD-2-Clause | `web/vendor/LICENSE-mammoth.txt` |
| PptxGenJS | Gem som .pptx | MIT | `web/vendor/LICENSE-pptxgenjs.txt` |
| qrcode-generator | QR-koder | MIT | `web/vendor/LICENSE-qrcode-generator.txt` |
| ZXing (zxing-js) | Stregkode- og QR-scanner | Apache-2.0 | `web/vendor/LICENSE-zxing.txt` |
| Sora, Manrope, JetBrains Mono | Skrifttyper | SIL OFL 1.1 | `web/fonts/LICENSE-*.txt` |
| axe-core | Tilgængelighedstest (kun tests) | MPL-2.0 | `tests/vendor/LICENSE-axe-core.txt` |
| Chaquopy | Python i Android-appen (hentes af Gradle) | MIT | – |

**Sprogmodeller** følger ikke med. Assistenten henter dem fra Hugging Face, når brugeren vælger det:
Qwen 2.5 (Apache-2.0) og Llama 3.2 (Llama 3.2 Community License – kræver bl.a. “Built with Llama”, og visse
brugsformer er forbudt). Brugeren kan også vælge sin egen `.gguf`-fil.

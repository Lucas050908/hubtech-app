/**
 * Kommandoer – the commands an IT supporter uses most, with a plain explanation.
 * os: win (cmd / PowerShell), mac, linux. admin: needs an administrator / sudo.
 */
export const CMD_GROUPS = [
  { id: 'net', label: 'Netværk', icon: 'globe' },
  { id: 'printer', label: 'Printer', icon: 'printer' },
  { id: 'repair', label: 'Reparation', icon: 'tool' },
  { id: 'info', label: 'Systeminfo', icon: 'info' },
  { id: 'disk', label: 'Diske og filer', icon: 'database' },
  { id: 'users', label: 'Brugere og adgang', icon: 'users' },
  { id: 'power', label: 'Strøm og genstart', icon: 'power' },
];

export const COMMANDS = [
  // ── network ──
  { g: 'net', os: 'win', cmd: 'ipconfig /all', d: 'Viser IP-adresse, gateway, DNS og MAC-adresse for alle netværkskort.' },
  { g: 'net', os: 'win', cmd: 'ipconfig /release\nipconfig /renew', d: 'Slipper og henter en ny IP-adresse fra routeren (DHCP).' },
  { g: 'net', os: 'win', cmd: 'ipconfig /flushdns', d: 'Tømmer DNS-cachen – hjælper, når en hjemmeside er flyttet eller ikke vil åbne.' },
  { g: 'net', os: 'any', cmd: 'ping 8.8.8.8', d: 'Er der forbindelse til internettet? Svarer den, virker forbindelsen (Ctrl+C stopper på Mac/Linux).' },
  { g: 'net', os: 'any', cmd: 'ping google.com', d: 'Virker navneopslag (DNS)? Virker ping 8.8.8.8 men ikke dette, er det DNS, der fejler.' },
  { g: 'net', os: 'win', cmd: 'tracert google.com', d: 'Viser vejen pakkerne tager – hvor stopper forbindelsen?' },
  { g: 'net', os: 'unix', cmd: 'traceroute google.com', d: 'Viser vejen pakkerne tager (Mac og Linux).' },
  { g: 'net', os: 'win', cmd: 'nslookup google.com', d: 'Slår et navn op i DNS og viser, hvilken DNS-server der svarer.' },
  { g: 'net', os: 'win', cmd: 'netstat -ano', d: 'Viser åbne forbindelser og porte med proces-id (PID).' },
  { g: 'net', os: 'win', cmd: 'Test-NetConnection 192.168.1.50 -Port 9100', d: 'PowerShell: svarer en bestemt port? 9100 er printerens udskrivningsport, 443 er https.' },
  { g: 'net', os: 'win', cmd: 'netsh wlan show profiles', d: 'Viser de Wi-Fi-netværk, computeren har gemt.' },
  { g: 'net', os: 'win', cmd: 'netsh wlan show profile name="NETVÆRK" key=clear', d: 'Viser den gemte Wi-Fi-kode for et netværk (under “Nøgleindhold”).', admin: true },
  { g: 'net', os: 'win', cmd: 'netsh int ip reset\nnetsh winsock reset', d: 'Nulstiller netværksindstillingerne. Kræver genstart bagefter.', admin: true },
  { g: 'net', os: 'win', cmd: 'arp -a', d: 'Viser enheder på det lokale netværk, som computeren har talt med (IP og MAC).' },
  { g: 'net', os: 'mac', cmd: 'ifconfig', d: 'Viser netværkskort og IP-adresser på Mac.' },
  { g: 'net', os: 'linux', cmd: 'ip a', d: 'Viser netværkskort og IP-adresser på Linux.' },
  { g: 'net', os: 'mac', cmd: 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder', d: 'Tømmer DNS-cachen på Mac.', admin: true },

  // ── printer ──
  { g: 'printer', os: 'win', cmd: 'net stop spooler\ndel /Q /F /S "%systemroot%\\System32\\spool\\PRINTERS\\*"\nnet start spooler', d: 'Rydder en fastlåst udskriftskø. Sletter alle ventende udskrifter.', admin: true },
  { g: 'printer', os: 'win', cmd: 'printui /s /t2', d: 'Åbner Egenskaber for printerserver på fanen Drivere – her fjernes gamle printerdrivere.', admin: true },
  { g: 'printer', os: 'win', cmd: 'control printers', d: 'Åbner det klassiske vindue Enheder og printere.' },
  { g: 'printer', os: 'win', cmd: 'Get-Printer', d: 'PowerShell: viser installerede printere og deres porte.' },
  { g: 'printer', os: 'win', cmd: 'Get-PrintJob -PrinterName "Navn"', d: 'PowerShell: viser job i køen for en printer.' },
  { g: 'printer', os: 'win', cmd: 'Add-PrinterPort -Name "IP_192.168.1.50" -PrinterHostAddress "192.168.1.50"', d: 'PowerShell: opretter en TCP/IP-port til en netværksprinter.', admin: true },
  { g: 'printer', os: 'unix', cmd: 'lpstat -p -d', d: 'Viser printere og standardprinteren (Mac og Linux).' },
  { g: 'printer', os: 'unix', cmd: 'cancel -a', d: 'Annullerer alle job i alle køer (Mac og Linux).' },
  { g: 'printer', os: 'unix', cmd: 'lpstat -o', d: 'Viser ventende udskrifter.' },

  // ── repair ──
  { g: 'repair', os: 'win', cmd: 'sfc /scannow', d: 'Tjekker og reparerer Windows’ systemfiler. Tager 5–15 minutter.', admin: true },
  { g: 'repair', os: 'win', cmd: 'DISM /Online /Cleanup-Image /RestoreHealth', d: 'Reparerer Windows-billedet, som sfc bruger. Kør den først, hvis sfc ikke kan reparere alt.', admin: true },
  { g: 'repair', os: 'win', cmd: 'chkdsk C: /f', d: 'Tjekker disken for fejl. Kører ved næste genstart, når det er systemdisken.', admin: true },
  { g: 'repair', os: 'win', cmd: 'wsreset', d: 'Nulstiller Microsoft Store, når den ikke vil åbne eller hente.' },
  { g: 'repair', os: 'win', cmd: 'gpupdate /force', d: 'Henter gruppepolitikker igen (på computere i et domæne).' },
  { g: 'repair', os: 'win', cmd: 'mdsched', d: 'Starter Windows’ hukommelsestest ved næste genstart.' },
  { g: 'repair', os: 'win', cmd: 'msconfig', d: 'Systemkonfiguration – fx fejlsikret tilstand ved næste start.' },
  { g: 'repair', os: 'mac', cmd: 'diskutil verifyVolume /', d: 'Tjekker startdisken på Mac (Diskværktøj → Førstehjælp gør det samme).' },

  // ── system info ──
  { g: 'info', os: 'win', cmd: 'systeminfo', d: 'Windows-version, installationsdato, hukommelse, seneste opstart og opdateringer.' },
  { g: 'info', os: 'win', cmd: 'winver', d: 'Viser Windows-versionen og build-nummer i et lille vindue.' },
  { g: 'info', os: 'win', cmd: 'msinfo32', d: 'Systemoplysninger: model, BIOS, hardware og drivere.' },
  { g: 'info', os: 'win', cmd: 'wmic bios get serialnumber', d: 'Viser computerens serienummer (bruges til garanti og drivere). På nyere Windows: Get-CimInstance Win32_BIOS.' },
  { g: 'info', os: 'win', cmd: 'Get-CimInstance Win32_BIOS | Select-Object SerialNumber', d: 'PowerShell: serienummeret på nyere Windows, hvor wmic er fjernet.' },
  { g: 'info', os: 'win', cmd: 'powercfg /batteryreport', d: 'Laver en rapport over batteriets slid (gemmes som HTML i den mappe, du står i).' },
  { g: 'info', os: 'win', cmd: 'devmgmt.msc', d: 'Åbner Enhedshåndtering – drivere og hardware med fejl (gult udråbstegn).' },
  { g: 'info', os: 'win', cmd: 'eventvwr.msc', d: 'Åbner Logbogen – fejl og advarsler fra Windows og programmer.' },
  { g: 'info', os: 'win', cmd: 'tasklist', d: 'Viser kørende processer (som Jobliste, bare i tekst).' },
  { g: 'info', os: 'mac', cmd: 'system_profiler SPHardwareDataType', d: 'Model, chip, hukommelse og serienummer på Mac.' },
  { g: 'info', os: 'mac', cmd: 'sw_vers', d: 'Viser macOS-versionen.' },
  { g: 'info', os: 'linux', cmd: 'uname -a', d: 'Kerne og systemversion på Linux.' },
  { g: 'info', os: 'linux', cmd: 'free -h', d: 'Hvor meget hukommelse er brugt og ledig (Linux).' },

  // ── disks ──
  { g: 'disk', os: 'win', cmd: 'cleanmgr', d: 'Diskoprydning – fjerner midlertidige filer og gamle opdateringer.' },
  { g: 'disk', os: 'win', cmd: 'diskmgmt.msc', d: 'Diskhåndtering – partitioner, drevbogstaver og nye diske.' },
  { g: 'disk', os: 'win', cmd: 'robocopy C:\\Kilde D:\\Backup /E /R:1 /W:1', d: 'Kopierer en mappe med undermapper – fortsætter, selvom enkelte filer driller. God til at flytte data.' },
  { g: 'disk', os: 'win', cmd: 'manage-bde -status', d: 'Viser om BitLocker er slået til på diskene.', admin: true },
  { g: 'disk', os: 'unix', cmd: 'df -h', d: 'Hvor meget plads er der på diskene (Mac og Linux).' },
  { g: 'disk', os: 'unix', cmd: 'du -sh *', d: 'Hvor meget fylder hver mappe her? (Mac og Linux)' },

  // ── users ──
  { g: 'users', os: 'win', cmd: 'whoami', d: 'Hvem er du logget ind som?' },
  { g: 'users', os: 'win', cmd: 'net user', d: 'Viser lokale brugere på computeren.' },
  { g: 'users', os: 'win', cmd: 'net localgroup administrators', d: 'Hvem er administrator på computeren?' },
  { g: 'users', os: 'win', cmd: 'lusrmgr.msc', d: 'Lokale brugere og grupper (ikke i Windows Home).' },
  { g: 'users', os: 'win', cmd: 'control userpasswords2', d: 'Brugerkonti – fx automatisk login eller tilføje en bruger.' },
  { g: 'users', os: 'linux', cmd: 'sudo passwd brugernavn', d: 'Sæt en ny adgangskode for en bruger (Linux).', admin: true },

  // ── power ──
  { g: 'power', os: 'win', cmd: 'shutdown /r /t 0', d: 'Genstart nu.' },
  { g: 'power', os: 'win', cmd: 'shutdown /s /t 0', d: 'Sluk nu.' },
  { g: 'power', os: 'win', cmd: 'shutdown /r /o /t 0', d: 'Genstart til avancerede startindstillinger (fejlsikret tilstand, gendannelse).' },
  { g: 'power', os: 'win', cmd: 'powercfg /h off', d: 'Slår dvaletilstand og hurtig start fra – frigør plads og løser nogle opstartsfejl.', admin: true },
  { g: 'power', os: 'unix', cmd: 'sudo shutdown -r now', d: 'Genstart Mac eller Linux nu.', admin: true },
];

export const OS_LABEL = { win: 'Windows', mac: 'Mac', linux: 'Linux', unix: 'Mac og Linux', any: 'Alle' };

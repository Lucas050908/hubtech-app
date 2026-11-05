# Linux-terminalen (web/vendor/linux)

En rigtig Linux, der kører i browseren på brugerens egen enhed, uden adgang til computeren eller netværket.

| Fil | Hvad | Licens | Kilde |
|---|---|---|---|
| `libv86.mjs`, `v86.wasm` | v86 0.5.472 – x86-emulator til WebAssembly | BSD-2-Clause (`LICENSE-v86.txt`) | npm `v86@0.5.472` |
| `seabios.bin` | SeaBIOS (v86's build, `bios/seabios-debug.bin`) | LGPL-3.0 (`LICENSE-bios-LGPL.txt`) | github.com/copy/v86 |
| `vgabios.bin` | Bochs VGA BIOS (`bios/bochs-vgabios.bin`) | LGPL (`LICENSE-bios-LGPL.txt`) | github.com/copy/v86 |
| `linux.bin` | Buildroot 2024.05.2, Linux 6.8.12 (i686), BusyBox m.fl. – v86's `buildroot-bzimage68.bin` | GPL-2.0 og andre frie licenser | Kopi fra github.com/alizafarbati/WebLinux (`images/buildroot-bzimage68.bin`), SHA-256 `507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c` |

Kildekoden til programmerne i `linux.bin` findes hos buildroot.org (2024.05.2), kernel.org (6.8.12) og busybox.net; v86's Buildroot-opsætning ligger i github.com/copy/v86 (`tools/docker/buildroot`).

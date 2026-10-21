/** The theme scenes (names and the style that goes with each) – small, so the app can read it without loading the renderer. */
export const SCENES = {
  tokyo: { name: 'Tokyo om natten', short: 'Tokyo', style: 'neon', desc: 'Tætte tårne, neonskilte, et højbanetog og regn på asfalten.' },
  neon: { name: 'Neongade', short: 'Neon', style: 'neon', desc: 'En våd gade fyldt med lysende skilte.' },
  shanghai: { name: 'Kinesisk storby', short: 'Storby', style: 'futuristisk', desc: 'Skyskrabere ved floden, både og lys, der spejler sig i vandet.' },
  future: { name: 'Fremtidsby', short: 'Fremtid', style: 'futuristisk', desc: 'Lysende tårne, svævende ringe og flyvende trafik.' },
  kyoto: { name: 'Traditionelt Japan', short: 'Japan', style: 'zen', desc: 'Pagode, torii-port, lanterner og kirsebærblomster.' },
  harbor: { name: 'Asiatisk skyline', short: 'Havn', style: 'elegant', desc: 'Skyline foran bjergene, færger og lyskegler over havnen.' },
  minimal: { name: 'Minimalistisk', short: 'Minimal', style: 'minimal', desc: 'Rolige, bløde farver uden forstyrrelser.' },
  silk: { name: 'Elegant', short: 'Elegant', style: 'elegant', desc: 'Silke, der bølger langsomt, og guldstøv.' },
};

export const STYLES = [
  ['auto', 'Følger temaet'], ['standard', 'Standard (aurora)'], ['neon', 'Neon'], ['futuristisk', 'Futuristisk'], ['zen', 'Zen'], ['elegant', 'Elegant'], ['minimal', 'Minimalistisk'],
];

// js/terminal/themes.js: the Desk Terminal's colour themes. ONE source of truth: the CSS file js/terminal/themes.css is generated from this
// (scripts/build_theme_css.mjs, a test fails if they drift), the sign-in page inlines the same blocks, and the picker (themePicker.js) reads the
// names and swatches from here. Pure: no DOM, no fetch.
//   node --test js/terminal/themes.test.mjs
//
// How a theme works: desk-terminal.html defines every token in :root (that IS the 'default' theme, byte-for-byte today's values). Any other
// theme is html[data-theme="id"]{ ...tokens } and replaces them. A token a theme does not list inherits the default. Tokens are named exactly as
// the CSS variables, without the leading dashes ('bg' is --bg). The rgb triples ('purrgb' = "139,124,246") let a stylesheet write
// rgba(var(--purrgb),.12) so a tinted background follows the theme; the tinted backgrounds (--purbg, --goldbg, --upbg, --dnbg) are derived in
// :root from the triples, so a theme only has to give the triple.
//
// The semantic rules every theme keeps: green and red (or the colour-blind pair) mean DIRECTION and nothing else; gold means a grade or a thesis;
// the accent (--pur / --pur2) means "you can press this". A theme changes the look, never the meaning.

// What each token is for (the guard test checks every theme only uses these, and the default defines all of them).
export const TOKENS = {
  bg: 'page background', bg1: 'panel, lower', bg2: 'panel, upper', bg3: 'raised surface / hover',
  line: 'hairline', line2: 'border', line3: 'strong border',
  tx: 'body text', tx2: 'secondary text', tx3: 'tertiary text and labels', flat: 'neutral / no direction',
  pur: 'accent', pur2: 'accent text and links', pur3: 'accent, lighter variant', purdeep: 'accent, deep fill',
  gold: 'grades and theses', gold2: 'gold, light text',
  up: 'direction up', dn: 'direction down',
  blue: 'information blue', blue2: 'information blue, lighter', teal: 'information teal',
  bgrgb: 'background as r,g,b', txrgb: 'text as r,g,b', purrgb: 'accent as r,g,b', pur2rgb: 'accent text as r,g,b', goldrgb: 'gold as r,g,b',
  uprgb: 'up as r,g,b', dnrgb: 'down as r,g,b', bluergb: 'blue as r,g,b', tealrgb: 'teal as r,g,b',
  glow1: 'page glow, top right', glow2: 'page glow, bottom left', scrim: 'dimming layer behind overlays', 'on-acc': 'text on an accent fill',
  'chart-grid': 'chart gridlines', 'chart-text': 'chart axis text',
  'map-land': 'world map land', 'map-sea': 'world map sea', 'map-line': 'world map borders',
  mono: 'monospace font stack', sans: 'body font stack',
};

const MONO = '"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace';
const SANS = 'Inter,ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif';

// 'default' = today's palette, exactly. desk-terminal.html's :root is checked against this by the test.
const DEFAULT = {
  bg: '#070a17', bg1: '#0c1124', bg2: '#111833', bg3: '#18203f', line: '#1f2950', line2: '#2c3866', line3: '#3a4677',
  tx: '#eef0fb', tx2: '#a9b0d0', tx3: '#6d7599', flat: '#8a93b8',
  pur: '#8b7cf6', pur2: '#b4a9ff', pur3: '#9b8cff', purdeep: '#3a2f8f', gold: '#e8b85a', gold2: '#f3e3bf',
  up: '#2fd39a', dn: '#ff5d78', blue: '#7aa2ff', blue2: '#4fb3ff', teal: '#5fd0c9',
  bgrgb: '7,10,23', txrgb: '238,240,251', purrgb: '139,124,246', pur2rgb: '180,169,255', goldrgb: '232,184,90',
  uprgb: '47,211,154', dnrgb: '255,93,120', bluergb: '91,157,255', tealrgb: '95,208,201',
  glow1: 'rgba(139,124,246,.10)', glow2: 'rgba(232,184,90,.05)', scrim: 'rgba(3,5,12,.72)', 'on-acc': '#ffffff',
  'chart-grid': 'rgba(44,56,102,.35)', 'chart-text': '#a9b0d0',
  'map-land': '#18203f', 'map-sea': '#070a17', 'map-line': '#2c3866',
  mono: MONO, sans: SANS,
};

// Swatch = the five colours the picker previews: [page, panel, accent, up, down].
export const THEMES = [
  { id: 'default', label: 'Deep navy', note: 'The original: navy, purple to press, gold for grades.', tokens: DEFAULT,
    swatch: [DEFAULT.bg, DEFAULT.bg2, DEFAULT.pur, DEFAULT.up, DEFAULT.dn] },

  { id: 'daylight', label: 'Daylight', note: 'Light: pale page, deep ink text. Same accents, darkened for contrast.',
    tokens: {
      bg: '#f3f4fa', bg1: '#ffffff', bg2: '#eceef8', bg3: '#e1e5f3', line: '#d3d8ec', line2: '#b9c0dc', line3: '#9aa3c8',
      tx: '#141932', tx2: '#394266', tx3: '#586088', flat: '#5f678b',
      pur: '#5848d4', pur2: '#4535c4', pur3: '#6a5ae0', purdeep: '#4535c4', gold: '#8a5d00', gold2: '#6b4700',
      up: '#0a7a52', dn: '#c0223f', blue: '#2a5fd6', blue2: '#1a6fb5', teal: '#0b7c78',
      bgrgb: '243,244,250', txrgb: '20,25,50', purrgb: '88,72,212', pur2rgb: '69,53,196', goldrgb: '138,93,0',
      uprgb: '10,122,82', dnrgb: '192,34,63', bluergb: '42,95,214', tealrgb: '11,124,120',
      glow1: 'rgba(88,72,212,.10)', glow2: 'rgba(138,93,0,.06)', scrim: 'rgba(243,244,250,.82)', 'on-acc': '#ffffff',
      'chart-grid': 'rgba(20,25,50,.10)', 'chart-text': '#394266',
      'map-land': '#dfe3f3', 'map-sea': '#f3f4fa', 'map-line': '#a9b0d2',
    },
    extra: 'html[data-theme="daylight"]{color-scheme:light}',
    login: { btnBg: 'linear-gradient(90deg,#5848d4,#4535c4)', btnFg: '#ffffff', brandMid: '#8a5d00' },
    swatch: ['#f3f4fa', '#ffffff', '#5848d4', '#0a7a52', '#c0223f'] },

  { id: 'amber', label: 'Amber terminal', note: 'Warm amber on near-black, mono headings.',
    tokens: {
      bg: '#0b0803', bg1: '#130e05', bg2: '#1b1408', bg3: '#261c0b', line: '#33260f', line2: '#4c3816', line3: '#654a1e',
      tx: '#ffe9c2', tx2: '#dcb878', tx3: '#ad8d54', flat: '#b89a62',
      pur: '#e6a22e', pur2: '#ffc766', pur3: '#f0b44c', purdeep: '#6b4a10', gold: '#fff0a8', gold2: '#fff6cf',
      up: '#a6d96a', dn: '#ff6a4d', blue: '#8fb4ff', blue2: '#6cc4ff', teal: '#6fd6c8',
      bgrgb: '11,8,3', txrgb: '255,233,194', purrgb: '230,162,46', pur2rgb: '255,199,102', goldrgb: '255,240,168',
      uprgb: '166,217,106', dnrgb: '255,106,77', bluergb: '143,180,255', tealrgb: '111,214,200',
      glow1: 'rgba(230,162,46,.11)', glow2: 'rgba(255,106,77,.05)', scrim: 'rgba(5,3,0,.74)', 'on-acc': '#1b1408',
      'chart-grid': 'rgba(101,74,30,.40)', 'chart-text': '#dcb878',
      'map-land': '#261c0b', 'map-sea': '#0b0803', 'map-line': '#4c3816',
    },
    extra: 'html[data-theme="amber"] :where(h1,h2,h3,h4,.brand,.lbl,th){font-family:var(--mono)}',
    login: { btnBg: 'linear-gradient(90deg,#e6a22e,#d4901c)', btnFg: '#1b1408', brandMid: '#ffd98a' },
    swatch: ['#0b0803', '#1b1408', '#e6a22e', '#a6d96a', '#ff6a4d'] },

  { id: 'console', label: 'Green console', note: 'Green phosphor on black, monospace everywhere.',
    tokens: {
      bg: '#020a04', bg1: '#041109', bg2: '#07190e', bg3: '#0b2415', line: '#0f3a1f', line2: '#17582f', line3: '#207a41',
      tx: '#c9ffd9', tx2: '#82e3a4', tx3: '#56bd80', flat: '#62ad82',
      pur: '#2fcfee', pur2: '#8be9ff', pur3: '#5fe0ff', purdeep: '#0b3a4a', gold: '#f0d24a', gold2: '#fff0a0',
      up: '#39ff88', dn: '#ff5252', blue: '#7aa2ff', blue2: '#4fb3ff', teal: '#5fd0c9',
      bgrgb: '2,10,4', txrgb: '201,255,217', purrgb: '47,207,238', pur2rgb: '139,233,255', goldrgb: '240,210,74',
      uprgb: '57,255,136', dnrgb: '255,82,82', bluergb: '122,162,255', tealrgb: '95,208,201',
      glow1: 'rgba(57,255,136,.08)', glow2: 'rgba(47,207,238,.05)', scrim: 'rgba(0,5,2,.76)', 'on-acc': '#021008',
      'chart-grid': 'rgba(32,122,65,.35)', 'chart-text': '#82e3a4',
      'map-land': '#0b2415', 'map-sea': '#020a04', 'map-line': '#17582f',
      mono: '"IBM Plex Mono","JetBrains Mono",ui-monospace,Menlo,Consolas,monospace',
      sans: '"IBM Plex Mono","JetBrains Mono",ui-monospace,Menlo,Consolas,monospace',
    },
    fontHref: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap',
    login: { btnBg: 'linear-gradient(90deg,#2fcfee,#1fb8d8)', btnFg: '#021008', brandMid: '#f0d24a' },
    swatch: ['#020a04', '#07190e', '#2fcfee', '#39ff88', '#ff5252'] },

  { id: 'contrast', label: 'High contrast', note: 'Black and white, thicker lines, AAA text.',
    tokens: {
      bg: '#000000', bg1: '#0a0a0a', bg2: '#141414', bg3: '#242424', line: '#7a7a7a', line2: '#a3a3a3', line3: '#d0d0d0',
      tx: '#ffffff', tx2: '#f2f2f2', tx3: '#d6d6d6', flat: '#d0d0d0',
      pur: '#b4a8ff', pur2: '#d9d3ff', pur3: '#c7bfff', purdeep: '#3a2f8f', gold: '#ffd35c', gold2: '#ffe9a8',
      up: '#00ff9c', dn: '#ff7088', blue: '#9ec0ff', blue2: '#7cc8ff', teal: '#7ae6df',
      bgrgb: '0,0,0', txrgb: '255,255,255', purrgb: '180,168,255', pur2rgb: '217,211,255', goldrgb: '255,211,92',
      uprgb: '0,255,156', dnrgb: '255,112,136', bluergb: '158,192,255', tealrgb: '122,230,223',
      glow1: 'rgba(180,168,255,0)', glow2: 'rgba(255,211,92,0)', scrim: 'rgba(0,0,0,.85)', 'on-acc': '#000000',
      'chart-grid': 'rgba(255,255,255,.28)', 'chart-text': '#f2f2f2',
      'map-land': '#242424', 'map-sea': '#000000', 'map-line': '#a3a3a3',
    },
    extra: 'html[data-theme="contrast"] :where(.card,.chip,.btn){border-width:2px}',
    login: { btnBg: 'linear-gradient(90deg,#b4a8ff,#9e90ff)', btnFg: '#000000', brandMid: '#ffe9a8' },
    swatch: ['#000000', '#141414', '#b4a8ff', '#00ff9c', '#ff7088'] },

  { id: 'colourblind', label: 'Colour-blind safe', note: 'Blue for up, orange for down: they differ in brightness as well as hue.',
    tokens: {
      ...DEFAULT,
      up: '#8ee0ff', dn: '#e8590c', uprgb: '142,224,255', dnrgb: '232,89,12',
      tx3: '#8088ae', flat: '#9aa3c4', blue: '#c4a8ff', blue2: '#a78bfa', bluergb: '196,168,255',
    },
    swatch: [DEFAULT.bg, DEFAULT.bg2, DEFAULT.pur, '#8ee0ff', '#e8590c'] },
];

// The sign-in page (js/deskLoginPage.js) has three looks of its own beyond the shared tokens; the default values live in that page's :root.
export const LOGIN_DEFAULT = { btnBg: 'linear-gradient(90deg,rgba(139,124,246,.55),rgba(108,92,231,.55))', btnFg: '#ffffff', brandMid: '#f3d89a' };

export const THEME_IDS = THEMES.map(t => t.id);
export const THEME_KEY = 'deskTheme';
export const themeById = id => THEMES.find(t => t.id === id) ?? THEMES[0];

// token name -> CSS declaration
const decl = (k, v) => `--${k}:${v}`;

/** The CSS for every non-default theme: one html[data-theme="id"]{...} block each, plus the theme's extra rule. Stable order, one line per theme. */
export function themeBlocksCss() {
  return THEMES.filter(t => t.id !== 'default').map(t => {
    const body = Object.entries(t.tokens).map(([k, v]) => decl(k, v)).join(';');
    return `html[data-theme="${t.id}"]{${body}}${t.extra ? '\n' + t.extra : ''}`;
  }).join('\n');
}

/** The sign-in page's extra blocks: the shared theme blocks plus each theme's login look (--btn-bg, --btn-fg, --brand-mid). */
export function loginThemeCss() {
  const own = THEMES.filter(t => t.login).map(t => `html[data-theme="${t.id}"]{--btn-bg:${t.login.btnBg};--btn-fg:${t.login.btnFg};--brand-mid:${t.login.brandMid}}`).join('\n');
  return themeBlocksCss() + '\n' + own;
}

/** The header of the generated file. */
export const THEMES_CSS_HEADER = '/* GENERATED by scripts/build_theme_css.mjs from js/terminal/themes.js. Do not edit by hand: a test fails if this drifts. */\n';
export const themesCssText = () => THEMES_CSS_HEADER + themeBlocksCss() + '\n';

// ── colour maths for the contrast test (WCAG 2.x relative luminance) ──
export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16));
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

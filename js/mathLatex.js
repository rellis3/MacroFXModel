// Layer 1 of the library's equations (plans/PAPER_LIBRARY.md "Equations as maths"): LaTeX rebuilt from the positioned text of an
// equation block, with no model and no network.
//
//   toLatex(src, opts?) -> { latex, conf (0..1), notes:[string], tag, lin }
//   linearize(src)      -> string        compact text for a model: 'dX(t) = sqrt[v(t)]dW_{1}(t) - {v(t)}/{2} dt'
//   CONF_OK             0.8              at or above this the reader may show the rendered equation
//
// src is what js/paperText.js keeps on every 'eq' block:  { it:[[str, x, y, w, h, fontIndex], ...], fonts:[name], rules:[[x0, x1, y, t]] }
// (PDF units, origin bottom-left; h is the font size). Also accepted: { items:[{ str, x, y, w, h, font }], rules }, or a bare array of either.
//
// HOW (pure geometry + glyph tables)
//  1. Every text item is split into glyph atoms (x slot = equal share of the item width).
//  2. Drawn horizontal rules are fraction bars or radical overbars: a bar with atoms above AND below is \frac, a bar over atoms with a
//     radical glyph touching its left end is \sqrt, a bar over atoms alone is \overline. Narrow bars first, so nesting works.
//     A stretched dash glyph standing alone counts as a bar. Without rules nothing is guessed as a fraction (the confidence drops).
//  3. Atoms smaller than the body size are scripts: above the baseline = ^{}, below = _{}, centred over a big operator = its limits.
//     Accents sitting on a letter become \hat, \tilde, \bar, \dot. Primes stay primes.
//  4. The remaining full-size atoms are clustered into rows by baseline; several rows are an aligned block (aligned at the first
//     relation sign). Bracket pairs that enclose a fraction, sum or integral become \left \right.
//  5. The confidence starts at 1 and loses points for every guess: unknown glyphs, stray accents or radicals, unmatched rules,
//     unbalanced brackets, leftover atoms, prose-like letter runs. Callers render at >= CONF_OK and otherwise fall back.
export const CONF_OK = 0.8;

// ── glyph tables ───────────────────────────────────────────────────────────────────────────────────────────────
const G = {
  // lower Greek
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\epsilon', 'ϵ': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota', 'κ': '\\kappa',
  'λ': '\\lambda', 'μ': '\\mu', 'µ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'ο': 'o', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma', 'ς': '\\varsigma', 'τ': '\\tau', 'υ': '\\upsilon',
  'φ': '\\varphi', 'ϕ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega', 'ϑ': '\\vartheta', 'ϖ': '\\varpi', 'ϱ': '\\varrho', 'ϰ': '\\varkappa', 'ℓ': '\\ell',
  // upper Greek
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega', 'Υ': '\\Upsilon',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Χ': 'X',
  // operators and relations
  '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '∂': '\\partial', '∇': '\\nabla', '√': '\\sqrt', '∞': '\\infty',
  '≤': '\\le', '⩽': '\\le', '≥': '\\ge', '⩾': '\\ge', '≠': '\\ne', '≈': '\\approx', '≡': '\\equiv', '∼': '\\sim', '~': '\\sim', '≃': '\\simeq', '≅': '\\cong', '∝': '\\propto',
  '≪': '\\ll', '≫': '\\gg', '·': '\\cdot', '⋅': '\\cdot', '∙': '\\cdot', '•': '\\cdot', '×': '\\times', '±': '\\pm', '∓': '\\mp', '÷': '\\div', '∗': '*', '⋆': '\\star', '∘': '\\circ',
  '⊗': '\\otimes', '⊕': '\\oplus', '∧': '\\wedge', '∨': '\\vee', '∈': '\\in', '∉': '\\notin', '∋': '\\ni', '⊂': '\\subset', '⊆': '\\subseteq', '⊃': '\\supset', '⊇': '\\supseteq',
  '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset', '∀': '\\forall', '∃': '\\exists', '¬': '\\neg', '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow',
  '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow', '↦': '\\mapsto', '↑': '\\uparrow', '↓': '\\downarrow', '⟶': '\\longrightarrow', '⟹': '\\Longrightarrow', '⊥': '\\perp', '∥': '\\parallel',
  '′': "'", '″': "''", '‴': "'''", '‖': '\\Vert', '∣': '|', '|': '|', '⊤': '\\top', '†': '\\dagger', '‡': '\\ddagger', '…': '\\ldots', '⋯': '\\cdots', '⋮': '\\vdots', '⋱': '\\ddots',
  '−': '-', '–': '-', '—': '-', '‐': '-', '‑': '-', '＋': '+', '＝': '=', '⟨': '\\langle', '⟩': '\\rangle', '〈': '\\langle', '〉': '\\rangle', '⌈': '\\lceil', '⌉': '\\rceil', '⌊': '\\lfloor', '⌋': '\\rfloor',
  '%': '\\%', '#': '\\#', '&': '\\&', '$': '\\$', '_': '\\_', '{': '\\{', '}': '\\}', '\\': '\\backslash', '°': '^{\\circ}', '¯': '\\bar{}',
  'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}', 'ℙ': '\\mathbb{P}', 'ℍ': '\\mathbb{H}', 'ℓ̇': '\\ell',
  'ℒ': '\\mathcal{L}', 'ℱ': '\\mathcal{F}', 'ℋ': '\\mathcal{H}', 'ℬ': '\\mathcal{B}', 'ℐ': '\\mathcal{I}', 'ℛ': '\\mathcal{R}', 'ℳ': '\\mathcal{M}', 'ℕ̸': '\\mathbb{N}',
  '∆': '\\Delta', '∶': ':', '⁄': '/', '∕': '/', '⊙': '\\odot', '⊖': '\\ominus', '⊛': '\\circledast', '⋂': '\\bigcap', '⋃': '\\bigcup', '≜': ':=', '≔': ':=', '⇀': '\\rightharpoonup', 'ˉ': '\\bar{}', '…': '\\ldots', '‥': '\\ldots', ' ': ' ', 'ħ': '\\hbar', 'ℏ': '\\hbar', 'ℜ': '\\Re', 'ℑ': '\\Im', 'ℵ': '\\aleph',
};
// Unicode math alphanumerics (U+1D400..): italic/bold/script/double-struck letters fold to the plain letter, with a style where it matters
function mathAlnum(cp) {
  if (cp >= 0x1d538 && cp <= 0x1d56b) { const k = (cp - 0x1d538) % 26, up = cp < 0x1d552; return up ? `\\mathbb{${String.fromCharCode(65 + k)}}` : `\\mathbb{${String.fromCharCode(97 + k)}}`; }
  if (cp >= 0x1d49c && cp <= 0x1d4cf) return `\\mathcal{${String.fromCharCode(65 + ((cp - 0x1d49c) % 26))}}`;
  const blocks = [[0x1d400, 0x1d433], [0x1d434, 0x1d467], [0x1d468, 0x1d49b], [0x1d5a0, 0x1d5d3], [0x1d5d4, 0x1d607], [0x1d608, 0x1d63b], [0x1d63c, 0x1d66f], [0x1d670, 0x1d6a3]];
  for (const [a, b] of blocks) if (cp >= a && cp <= b) { const k = cp - a, bold = a === 0x1d400 || a === 0x1d468 || a === 0x1d5d4 || a === 0x1d63c; const ch = k < 26 ? String.fromCharCode(65 + k) : String.fromCharCode(97 + k - 26); return bold ? `\\mathbf{${ch}}` : ch; }
  if (cp >= 0x1d6a8 && cp <= 0x1d7c9) { const greekU = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ∇', greekL = 'αβγδεζηθικλμνξοπρςστυφχψω'; const k = (cp - 0x1d6a8) % 58; const ch = k < 25 ? greekU[k] : (k >= 26 && k < 26 + 25) ? greekL[k - 26] : null; if (ch) return G[ch] ?? null; }
  if (cp >= 0x1d7ce && cp <= 0x1d7ff) return String((cp - 0x1d7ce) % 10);
  return null;
}
// Symbol-font private-use area (U+F020..U+F0FF): the byte is the Symbol encoding
const SYMBOL_LOWER = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ', SYMBOL_UPPER = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ';
const SYMBOL_HI = { 0xa3: '≤', 0xa5: '∞', 0xab: '↔', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓', 0xb1: '±', 0xb3: '≥', 0xb4: '×', 0xb5: '∝', 0xb6: '∂', 0xb7: '·', 0xb9: '≠', 0xba: '≡', 0xbb: '≈', 0xc5: '⊕', 0xc6: '∅', 0xc7: '∩', 0xc8: '∪', 0xc9: '⊃', 0xca: '⊇', 0xcc: '⊂', 0xcd: '⊆', 0xce: '∈', 0xcf: '∉', 0xd1: '∇', 0xd5: '∏', 0xd6: '√', 0xd7: '·', 0xd8: '¬', 0xd9: '∧', 0xda: '∨', 0xde: '⇒', 0xdb: '⇔', 0xe5: '∑', 0xf2: '∫', 0x22: '∀', 0x24: '∃', 0x2d: '−', 0x40: '≅', 0x2a: '∗', 0x27: '∋' };
function symbolGlyph(code) {
  const b = code & 0xff;
  if (b >= 0x61 && b <= 0x7a) return SYMBOL_LOWER[b - 0x61];
  if (b >= 0x41 && b <= 0x5a) return SYMBOL_UPPER[b - 0x41];
  return SYMBOL_HI[b] ?? (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : null);
}
// cmex (extension font) control codes: big delimiters, by pdf.js as raw control characters
const EX_DELIM = {
  0x00: '(', 0x01: ')', 0x02: '[', 0x03: ']', 0x04: '⌊', 0x05: '⌋', 0x06: '⌈', 0x07: '⌉', 0x08: '{', 0x09: '}', 0x0a: '⟨', 0x0b: '⟩', 0x0c: '|', 0x0d: '‖', 0x0e: '/', 0x0f: '\\',
  0x10: '(', 0x11: ')', 0x12: '(', 0x13: ')', 0x14: '[', 0x15: ']', 0x16: '⌊', 0x17: '⌋', 0x18: '⌈', 0x19: '⌉', 0x1a: '{', 0x1b: '}', 0x1c: '⟨', 0x1d: '⟩', 0x1e: '/', 0x1f: '\\',
};
const MI_CTRL = 'ΓΔΘΛΞΠΣΥΦΨΩ\u0000\u0000\u0000\u0000\u0000αβγδεζηθικλμνξπρστυφχψωεϑϖϱςϕ';   // cmmi / cmr low slots: 0x00.. (0x0B on is lower-case Greek)
const EX_ASCII = { '!': ')', '"': '[', '#': ']', '$': '⌊', '%': '⌋', '&': '⌈', "'": '⌉', '(': '{', ')': '}', '*': '⟨', '+': '⟩', ',': '/', '-': '\\' };   // cmex 0x21..0x2d (largest sizes)
const ACCENT = { 'ˆ': '\\hat', '^': '\\hat', '̂': '\\hat', '˜': '\\tilde', '~': '\\tilde', '̃': '\\tilde', '¯': '\\bar', '‾': '\\bar', '̄': '\\bar', '˙': '\\dot', '̇': '\\dot', '¨': '\\ddot', '̈': '\\ddot', 'ˇ': '\\check', '´': '\\acute', '`': '\\grave', '˘': '\\breve' };
const FN_NAMES = new Set(['argmin', 'argmax', 'exp', 'log', 'ln', 'lg', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'max', 'min', 'sup', 'inf', 'lim', 'det', 'arg', 'deg', 'dim', 'ker', 'gcd', 'Pr']);
const TEXT_WORDS = new Set(['where', 'for', 'if', 'and', 'or', 'otherwise', 'with', 'such', 'that', 'subject', 'to', 'when', 'else', 'all', 'some', 'any', 'as', 'on', 'in', 'at', 'is', 'are', 'the', 'of', 'then']);
const OPEN = new Set(['(', '[', '⟨', '⌈', '⌊']), CLOSE = new Set([')', ']', '⟩', '⌉', '⌋']);
const RELATIONS = new Set(['=', '≈', '≡', '≤', '≥', '<', '>', '≠', '∼', '≃', '∈', '→', '⇒', '⇔', '∝', '≪', '≫', '⊂', '⊆', '≅', '←', '↦', '⟶']);
const BIGOPS = new Set(['∑', '∏', '∫', '∬', '∭', '∮', '⋃', '⋂']);
const isLetter = c => /^[A-Za-z]$/.test(c);
const med = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

// ── input ──────────────────────────────────────────────────────────────────────────────────────────────────────
function readInput(src) {
  const out = { items: [], fonts: [], rules: [] };
  const add = s => {
    if (!s) return;
    if (Array.isArray(s)) { for (const e of s) add(e); return; }
    if (Array.isArray(s.it)) { for (const t of s.it) if (Array.isArray(t) && typeof t[0] === 'string') out.items.push({ str: t[0], x: +t[1], y: +t[2], w: +t[3], h: +t[4], font: s.fonts?.[t[5]] ?? String(t[5] ?? ''), fi: t[5] }); }
    else if (Array.isArray(s.items)) { for (const t of s.items) if (t && typeof t.str === 'string') out.items.push({ str: t.str, x: +t.x, y: +t.y, w: +t.w, h: +t.h, font: String(t.font ?? ''), fi: t.font }); }
    else if (Array.isArray(s.lines)) add(s.lines);
    else if (typeof s.str === 'string') out.items.push({ str: s.str, x: +s.x, y: +s.y, w: +s.w, h: +s.h, font: String(s.font ?? ''), fi: s.font });
    if (Array.isArray(s.rules)) for (const r of s.rules) if (Array.isArray(r) && r.length >= 3 && r.every(Number.isFinite)) out.rules.push({ x0: Math.min(r[0], r[1]), x1: Math.max(r[0], r[1]), y: r[2], t: r[3] ?? 0.5 });
  };
  add(src);
  out.items = out.items.filter(i => Number.isFinite(i.x) && Number.isFinite(i.y) && i.str !== '' && i.str.trim() !== '');
  const xr = Math.max(...out.items.map(i => i.x + i.w), -Infinity);
  for (const i of [...out.items]) {   // "... dW). (18)" in one item: the number is split off, by character slots
    const m = i.str.match(EQ_NUM_TAIL);
    if (m && i.x + i.w >= xr - 0.5 && out.items.length >= 1) {
      const slot = i.w / i.str.length, cut = m[1].length + (i.str.length - m[1].length - m[2].trimStart().length - (i.str.length - i.str.trimEnd().length));
      const at = i.str.lastIndexOf(m[2].trim());
      out.items.push({ ...i, str: m[2].trim(), x: i.x + at * slot, w: m[2].trim().length * slot });
      i.str = m[1]; i.w = Math.max(0, at * slot);
    }
  }
  for (const i of out.items) { if (!(i.h > 0)) i.h = 10; if (!(i.w >= 0)) i.w = 0; }
  return out;
}

const EQ_NUM = /^\(\s*([A-Z]?\.?\d{1,3}(?:\.\d{1,3})?[a-z]?)\s*\)$/;
const EQ_NUM_TAIL = /^(.*?\S)\s+(\(\s*[A-Z]?\.?\d{1,3}(?:\.\d{1,3})?[a-z]?\s*\))\s*$/;

// ── glyph -> atom ──────────────────────────────────────────────────────────────────────────────────────────────
const PIECE = {
  0xf8eb: ['(', 't'], 0xf8ec: ['(', 'e'], 0xf8ed: ['(', 'b'], 0x239b: ['(', 't'], 0x239c: ['(', 'e'], 0x239d: ['(', 'b'],
  0xf8f6: [')', 't'], 0xf8f7: [')', 'e'], 0xf8f8: [')', 'b'], 0x239e: [')', 't'], 0x239f: [')', 'e'], 0x23a0: [')', 'b'],
  0xf8ee: ['[', 't'], 0xf8ef: ['[', 'e'], 0xf8f0: ['[', 'b'], 0x23a1: ['[', 't'], 0x23a2: ['[', 'e'], 0x23a3: ['[', 'b'],
  0xf8f9: [']', 't'], 0xf8fa: [']', 'e'], 0xf8fb: [']', 'b'], 0x23a4: [']', 't'], 0x23a5: [']', 'e'], 0x23a6: [']', 'b'],
  0xf8f1: ['{', 't'], 0xf8f2: ['{', 'm'], 0xf8f3: ['{', 'b'], 0x23a7: ['{', 't'], 0x23a8: ['{', 'm'], 0x23a9: ['{', 'b'],
  0xf8fc: ['}', 't'], 0xf8fd: ['}', 'm'], 0xf8fe: ['}', 'b'], 0x23ab: ['}', 't'], 0x23ac: ['}', 'm'], 0x23ad: ['}', 'b'],
  0xf8f4: ['|', 'e'], 0x23aa: ['|', 'e'], 0x2320: ['∫', 't'], 0x2321: ['∫', 'b'], 0xf8f5: ['∫', 'e'], 0x23ae: ['∫', 'e'],
};
const isCombining = c => c >= 0x300 && c <= 0x36f;
const COMB = { 0x302: 'ˆ', 0x303: '˜', 0x304: '¯', 0x305: '¯', 0x307: '˙', 0x308: '¨', 0x30c: 'ˇ', 0x301: '´', 0x300: '`', 0x306: '˘', 0x20d7: '→' };
function toAtoms(items, ctx) {
  const atoms = [];
  for (const it of items) {
    const chars = Array.from(it.str.normalize('NFC').replace(/(^|[^\d])6(?==)/g, '$1≠\u0000')).filter(c => c !== '\u0000').map(ch => { const c = ch.codePointAt(0); return c >= 0xd400 && c <= 0xd7ff ? String.fromCodePoint(0x10000 + c) : ch; });   // pdf.js can drop the first surrogate of a math alphanumeric
    const slot = it.w > 0 ? it.w / chars.length : it.h * 0.5;
    chars.forEach((ch, k) => {
      if (/\s/.test(ch)) return;
      const cp = ch.codePointAt(0), prev = atoms[atoms.length - 1];
      if ((isCombining(cp) || cp === 0x20d7) && prev && !prev.node && /^[A-Za-z\u0370-\u03ff]$/.test(prev.ch)) { (prev.acc ??= []).push(ACCENT[COMB[cp]] ?? '\\hat'); if (!ACCENT[COMB[cp]]) ctx.pen(0.2); return; }
      if (isCombining(cp)) { ctx.unknown.push(ch); }
      atoms.push({ ch, x0: it.x + k * slot, x1: it.x + (k + 1) * slot, y: it.y, s: it.h, f: it.fi, font: it.font, w: slot });
    });
  }
  return mergePieces(atoms);
}
/** Big brackets and integral signs drawn as stacked pieces (top, extension, bottom) become one tall delimiter. */
function mergePieces(atoms) {
  const out = [], pieces = atoms.filter(a => PIECE[a.ch.codePointAt(0)]);
  if (!pieces.length) return atoms;
  const used = new Set();
  for (const a of pieces) {
    if (used.has(a)) continue;
    const [fam] = PIECE[a.ch.codePointAt(0)], grp = [a]; used.add(a);
    for (let grew = true; grew;) {
      grew = false;
      for (const b of pieces) {
        if (used.has(b) || PIECE[b.ch.codePointAt(0)][0] !== fam || Math.abs(b.x0 - a.x0) > 0.6 * a.s) continue;
        const ys = grp.map(g => g.y), lo = Math.min(...ys), hi = Math.max(...ys);
        if (b.y >= lo - 1.5 * a.s && b.y <= hi + 1.5 * a.s) { grp.push(b); used.add(b); grew = true; }
      }
    }
    const ys = grp.map(g => g.y), yc = (Math.max(...ys) + Math.min(...ys)) / 2;
    out.push({ ...a, ch: fam, y: yc, bigdelim: true, x0: Math.min(...grp.map(g => g.x0)), x1: Math.max(...grp.map(g => g.x1)), tall: grp.length });
  }
  return [...atoms.filter(a => !PIECE[a.ch.codePointAt(0)]), ...out];
}

// a glyph's LaTeX token (kind: ord | op | rel | open | close | punct | big | fn | text)
function glyph(a, ctx) {
  let ch = a.ch;
  if (ctx.syFonts?.has(a.f) && SY_SLOT[ch]) ch = SY_SLOT[ch];
  if (ch === '\u0338') return { tex: '', kind: 'ord', ch: '', slashed: true };
  const cp = ch.codePointAt(0);
  if (cp >= 0xf020 && cp <= 0xf0ff) { const g = symbolGlyph(cp); if (g) ch = g; }
  if (ctx.exFonts.has(a.f) && cp < 0x20 && EX_DELIM[cp]) { const d = EX_DELIM[cp]; return { tex: delimTex(d), kind: OPEN.has(d) || d === '{' ? 'open' : 'close', big: true, ch: d }; }
  if (ctx.exFonts.has(a.f) && EX_ASCII[ch] && (a.x1 - a.x0) >= 0.3 * a.s) { const d = EX_ASCII[ch]; return { tex: delimTex(d), kind: OPEN.has(d) || d === '{' ? 'open' : 'close', big: true, ch: d }; }
  if (cp < 0x20 && (ctx.miFonts.has(a.f) || ctx.rmFonts.has(a.f)) && cp !== 0 && MI_CTRL[cp] && MI_CTRL[cp] !== '\u0000' && (cp <= 0x0a || ctx.miFonts.has(a.f))) { const g = MI_CTRL[cp]; return { tex: G[g] ?? g, kind: 'ord', ch: g }; }
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) { ctx.unknown.push(ch); return { tex: '\\square', kind: 'ord', unknown: true, ch }; }
  if (ch === '{' && ctx.exFonts.has(a.f)) return { tex: '\\{', kind: 'open', big: true, ch };
  if (ch === '}' && ctx.exFonts.has(a.f)) return { tex: '\\}', kind: 'close', big: true, ch };
  if (a.bigdelim) { if (ch === '∫') return { tex: '\\int', kind: 'big', ch, big: true }; const d = ch; return { tex: delimTex(d), kind: d === '(' || d === '[' || d === '{' ? 'open' : d === '|' ? 'open2' : 'close', big: true, ch: d }; }
  if (a.bigop) return { tex: a.bigop, kind: 'big', ch: a.bigop, big: true };
  if (BIGOPS.has(ch)) return { tex: G[ch] ?? '\\sum', kind: 'big', ch, big: true };
  if (isLetter(ch)) return { tex: ch, kind: 'ord', ch };
  if (/^\d$/.test(ch)) return { tex: ch, kind: 'ord', ch, digit: true };
  if (ch === '(' || ch === '[') return { tex: ch, kind: 'open', ch, big: ctx.exFonts.has(a.f) };
  if (ch === ')' || ch === ']') return { tex: ch, kind: 'close', ch, big: ctx.exFonts.has(a.f) };
  if (ch === '{' || ch === '⟨' || ch === '⌈' || ch === '⌊') return { tex: G[ch] ?? ch, kind: 'open', ch };
  if (ch === '}' || ch === '⟩' || ch === '⌉' || ch === '⌋') return { tex: G[ch] ?? ch, kind: 'close', ch };
  if (ch === ',' || ch === ';') return { tex: ch, kind: 'punct', ch };
  if (ch === '.' || ch === ':' || ch === '!' || ch === '?') return { tex: ch === '.' ? '.' : ch, kind: 'punct', ch };
  if (ch === '=' || ch === '<' || ch === '>') return { tex: ch, kind: 'rel', ch };
  if (ch === '+' || ch === '/' || ch === '*') return { tex: ch, kind: 'op', ch };
  if (ch === '-' || ch === '−' || ch === '–' || ch === '—') return { tex: '-', kind: 'op', ch: '−' };
  if (ch === '′' || ch === '″' || ch === '‴') return { tex: G[ch], kind: 'prime', ch };
  if (ch === "'" ) return { tex: "'", kind: 'prime', ch };
  if (ch === '|' || ch === '∣') return { tex: '|', kind: 'open2', ch };
  if (ch === '‖') return { tex: '\\Vert', kind: 'open2', ch };
  const m = G[ch];
  if (m != null) return { tex: m, kind: RELATIONS.has(ch) ? 'rel' : /^[\\]/.test(m) && /cdot|times|pm|mp|div|star|circ|otimes|oplus|wedge|vee|cup|cap/.test(m) ? 'op' : 'ord', ch };
  const ma = mathAlnum(cp); if (ma) return { tex: ma, kind: 'ord', ch };
  if (cp >= 0x370 && cp <= 0x3ff) { ctx.unknown.push(ch); return { tex: '\\square', kind: 'ord', unknown: true, ch }; }
  if (cp > 0x7f || '"@`^'.includes(ch)) { ctx.unknown.push(ch); return { tex: '\\square', kind: 'ord', unknown: true, ch }; }
  return { tex: ch, kind: 'ord', ch };
}
function delimTex(d) { return d === '{' ? '\\{' : d === '}' ? '\\}' : d === '|' ? '|' : d === '‖' ? '\\Vert' : d === '\\' ? '\\backslash' : (G[d] ?? d); }

// ── structure: rules (fractions, radicals), accents, rows, scripts ──────────────────────────────────────────
const RADICAL_CH = new Set(['√', 'p', 'q', 'r', 's', 't', 'u', 'p', 'q', 'r', 's', 't', 'Ö', '']);

function consumeRules(atoms, rules, D, ctx) {
  const cx = a => (a.x0 + a.x1) / 2, vc = a => a.y + 0.3 * a.s;
  const live = a => !a.dead;
  const order = [...rules].sort((a, b) => (a.x1 - a.x0) - (b.x1 - b.x0));
  for (const R of order) {
    const wR = R.x1 - R.x0; if (wR < 0.6 * D) { R.skip = true; continue; }
    const inX = a => cx(a) >= R.x0 - 1.5 && cx(a) <= R.x1 + 1.5;
    const above = atoms.filter(a => live(a) && !a.rad && inX(a) && vc(a) > R.y && a.y <= R.y + 1.9 * D && a.y > R.y - 0.5 * D);
    const below = atoms.filter(a => live(a) && !a.rad && inX(a) && vc(a) < R.y && a.y >= R.y - 1.9 * D && a.y + 0.75 * a.s < R.y + 0.9 * D);
    // a radical glyph touching the left end of the bar
    const rad = atoms.find(a => live(a) && a.x1 >= R.x0 - 0.6 * D && a.x0 <= R.x0 + 0.35 * D && a.x1 <= R.x0 + 0.9 * D && RADICAL_CH.has(a.ch) && Math.abs(vc(a) - R.y) <= 2.2 * D && (!(a.ch.length === 1 && isLetter(a.ch)) || ctx.exFonts.has(a.f) || a.s * 0.55 < (a.x1 - a.x0) + 4));
    const abv = rad ? above.filter(a => a !== rad) : above;
    if (rad && below.length && !abv.length) {
      // radical: the glyph and the bar belong to the root; the body is under the bar
      const body = below.filter(a => a.x0 >= R.x0 - 0.3 * D);
      const idx = atoms.filter(a => live(a) && a !== rad && !body.includes(a) && a.s < 0.8 * rad.s && a.x1 <= rad.x1 + 1 && a.x0 >= rad.x0 - 1.2 * D && vc(a) > R.y - 0.3 * D);   // an index ^n over the radical sign
      const rowNode = layout(body, ctx, rules.filter(r => r !== R && !r.used && r.x0 >= R.x0 - 1 && r.x1 <= R.x1 + 1), 'sqrt');
      const idxNode = idx.length ? layout(idx, ctx, [], 'idx') : null;
      body.forEach(a => { a.dead = true; }); idx.forEach(a => { a.dead = true; }); rad.dead = true;
      atoms.push(compose({ type: 'sqrt', body: rowNode, index: idxNode }, [...body, rad, ...idx], R));
      R.used = true; continue;
    }
    if (abv.length && below.length) {
      const sub = rules.filter(r => r !== R && !r.used);
      const num = layout(abv, ctx, sub.filter(r => r.x0 >= R.x0 - 1 && r.x1 <= R.x1 + 1 && r.y > R.y), 'num'), den = layout(below, ctx, sub.filter(r => r.x0 >= R.x0 - 1 && r.x1 <= R.x1 + 1 && r.y < R.y), 'den');
      abv.forEach(a => { a.dead = true; }); below.forEach(a => { a.dead = true; });
      atoms.push(compose({ type: 'frac', num, den }, [...abv, ...below], R));
      R.used = true; continue;
    }
    if (below.length && !abv.length && wR >= 1.0 * D && below.some(a => a.y + 0.75 * a.s >= R.y - 0.45 * D && a.y + 0.75 * a.s <= R.y + 0.5 * D)) {   // an overline: the body touches the bar
      const ov = layout(below, ctx, [], 'over'); below.forEach(a => { a.dead = true; });
      atoms.push(compose({ type: 'over', body: ov }, below, R)); R.used = true; ctx.notes.push('overline'); ctx.pen(wR > 2.2 * D ? 0.35 : 0.12); continue;
    }
  }
  return atoms.filter(live);
}
function compose(node, parts, R) {
  const x0 = Math.min(R.x0, ...parts.map(p => p.x0)), x1 = Math.max(R.x1, ...parts.map(p => p.x1));
  const s = Math.max(...parts.map(p => p.s));
  // a fraction sits on the axis (a quarter em under its bar); a radical or overline keeps the baseline of its body
  const y = node.type === 'frac' ? R.y - 0.26 * s : med(parts.filter(p => !p.rad && (p.node || p.s >= 0.85 * s)).map(p => p.y));
  return { ch: '', node, x0, x1, w: x1 - x0, y, s, f: -1, font: '' };
}

/** Accents that sit on a letter fold into it. Returns the atoms without the accent glyphs. */
function foldAccents(atoms, ctx) {
  const out = [];
  for (const a of atoms) {
    if (!ACCENT[a.ch] || a.node) { out.push(a); continue; }
    const base = atoms.find(b => b !== a && !b.node && !ACCENT[b.ch] && /^[A-Za-zͰ-Ͽ]$/.test(b.ch) && Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) <= 0.55 * Math.max(b.x1 - b.x0, 3) + 1 && Math.abs(a.y - b.y) <= 1.1 * b.s && (a.y > b.y + 0.15 * b.s || a.x0 < b.x1 - 0.35 * (b.x1 - b.x0)));
    if (base && !(a.ch === '→' && base.s < 8)) { (base.acc ??= []).push(ACCENT[a.ch]); a.dead = true; continue; }
    out.push(a);
  }
  return out.filter(a => !a.dead);
}

function pickDominant(atoms) {
  const bins = new Map();
  const tall = a => a.bigdelim || /^[∑∏∫∬∭∮{}()[\]|√⌈⌉⌊⌋⟨⟩]$/.test(a.ch);   // big operators and delimiters may be set larger than the text
  const countable = atoms.filter(a => !a.node && !tall(a));
  for (const a of (countable.length ? countable : atoms.filter(a => !a.node))) { const k = Math.round(a.s * 2) / 2; bins.set(k, (bins.get(k) ?? 0) + 1); }
  if (!bins.size) return Math.max(...atoms.map(a => a.s), 10);
  const top = Math.max(...bins.keys());
  let D = top, best = -1;   // the commonest size among the larger ones (scripts are <= 0.75 of the body, so a script-heavy equation still reads its body size)
  for (const [k, c] of bins) if (k >= 0.78 * top && (c > best || (c === best && k > D))) { best = c; D = k; }
  return D;
}

/**
 * atoms -> a row node: { rows:[[item]], aligned } where an item is { g:glyph, sup, sub, acc } or a composite node.
 * `kind` is a label for diagnostics only.
 */
function layout(atomsIn, ctx, rules, kind) {
  let atoms = atomsIn.filter(a => !a.dead);
  if (!atoms.length) return { rows: [] };
  const D0 = pickDominant(atoms);
  atoms = consumeRules(atoms, rules.filter(r => !r.used), D0, ctx);
  atoms = foldAccents(atoms, ctx);
  if (!atoms.length) return { rows: [] };
  const D = pickDominant(atoms);
  // big operators drawn as letters in an extension font: P X Q Y R Z with limits above/below; a lone hat with scripts beside it is an integral sign
  for (const a of atoms) {
    if (a.node || a.bigop) continue;
    if ((a.ch === 'ˆ' || a.ch === '^') && a.s >= 0.85 * D && atoms.some(b => b !== a && b.s < 0.85 * a.s && b.x0 >= a.x0 && b.x0 - a.x1 <= 0.8 * a.s && Math.abs(b.y - a.y) <= 1.1 * a.s) && !atoms.some(b => b !== a && /^[A-Za-z]$/.test(b.ch) && b.s >= 0.85 * a.s && Math.abs((b.x0 + b.x1) / 2 - (a.x0 + a.x1) / 2) <= 0.6 * (b.x1 - b.x0))) { a.bigop = '\\int'; ctx.pen(0.05); ctx.notes.push('integral sign read from a glyph substitute'); continue; }
    const wide = (a.x1 - a.x0) >= 1.1 * a.s;
    if (/^[PQRXYZ]$/.test(a.ch) && atoms.filter(b => b.f === a.f).length === 1 && atoms.some(b => b !== a && b.s < 0.85 * a.s && b.x0 >= a.x0 && b.x0 - a.x1 <= 1.4 * a.s && Math.abs(b.y - a.y) <= 1.7 * a.s)) { a.bigop = a.ch === 'P' || a.ch === 'X' ? '\\sum' : a.ch === 'Q' || a.ch === 'Y' ? '\\prod' : '\\int'; ctx.pen(0.05); continue; }
    if (/^[PQRXYZ]$/.test(a.ch) && (ctx.exFonts.has(a.f) || (wide && atoms.some(b => b !== a && b.s < 0.85 * a.s && Math.abs((b.x0 + b.x1) / 2 - (a.x0 + a.x1) / 2) <= 0.7 * (a.x1 - a.x0))))) a.bigop = a.ch === 'P' || a.ch === 'X' ? '\\sum' : a.ch === 'Q' || a.ch === 'Y' ? '\\prod' : '\\int';
    if (!a.bigop && ctx.exFonts.has(a.f) && a.ch === 'S') a.bigop = '\\bigcup';
    if (!a.bigop && BIGOPS.has(a.ch) && G[a.ch]) a.bigop = G[a.ch];
  }
  // main vs script
  const isMain = a => a.node || a.s >= 0.88 * D || a.bigop;
  let mains = atoms.filter(isMain), scripts = atoms.filter(a => !isMain(a));
  if (!mains.length) { mains = atoms; scripts = []; }
  // rows by baseline (extension-font glyphs and big operators follow the nearest row)
  const flow = mains.filter(a => !a.bigop && !a.bigdelim && !(ctx.exFonts.has(a.f) && !a.node));
  const rowsDef = [];
  for (const a of [...(flow.length ? flow : mains)].sort((p, q) => q.y - p.y)) {
    const r = rowsDef.find(r => Math.abs(r.y - a.y) <= 0.5 * D);
    if (r) { r.atoms.push(a); r.y = med(r.atoms.map(t => t.y)); } else rowsDef.push({ y: a.y, atoms: [a] });
  }
  const placed = new Set(rowsDef.flatMap(r => r.atoms));
  const rowOfBig = [];
  for (const a of mains) {
    if (placed.has(a)) continue;
    let best = null, bd = Infinity;
    const drop = a.bigop && (ctx.exFonts.has(a.f) || /^[PQRXYZˆ^]$/.test(a.ch)) ? (a.bigop === '\\int' ? 1.15 : 0.75) * a.s : ctx.exFonts.has(a.f) && !a.bigop ? 0.9 * a.s : 0;   // cmex hangs below its origin
    const dropBig = a.bigop ? (a.bigop === '\\int' ? 1.15 : 0.75) * a.s : 0;   // a big operator's origin sits above or on the row: try both
    for (const r of rowsDef) { const d = Math.min(Math.abs(r.y - (a.y - drop)), a.bigop ? Math.abs(r.y - (a.y - dropBig)) : Infinity, a.bigop ? Math.abs(r.y - a.y) : Infinity); if (d < bd) { bd = d; best = r; } }
    if (best && bd <= (a.bigop || a.bigdelim || ctx.exFonts.has(a.f) ? 2.4 : 1.6) * D) { best.atoms.push(a); placed.add(a); if (a.bigop || a.bigdelim || ctx.exFonts.has(a.f)) a.y = best.y; } else if (!rowsDef.length) { rowsDef.push({ y: a.y, atoms: [a] }); placed.add(a); }
    else { ctx.stray.push(a); ctx.notes.push('glyph far from every row'); }
  }
  rowsDef.sort((p, q) => q.y - p.y);
  for (const r of rowsDef) r.atoms.sort((p, q) => p.x0 - q.x0);
  if (kind === 'eq' && rowsDef.length >= 2 && rowsDef.some(r => r.atoms.length <= 2 && !r.atoms.some(a => RELATIONS.has(a.ch) || a.node || a.bigop || a.bigdelim)) && rowsDef.some(r => r.atoms.some(a => RELATIONS.has(a.ch)))) { ctx.pen(0.3); ctx.notes.push('a short row with no relation (ambiguous stack)'); }
  if (kind === 'eq') {
    const numeric = rowsDef.filter(r => r.atoms.length >= 2 && r.atoms.every(a => /^[0-9.,%\-−–+()]$/.test(a.ch)));
    if (numeric.length >= 2 || (numeric.length === 1 && rowsDef.length === 1 && !rowsDef[0].atoms.some(a => /[A-Za-z=]/.test(a.ch)))) { ctx.pen(0.4); ctx.notes.push('only numbers (a table or a chart axis)'); }
    if (!atoms.some(a => /[A-Za-z\u0370-\u03ff=<>≤≥≈∈∑∫∏]/.test(a.ch) || a.node || a.bigop)) { ctx.pen(0.4); ctx.notes.push('no variable or relation'); }
  }
  if (kind === 'eq' && rowsDef.length >= 3 && !rowsDef.some(r => r.atoms.some(a => RELATIONS.has(a.ch) || a.bigop || a.node))) { ctx.pen(0.25); ctx.notes.push('looks like a table, not an equation'); }
  // a tall left brace with two or more rows to its right is a cases environment
  const brace = mains.find(a => !a.node && ((a.bigdelim && a.ch === '{') || (a.ch === '{' && a.s >= 0.88 * D && rowsDef.filter(r => r.atoms.some(t => t !== a && t.x0 >= a.x1 - 1.5)).length >= 2) || (ctx.exFonts.has(a.f) && (a.ch.codePointAt(0) === 0x1a || a.ch.codePointAt(0) === 0x08 || EX_ASCII[a.ch] === '{' || a.ch === '{')) || (ctx.syFonts?.has(a.f) && a.ch === 'f')));
  if (brace && rowsDef.length >= 2) {
    const right = a => a !== brace && a.x0 >= brace.x1 - 1.5, left = a => a !== brace && a.x1 <= brace.x0 + 1.5;
    const caseRows = rowsDef.filter(r => r.atoms.some(right));
    const byY = (a, rows) => rows.reduce((b, r) => (Math.abs(r.y - a.y) < Math.abs(b.y - a.y) ? r : b), rows[0]);
    if (caseRows.length >= 2) {
      const cells = caseRows.map(() => []);
      const rest = atoms.filter(a => a !== brace && right(a));
      for (const a of rest) cells[caseRows.indexOf(byY(a, caseRows))].push(a);
      const lhs = atoms.filter(left);
      const caseNode = { type: 'cases', rows: cells.map(row => {
        row.sort((p, q) => p.x0 - q.x0);
        let cut = -1;
        for (let i = 0; i < row.length - 1 && cut < 0; i++) { const w = row.slice(i).map(t => t.ch).join(''); if (/^(?:if|for|otherwise|when|else|where|with)/.test(w) && row[i].s >= 0.88 * D && (i === 0 || row[i].x0 - row[i - 1].x1 >= 0.6 * D)) cut = i; }
        if (cut < 0) { let gm = 0; for (let i = 1; i < row.length; i++) { const g = row[i].x0 - row[i - 1].x1; if (g > gm && g >= 1.8 * D && row[i].s >= 0.88 * D) { gm = g; cut = i; } } }
        const parts = cut > 0 ? [row.slice(0, cut), row.slice(cut)] : [row];
        return parts.map(part => layout(part, ctx, [], 'case'));
      }) };
      for (const a of rest) a.dead = true;
      brace.dead = true;
      const x0 = brace.x0, x1 = Math.max(...rest.map(a => a.x1)), yc = (caseRows[0].y + caseRows[caseRows.length - 1].y) / 2;
      const comp = { ch: '', node: caseNode, x0, x1, w: x1 - x0, y: yc, s: D, f: -1, font: '' };
      const lhsMain = lhs.filter(a => isMain(a)), lhsScr = lhs.filter(a => !isMain(a));
      mains = [...lhsMain, comp]; scripts = lhsScr;
      rowsDef.length = 0; rowsDef.push({ y: yc, atoms: mains.sort((p, q) => p.x0 - q.x0) });
    }
  }
  // attach scripts to bases
  const allMain = rowsDef.flatMap(r => r.atoms);
  const groups = [];   // { base, cls:'sup'|'sub', atoms, x1 }
  for (const sc of scripts.sort((p, q) => p.x0 - q.x0)) {
    const join = groups.find(g => sc.x0 - g.x1 <= 0.6 * sc.s && sc.x0 - g.x1 >= -0.5 * sc.s && Math.abs(sc.y - g.y) <= 0.4 * D);
    if (join) { join.atoms.push(sc); join.x1 = Math.max(join.x1, sc.x1); continue; }
    let best = null, bd = Infinity;
    for (const b of allMain) {
      const big = !!b.bigop || BIGOPS.has(b.ch);
      const hd = sc.x0 - b.x1, dy = sc.y - b.y, ccx = (sc.x0 + sc.x1) / 2;
      let ok;
      if (big) ok = (ccx >= b.x0 - 0.6 * D && ccx <= b.x1 + 0.6 * D || (hd >= -0.5 && hd <= 1.2 * D)) && Math.abs(dy) <= 1.6 * D;
      else ok = hd >= -0.45 * Math.max(b.x1 - b.x0, 4) - 0.6 && hd <= 1.1 * D && Math.abs(dy) <= 1.1 * D;
      if (!ok) continue;
      const score = Math.abs(hd) + 1.5 * Math.abs(dy);
      if (score < bd) { bd = score; best = b; }
    }
    if (!best) { ctx.stray.push(sc); ctx.notes.push('small glyph with no base'); continue; }
    const big = !!best.bigop || BIGOPS.has(best.ch), dy = sc.y - best.y;
    const cls = big ? (dy > 0.45 * D || sc.y > best.y + best.s * 0.55 ? 'sup' : 'sub') : (dy >= 0.12 * D ? 'sup' : 'sub');
    groups.push({ base: best, cls, atoms: [sc], x1: sc.x1, y: sc.y });
  }
  for (const g of groups) {
    const node = layout(g.atoms, ctx, [], 'script');
    const slot = g.cls === 'sup' ? 'sup' : 'sub';
    if (g.base[slot]) { g.base[slot] = { rows: [[...(g.base[slot].rows[0] ?? []), ...(node.rows[0] ?? [])]] }; ctx.pen(0.1); ctx.notes.push('two scripts in one place'); } else g.base[slot] = node;
  }
  const rows = rowsDef.map(r => r.atoms.map(a => itemOf(a, ctx)));
  for (const row of rows) for (const it of row) if (it.g && (it.sup || it.sub) && (it.g.kind === 'op' || it.g.kind === 'rel') && !it.g.big) { ctx.pen(0.3); ctx.notes.push('scripts on an operator (an unmarked fraction?)'); }
  for (let r = 0; r < rows.length; r++) {   // a slash-glyph before '=' is \ne; a bar glyph before an arrow is \mapsto
    const row = rows[r], out = [];
    for (let i = 0; i < row.length; i++) {
      const it = row[i], nx = row[i + 1];
      if (it.g?.slashed && nx?.g?.ch === '=') { out.push({ ...nx, g: { tex: '\\ne', kind: 'rel', ch: '≠' }, x0: it.x0 }); i++; continue; }
      if (it.g?.ch === '↦' && nx?.g?.ch === '→') { out.push(it); i++; continue; }
      out.push(it);
    }
    rows[r] = out;
  }
  mergeRuns(rows, ctx);
  return { rows, ys: rowsDef.map(r => r.y), x0s: rowsDef.map(r => r.atoms[0]?.x0 ?? 0), kind };
}
function itemOf(a, ctx) {
  if (a.node) return { node: a.node, x0: a.x0, x1: a.x1 };
  const g = glyph(a, ctx);
  return { g, x0: a.x0, x1: a.x1, sup: a.sup, sub: a.sub, acc: a.acc, s: a.s };
}
/** Letter runs: function names (exp, max, lim), prose words (where, for) and upper-case subscripts (BS) become one token. */
function mergeRuns(rows, ctx) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r], out = [];
    for (let i = 0; i < row.length;) {
      const it = row[i];
      if (!it.g || it.g.kind !== 'ord' || !isLetter(it.g.ch) || it.acc) { out.push(it); i++; continue; }
      let j = i, s = '';
      while (j < row.length && row[j].g && row[j].g.kind === 'ord' && isLetter(row[j].g.ch) && !row[j].acc && (j === i || (!row[j - 1].sup && !row[j - 1].sub && row[j].x0 - row[j - 1].x1 <= 0.25 * (row[j].s ?? 10)))) { s += row[j].g.ch; j++; }
      const run = row.slice(i, j);
      const lastHasScripts = !!(run[run.length - 1].sup || run[run.length - 1].sub);
      let done = false;
      for (let len = s.length; len >= 2 && !done; len--) {   // longest known name at the end of the run, e.g. "dexp" is rare; try whole run, then suffix
        for (const start of [0, s.length - len]) {
          const w = s.slice(start, start + len);
          if (start + len !== s.length && start !== 0) continue;
          if (FN_NAMES.has(w) && (start === 0 && len === s.length || start + len === s.length)) {
            const head = run.slice(0, start); out.push(...head);
            const tail = run[run.length - 1];
            out.push({ g: { tex: /^arg(?:min|max)$/.test(w) ? `\\operatorname{${w}}` : `\\${w}`, kind: 'fn', ch: w }, x0: run[start].x0, x1: tail.x1, sup: tail.sup, sub: tail.sub, s: tail.s });
            done = true; break;
          }
        }
      }
      if (!done) {   // a function name glued to the next letters (logS, expX): split after the name
        const m = s.match(/^(exp|log|ln|sin|cos|tan|max|min|sup|inf|lim|det|arg|sinh|cosh|tanh)([A-Za-z]+)$/);
        if (m && m[2].length <= 3 && !/^(?:ma|mi)/.test(m[2]) && run[m[1].length - 1] && !run[m[1].length - 1].sup && !run[m[1].length - 1].sub) {
          out.push({ g: { tex: `\\${m[1]}`, kind: 'fn', ch: m[1] }, x0: run[0].x0, x1: run[m[1].length - 1].x1, s: run[0].s }); out.push(...run.slice(m[1].length)); done = true;
        }
      }
      if (!done && TEXT_WORDS.has(s) && !lastHasScripts) { out.push({ g: { tex: `\\text{ ${s} }`, kind: 'text', ch: s }, x0: run[0].x0, x1: run[run.length - 1].x1 }); done = true; }
      if (!done) { out.push(...run); if (s.length >= 4) ctx.prose.push(s); }
      i = j;
    }
    rows[r] = out;
  }
}

// ── emitters ───────────────────────────────────────────────────────────────────────────────────────────────────
function texItem(it, ctx, depth) {
  if (it.node) return texNode(it.node, ctx, depth);
  let t = it.g.tex;
  if (it.g.kind === 'ord' && it.sub && !it.sup && depth > 0) { /* nothing */ }
  if (it.acc) for (const ac of it.acc) t = `${ac}{${t}}`;
  if (it.g.kind === 'prime') return t;
  if (it.g.kind === 'big' || it.g.kind === 'fn') { /* limits below */ }
  const sub = it.sub ? texScript(it.sub, ctx, depth + 1, true) : '', sup = it.sup ? texScript(it.sup, ctx, depth + 1, false) : '';
  if (it.g.ch === '√' || t === '\\sqrt') return '\\sqrt{}';
  if (sub || sup) {
    if (/^\\(?:text|square)/.test(t)) t = `{${t}}`;
    return `${t}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}`;
  }
  return t;
}
function texScript(node, ctx, depth, isSub) {
  const body = texRows(node, ctx, depth);
  const plain = body.replace(/\s+/g, '');
  if (isSub && /^[A-Z]{2,}$/.test(plain)) return `\\mathrm{${plain}}`;
  if (isSub && FN_NAMES.has(plain)) return `\\${plain}`;
  return body;
}
function texNode(n, ctx, depth) {
  if (n.type === 'frac') return `\\frac{${texRows(n.num, ctx, depth + 1)}}{${texRows(n.den, ctx, depth + 1)}}`;
  if (n.type === 'sqrt') return `\\sqrt${n.index ? `[${texRows(n.index, ctx, depth + 1)}]` : ''}{${texRows(n.body, ctx, depth + 1)}}`;
  if (n.type === 'over') return `\\overline{${texRows(n.body, ctx, depth + 1)}}`;
  if (n.type === 'cases') return `\\begin{cases}${n.rows.map(r => r.map(c => texRows(c, ctx, depth + 1)).join(' & ')).join(' \\\\ ')}\\end{cases}`;
  return '';
}
const NEEDS_SPACE = /(?:^|[^\\])\\[A-Za-z]+$/;
function joinTokens(toks) {
  let s = '';
  for (const t of toks) {
    if (!t) continue;
    if (s && (NEEDS_SPACE.test(s) || /^\\[A-Za-z]+$/.test(s.slice(s.lastIndexOf('\\')))) && /^[A-Za-z]/.test(t)) s += ' ';
    s += t;
  }
  return s;
}
/** One row to LaTeX: pairs round/square/angle brackets and turns the ones that enclose tall material into \left \right. */
function texRowTokens(row, ctx, depth) {
  const toks = row.map(it => ({ it, tex: texItem(it, ctx, depth), tall: !!(it.node || it.g.kind === 'big' || it.g?.big && it.g.kind === 'big') }));
  const stack = [];
  for (let i = 0; i < toks.length; i++) {
    const it = toks[i].it; if (!it.g) continue;
    if (it.g.kind === 'open') stack.push(i);
    else if (it.g.kind === 'close') {
      let j = stack.length - 1; while (j >= 0 && !pairs(toks[stack[j]].it.g.ch, it.g.ch)) j--;
      if (j < 0) { ctx.unbalanced++; continue; }
      const o = stack[j]; stack.length = j;
      const inner = toks.slice(o + 1, i);
      const tall = it.g.big || toks[o].it.g.big || inner.some(t => t.tall && (t.it.node?.type === 'frac' || t.it.g?.kind === 'big' || t.it.node?.type === 'sqrt' && JSON.stringify(t.it.node).includes('"frac"')));
      toks[o].paired = i; toks[i].paired = o;
      if (tall) { toks[o].left = true; toks[i].left = true; }
    }
  }
  ctx.unbalanced += stack.length;
  return toks.map(t => {
    if (t.left && t.it.g.kind === 'open') return `\\left${leftTok(t.tex)}`;
    if (t.left && t.it.g.kind === 'close') return closeLeft(t);
    return t.tex;
  });
}
function leftTok(s) { return s === '{' ? '\\{' : s; }
function closeLeft(t) { const m = t.tex.match(/^([^_^]+)((?:_\{.*\})?(?:\^\{.*\})?)$/s); return m ? `\\right${m[1]}${m[2]}` : `\\right${t.tex}`; }
function pairs(o, c) { return (o === '(' && c === ')') || (o === '[' && c === ']') || (o === '⟨' && c === '⟩') || (o === '⌈' && c === '⌉') || (o === '⌊' && c === '⌋') || (o === '{' && c === '}') || (o === '[' && c === ')') || (o === '(' && c === ']'); }
function texRows(node, ctx, depth) {
  const rows = node.rows ?? [];
  if (!rows.length) return '';
  if (rows.length === 1) return joinTokens(texRowTokens(rows[0], ctx, depth));
  if (depth > 0) ctx.pen(0.1);
  if (depth > 0) return rows.map(r => joinTokens(texRowTokens(r, ctx, depth))).join('\\ ');   // multi-line numerator or limit: rare, flagged
  // aligned at the first relation sign of each row
  const lines = rows.map((r, ri) => {
    const toks = texRowTokens(r, ctx, depth);
    let k = r.findIndex(it => it.g?.kind === 'rel');
    if (k < 0) { const lead = r[0]?.g?.kind === 'op'; return (lead ? '&' : '') + joinTokens(toks); }
    return joinTokens(toks.slice(0, k)) + '&' + joinTokens(toks.slice(k));
  });
  return `\\begin{aligned}${lines.join(' \\\\ ')}\\end{aligned}`;
}

// linear text for a model: sub/superscript markers, radicals, stacked fractions
function linItem(it) {
  if (it.node) {
    const n = it.node;
    if (n.type === 'frac') return `{${linRows(n.num)}}/{${linRows(n.den)}}`;
    if (n.type === 'sqrt') return `sqrt[${linRows(n.body)}]`;
    if (n.type === 'over') return `overline[${linRows(n.body)}]`;
    if (n.type === 'cases') return `cases{${n.rows.map(r => r.map(c => linRows(c)).join(' | ')).join(' ; ')}}`;
    return '';
  }
  let t = it.g.ch;
  if (it.g.kind === 'big') t = it.g.tex.replace('\\', '');
  if (it.g.kind === 'fn' || it.g.kind === 'text') t = it.g.ch;
  if (it.g.unknown) t = `<${it.g.ch.codePointAt(0).toString(16)}>`;
  if (it.acc) t = `${it.acc.map(a => a.replace('\\', '')).join('-')}(${t})`;
  return t + (it.sub ? `_{${linRows(it.sub)}}` : '') + (it.sup ? `^{${linRows(it.sup)}}` : '');
}
function linRows(node) {
  const rows = node.rows ?? [];
  return rows.map(r => r.map((it, i) => {
    const t = linItem(it);
    const prev = r[i - 1];
    const gap = prev && it.x0 - prev.x1 > 3.2;   // a visible word space
    return (gap ? ' ' : '') + t;
  }).join('').trim()).join(' ; ');
}

// ── confidence ─────────────────────────────────────────────────────────────────────────────────────────────────
function newCtx(exFonts, cls) {
  const ctx = { exFonts, miFonts: cls?.mi ?? new Set(), rmFonts: cls?.rm ?? new Set(), unknown: [], stray: [], notes: [], prose: [], unbalanced: 0, penalty: 0, pen(p) { ctx.penalty += p; } };
  return ctx;
}
// cmsy: pdf.js leaves some of its glyphs as their raw ASCII slot (h i = angle brackets, j k = bars, f g = braces)
const SY_SLOT = { '6': '\u0338', '7': '↦', h: '⟨', i: '⟩', j: '|', k: '‖', f: '{', g: '}' };
function findSyFonts(items) {
  const per = new Map();
  for (const i of items) { const e = per.get(i.fi) ?? { sym: 0, other: 0, set: new Set() }; per.set(i.fi, e); for (const ch of i.str) { if (/[−≤≥±×∈→∂∇∞·⋅∼≈≡]/.test(ch)) e.sym++; else if (/^[A-Za-z0-9\u0370-\u03ff]$/.test(ch) && !SY_SLOT[ch]) e.other++; e.set.add(ch); } }
  const sy = new Set(); for (const [f, e] of per) if (e.sym && !e.other) sy.add(f);
  return sy;
}
/** Fonts that carry raw control-character glyphs: cmex (big delimiters, no letters to speak of), cmmi (Greek in the low slots, many letters), cmr (capital Greek). */
function fontClasses(items) {
  const per = new Map();
  for (const i of items) {
    const e = per.get(i.fi) ?? { ctrl: 0, letters: new Set(), digits: 0, greek: 0 }; per.set(i.fi, e);
    for (const ch of i.str) { const c = ch.codePointAt(0); if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) e.ctrl++; else if (/[A-Za-z]/.test(ch)) e.letters.add(ch); else if (/\d/.test(ch)) e.digits++; else if (c >= 0x370 && c <= 0x3ff) e.greek++; }
  }
  const ex = new Set(), mi = new Set(), rm = new Set();
  for (const [f, e] of per) {
    if (!e.ctrl) continue;
    if (e.greek || e.letters.size >= 4) mi.add(f); else if (e.digits) rm.add(f); else ex.add(f);
  }
  return { ex, mi, rm };
}
function findExFonts(items) { return fontClasses(items).ex; }

/** Positioned items of an equation block -> LaTeX with a confidence. Never throws. */
export function toLatex(src, opts = {}) {
  const dead = { latex: '', conf: 0, notes: ['no geometry'], tag: null, lin: '' };
  try {
    const inp = readInput(src);
    if (!inp.items.length) return dead;
    const cls = fontClasses(inp.items), exFonts = cls.ex;
    // equation number at the right (or left) edge
    let tag = null;
    const xs = inp.items.map(i => i.x + i.w), xmax = Math.max(...xs);
    const numIt = inp.items.find(i => EQ_NUM.test(i.str.trim()) && inp.items.length > 1 && (i.x + i.w >= xmax - 0.5 || i.x <= Math.min(...inp.items.map(t => t.x)) + 0.5));
    let items = inp.items;
    if (numIt) { tag = numIt.str.trim().match(EQ_NUM)[1]; items = items.filter(i => i !== numIt); }
    else if (opts.label && /^[\w.]+$/.test(String(opts.label))) tag = String(opts.label);
    if (!items.length) return { ...dead, tag, notes: ['only an equation number'] };
    const ctx = newCtx(exFonts, cls); ctx.syFonts = findSyFonts(items);
    const atoms = toAtoms(items, ctx);
    // a stretched dash standing alone is a bar
    const rules = inp.rules.map(r => ({ ...r }));
    for (const a of atoms) if (/^[-−–—‾¯_]$/.test(a.ch) && a.w >= 1.6 * a.s * 0.5 && atoms.every(b => b === a || b.x1 <= a.x0 - 0.2 * a.s || b.x0 >= a.x1 + 0.2 * a.s || Math.abs(b.y - a.y) > 0.3 * a.s) && (a.x1 - a.x0) >= 1.3 * a.s) { /* handled below */ }
    const D = pickDominant(atoms);
    // unmatched wide dashes (only when the PDF text has no drawn rules there)
    for (const it of items) if (/^[-−–—‾¯_]{1}$/.test(it.str.trim()) && it.w >= 1.6 * it.h && !rules.some(r => Math.abs(r.y - (it.y + 0.3 * it.h)) < 0.4 * it.h && r.x0 < it.x + it.w && r.x1 > it.x)) { rules.push({ x0: it.x, x1: it.x + it.w, y: it.y + 0.3 * it.h, t: 0.5, pseudo: true }); const a = atoms.find(t => t.x0 === it.x && t.y === it.y && t.ch === it.str.trim()); if (a) a.dead = true; }
    const node = layout(atoms, ctx, rules, 'eq');
    const unused = rules.filter(r => !r.used && !r.skip && (r.x1 - r.x0) >= 0.5 * D && !r.pseudo).length;
    let body = texRows(node, ctx, 0).trim();
    // a lone radical sign without a bar
    if (/\\sqrt\{\}/.test(body)) { ctx.pen(0.3); ctx.notes.push('radical without a bar'); }
    body = body.replace(/(?:\\cdot){3}/g, '\\cdots ').replace(/(?:\.){3}/g, '\\ldots ');
    if (tag) body += `\\tag{${tag}}`;
    // confidence
    let conf = 1;
    if (ctx.unknown.length) { conf -= Math.min(0.7, 0.25 * ctx.unknown.length); ctx.notes.push(`unknown glyph ${[...new Set(ctx.unknown)].slice(0, 4).map(c => 'U+' + c.codePointAt(0).toString(16)).join(' ')}`); }
    if (ctx.stray.length) { conf -= Math.min(0.6, 0.25 * ctx.stray.length); }
    if (unused) { conf -= Math.min(0.4, 0.2 * unused); ctx.notes.push('drawn line not matched'); }
    if (ctx.unbalanced) { conf -= Math.min(0.5, 0.25 * ctx.unbalanced); ctx.notes.push('unbalanced brackets'); }
    if (ctx.prose.length) { const pr = ctx.prose.reduce((t, w) => t + (w.length >= 6 ? 0.3 : 0.12), 0); conf -= Math.min(0.5, pr); if (pr >= 0.2) ctx.notes.push('prose-like words'); }
    if (/\(\)|\[\]|\\left\(\\right\)/.test(body.replace(/\\left|\\right/g, ''))) { conf -= 0.25; ctx.notes.push('empty brackets'); }
    const nRows = (body.match(/\\\\/g) ?? []).length + 1; if (nRows > 4) conf -= 0.08 * (nRows - 4);
    conf -= ctx.penalty;
    if (/\\square/.test(body)) conf = Math.min(conf, 0.45);
    if (!body.replace(/\\tag\{[^}]*\}/, '').trim()) conf = 0;
    if (body.length > 900) conf -= 0.2;
    conf = Math.max(0, Math.min(1, Math.round(conf * 100) / 100));
    return { latex: body, conf, notes: [...new Set(ctx.notes)], tag, lin: linRows(node) };
  } catch (e) { return { ...dead, notes: [`error: ${String(e?.message ?? e).slice(0, 80)}`] }; }
}

/** The geometry as compact text for a model (see header). */
export function linearize(src) {
  try {
    const inp = readInput(src);
    if (!inp.items.length) return '';
    const cls = fontClasses(inp.items), exFonts = cls.ex;
    const items = inp.items.filter(i => !EQ_NUM.test(i.str.trim()) || inp.items.length === 1);
    const ctx = newCtx(exFonts, cls); ctx.syFonts = findSyFonts(items);
    const atoms = toAtoms(items, ctx);
    const node = layout(atoms, ctx, inp.rules.map(r => ({ ...r })), 'eq');
    return linRows(node);
  } catch { return ''; }
}

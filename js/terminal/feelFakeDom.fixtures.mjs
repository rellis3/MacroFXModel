// js/terminal/feelFakeDom.fixtures.mjs: a small stand-in DOM for the command line and linked selection tests (the repo has no jsdom).
// It parses the simple markup those modules write (tags, double-quoted attributes, text), answers the selectors they use (tag, #id, .class,
// [attr], [attr="v"], compounds, commas, descendant spaces), and fires events through capture and bubble listeners. It is a behavioural stand-in,
// not a browser: the tests say what is and is not verified.
const VOID = new Set(['input', 'br', 'img']);
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const unent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

function parseCompound(c) {
  const out = { tag: null, id: null, cls: [], attrs: [] };
  const re = /^([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  let m, last = 0;
  while ((m = re.exec(c))) {
    if (m.index !== last) throw new Error(`unsupported selector part ${c}`);
    last = re.lastIndex;
    if (m[1]) out.tag = m[1].toLowerCase(); else if (m[2]) out.id = m[2]; else if (m[3]) out.cls.push(m[3]); else out.attrs.push([m[4], m[5] ?? null]);
  }
  if (last !== c.length) throw new Error(`unsupported selector part ${c}`);
  return out;
}
const matchComp = (el, p) => (!p.tag || el.tag === p.tag) && (!p.id || el.attrs.id === p.id) && p.cls.every(k => (el.attrs.class ?? '').split(/\s+/).includes(k))
  && p.attrs.every(([n, v]) => (v == null ? n in el.attrs : el.attrs[n] === v));
const parseSel = sel => String(sel).split(',').map(s => s.trim().split(/\s+/).map(parseCompound));
function matchesSel(el, groups) {
  return groups.some(parts => {
    if (!matchComp(el, parts[parts.length - 1])) return false;
    let node = el.parent, i = parts.length - 2;
    while (i >= 0 && node) { if (node.tag && matchComp(node, parts[i])) i--; node = node.parent; }
    return i < 0;
  });
}

export class El {
  constructor(tag = 'div', attrs = {}) { this.tag = tag.toLowerCase(); this.attrs = { ...attrs }; this.kids = []; this.parent = null; this.text = ''; this.listeners = {}; this.value = attrs.value ?? ''; this.disabled = false; this.focused = false; this.scrolled = 0; this.clicks = 0; }
  get tagName() { return this.tag.toUpperCase(); }
  get isContentEditable() { return false; }
  get id() { return this.attrs.id ?? ''; } set id(v) { this.attrs.id = v; }
  get className() { return this.attrs.class ?? ''; } set className(v) { this.attrs.class = v; }
  get hidden() { return 'hidden' in this.attrs; } set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get title() { return this.attrs.title ?? ''; } set title(v) { this.attrs.title = v; }
  get dataset() {
    const a = this.attrs;
    return new Proxy({}, { get: (_, k) => (typeof k === 'string' && `data-${kebab(k)}` in a ? a[`data-${kebab(k)}`] : undefined), set: (_, k, v) => { a[`data-${kebab(k)}`] = String(v); return true; }, has: (_, k) => `data-${kebab(k)}` in a });
  }
  get classList() { return { add: c => { const s = new Set((this.attrs.class ?? '').split(/\s+/).filter(Boolean)); s.add(c); this.attrs.class = [...s].join(' '); } }; }
  get textContent() { return this.text + this.kids.map(k => k.textContent).join(''); } set textContent(v) { this.kids = []; this.text = String(v); }
  get innerHTML() { return this._html ?? this.textContent; }
  set innerHTML(html) { this._html = html; this.kids = []; this.text = ''; parseInto(this, html); }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return n in this.attrs; }
  matches(sel) { return matchesSel(this, parseSel(sel)); }
  closest(sel) { const g = parseSel(sel); for (let e = this; e && e.tag; e = e.parent) if (matchesSel(e, g)) return e; return null; }
  querySelectorAll(sel) { const g = parseSel(sel), out = []; const walk = n => { for (const k of n.kids) { if (matchesSel(k, g)) out.push(k); walk(k); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  appendChild(k) { k.parent = this; this.kids.push(k); return k; }
  insertBefore(k, ref) { if (k.parent) k.remove(); k.parent = this; const i = ref ? this.kids.indexOf(ref) : -1; if (i < 0) this.kids.push(k); else this.kids.splice(i, 0, k); return k; }
  get parentNode() { return this.parent; }
  get firstChild() { return this.kids[0] ?? null; }
  get nextSibling() { const p = this.parent; if (!p) return null; const i = p.kids.indexOf(this); return p.kids[i + 1] ?? null; }
  remove() { if (this.parent) this.parent.kids = this.parent.kids.filter(k => k !== this); this.parent = null; }
  addEventListener(t, fn, cap) { (this.listeners[t] ??= []).push({ fn, cap: cap === true || cap?.capture === true }); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] ?? []).filter(l => l.fn !== fn); }
  focus() { this.focused = true; const d = this.ownerDoc; if (d) d.activeElement = this; }
  click() { this.clicks++; this.ownerDoc?.fire('click', this); }
  scrollIntoView() { this.scrolled++; }
  getBoundingClientRect() { return { top: 0, bottom: 1, left: 0, right: 1, width: 1, height: 1 }; }
  get ownerDoc() { let e = this; while (e.parent) e = e.parent; return e.doc ?? null; }
}

function parseInto(root, html) {
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  const stack = [root];
  let m;
  while ((m = re.exec(html))) {
    const cur = stack[stack.length - 1];
    if (m[5] != null) { const t = unent(m[5]); cur.kids.length === 0 && !cur.kids.some(k => k.tag) ? (cur.text += t) : cur.appendChild(Object.assign(new El('#text'), { text: t })); continue; }
    if (m[1]) { if (stack.length > 1) stack.pop(); continue; }
    const el = new El(m[2]);
    for (const a of m[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) el.attrs[a[1]] = a[2] == null ? '' : unent(a[2]);
    if (el.tag === 'input') el.value = el.attrs.value ?? '';
    cur.appendChild(el);
    if (!VOID.has(el.tag) && !m[4]) stack.push(el);
  }
}

export class FakeDoc {
  constructor() {
    this.root = new El('html'); this.root.doc = this;
    this.body = this.root.appendChild(new El('body'));
    this.activeElement = this.body;
    this.docListeners = {};
  }
  createElement(t) { return new El(t); }
  getElementById(id) { return this.root.querySelector(`#${id}`); }
  querySelector(s) { return this.root.querySelector(s); }
  querySelectorAll(s) { return this.root.querySelectorAll(s); }
  addEventListener(t, fn, cap) { (this.docListeners[t] ??= []).push({ fn, cap: cap === true || cap?.capture === true }); }
  removeEventListener(t, fn) { this.docListeners[t] = (this.docListeners[t] ?? []).filter(l => l.fn !== fn); }
  /** Fire an event at target: document capture listeners, the target's own, then document bubble listeners. Returns the event. */
  fire(type, target, extra = {}) {
    const e = { type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    const run = l => { if (l.fn) l.fn(e); };
    for (const l of [...(this.docListeners[type] ?? [])].filter(x => x.cap)) run(l);
    const path = []; for (let n = target; n && n.tag; n = n.parent) path.push(n);
    for (const n of path) for (const l of [...(n.listeners[type] ?? [])]) run(l);
    for (const l of [...(this.docListeners[type] ?? [])].filter(x => !x.cap)) run(l);
    return e;
  }
}

/** A document with the shell the terminal gives these modules: tabs, sections, the top-bar buttons. */
export function makePage() {
  const doc = new FakeDoc();
  doc.root.doc = doc;
  const host = new El('div'); doc.body.appendChild(host);
  host.innerHTML = `<button id="cmdbtn" hidden></button><button id="linkchip" hidden></button>
<nav id="tabs"><button data-t="overview" aria-selected="true">Overview</button><button data-t="pair" aria-selected="false">Pair</button><button data-t="replay" aria-selected="false">Replay</button><button data-t="macro" aria-selected="false">Macro</button><button data-t="assets" aria-selected="false">Assets</button></nav>
<main><section id="overview"><div class="cs-row" data-ccy="EUR"></div><div class="cs-row" data-ccy="USD"></div><div class="cs-row" data-ccy="JPY"></div></section>
<section id="assets" hidden><div class="card click" data-inst="NQ" id="card-nq"></div><div class="card click" data-inst="GOLD" id="card-gold"></div><div class="vc-tile" data-lk-inst="NQ" id="vc-nq"></div><div class="tfp-host"><button class="tfp-b" data-tf="5m" aria-pressed="false"></button><button class="tfp-b" data-tf="15m" aria-pressed="false"></button><button class="tfp-b" data-tf="4h" aria-pressed="false"></button></div></section>
<section id="pair" hidden><select id="tt-sel"></select><button data-p="GBPUSD" id="pq-gbp"></button><div data-pair="NQ" id="pair-row"></div></section>
<section id="replay" hidden><select id="rp-inst"></select><input id="rp-date"></section></main>`;
  // tab buttons switch aria-selected like the page does
  for (const b of doc.querySelectorAll('#tabs [data-t]')) b.addEventListener('click', () => { for (const x of doc.querySelectorAll('#tabs [data-t]')) x.attrs['aria-selected'] = String(x === b); });
  return doc;
}

/** A window stand-in: spies for the hooks the terminal sets, a manual timer queue, a no-op MutationObserver. */
export function makeWin(doc, extra = {}) {
  const calls = { pair: [], replay: [], macro: [], modal: [] }, timers = [];
  const win = {
    document: doc, location: { hash: '' }, calls, timers,
    openPairPage: inst => { calls.pair.push(inst); const s = doc.getElementById('tt-sel'); if (s) s.value = inst; },
    openReplay: (inst, ts) => { calls.replay.push([inst, ts]); return true; },
    openMacroBoard: id => { calls.macro.push(id); return true; },
    ccyModal: c => calls.modal.push(c),
    matchMedia: () => ({ matches: true }),
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: fn => { fn(); return 1; },
    setTimeout: fn => { timers.push(fn); return timers.length; },
    dispatchEvent() {},
    flush() { while (timers.length) timers.shift()(); },
    ...extra,
  };
  return win;
}
export const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

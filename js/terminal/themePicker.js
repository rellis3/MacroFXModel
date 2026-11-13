// The Desk Terminal's theme picker: a chip in the top bar (palette icon + the current theme's name) that opens a popover of swatches.
// A pick sets data-theme on <html>, is remembered in localStorage ('deskTheme'), and fires a 'themechange' event so anything drawn from code
// (charts, the map) can read the new colours and redraw (see themeColors.js). The page's <head> already applied the saved theme before first paint.
// 'default' is the original palette and is the absence of the attribute. Nothing here is a setting that costs anything or reveals anything, so every
// session has it (it is registered as a shell widget with no hide reason).
import { THEMES, THEME_KEY, themeById } from './themes.js';

const root = document.documentElement;

export function currentTheme() {
  const a = root.getAttribute('data-theme');
  return THEMES.some(t => t.id === a) ? a : 'default';
}

function ensureFont(theme) {
  if (!theme.fontHref || document.getElementById('themeFont')) return;
  const l = document.createElement('link');
  l.id = 'themeFont'; l.rel = 'stylesheet'; l.setAttribute('href', theme.fontHref);
  document.head.appendChild(l);
}

export function applyTheme(id, { save = true } = {}) {
  const theme = themeById(id);
  if (theme.id === 'default') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme.id);
  ensureFont(theme);
  if (save) { try { localStorage.setItem(THEME_KEY, theme.id); } catch (e) { /* private window: the pick lasts for this page */ } }
  const name = document.getElementById('themename'); if (name) name.textContent = theme.label;
  document.querySelectorAll('.topt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeId === theme.id)));
  window.dispatchEvent(new CustomEvent('themechange', { detail: { id: theme.id } }));
  return theme.id;
}

function build(pop) {
  pop.innerHTML = '';
  const h = document.createElement('div'); h.className = 'tph'; h.textContent = 'Colour theme'; pop.appendChild(h);
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'topt'; b.setAttribute('role', 'menuitemradio'); b.dataset.themeId = t.id;
    b.setAttribute('aria-checked', String(t.id === currentTheme()));
    const sw = document.createElement('span'); sw.className = 'sw'; sw.setAttribute('aria-hidden', 'true');
    for (const c of t.swatch) { const i = document.createElement('i'); i.style.background = c; sw.appendChild(i); }
    const txt = document.createElement('span');
    const n = document.createElement('span'); n.className = 'tn'; n.textContent = t.label;
    const d = document.createElement('span'); d.className = 'tt'; d.textContent = t.note;
    txt.append(n, d); b.append(sw, txt);
    pop.appendChild(b);
  }
}

export function initThemePicker() {
  const btn = document.getElementById('themebtn'), pop = document.getElementById('themepop');
  if (!btn || !pop) return;
  build(pop);
  const name = document.getElementById('themename'); if (name) name.textContent = themeById(currentTheme()).label;
  const items = () => [...pop.querySelectorAll('.topt')];
  const open = () => { pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); (items().find(b => b.getAttribute('aria-checked') === 'true') ?? items()[0])?.focus(); };
  const close = (focusBtn) => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focusBtn) btn.focus(); };
  btn.addEventListener('click', () => (pop.hidden ? open() : close(false)));
  pop.addEventListener('click', e => { const b = e.target.closest('.topt'); if (b) { applyTheme(b.dataset.themeId); close(true); } });
  pop.addEventListener('keydown', e => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
  });
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close(false); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initThemePicker); else initThemePicker();
}

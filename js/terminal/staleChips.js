// js/terminal/staleChips.js: a small "source stale since" chip on the boards that draw a feed the Info map flags as stale, blocked or
// laptop-dependent (review 2026-11-27: the Info map listed CVOL frozen since 21 Aug, EVZ ended Mar 2025, RBNZ blocked and the laptop-pulled
// central-bank paths, but the boards that use those feeds said nothing). The flag text is the Info map's own (js/infoMap.js FAMILIES[].flag),
// so the two never disagree; this file only says which board draws which family.
//
// Pure half: STALE_SURFACES, staleNote(), chipHtml(). paint(doc) puts one chip at the top of each mapped board that is on the page and has
// none yet; install(doc, win) repaints when the page changes (throttled). Tested in js/terminal/staleChips.test.mjs.
import { FAMILIES, FLAG_KINDS } from '../infoMap.js';

/** board surface id -> Info map family id (js/infoMap.js) */
export const STALE_SURFACES = {
  'panel.macro.cbboard': 'rbnz-statement-tone',
  'panel.macro.fedyields': 'fed-path-odds',
  'panel.macro.cbfutures': 'policy-rates-and-priced-path',
  'panel.macro.pathdiff': 'policy-rates-and-priced-path',
  'panel.macro.xccy': 'cross-currency-basis',
  'panel.ov.riskstate': 'risk-state',
  'panel.asset.volclock': 'vol-forecast-family',
  'panel.ana.volfc': 'vol-forecast-family',
  'panel.macro.vol': 'vix-complex-and-surface-lab',
  'panel.opt.skew': 'options-skew-and-iv-term',
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// script and plan paths stay out of what the board says (they are the Info map's owner detail)
const noPaths = t => String(t ?? '').replace(/\s*\((?:[^()]*\b[\w./-]+\.(?:bat|md|py|mjs|js|ps1|sh)\b[^()]*)\)/g, '').replace(/\b[\w./-]+\.(?:bat|md|py|mjs|js|ps1|sh)\b/g, 'a laptop script');

// what the chip names (the family's feed, in a word or two)
const WHAT = { 'rbnz-statement-tone': 'RBNZ statements', 'risk-state': 'EVZ flag', 'vol-forecast-family': 'CVOL', 'vix-complex-and-surface-lab': 'CVOL' };
const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
/** The chip's words for a family: { short, long } or null when the family is not flagged (or is retired: nothing draws it). */
export function staleNote(familyId, fams = FAMILIES) {
  const f = fams.find(x => x.id === familyId), fl = f?.flag;
  if (!fl || fl.kind === 'retired') return null;
  const text = noPaths(fl.text);
  const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text)?.[1] ?? null;
  const since = date ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : /since (\w+)/.exec(text)?.[1] ?? null;
  const what = WHAT[familyId] ?? 'source';
  const short = fl.kind === 'laptop' ? 'laptop feed: check its date' : fl.kind === 'blocked' ? `${what} blocked${since && MON[since.slice(0, 3)] ? ` since ${since}` : ''}` : `${what} stale${since ? ` since ${since}` : ''}`;
  return { short, long: `${FLAG_KINDS[fl.kind] ?? fl.kind}: ${text}`, kind: fl.kind };
}
export const chipHtml = n => (n ? `<span class="chip gold stale-src" title="${esc(n.long)}">${esc(n.short)}</span>` : '');

/** Put a chip at the top of each mapped board on the page that has none. Returns how many it added. */
export function paint(doc = globalThis.document) {
  let added = 0;
  for (const [sid, fam] of Object.entries(STALE_SURFACES)) {
    const n = staleNote(fam); if (!n) continue;
    for (const el of doc.querySelectorAll(`[data-surface="${sid}"]`)) {
      if (el.querySelector('.stale-src') || !el.textContent.trim()) continue;   // already there, or the board has not drawn yet
      const host = el.querySelector('.card .ch .r, .card .ch, .sec, .card') ?? el;
      host.insertAdjacentHTML(host.classList.contains('r') || host.classList.contains('ch') || host.classList.contains('sec') ? 'beforeend' : 'afterbegin', ` ${chipHtml(n)}`);
      added++;
    }
  }
  return added;
}
/** Repaint after the page changes, at most every 800 ms. */
export function install(doc = globalThis.document, win = globalThis) {
  let t = null;
  const go = () => { t = null; try { paint(doc); } catch (e) { console.warn('stale chips', e); } };
  const obs = new win.MutationObserver(() => { if (!t) t = win.setTimeout(go, 800); });
  obs.observe(doc.body, { childList: true, subtree: true });
  go();
  return obs;
}

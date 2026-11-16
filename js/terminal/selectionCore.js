// js/terminal/selectionCore.js: the ONE shared selection of the Desk Terminal (which market, which candle size, which moment), pure and DOM-free.
//
// Linked selection (owner build list, 2026-11-15): when it is on, the Pair page, the Replay, the strength board, the vol clock, the asset cards and
// the chart candle size all read and write this one object, so picking a market in one place moves the others. js/terminal/linkedSelection.js is
// the DOM glue; this file is the state, the validation and the persistence, and is tested by selectionCore.test.mjs.
//
// What is kept: { inst, tf, date, ts }. inst is a desk market key (EURUSD, NQ, GOLD ...), tf one of the chart candle sizes, date a London
// calendar day (YYYY-MM-DD) and ts a moment in ms. Anything that does not validate is dropped, never stored. The last selection is remembered in
// localStorage (every access in try/catch: a private window must still work), and so is the on/off state of the link.
import { TF_KEYS } from '../deskBarsCore.js';
import { legsOf } from './pairView.js';

export const SEL_KEY = 'deskSel:v1';
export const LINK_KEY = 'deskLinked:v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Keep only the valid parts of a selection. Unknown keys and bad values are dropped. */
export function cleanSel(raw) {
  const o = {};
  if (!raw || typeof raw !== 'object') return o;
  const inst = typeof raw.inst === 'string' ? raw.inst.trim().toUpperCase() : '';
  if (/^[A-Z0-9]{2,12}$/.test(inst)) o.inst = inst;
  if (TF_KEYS.includes(raw.tf)) o.tf = raw.tf;
  if (typeof raw.date === 'string' && DATE_RE.test(raw.date) && !Number.isNaN(Date.parse(`${raw.date}T12:00:00Z`))) o.date = raw.date;
  if (Number.isFinite(raw.ts) && raw.ts > 0) o.ts = Math.round(raw.ts);
  return o;
}

const safeStore = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/**
 * createSelection({ store }) -> { get, set, subscribe, linked, setLinked, clear }
 *   set(patch, source) merges the valid parts of patch; returns the list of keys that changed (empty = nothing to tell anyone).
 *   subscribe(fn) calls fn({ sel, changed, source }) on every real change; returns an unsubscribe function.
 *   A change of market alone keeps the date and moment (the same moment in another market is the point of linking).
 */
export function createSelection({ store = safeStore() } = {}) {
  let sel = {}, link = true;
  try { sel = cleanSel(JSON.parse(store?.getItem(SEL_KEY) ?? 'null')); } catch { sel = {}; }
  try { link = store?.getItem(LINK_KEY) !== 'off'; } catch { link = true; }
  const subs = new Set();
  const save = () => { try { store?.setItem(SEL_KEY, JSON.stringify(sel)); } catch { /* storage blocked: the choice lasts for this page only */ } };
  const emit = (changed, source) => { for (const fn of [...subs]) { try { fn({ sel: { ...sel }, changed, source }); } catch { /* one listener must not stop the rest */ } } };
  return {
    get: () => ({ ...sel }),
    set(patch, source = '') {
      const c = cleanSel(patch), changed = [];
      for (const k of Object.keys(c)) if (sel[k] !== c[k]) { sel[k] = c[k]; changed.push(k); }
      // a new date without its own moment drops the old moment (it belongs to the old day)
      if (changed.includes('date') && !('ts' in c) && sel.ts !== undefined) { delete sel.ts; changed.push('ts'); }
      if (changed.length) { save(); emit(changed, source); }
      return changed;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    linked: () => link,
    setLinked(on, source = '') {
      const v = !!on; if (v === link) return link;
      link = v;
      try { store?.setItem(LINK_KEY, v ? 'on' : 'off'); } catch { /* ignore */ }
      emit(['linked'], source);
      return link;
    },
    clear() { sel = {}; save(); emit(['inst', 'tf', 'date', 'ts'], 'clear'); },
  };
}

/** Currencies a selected market is made of, for highlighting the strength board: EURUSD -> ['EUR', 'USD']; non-FX markets -> []. */
export function ccyLegs(inst) {
  const l = legsOf(inst);
  return l && l[0] ? [l[0], l[1]] : [];
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The text on the top-bar chip: "NQ · 12 Nov 14:30 · 1h" (only the parts that are set). */
export function describeSel(sel, { londonHM = null } = {}) {
  if (!sel?.inst) return 'nothing picked yet';
  const out = [sel.inst];
  if (sel.date) { const [, m, d] = sel.date.split('-'); out.push(`${+d} ${MON[+m - 1]}${sel.ts && londonHM ? ` ${londonHM(sel.ts)}` : ''}`); }
  if (sel.tf) out.push(sel.tf);
  return out.join(' · ');
}

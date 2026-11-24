/**
 * LAYER 2 on the CFD QLIKE per-line base: event-day widths, central banks + FOMC only (ladder-event-layer-cb-fomc,
 * forge/LADDER_EVENT_LAYER_CB_FOMC_PREREG.md). SHADOW, switchable, never edits the base.
 *
 *   level = base level (js/ladderV2Qlike.js) x mult[line][bucket][tau]   on an FOMC day or a decision day of one of the
 *   instrument's own central banks (CB wins if both); x1 every other day. Remove this layer -> the base, exactly.
 *
 * Multipliers: js/ladderV2EventLayerCfdParams.json (scripts/ladder-event-layer-cb-fomc/fit_layer.py). Decision dates:
 * the hand-kept bank calendars, so the live tag never depends on a vendor's event names.
 */
import { readFileSync, existsSync } from 'node:fs';
import { FOMC_MEETINGS } from './fomcCalendar.js';
import { ECB_MEETINGS } from './ecbCalendar.js';
import { BOE_MEETINGS } from './boeCalendar.js';
import { BOJ_MEETINGS } from './bojCalendar.js';
import { BOC_MEETINGS } from './bocCalendar.js';
import { RBA_MEETINGS } from './rbaCalendar.js';
import { RBNZ_MEETINGS } from './rbnzCalendar.js';
import { SNB_MEETINGS } from './snbCalendar.js';

const u = new URL('./ladderV2EventLayerCfdParams.json', import.meta.url);
export const EVENT_LAYER = existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : { instruments: {} };

const days = M => new Set(M.map(m => m.date));
const BANKS = {
  EUR: ['ECB', days(ECB_MEETINGS)], GBP: ['BoE', days(BOE_MEETINGS)], JPY: ['BoJ', days(BOJ_MEETINGS)],
  CAD: ['BoC', days(BOC_MEETINGS)], AUD: ['RBA', days(RBA_MEETINGS)], NZD: ['RBNZ', days(RBNZ_MEETINGS)],
  CHF: ['SNB', days(SNB_MEETINGS)],
};
const FOMC = days(FOMC_MEETINGS);
const TAUS = ['50', '75', '90'];
const SHORT = { hl: 'HL', oh: 'OH', ol: 'OL', cup: 'C+', cdn: 'C-' };

/** { bucket: 'CB' | 'FOMC', label } for this instrument on this London session date, or null (layer is x1). */
export function eventLayerTag(sym, session) {
  const P = EVENT_LAYER.instruments[sym];
  if (!P) return null;
  const cb = (P.ccys ?? []).filter(c => BANKS[c] && BANKS[c][1].has(session)).map(c => BANKS[c][0]);
  if (cb.length) return { bucket: 'CB', label: `${cb.join(' + ')} decision${FOMC.has(session) ? ' (+ FOMC)' : ''}` };
  if (FOMC.has(session)) return { bucket: 'FOMC', label: 'FOMC decision' };
  return null;
}

/** Layer-2 levels from a base qlikeDayLevels object: { tag, label, lines: { q: { p50, p75, p90, mult } } } or null. */
export function eventLayerLevels(sym, base, session) {
  const tag = eventLayerTag(sym, session);
  if (!tag || !base) return null;
  const L = EVENT_LAYER.instruments[sym].lines;
  const lines = {};
  for (const q of Object.keys(SHORT)) {
    if (base[`${q}_p50`] == null || !L[q]) continue;
    const m = L[q].mult[tag.bucket];
    lines[q] = Object.fromEntries(TAUS.map(t => [`p${t}`, base[`${q}_p${t}`] * m[t]]));
    lines[q].mult = m;
  }
  return { ...tag, lines };
}

/** Extra export rows for one instrument block ('EV2 ...'); [] on ordinary days. Base rows are never changed. */
export function eventLayerRows(sym, base, session) {
  const ev = eventLayerLevels(sym, base, session);
  if (!ev) return [];
  const out = [`Layer 2 today: ${ev.label} (verdict ${EVENT_LAYER.verdict ?? 'pending'}; tick "Event layer" to use)`];
  for (const [q, v] of Object.entries(ev.lines)) {
    out.push(`EV2 ${SHORT[q].padEnd(3)}: ${v.p50.toFixed(2)}% median · ${v.p75.toFixed(2)}% 75th · ${v.p90.toFixed(2)}% 90th  [x${v.mult['50'].toFixed(2)}]`);
  }
  return out;
}

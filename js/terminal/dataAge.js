// js/terminal/dataAge.js: the one "data age" chip for tiles fed by a laptop pull (Fed path ZQ strip, central-bank expectations, options skew,
// QuikStrike open interest, cross-currency basis). If the laptop is off, Railway serves the last copy with its old date, so every such tile
// carries its age and goes amber, then red, past a threshold. The state is in words as well as colour ("stale", "very stale"), never colour alone.
// Pure: no DOM, no fetch. Colours come from the existing .chip.gold / .chip.dn tokens, so every theme follows.

import { clockState } from '../marketClock.js';

const HOUR = 3600e3;

/** Hours since an ISO / epoch-ms timestamp (or a 'YYYY-MM-DD' date, read as the end of that UTC day); null when it cannot be read. */
export function ageHours(asOf, now = Date.now()) {
  if (asOf == null || asOf === '') return null;
  let t = typeof asOf === 'number' ? asOf : Date.parse(String(asOf));
  if (typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) t += 24 * HOUR;
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now - t) / HOUR);
}

/** 'ok' | 'warn' | 'bad' | 'unknown' for an age in hours against a warn and a bad threshold. */
export function ageLevel(h, { warnH = 36, badH = 96 } = {}) {
  if (h == null || !Number.isFinite(h)) return 'unknown';
  return h >= badH ? 'bad' : h >= warnH ? 'warn' : 'ok';
}

/** '5h', '3 days', 'just now'. */
export function ageWords(h) {
  if (h == null || !Number.isFinite(h)) return 'age unknown';
  if (h < 1) return 'just now';
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const CLASS = { ok: '', warn: ' gold', bad: ' dn', unknown: ' gold' };
const TAG = { ok: '', warn: ' · stale', bad: ' · very stale', unknown: '' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The chip. Give it the data's own timestamp (`asOf`, or `ageH` when the route already computed it).
 * `what` is the plain label ("futures pulled", "skew pulled"); `warnH` / `badH` are per-feed thresholds.
 * Always rendered, so a fresh tile also shows when it was pulled, and a tile with no timestamp says so.
 */
export function ageChip({ asOf = null, ageH = null, what = 'pulled', warnH = 36, badH = 96, now = Date.now(), source = 'laptop pull' } = {}) {
  const h = ageH != null && Number.isFinite(Number(ageH)) ? Number(ageH) : ageHours(asOf, now);
  const lv = ageLevel(h, { warnH, badH });
  const title = lv === 'ok' ? `${what} ${ageWords(h)} (${source})`
    : lv === 'unknown' ? `${what}: no timestamp on this feed (${source})`
      : `${what} ${ageWords(h)}. This tile is fed by a ${source}; if the laptop is off the server keeps showing the last copy.`;
  return `<span class="chip dage${CLASS[lv]}" data-age="${lv}" title="${esc(title)}">${esc(what)} ${esc(ageWords(h))}${TAG[lv]}</span>`;
}

/** The set of tiles this covers, with their thresholds, so a test can check every laptop-fed tile has one. */
export const LAPTOP_TILES = {
  'fed-path-zq': { what: 'strip pulled', warnH: 36, badH: 96 },          // nightly 22:30 UK task
  'cb-expectations': { what: 'futures pulled', warnH: 48, badH: 120 },    // pushed by run_cb_expectations.bat; no scheduled task existed until the owner creates one (plans/LAPTOP_TASKS.md)
  'options-skew': { what: 'skew pulled', warnH: 48, badH: 120 },          // pushed by run_cb_expectations.bat; no scheduled task existed until the owner creates one (plans/LAPTOP_TASKS.md)
  'oi-store': { what: 'open interest saved', warnH: 36, badH: 96 },       // nightly QuikStrike capture
  'xccy-basis': { what: 'basis pulled', warnH: 48, badH: 120 },
};
export const tileChip = (id, o = {}) => ageChip({ ...(LAPTOP_TILES[id] ?? {}), ...o });

/**
 * The retail-crowd (OANDA position book) row on the Pair tab. The book is still served and recorded every 10 minutes while the FX week
 * is open, but it moves slowly (about 0.3 points of spread over two weeks on EUR/USD), and OANDA freezes it from the Friday close to the
 * Sunday reopen. So: while the market is shut it says "as at <close>" and is never flagged stale; while it is open, 3h amber, 24h red.
 */
export function bookChip(atMs, { now = Date.now(), esc: e = esc } = {}) {
  const st = clockState(now);
  if (!st.open) {
    const h = ageHours(atMs, now);
    return `<span class="chip dage" data-age="shut" title="${e('OANDA freezes the book from the Friday close to the Sunday reopen; this is the last reading before the close.')}">${e(st.short ?? 'market closed')}${h != null ? '' : ' · no reading'}</span>`;
  }
  return ageChip({ asOf: atMs, what: 'book read', warnH: 3, badH: 24, now, source: 'OANDA position book' });
}

globalThis.dataAge = { ageHours, ageLevel, ageWords, ageChip, tileChip, bookChip, LAPTOP_TILES };

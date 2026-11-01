/**
 * I/O for the long-history sections of /api/state: committed seeds merged with the R2 archive (js/dataArchive.js).
 * The seeds mean the engine shows deep history from the first boot; the archive keeps it current. Cached 6h.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadSeed, mergeByDate } from './marketHistory.js';
import { COT_MARKETS } from './cotArchive.js';

export const HISTORY_CBOE = ['VIX', 'VIX3M', 'VVIX', 'SKEW', 'OVX', 'GVZ', 'VXEEM', 'VXTLT'];
export const HISTORY_YAHOO = ['MOVE', 'TNX', 'HYG', 'IEF', 'LQD', 'FX_EURUSD', 'FX_GBPUSD', 'FX_AUDUSD', 'FX_NZDUSD', 'FX_JPY', 'FX_CAD', 'FX_CHF', 'FX_NOK', 'FX_SEK',
  'FX_MXN', 'FX_BRL', 'FX_TRY', 'FX_INR', 'FX_IDR', 'FX_KRW', 'FX_TWD', 'FX_SGD', 'FX_MYR', 'FX_PHP', 'FX_THB'];
const FLIPPED_IN_CSV = new Set(['JPY', 'CAD', 'CHF']);   // cot_weekly.csv stores these in USD/xxx pair terms (COT_WEEKLY_README.md)

/** Committed COT fallback (analysis/output/cot-crowding-programme/cot_weekly.csv), put back into raw futures terms. */
export function loadCotCsv(root) {
  const f = path.join(root, 'analysis/output/cot-crowding-programme/cot_weekly.csv');
  if (!existsSync(f)) return {};
  const lines = readFileSync(f, 'utf8').trim().split('\n'), h = lines[0].split(',');
  const ix = k => h.indexOf(k), out = {};
  for (const l of lines.slice(1)) {
    const c = l.split(','), sym = c[ix('sym')], flip = FLIPPED_IN_CSV.has(sym);
    const L = +c[ix('spec_long')], S = +c[ix('spec_short')], oi = +c[ix('oi')];
    (out[sym] ??= { rows: [], group: null, flipInLiveReads: flip, source: 'committed cot_weekly.csv' }).rows.push({
      date: String(c[ix('report_date')]).slice(0, 10), lev_money_positions_long: flip ? S : L, lev_money_positions_short: flip ? L : S, open_interest_all: oi });
  }
  for (const t of Object.values(out)) t.rows.sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}

export function createHistorySources({ getJSON = async () => null, root = process.cwd(), ttlMs = 6 * 3600e3 } = {}) {
  let cache = null, at = 0, building = null;
  const deep = async (source, id) => {
    const doc = await getJSON(`archive/series/${source}/${id}.json`).catch(() => null);
    return Array.isArray(doc?.points) ? doc.points.map(p => ({ date: p[0], value: p[1] })) : [];
  };
  async function build() {
    const series = {}, from = {};
    for (const id of HISTORY_CBOE) { const a = await deep('cboe', id); series[id] = mergeByDate(loadSeed('cboe', id, root), a); from[id] = a.length ? 'seed+R2' : 'seed'; }
    for (const id of HISTORY_YAHOO) { const a = await deep('yahoo', id); series[id] = mergeByDate(loadSeed('yahoo', id, root), a); from[id] = a.length ? 'seed+R2' : 'seed'; }
    let backfill = null;
    try { const f = path.join(root, 'backfill/surprise_backfill.json'); if (existsSync(f)) backfill = JSON.parse(readFileSync(f, 'utf8')); } catch { /* none */ }
    const cot = {}, csv = loadCotCsv(root);
    for (const m of COT_MARKETS) {
      const t = await getJSON(`archive/tables/cot/${m.sym}.json`).catch(() => null);
      if (t?.rows?.length) cot[m.sym] = { ...t, group: m.group, flipInLiveReads: m.flip, source: 'R2 (CFTC full depth)' };
      else if (csv[m.sym]) cot[m.sym] = { ...csv[m.sym], group: m.group };
    }
    return { series, from, backfill, cot, builtAt: new Date().toISOString() };
  }
  return async function get() {
    if (cache && Date.now() - at < ttlMs) return cache;
    building ??= build().then(v => { cache = v; at = Date.now(); return v; }).finally(() => { building = null; });
    return building;
  };
}

// Futures 1-minute bars for the Forecast Reversion page (NQ, GC, 6E, 6J; 2018 -> the last NT8 export). READ-ONLY.
//   GET /api/futures-bars?sym=NQ|GC|6E|6J&from=YYYY-MM-DD&to=YYYY-MM-DD
//   -> { ok, sym, inverted, values: [{ datetime 'YYYY-MM-DD HH:MM:00' (London wall clock), open, high, low, close, volume }],
//        sigma_v: { date: mean over the prior 14 sessions of the RMS of (close - running VWAP) / running VWAP } }
// Store: R2 futures-bars/v1/<SYM>/<YYYY-MM>.json.gz, written by scripts/futures-bars/{build_store.py, upload_store.mjs}.
// 6J is stored inverted (USD/JPY terms) so it lines up with the USDJPY forecast lines.
import zlib from 'node:zlib';
import { getBuffer } from './r2Store.js';

const SYMS = new Set(['NQ', 'GC', '6E', '6J']);
const MAX_DAYS = 120;
const months = new Map();                       // `${sym}|${YYYY-MM}` -> doc | null
async function month(sym, ym) {
  const k = `${sym}|${ym}`;
  if (months.has(k)) return months.get(k);
  const buf = await getBuffer(`futures-bars/v1/${sym}/${ym}.json.gz`).catch(() => null);
  const doc = buf ? JSON.parse(zlib.gunzipSync(buf).toString('utf8')) : null;
  months.set(k, doc);
  if (months.size > 30) months.delete(months.keys().next().value);
  return doc;
}
const ymOf = d => d.slice(0, 7);
function monthsBetween(a, b) {
  const out = []; let [y, m] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
function rmsVwap(bars) {
  let pv = 0, v = 0, s = 0, n = 0;
  for (const [, , h, l, c, vol] of bars) {
    const w = vol > 0 ? vol : 0; pv += (h + l + c) / 3 * w; v += w;
    const vw = v > 0 ? pv / v : c; s += ((c - vw) / vw) ** 2; n++;
  }
  return n ? Math.sqrt(s / n) : NaN;
}

export async function futuresBars(sym, from, to) {
  sym = String(sym || '').toUpperCase();
  if (!SYMS.has(sym)) return { ok: false, error: `futures bars for ${[...SYMS].join(', ')} only` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { ok: false, error: 'from/to as YYYY-MM-DD' };
  const span = (Date.parse(to) - Date.parse(from)) / 86400e3;
  if (!(span >= 0) || span > MAX_DAYS) return { ok: false, error: `range must be 0-${MAX_DAYS} days` };
  const pre = new Date(Date.parse(from) - 40 * 86400e3).toISOString().slice(0, 10);   // 14 prior sessions for sigma_v
  const docs = (await Promise.all(monthsBetween(ymOf(pre), ymOf(to)).map(ym => month(sym, ym)))).filter(Boolean);
  if (!docs.length) return { ok: false, error: `no stored ${sym} futures bars for ${from} -> ${to}` };
  const days = Object.assign({}, ...docs.map(d => d.days));
  const keys = Object.keys(days).sort();
  const rms = keys.map(k => rmsVwap(days[k]));
  const values = [], sigma_v = {};
  keys.forEach((k, i) => {
    if (k < from || k > to) return;
    if (i >= 14) { const w = rms.slice(i - 14, i).filter(Number.isFinite); if (w.length === 14) sigma_v[k] = w.reduce((a, b) => a + b, 0) / 14; }
    for (const [m, o, h, l, c, v] of days[k]) {
      values.push({ datetime: `${k} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`, open: o, high: h, low: l, close: c, volume: v });
    }
  });
  return { ok: true, sym, inverted: !!docs[0].inverted, last_day: keys[keys.length - 1], values, sigma_v };
}

export function mountFuturesBars(app) {
  app.get('/api/futures-bars', async (req, res) => {
    try {
      const r = await futuresBars(req.query.sym, String(req.query.from ?? ''), String(req.query.to ?? ''));
      res.status(r.ok ? 200 : 400).json(r);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

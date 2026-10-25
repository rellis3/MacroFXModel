/**
 * Leg transforms for forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md: T2 (CFD financing) and T3 (one-day fill delay).
 * Shared by validate.mjs and the follow-ups so there is one implementation. Pass to buildPortfolio({ legTransform }).
 */
import { SAMPLE, FX } from '../portfolio-book/build.mjs';

const DIV = { spx500: 0.018, nas100: 0.009 };   // constant dividend yields (prereg T2, stated assumption)
const MARKUP = 0.025, FX_MARKUP = 0.010;
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;

export function makeTransform(store, { delay = false, finance = false } = {}) {
  const closeCache = {};
  async function closesFor(inst) {
    if (!closeCache[inst]) { const rows = await store.series(`px_d1_${inst}`, { from: '2002-01-01', to: SAMPLE.to }); closeCache[inst] = new Map(rows.map(r => [String(r.date), Number(r.value)])); }
    return closeCache[inst];
  }
  const rateCache = new Map();
  let latestVintage = null;
  async function usdRate(d) {   // r as a fraction, point-in-time at d 22:00Z; before the first vintage, the latest published value for that month (A1)
    if (rateCache.has(d)) return rateCache.get(d);
    const row = await store.at('rate3m_usd', `${d}T22:00:00Z`);
    let r;
    if (row) r = Number(row.value) / 100;
    else {
      latestVintage ??= new Map((await store.series('rate3m_usd')).map(x => [String(x.date).slice(0, 7), Number(x.value) / 100]));
      let m = d.slice(0, 7); r = latestVintage.get(m);
      for (let k = 0; r == null && k < 6; k++) { const t = new Date(m + '-01T00:00:00Z'); t.setUTCMonth(t.getUTCMonth() - 1); m = t.toISOString().slice(0, 7); r = latestVintage.get(m); }
      r ??= 0;
    }
    rateCache.set(d, r);
    return r;
  }

  return async (sid, inst, p) => {
    const n = p.dates.length, net = p.net.slice();
    const held = new Array(n).fill(0);   // position earning day i's return
    for (let i = 1; i < n; i++) held[i] = delay ? (i >= 2 ? p.pos[i - 2] : 0) : p.pos[i - 1];
    if (delay) {
      const px = await closesFor(inst);
      let unitCarry = 0;
      for (let i = 1; i < n; i++) {
        if (p.dates[i] < SAMPLE.from) { net[i] = 0; continue; }
        const c0 = px.get(p.dates[i - 1]), c1 = px.get(p.dates[i]);
        const r = c0 && c1 ? c1 / c0 - 1 : 0;
        const costPrev = p.gross[i - 1] - p.net[i - 1];   // each cost lands one day later
        if (p.pos[i - 1]) unitCarry = (p.gross[i] - p.pos[i - 1] * r) / p.pos[i - 1];
        else if (!FX.includes(inst)) unitCarry = 0;
        net[i] = held[i] * r + held[i] * unitCarry - (p.dates[i - 1] >= SAMPLE.from ? costPrev : 0);
      }
    }
    if (finance) {
      for (let i = 1; i < n; i++) {
        const d = p.dates[i]; if (d < SAMPLE.from) continue;
        const pos = held[i]; if (!pos) continue;
        const r = await usdRate(p.dates[i - 1]), g = days(p.dates[i - 1], d) / 365, a = Math.abs(pos);
        let f;
        if (FX.includes(inst)) f = -FX_MARKUP * a;
        else if (inst === 'xauusd') f = pos > 0 ? -(r + MARKUP) * a : (r - MARKUP) * a;
        else f = pos > 0 ? -(r + MARKUP - DIV[inst]) * a : (r - MARKUP - DIV[inst]) * a;
        net[i] += f * g;
      }
    }
    return net;
  };
}

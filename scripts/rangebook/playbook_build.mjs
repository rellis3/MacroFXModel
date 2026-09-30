// The exhaustion playbook on EURUSD (forge/EXHAUSTION_PLAYBOOK_EURUSD_PREREG.md). For every pass:
// M15/H1 WaveTrend (9/12/3) stretch, the 10-day USD trend over the other majors, the expansion-day
// flag, the at-touch follow/fade outcomes, and the confirmed (M15 close back inside) fade.
//   node scripts/rangebook/playbook_build.mjs
import fs from 'fs';
import { loadM1ForPair } from '../../js/volBacktestM1Engine.js';
import { LINE_SIDE, nyCloseDailyBars } from '../../js/voteAtlasV4Lines.js';
import { createHtfContext, htfIdxAt } from '../../js/confluenceFeatures.js';
import { STATE_WT } from '../../js/vumanchuState.js';
import { loadCalendarProxy } from '../v4/calendarProxy.mjs';
import { costForPair } from '../../js/perLineStrategy.js';
import { buildContext, scrambleFrom, passesOf, targets, race } from './common.mjs';

const OPTS = { sym: 'EURUSD', assetClass: 'fx', tagFor: loadCalendarProxy()('EURUSD') };
const COST = costForPair('eurusd', 'fx');
const MAJORS = [['gbpusd', -1], ['usdjpy', 1], ['audusd', -1], ['usdcad', 1], ['usdchf', 1], ['nzdusd', -1]];   // +1 = USD is the base
const r4 = x => (x == null || !Number.isFinite(x)) ? null : Math.round(x * 1e4) / 1e4;

function usdTrendFn(majors) {
  const nys = majors.map(([, s, p]) => ({ s, ny: nyCloseDailyBars(p).filter(b => b.n >= 60) }));
  return openSec => {
    let sum = 0, n = 0;
    for (const { s, ny } of nys) {
      let j = -1; for (let i = ny.length - 1; i >= 0; i--) if (ny[i].endSec <= openSec) { j = i; break; }
      if (j >= 10) { sum += s * Math.log(ny[j].close / ny[j - 10].close); n++; }
    }
    return n >= 4 ? sum / n : null;
  };
}

function rOf(outcome, dc, df, lm, costSig) {
  const f = outcome === 'cont' ? dc / df : (outcome === 'fade' || outcome === 'both') ? -1 : Math.max(-1, Math.min(dc / df, lm / df));
  const a = outcome === 'fade' ? df / dc : (outcome === 'cont' || outcome === 'both') ? -1 : Math.max(-1, Math.min(df / dc, -lm / dc));
  return { follow: f - costSig / df, fade: a - costSig / dc };
}

// Confirmed fade: first completed M15 bar after the pass that closes back inside the line; enter at the
// next bar's open; stop = next line out, target = line behind. null = no trade.
function confirmedFade(bars, k, up, level, tg, open) {
  const bkt = t => Math.floor(t / 900);
  let j = k + 1, entryK = null;
  for (; j < bars.length; j++) {
    if (bkt(bars[j].time) !== bkt(bars[j - 1].time) && (up ? bars[j - 1].close < level : bars[j - 1].close > level)) { entryK = j; break; }
    const b = bars[j];
    if (up ? (b.high >= tg.cont || b.low <= tg.fade) : (b.low <= tg.cont || b.high >= tg.fade)) return null;
  }
  if (entryK == null) return null;
  const e = bars[entryK].open, risk = Math.abs(tg.cont - e), reward = Math.abs(e - tg.fade);
  if (!(risk > 0) || (up ? e <= tg.fade : e >= tg.fade)) return null;
  let r = null;
  for (let i = entryK; i < bars.length && r == null; i++) {
    const b = bars[i];
    if (up ? b.high >= tg.cont : b.low <= tg.cont) r = -1;
    else if (up ? b.low <= tg.fade : b.high >= tg.fade) r = reward / risk;
  }
  if (r == null) r = Math.max(-1, (up ? e - bars.at(-1).close : bars.at(-1).close - e) / risk);
  return r - COST / 100 * open / risk;
}

function build(E, majors, want) {
  const ctx = buildContext(E, OPTS);
  const htf = createHtfContext(E, { wt: STATE_WT });
  const usd = usdTrendFn(majors);
  const out = new Map();
  ctx.days.forEach((d, di) => {
    const unit = d.sigmaFrac * d.open; if (!(unit > 0) || !d.ladder.hl?.p75) return;
    const trend = usd(d.openSec);
    const prev = ctx.days[di - 1], prev5 = ctx.days.slice(Math.max(0, di - 5), di);
    let expansion = null;
    if (prev && prev5.length === 5) {
      let hi = -Infinity, lo = Infinity; for (const b of prev.bars) { if (b.high > hi) hi = b.high; if (b.low < lo) lo = b.low; }
      const blew = (hi - lo) / prev.open * 100 >= prev.ladder.hl.p75;
      const acc = d.ladder.sigma_daily_pct > 1.10 * prev5.reduce((a, x) => a + x.ladder.sigma_daily_pct, 0) / 5;
      expansion = blew || acc;
    }
    for (const p of passesOf(d)) {
      const key = `${d.date}|${p.line}|${p.pass}`;
      if (want && !want.has(key)) continue;
      const up = LINE_SIDE[p.line] === 'up', tg = targets(d, p.line, p.level, p.hiB, p.loB);
      if (!tg) continue;
      const t = d.bars[p.k].time;
      const i15 = htfIdxAt(htf, '15m', t), i1h = htfIdxAt(htf, '1h', t);
      const w15 = i15 >= 0 ? htf.byTf['15m'].wt1[i15] : null, w1h = i1h >= 0 ? htf.byTf['1h'].wt1[i1h] : null;
      const stretched = w15 != null && w1h != null && (up ? (w15 >= 53 && w1h >= 53) : (w15 <= -53 && w1h <= -53));
      const aligned = trend == null ? null : (up ? trend > 0 : trend < 0);
      const dc = Math.abs(tg.cont - p.level) / unit, df = Math.abs(p.level - tg.fade) / unit;
      const rc = race(d.bars, p.k, up, p.level, tg);
      out.set(key, { t, w15: r4(w15), w1h: r4(w1h), stretched, usdTrend: r4(trend), aligned, expansion,
        ...rOf(rc.outcome, dc, df, rc.lastMove / unit, COST / 100 * d.open / unit),
        confirmed: r4(confirmedFade(d.bars, p.k, up, p.level, tg, d.open)) });
    }
  });
  return out;
}

const E = await loadM1ForPair('eurusd');
const majors = []; for (const [k, s] of MAJORS) majors.push([k, s, await loadM1ForPair(k)]);
const seq = JSON.parse(fs.readFileSync('analysis/output/rangebook/eurusd_sequence.json', 'utf8')).passes.filter(p => !p.sameBar);
const want = new Set(seq.map(p => `${p.date}|${p.line}|${p.pass}`));
const rows = build(E, majors, want);
if (rows.size !== want.size) { console.error(`matched ${rows.size} of ${want.size}`); process.exit(3); }

// Self-check: the decision flags must not change when EURUSD and the six majors are scrambled from the pass bar.
{
  const keys = [...rows.keys()].filter((_, i) => i % Math.floor(rows.size / 5) === 3).slice(0, 5);
  const cut = (pk, t, seed) => { let i = 0; while (i < pk.n && pk.times[i] < t) i++; return scrambleFrom(pk, i, seed); };
  const flags = v => JSON.stringify([v.w15, v.w1h, v.stretched, v.usdTrend, v.aligned, v.expansion]);
  // Scramble from the bar AFTER the pass (the pass bar itself defines the pass — scrambling it can move
  // the pass to a later bar, which is not look-ahead), and require the re-found pass on the SAME bar.
  for (const key of keys) {
    const t = rows.get(key).t;
    const again = build(cut(E, t + 60, 161), majors.map(([k, s, p], i) => [k, s, cut(p, t + 60, 171 + i)]), new Set([key])).get(key);
    if (!again || again.t !== t || flags(again) !== flags(rows.get(key))) { console.error(`LOOK-AHEAD ${key}\n ${flags(rows.get(key))} @${t}\n ${again && flags(again)} @${again?.t}`); process.exit(2); }
  }
  console.log(`self-check: ${keys.length} passes' playbook flags identical under future-scramble (EURUSD + 6 majors)`);
}
const seqByKey = new Map(seq.map(p => [`${p.date}|${p.line}|${p.pass}`, p]));
fs.writeFileSync('analysis/output/rangebook/eurusd_playbook.json', JSON.stringify([...rows].map(([key, v]) => ({ key, date: key.slice(0, 10), line: key.split('|')[1], londonMin: seqByKey.get(key).londonMin, ...v }))));
const V = [...rows.values()];
console.log(`EURUSD: ${V.length} passes; stretched ${V.filter(v => v.stretched).length}, aligned ${V.filter(v => v.aligned).length}, expansion ${V.filter(v => v.expansion).length}, confirmed fades available ${V.filter(v => v.confirmed != null).length}`);

#!/usr/bin/env node
/**
 * N1 / N2 — nowcast-vs-consensus → surprise sign. Design frozen in
 * MD files/NOWCAST_TESTS.md before this ran.
 *
 *   node analysis/nowcast_studies.mjs            (FRED_KEY in env for N2)
 *
 * Inputs: backfill/surprise_backfill.json (ForexFactory consensus + actual),
 * data/nowcast/cleveland_month.json (the Cleveland Fed chart JSON, daily
 * nowcasts per month since 2013-07), FRED/ALFRED GDPNOW vintages (fetched).
 * Output: analysis/output/nowcast_studies.json + a console table.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 864e5;
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const iso = ms => new Date(ms).toISOString().slice(0, 10);

const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'backfill/surprise_backfill.json'), 'utf8'));
const FF = pack.rows.map(r => Object.fromEntries(pack.cols.map((c, i) => [c, r[i]]))).filter(r => r.country === 'US');

// ── Cleveland: month -> [{date, cpi, core, pce, corepce}] daily nowcasts ──
function loadCleveland() {
  const charts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/nowcast/cleveland_month.json'), 'utf8'));
  const byMonth = {};
  for (const c of charts) {
    const [yy, mm] = c.chart.subcaption.split('-').map(Number);            // "2021-11" = the month nowcast
    const labels = c.categories[0].category.map(x => x.label);
    const series = Object.fromEntries(c.dataset.map(d => [d.seriesname, d.data.map(x => x.value === '' ? null : parseFloat(x.value))]));
    const rows = [];
    labels.forEach((lab, i) => {
      const m = lab.match(/^(\d{2})\/(\d{2})$/); if (!m) return;             // skip the "CPI Oct" vlines
      const M = +m[1], D = +m[2];
      // the run starts in the month before and can end in the month after (or next year)
      let y = yy; if (M > mm + 1) y = yy - 1; else if (M < mm - 1) y = yy + 1; if (mm === 12 && M === 1) y = yy + 1; if (mm === 1 && M === 12) y = yy - 1;
      rows.push({ date: `${y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`, cpi: series['CPI Inflation']?.[i] ?? null, core: series['Core CPI Inflation']?.[i] ?? null, pce: series['PCE Inflation']?.[i] ?? null, corepce: series['Core PCE Inflation']?.[i] ?? null });
    });
    byMonth[`${yy}-${String(mm).padStart(2, '0')}`] = rows;
  }
  return byMonth;
}
// last nowcast strictly before the release day, for the reference month
function nowcastBefore(byMonth, refMonth, releaseDay, field) {
  const rows = (byMonth[refMonth] ?? []).filter(r => r.date < releaseDay && r[field] != null);
  return rows.length ? rows[rows.length - 1][field] : null;
}
const refMonthOf = releaseMs => { const d = new Date(releaseMs); const m = d.getUTCMonth(); const y = d.getUTCFullYear() + (m === 0 ? -1 : 0); return `${y}-${String(((m + 11) % 12) + 1).padStart(2, '0')}`; };

// ── statistics ──
function score(calls, label, thresholds) {
  const out = { label, n: calls.length };
  const usable = calls.filter(c => c.gap != null && c.surprise != null);
  out.maeNowcast = +(usable.reduce((s, c) => s + Math.abs(c.nowcast - c.actual), 0) / usable.length).toFixed(3);
  out.maeConsensus = +(usable.reduce((s, c) => s + Math.abs(c.consensus - c.actual), 0) / usable.length).toFixed(3);
  out.byThreshold = thresholds.map(th => {
    const made = usable.filter(c => Math.abs(c.gap) >= th);
    const inline = made.filter(c => c.surprise === 0).length;
    const dec = made.filter(c => c.surprise !== 0);
    const hits = dec.filter(c => Math.sign(c.gap) === Math.sign(c.surprise)).length;
    const n = dec.length, p = n ? hits / n : null, se = n ? Math.sqrt(p * (1 - p) / n) : null;
    return { threshold: th, calls: made.length, inline, n, hits, hitRate: p != null ? +p.toFixed(3) : null, lo: p != null ? +Math.max(0, p - 1.96 * se).toFixed(3) : null, hi: p != null ? +Math.min(1, p + 1.96 * se).toFixed(3) : null };
  });
  return out;
}
const verdict = (s, th, minN) => { const b = s.byThreshold.find(x => x.threshold === th); if (!b || b.n < minN) return `insufficient (n=${b?.n ?? 0})`; return b.lo > 0.5 && s.maeNowcast <= s.maeConsensus ? 'VALIDATED' : b.lo > 0.5 ? 'hit rate clears, but nowcast MAE worse than consensus' : 'NULL'; };

// ── N1 ──
const CL = loadCleveland();
const N1 = {};
for (const [title, field] of [['CPI m/m', 'cpi'], ['Core CPI m/m', 'core'], ['Core PCE Price Index m/m', 'corepce'], ['PCE Price Index m/m', 'pce']]) {
  const rel = FF.filter(r => r.event === title && r.estimate && r.actual && r.ms >= Date.parse('2013-08-01'));
  const calls = rel.map(r => {
    const day = iso(r.ms), ref = refMonthOf(r.ms);
    const nc = nowcastBefore(CL, ref, day, field); const cons = num(r.estimate), act = num(r.actual);
    if (nc == null || cons == null || act == null) return null;
    return { day, ref, nowcast: +nc.toFixed(3), consensus: cons, actual: act, gap: +(nc - cons).toFixed(3), surprise: Math.sign(+(act - cons).toFixed(3)) };
  }).filter(Boolean);
  N1[title] = score(calls, title, [0.05, 0.10, 0.15]); N1[title].verdict = verdict(N1[title], 0.05, 40); N1[title].releases = rel.length;
  N1[title].sample = calls.slice(-3);
}

// ── N2 ──
let N2 = null;
const KEY = process.env.FRED_KEY;
if (KEY) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=GDPNOW&api_key=${KEY}&file_type=json&realtime_start=2011-01-01&realtime_end=9999-12-31&observation_start=2011-01-01`;
  const j = await (await fetch(url)).json();
  const vint = (j.observations ?? []).map(o => ({ date: o.date, value: parseFloat(o.value), rs: o.realtime_start })).filter(o => Number.isFinite(o.value));
  const rel = FF.filter(r => r.event === 'Advance GDP q/q' && r.estimate && r.actual);
  const calls = rel.map(r => {
    const day = iso(r.ms); const d = new Date(r.ms); const q = Math.floor(d.getUTCMonth() / 3); const y = d.getUTCFullYear() + (q === 0 ? -1 : 0); const refQ = `${y}-${String(((q + 3) % 4) * 3 + 1).padStart(2, '0')}-01`;
    const vs = vint.filter(o => o.date === refQ && o.rs < day).sort((a, b) => a.rs < b.rs ? -1 : 1);
    const nc = vs.length ? vs[vs.length - 1].value : null; const cons = num(r.estimate), act = num(r.actual);
    if (nc == null || cons == null || act == null) return null;
    return { day, ref: refQ, nowcast: +nc.toFixed(2), nowcastAsOf: vs[vs.length - 1].rs, consensus: cons, actual: act, gap: +(nc - cons).toFixed(2), surprise: Math.sign(+(act - cons).toFixed(2)) };
  }).filter(Boolean);
  N2 = score(calls, 'Advance GDP q/q', [0.2, 0.4, 0.6]); N2.verdict = verdict(N2, 0.2, 40); N2.releases = rel.length; N2.sample = calls.slice(-3);
}

fs.mkdirSync(path.join(ROOT, 'analysis/output'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'analysis/output/nowcast_studies.json'), JSON.stringify({ ranAt: new Date().toISOString(), N1, N2 }, null, 1));
const line = s => `${s.label.padEnd(26)} releases=${s.releases} calls=${s.n}  MAE nowcast ${s.maeNowcast} vs consensus ${s.maeConsensus}  ` + s.byThreshold.map(b => `|gap|≥${b.threshold}: ${b.hits}/${b.n} = ${b.hitRate} [${b.lo}–${b.hi}] (inline ${b.inline})`).join('  ') + `  → ${s.verdict}`;
console.log('N1 Cleveland nowcast vs consensus'); for (const s of Object.values(N1)) console.log(' ', line(s));
if (N2) { console.log('N2 GDPNow vs consensus'); console.log(' ', line(N2)); console.log('  sample', JSON.stringify(N2.sample)); } else console.log('N2 skipped: no FRED_KEY');
console.log('  N1 sample', JSON.stringify(N1['CPI m/m'].sample));

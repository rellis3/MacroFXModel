// js/bankCredit.js — BIS Locational Banking Statistics (cross-border bank credit), shaped for the desk.
//
// WHY: the bank-lending leg of the money chain. Central-bank liquidity (globalLiquidityEngine.js) and the
// front end (SOFR/STIR legs) say what money costs; this says how much banks actually lend across borders,
// in which currency, to whom (non-bank financials, Cayman fund vehicles, China), and whose banks fund the
// world's dollars. Source: BIS SDMX API, dataflow WS_LBS_D_PUB, no key. Quarterly, published roughly four
// months after the quarter ends.
//
// EVIDENCE (js/deskEvidence.js): bank-credit-dollar-dxy UNDERPOWERED, bank-credit-dollar-nasdaq CONTEXT.
// So this is a CREDIT REGIME read, never a forecast: nothing here may be shown as a dollar or Nasdaq call.
//
// Growth = sum of the last four BIS FX- and break-adjusted flows (measure F) / stock four quarters earlier,
// so a moving dollar does not show up as fake euro or yen growth.
//
// Point-in-time: a quarter is stamped with the date this feed FIRST saw it (`firstSeen`). Quarters that
// predate the feed carry no stamp; research must assume them known two quarters after quarter end (the
// bank-credit-dollar prereg's conservative rule). Pure functions are exported for tests.

export const BIS_BASE = 'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_LBS_D_PUB/1.0';
export const START_PERIOD = '1998-Q1';

// Dimension order: FREQ.MEASURE.POSITION.INSTR.DENOM.CURR_TYPE.PARENT.BANK_TYPE.REP_CTY.CP_SECTOR.CP_COUNTRY.POS_TYPE
// Always: claims (C), all instruments (A), all currency types (A), all reporting banks (A), all reporters (5A), cross-border (N).
export const BIS_REQUESTS = [
  { id: 'currencies', key: 'Q.S+F.C.A.TO1+USD+EUR+JPY+GBP+CHF.A.5J.A.5A.A.5J.N' },
  { id: 'sectors',    key: 'Q.S+F.C.A.TO1+USD.A.5J.A.5A.B+F+C+G.5J.N' },
  { id: 'borrowers',  key: 'Q.S+F.C.A.TO1+USD+JPY.A.5J.A.5A.A.US+GB+KY+CN+JP+FR+DE+SG+HK+AE+SA+CH+LU+IE.N' },
  { id: 'parents',    key: 'Q.S.C.A.USD.A.US+JP+FR+GB+CA+CN+DE+CH.A.5A.A.5J.N' },
];

export const NAMES = {
  US: 'United States', GB: 'United Kingdom', KY: 'Cayman Islands', CN: 'China', JP: 'Japan', FR: 'France',
  DE: 'Germany', SG: 'Singapore', HK: 'Hong Kong', AE: 'UAE', SA: 'Saudi Arabia', CH: 'Switzerland',
  LU: 'Luxembourg', IE: 'Ireland', CA: 'Canada',
};
export const SECTORS = { A: 'All borrowers', B: 'Banks', F: 'Non-bank financials', C: 'Non-financial companies', G: 'Governments' };
export const CURRENCIES = { TO1: 'All currencies', USD: 'US dollar', EUR: 'Euro', JPY: 'Yen', GBP: 'Sterling', CHF: 'Swiss franc' };

// Regime bands for 4-quarter USD credit growth: the terciles of 1985-Q2..2026-Q2 used in bank-credit-dollar
// (analysis/output/bank-credit-dollar/concentration.json). Fixed, so the label does not drift with new data.
export const REGIME_BANDS = { low: 2.68, high: 7.60 };
export function regimeOf(g) {
  if (!Number.isFinite(g)) return null;
  if (g < 0) return 'contracting';
  if (g < REGIME_BANDS.low) return 'slow';
  if (g <= REGIME_BANDS.high) return 'normal';
  return 'fast';
}

const sk = (measure, denom, sector, cp, parent = '5J') => `${measure}|${denom}|${sector}|${cp}|${parent}`;

/** BIS SDMX CSV -> rows { measure, denom, sector, cp, parent, period, value } (value in USD millions). */
export function parseBisCsv(text) {
  const lines = String(text ?? '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',');
  const ix = n => head.indexOf(n);
  const I = { m: ix('L_MEASURE'), d: ix('L_DENOM'), s: ix('L_CP_SECTOR'), c: ix('L_CP_COUNTRY'), p: ix('L_PARENT_CTY'), t: ix('TIME_PERIOD'), v: ix('OBS_VALUE') };
  if (Object.values(I).some(i => i < 0)) throw new Error('BIS CSV: unexpected header');
  const out = [];
  for (const l of lines.slice(1)) {
    const f = l.split(',');                      // BIS CSV fields carry no embedded commas for these dimensions
    const v = parseFloat(f[I.v]);
    if (!/^\d{4}-Q[1-4]$/.test(f[I.t]) || !Number.isFinite(v)) continue;
    out.push({ measure: f[I.m], denom: f[I.d], sector: f[I.s], cp: f[I.c], parent: f[I.p], period: f[I.t], value: v });
  }
  return out;
}

/** rows -> Map(seriesKey -> Map(period -> value)) */
export function indexRows(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = sk(r.measure, r.denom, r.sector, r.cp, r.parent);
    if (!m.has(k)) m.set(k, new Map());
    m.get(k).set(r.period, r.value);
  }
  return m;
}

export function shiftPeriod(p, n) {
  const y = +p.slice(0, 4), q = +p.slice(6) - 1 + n;
  const yy = y + Math.floor(q / 4), qq = ((q % 4) + 4) % 4 + 1;
  return `${yy}-Q${qq}`;
}

/** 4-quarter FX-adjusted growth (%) per period, from stock and flow maps. */
export function growthSeries(stock, flow) {
  const out = [];
  if (!stock || !flow) return out;
  for (const p of [...flow.keys()].sort()) {
    const base = stock.get(shiftPeriod(p, -4));
    const fl = [0, 1, 2, 3].map(i => flow.get(shiftPeriod(p, -i)));
    if (!Number.isFinite(base) || base <= 0 || fl.some(x => !Number.isFinite(x))) continue;
    out.push({ period: p, g: +(fl.reduce((a, b) => a + b, 0) / base * 100).toFixed(2) });
  }
  return out;
}

function lineFor(ix, denom, sector, cp, parent, latest) {
  const s = ix.get(sk('S', denom, sector, cp, parent)), f = ix.get(sk('F', denom, sector, cp, parent));
  if (!s) return null;
  const g = growthSeries(s, f);
  const gAt = p => g.find(x => x.period === p)?.g ?? null;
  const flow4 = f ? [0, 1, 2, 3].map(i => f.get(shiftPeriod(latest, -i))) : [];
  return {
    stockBn: Number.isFinite(s.get(latest)) ? +(s.get(latest) / 1000).toFixed(1) : null,
    flow4qBn: flow4.length === 4 && flow4.every(Number.isFinite) ? +(flow4.reduce((a, b) => a + b, 0) / 1000).toFixed(1) : null,
    flowQBn: f && Number.isFinite(f.get(latest)) ? +(f.get(latest) / 1000).toFixed(1) : null,
    g: gAt(latest), gPrev: gAt(shiftPeriod(latest, -1)), gYearAgo: gAt(shiftPeriod(latest, -4)),
    history: g,
  };
}

/** Build the desk snapshot from parsed rows. `firstSeen` maps period -> ISO date this feed first saw it. */
export function buildBankCredit(rows, { firstSeen = {} } = {}) {
  const ix = indexRows(rows);
  const tot = ix.get(sk('S', 'TO1', 'A', '5J'));
  if (!tot || !tot.size) throw new Error('BIS: total cross-border claims missing');
  const latest = [...tot.keys()].sort().at(-1);
  const L = (d, s, c, p = '5J') => lineFor(ix, d, s, c, p, latest);
  const strip = o => (o ? (({ history, ...rest }) => rest)(o) : null);

  const all = L('TO1', 'A', '5J'), usd = L('USD', 'A', '5J');
  const currencies = Object.keys(CURRENCIES).filter(c => c !== 'TO1').map(c => {
    const x = L(c, 'A', '5J');
    return x && { code: c, name: CURRENCIES[c], sharePct: +(x.stockBn / all.stockBn * 100).toFixed(1), ...strip(x) };
  }).filter(Boolean);
  const sectors = ['B', 'F', 'C', 'G'].map(s => { const x = L('TO1', s, '5J'); return x && { code: s, name: SECTORS[s], ...strip(x) }; }).filter(Boolean);
  const country = (denom) => Object.keys(NAMES).map(c => { const x = L(denom, 'A', c); return x && x.stockBn != null && { code: c, name: NAMES[c], ...strip(x) }; })
    .filter(Boolean).sort((a, b) => b.stockBn - a.stockBn);

  // Yen lent to borrowers outside Japan = all-country yen claims minus claims on Japan (the carry-funding footprint).
  const jpyAllS = ix.get(sk('S', 'JPY', 'A', '5J')), jpyJpS = ix.get(sk('S', 'JPY', 'A', 'JP'));
  const jpyAllF = ix.get(sk('F', 'JPY', 'A', '5J')), jpyJpF = ix.get(sk('F', 'JPY', 'A', 'JP'));
  const diff = (a, b) => (a && b ? new Map([...a].filter(([p]) => b.has(p)).map(([p, v]) => [p, v - b.get(p)])) : null);
  const jpyExS = diff(jpyAllS, jpyJpS), jpyExF = diff(jpyAllF, jpyJpF);
  const jpyExG = growthSeries(jpyExS, jpyExF);
  const yenOffshore = jpyExS ? {
    stockBn: +(jpyExS.get(latest) / 1000).toFixed(1),
    g: jpyExG.find(x => x.period === latest)?.g ?? null,
    gPrev: jpyExG.find(x => x.period === shiftPeriod(latest, -1))?.g ?? null,
    history: jpyExG,
  } : null;

  const parents = Object.keys(NAMES).map(c => {
    const s = ix.get(sk('S', 'USD', 'A', '5J', c));
    if (!s || !Number.isFinite(s.get(latest))) return null;
    const at = p => (Number.isFinite(s.get(p)) ? Math.round(s.get(p) / 1000) : null);
    return { code: c, name: NAMES[c], usdBn: at(latest), usdBn5yAgo: at(shiftPeriod(latest, -20)) };
  }).filter(Boolean).sort((a, b) => b.usdBn - a.usdBn);

  const nbfi = L('TO1', 'F', '5J'), usdKy = L('USD', 'A', 'KY');
  const usdUs = L('USD', 'A', 'US');
  return {
    source: 'BIS Locational Banking Statistics (WS_LBS_D_PUB), cross-border claims, all reporting countries',
    latest, firstSeen: firstSeen[latest] ?? null,
    evidence: { dxy: 'bank-credit-dollar-dxy (underpowered)', nasdaq: 'bank-credit-dollar-nasdaq (context)' },
    headline: {
      totalStockBn: all.stockBn, totalG: all.g, totalGPrev: all.gPrev, totalFlowQBn: all.flowQBn,
      usdStockBn: usd.stockBn, usdG: usd.g, usdGPrev: usd.gPrev, usdSharePct: +(usd.stockBn / all.stockBn * 100).toFixed(1),
      usdOffshoreBn: usdUs?.stockBn != null ? +(usd.stockBn - usdUs.stockBn).toFixed(1) : null,
      nbfiStockBn: nbfi?.stockBn ?? null, nbfiG: nbfi?.g ?? null,
      caymanUsdBn: usdKy?.stockBn ?? null, caymanUsdG: usdKy?.g ?? null,
      yenOffshoreBn: yenOffshore?.stockBn ?? null, yenOffshoreG: yenOffshore?.g ?? null,
      regime: regimeOf(usd.g), regimeBands: REGIME_BANDS,
    },
    currencies, sectors,
    borrowers: country('TO1'), usdBorrowers: country('USD'), jpyBorrowers: country('JPY'),
    parents,
    history: {
      total: all.history.filter(x => x.period >= '1999-Q1'),
      usd: usd.history.filter(x => x.period >= '1999-Q1'),
      nbfi: nbfi?.history ?? [],
      yenOffshore: yenOffshore?.history ?? [],
      caymanUsd: usdKy?.history ?? [],
    },
  };
}

/** One-line desk read for briefs and alerts. Context wording only (see EVIDENCE above). */
export function bankCreditLine(snap) {
  if (!snap?.headline) return null;
  const h = snap.headline, sg = v => (v == null ? 'n/a' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
  return `Bank credit ${snap.latest}: cross-border USD lending ${sg(h.usdG)} y/y (${h.regime}), all currencies ${sg(h.totalG)}, `
    + `non-bank financials ${sg(h.nbfiG)}, Cayman USD ${sg(h.caymanUsdG)}, yen to non-Japan borrowers ${sg(h.yenOffshoreG)}. Regime context, not a forecast.`;
}

export async function fetchBankCreditRows({ fetchImpl = fetch, start = START_PERIOD } = {}) {
  const rows = [];
  for (const r of BIS_REQUESTS) {
    const url = `${BIS_BASE}/${r.key}?startPeriod=${start}&format=csv`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 MacroFXDashboard' }, signal: AbortSignal.timeout(45_000) });
    if (!res.ok) throw new Error(`BIS ${r.id} HTTP ${res.status}`);
    const got = parseBisCsv(await res.text());
    if (!got.length) throw new Error(`BIS ${r.id}: no observations`);
    rows.push(...got);
  }
  return rows;
}

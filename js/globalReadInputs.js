/**
 * Global Read — input assembly. Pure: takes the payloads of the routes the
 * dashboard already serves and returns the input object js/globalReadCore.js
 * builds the read from. Shared by the server job (server.js, /api/global-read)
 * and the CLI (scripts/global_read.mjs), so both read the same numbers the same
 * way: one normalise step, never two copies.
 *
 *   const D = { 'daily-read': {...}, 'desk-watch': {...}, ... }   // keyed by GLOBAL_READ_ENDPOINTS
 *   const read = buildGlobalRead(assembleGlobalReadInput(D, { now }))
 *
 * Every payload is optional. A missing one disables the inputs that need it
 * and, where the audit found it matters, adds a data-quality issue.
 */
import { effectiveIc, freshness, REG } from './globalReadCore.js';

export const GLOBAL_READ_ENDPOINTS = ['data-health', 'daily-read', 'desk-watch', 'today-reads', 'macro-changes', 'vol-forecast', 'hmm/regimes',
  'yield-spread/plan', 'macro-regime-fx', 'macro-scorecard', 'trend-basket', 'cot-extremes', 'cot', 'oi-today', 'oi-levels',
  'credit-stress', 'liquidity-gate/live', 'regime', 'ledger', 'range-calls', 'release-calls', 'chain-read', 'morning-brief',
  'econ-surprise', 'fomc/latest', 'hmm5m-v2', 'vol-forecast/session', 'daily-snapshot?days=2', 'real-yield', 'yield-curve'];

export const GR_PAIRS = { EURUSD: ['EUR', 'USD'], GBPUSD: ['GBP', 'USD'], USDJPY: ['USD', 'JPY'], AUDUSD: ['AUD', 'USD'], NZDUSD: ['NZD', 'USD'], USDCAD: ['USD', 'CAD'], USDCHF: ['USD', 'CHF'] };
export const GR_CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];

// risk-on moves each pair this way (1 = pair up): commodity FX and the haven crosses; USDCAD down because CAD is the risk side
const RISK_BETA = { AUDUSD: 1, NZDUSD: 1, USDCAD: -1, USDJPY: 1, USDCHF: 1, EURUSD: 0.5, GBPUSD: 0.5 };
const SLASH = s => s.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2');
const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const median = xs => { const a = xs.filter(Number.isFinite).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };
const hmmKey = k => k.replace('/', '').replace('_USD', '').replace('_GBP', '').replace('NAS100', 'NQ').replace('XAU', 'GOLD');

export function assembleGlobalReadInput(D = {}, { now = Date.now(), skip = [] } = {}) {
  const ageDays = d => (d ? (now - new Date(d).getTime()) / 864e5 : null);

  // ── per-instrument rows (IV/σ, fitted ladder) ─────────────────────────────
  const dr = D['daily-read'];
  const drDay = dr?.days ? dr.days[Object.keys(dr.days).sort().at(-1)] : null;
  // The setup is frozen at ~22:55 the evening before; the vol forecast re-fits its ladder in the morning (NQ hl_p50
  // 1.33 vs 1.46 on 2026-10-16), and the Day Read's 'used' and range map use the current one. Same lines everywhere.
  const vfNow = D['vol-forecast']?.instruments ?? {};
  const rows = (drDay?.setup?.rows ?? []).map(r => { const lf = vfNow[r.sym]?.ladder_flat; return lf?.hl_p50 > 0 && lf?.hl_p75 > 0 ? { ...r, lines: { ...r.lines, ...lf } } : r; });
  const tags = Object.fromEntries(rows.map(r => [r.sym, r.tag]));

  // ── range flags ───────────────────────────────────────────────────────────
  const dw = D['desk-watch']?.states ?? [];
  const st = id => dw.find(s => s.id === id);
  const g = D['today-reads']?.global ?? {};
  const nqOi = (D['oi-today']?.pairs ?? []).find(p => /NAS100/.test(p.pair));
  const nqGexFlip = (D['oi-levels']?.byInstrument?.nq ?? []).find(l => l.type === 'gex_flip')?.price;
  const flags = {
    vixInv: !!st('vix-inversion')?.firing,
    frontDear: g.volTerm?.frontState === 'dear',
    frontCalm: g.volTerm?.frontState === 'calm',
    allDown: D._allDown ?? null,                     // validated (breadth-all-down); computed in the server tick from D1 closes
    nqDownWeek: !!st('nq-down-week')?.firing,
    // ONE definition of NQ gamma (owner decision 2026-10-16): the sign of net dealer GEX, as the OI bot and the
    // card use (oi.js regime: PIN = long gamma, BREAKOUT = short). spot-vs-flip disagreed with it on one screen.
    gexShortNq: nqOi?.regime === 'BREAKOUT' ? true : nqOi?.regime === 'PIN' ? false : null,
  };

  // ── global state observations ─────────────────────────────────────────────
  const mc = Object.fromEntries((D['macro-changes']?.rows ?? []).map(r => [r.key, r]));
  const sides = Object.values(g.crossAsset?.sides ?? {});
  const vf = D['vol-forecast']?.instruments ?? {};
  const IDX = ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'];
  const vix = st('vix-inversion')?.value;
  const mrfx = D['macro-regime-fx'];
  const obs = {
    crossAssetRiskOnShare: sides.length ? sides.filter(s => s === 'risk-on').length / sides.length : null,
    vix: vix?.vix ?? null, vix3m: vix?.vix3m ?? null,
    hy20dBp: mc.hy?.deltas?.['20'] ?? null,
    stockBondCorr: st('stock-bond-together')?.value?.corr ?? null,
    dxy20dPct: mc.dxy ? +(100 * mc.dxy.deltas['20'] / (mc.dxy.last - mc.dxy.deltas['20'])).toFixed(2) : null,
    usdMove20Pct: D['today-reads']?.currency?.factors?.byCcy?.USD?.move20Pct ?? null,
    us10y20dBp: mc.us10y?.deltas?.['20'] ?? null,
    real20dBp: mc.tips?.deltas?.['20'] ?? null,
    hikesPriced: mrfx?.policy?.movesPriced ?? null, hikesDir: mrfx?.policy?.direction ?? null,
    medianVolPctIdx: median(IDX.map(s => vf[s]?.vol_pct)),
    medianVolPctFx: median(Object.keys(GR_PAIRS).map(s => vf[s]?.vol_pct)),
    frontState: g.volTerm?.frontState ?? null,
    csi: D['credit-stress']?.current?.csi ?? null,
    liquidityBlocked: D['liquidity-gate/live']?.instruments ? Object.values(D['liquidity-gate/live'].instruments).some(x => x.composite === 'BLOCKED') : null,
  };

  // ── direction inputs per pair: every family read, weight from evidence ────
  const ys = D['yield-spread/plan']?.plan;
  const ysThr = ys?.entryThreshold ?? 2.75;
  const sc = Object.fromEntries((D['macro-scorecard']?.ranked ?? []).map(c => [c.ccy, c.composite]));
  const cb = D['macro-scorecard']?.cbSentiment ?? {};
  const trend = Object.fromEntries((D['trend-basket']?.current ?? []).map(c => [c.ccy, c.trend]));
  const cotRows = (D['cot-extremes']?.instruments ?? []).filter(c => c.group === 'fx');
  const cot = Object.fromEntries(cotRows.map(c => [c.sym, c.specShareZ]));
  const hmm = D['hmm/regimes'] ?? {};
  const plan = D['daily-snapshot?days=2']?.days?.[0]?.plan?.pairs ?? {};
  const regimeKey = mrfx?.now?.key;
  const lastFomc = cb.USD?.meetingDate ?? null;
  const sessionsSinceFomc = lastFomc ? Math.floor(ageDays(lastFomc) * 5 / 7) : null;

  // median |open→close| of the fitted ladder's σ (0.6745σ), the same σ as the lines the Day Read draws
  const rowSigma = Object.fromEntries(rows.map(r => [r.sym, r.sigma]));
  const tapeDen = (sym, ss) => (rowSigma[sym] > 0 ? 0.6745 * rowSigma[sym] : ss?.forecast?.oc_median ?? null);
  const relCcy = (map, [b, q], scale = 1) => (map[b] != null && map[q] != null ? Math.max(-1, Math.min(1, (map[b] - map[q]) / scale)) : 0);
  const dir = {};
  for (const [pair, bq] of Object.entries(GR_PAIRS)) {
    const k = pair.toLowerCase(), xs = [];
    const add = (id, s, extra = {}) => {
      const r = REG[id];
      xs.push({ id, label: r.label, family: r.family, tier: r.tier, s, e: effectiveIc({ tier: r.tier, ic: extra.ic ?? r.ic, n_eff: extra.n_eff ?? null }, extra.fresh ?? 1), note: extra.note ?? null, sStory: extra.sStory });
    };
    const y = ys?.signals?.[k];
    if (y) {
      const active = Math.abs(y.z) >= ysThr;
      const d = (y.z > 0 ? 1 : -1) * (y.inverted ? -1 : 1);
      // decay on the OLDER raw leg (monthly foreign series, ~45d publication lag): y.asOf is always today
      const fr = y.quoteObsDate ? freshness(ageDays(y.quoteObsDate), 80) : freshness(ageDays(y.asOf), 3);
      add('yield-spread', active ? d * Math.min(1, Math.abs(y.z) / ysThr) : 0, { sStory: fr * d * Math.min(1, Math.abs(y.z) / ysThr), fresh: fr,
        note: `short-rate spread z ${y.z.toFixed(2)} (enters at ${ysThr})${y.quoteObsDate ? `, foreign leg last printed ${y.quoteObsDate}` : ''}` });
    }
    const usdSide = bq[0] === 'USD' ? 1 : -1;
    add('post-fomc', sessionsSinceFomc != null && sessionsSinceFomc <= 5 ? usdSide : 0, { note: lastFomc ? `last FOMC ${lastFomc}, ${sessionsSinceFomc} sessions ago` : 'no FOMC date' });
    const mr = regimeKey ? mrfx.study?.regimes?.[regimeKey]?.[pair]?.['20'] : null;
    if (mr?.oos?.enough) {
      const hit = mr.oos.hitRate / 100;
      add('macro-regime-fx', sgn(mr.oos.mean), { ic: Math.abs(2 * (hit - 0.5)), n_eff: mr.all.nEffective, note: `OOS hit ${mr.oos.hitRate}% (n ${mr.oos.n}) but only ${mr.all.nEffective} independent episodes` });
    }
    const lean = plan[pair]?.lean; add('lean', lean === 'up' ? 1 : lean === 'down' ? -1 : 0, { note: `page lean ${lean ?? '—'}` });
    // /api/hmm/regimes says BULL/BEAR (trade-grade.js), not up/down: the old test made this input 0 on every pair
    const h = hmm[SLASH(pair)], td = String(h?.trendDir ?? '').toUpperCase();
    add('hmm-trend', !h?.trendDirConfident ? 0 : td === 'BULL' || td === 'UP' ? 1 : td === 'BEAR' || td === 'DOWN' ? -1 : 0, { note: `HMM ${h?.regime ?? '—'} ${h?.trendDir ?? ''}` });
    add('trend', bq[0] === 'USD' ? -(trend[bq[1]] ?? 0) : (trend[bq[0]] ?? 0), { note: '12-month trend' });
    add('macro-score', relCcy(sc, bq, 0.5), { note: `${bq[0]} ${sc[bq[0]] ?? '—'} vs ${bq[1]} ${sc[bq[1]] ?? '—'}` });
    add('cb-tone', relCcy(Object.fromEntries(Object.entries(cb).map(([c, v]) => [c, v.score])), bq, 0.5), { note: 'hawk − dove, last statements' });
    add('cot', -relCcy(cot, bq, 2), { note: 'spec positioning, read contrarian' });
    const oi = (D['oi-today']?.pairs ?? []).find(p => p.pair === SLASH(pair));
    add('oi-walls', oi?.maxPain && oi?.spot ? sgn(oi.maxPain - oi.spot) : 0, { note: oi ? `max pain ${oi.maxPain.toPrecision(6)} (${oi.regime})` : '—' });
    // story-only reads (REGISTRY tier 'untested', weight 0 in the tested arm): the chain and the tape so far
    const clip1 = v => Math.max(-1, Math.min(1, v));
    if (mc.us10y?.deltas?.['20'] != null) add('us-yields', usdSide * clip1(mc.us10y.deltas['20'] / 25), { note: `US 10Y ${mc.us10y.deltas['20'] > 0 ? '+' : ''}${mc.us10y.deltas['20']}bp over 20d` });
    if (obs.dxy20dPct != null) add('dollar-tape', usdSide * clip1(obs.dxy20dPct / 2), { note: `broad dollar ${obs.dxy20dPct > 0 ? '+' : ''}${obs.dxy20dPct}% over 20d` });
    if (obs.hy20dBp != null) add('risk-tone', (RISK_BETA[pair] ?? 0) * clip1(-obs.hy20dBp / 50), { note: `HY spreads ${obs.hy20dBp > 0 ? '+' : ''}${obs.hy20dBp}bp over 20d` });
    const ss = D['vol-forecast/session']?.instruments?.[pair], den = tapeDen(pair, ss);
    if (ss?.oc != null && den > 0) add('today-tape', clip1(ss.oc / den), { note: `session ${ss.oc > 0 ? '+' : ''}${ss.oc}% from the open so far` });
    dir[pair] = xs;
  }

  // gold and the two daily-read indices: story-only reads, same rules as the FX pairs (weight 0 in the tested arm)
  {
    const clip1 = v => Math.max(-1, Math.min(1, v));
    const mk = sym => {
      const xs = [], r = id => REG[id];
      const add = (id, sv, note) => xs.push({ id, label: r(id).label, family: r(id).family, tier: r(id).tier, s: 0, e: 0, note, sStory: sv });
      const ss = D['vol-forecast/session']?.instruments?.[sym], den = tapeDen(sym, ss);
      if (ss?.oc != null && den > 0) add('today-tape', clip1(ss.oc / den), `session ${ss.oc > 0 ? '+' : ''}${ss.oc}% from the open so far`);
      return { xs, add };
    };
    const g = mk('GOLD');
    if (mc.tips?.deltas?.['20'] != null) g.add('real-yields', -clip1(mc.tips.deltas['20'] / 15), `real yield ${mc.tips.deltas['20'] > 0 ? '+' : ''}${mc.tips.deltas['20']}bp over 20d (gold falls when it rises)`);
    if (obs.dxy20dPct != null) g.add('dollar-tape', -clip1(obs.dxy20dPct / 2), `broad dollar ${obs.dxy20dPct > 0 ? '+' : ''}${obs.dxy20dPct}% over 20d`);
    if (obs.hy20dBp != null) g.add('risk-tone', 0.5 * clip1(obs.hy20dBp / 50), `HY spreads ${obs.hy20dBp > 0 ? '+' : ''}${obs.hy20dBp}bp over 20d (stress is mildly gold-positive)`);
    dir.GOLD = g.xs;
    for (const sym of ['NQ', 'US2000']) {
      const q = mk(sym);
      if (obs.hy20dBp != null) q.add('risk-tone', clip1(-obs.hy20dBp / 50), `HY spreads ${obs.hy20dBp > 0 ? '+' : ''}${obs.hy20dBp}bp over 20d`);
      if (obs.vix != null && obs.vix3m != null) q.add('vix-tone', obs.vix >= obs.vix3m ? -1 : clip1(((obs.vix3m - obs.vix) / obs.vix3m - 0.10) * 5), `VIX ${obs.vix} vs 3M ${obs.vix3m} (a ~10% contango is normal = 0)`);
      if (mc.us10y?.deltas?.['20'] != null) q.add('us-yields', -0.5 * clip1(mc.us10y.deltas['20'] / 25), `US 10Y ${mc.us10y.deltas['20'] > 0 ? '+' : ''}${mc.us10y.deltas['20']}bp over 20d`);
      dir[sym] = q.xs;
    }
  }

  // ── currency tier: each currency's own readings (state, not forecast) ─────
  const fac = D['today-reads']?.currency?.factors?.byCcy ?? {};
  const pers = D['today-reads']?.currency?.persistence ?? {};
  const es = D['econ-surprise']?.byCcy ?? {};
  const ry = D['real-yield']?.byCcy ?? {};
  const yc = D['yield-curve']?.byCcy ?? {};
  const scRow = Object.fromEntries((D['macro-scorecard']?.ranked ?? []).map(c => [c.ccy, c]));
  const currencies = {};
  for (const c of GR_CCYS) {
    const cotRow = cotRows.find(r => r.sym === c);
    const pairKey = Object.entries(GR_PAIRS).find(([, bq]) => bq.includes(c) && c !== 'USD')?.[0];
    const y = pairKey ? ys?.signals?.[pairKey.toLowerCase()] : null;
    currencies[c] = {
      move20Pct: fac[c]?.move20Pct ?? null, dollarShare: fac[c]?.dollarShare ?? null,
      vr4h: pers[c]?.vr4hMean ?? null,
      macroScore: scRow[c]?.composite ?? null, macroStale: Object.entries(D['macro-scorecard']?.staleDims ?? {}).flatMap(([dim, v]) => v.filter(x => x.ccy === c).map(x => `${dim} ${x.ageDays}d`)),
      surprise: es[c] ? { score: es[c].score, stale: !!es[c].staleOnly, lastAsOf: es[c].lastAsOf } : null,
      cb: cb[c] ? { score: cb[c].score, regime: cb[c].regime, meeting: cb[c].meetingDate } : null,
      cot: cotRow ? { specPct: cotRow.specPct, z: cotRow.specShareZ } : null,
      realYield: ry[c]?.latestReal ?? null, curveSlope: yc[c]?.latestSlope ?? null,
      // oriented: + = the short-rate spread favours THIS currency (the raw z is the pair's, US minus foreign)
      spreadZ: y ? +(y.z * (y.inverted ? -1 : 1) * (GR_PAIRS[pairKey][0] === c ? 1 : -1)).toFixed(2) : null, trend: trend[c] ?? null,
    };
  }

  // ── data quality: feed health + the cross-checks the audit found ──────────
  const health = D['data-health']?.rows ?? [];
  const checks = [];
  const chk = (cond, problem, where = null) => { if (cond) checks.push({ problem, where }); };
  // the range arm's main validated driver: say so when it is absent rather than run on the VIX flags alone
  { const noIv = rows.filter(r => r.ratio == null).map(r => r.sym);
    chk(rows.length && noIv.length, `IV÷σ missing for ${noIv.length} of ${rows.length} instruments (${noIv.join(', ')}): their range read runs on the VIX/breadth flags only`, '/api/daily-read setup'); }
  chk((D.cot?.errors ?? []).length, `COT live feed: ${(D.cot?.errors ?? []).join(', ')} (FX legs missing; the weekly cot-extremes copy is used)`, 'other pages');
  chk(D['hmm5m-v2'] && !Object.keys(D['hmm5m-v2']).length, 'intraday HMM (5m/1h) serve {}: those services are off by default (SVC_HMM5M_V2/SVC_HMM1H), so the input is absent', 'not on today.html');
  const fomcDoc = D['fomc/latest']?.meetingDate;
  chk(fomcDoc && lastFomc && fomcDoc !== lastFomc, `/api/fomc/latest returns ${fomcDoc}; the last FOMC was ${lastFomc} (the history route is current)`, 'not on today.html');
  const staleSurprise = Object.entries(es).filter(([, v]) => v.staleOnly).map(([c]) => c);
  chk(staleSurprise.length, `econ surprise has no recent prints for ${staleSurprise.join(', ')}`, 'today.html');
  const hmmLabels = new Set(Object.values(hmm).map(x => x.regime));
  chk(Object.keys(hmm).length > 5 && hmmLabels.size === 1, `daily HMM labels every instrument ${[...hmmLabels][0]}: it carries no information today`, 'today.html (via /api/levels)');
  const bogus = Object.entries(D['oi-levels']?.byInstrument ?? {}).filter(([, ls]) => {
    const mp = ls.find(l => l.type === 'max_pain')?.price; return mp && ls.some(l => l.price < mp * 0.5);
  }).map(([k]) => k);
  chk(bogus.length, `OI levels below 50% of max pain (hvl / cluster parse) on ${bogus.join(', ')}`, 'today.html (via /api/oi-today)');
  chk((D['release-calls']?.summary?.n ?? 0) === 0, 'the release-calls record is empty (nobody is pressing the call buttons)', 'today.html');
  chk(Object.keys(D['macro-scorecard']?.staleDims ?? {}).length, `macro scorecard stale: ${Object.entries(D['macro-scorecard']?.staleDims ?? {}).map(([k, v]) => `${k} ${v.map(x => `${x.ccy} ${x.ageDays}d`).join('/')}`).join('; ')}`, 'today.html');
  chk(ys && ysThr !== 2.75, `the yield-spread plan enters at |z| ${ysThr}; the validated rule is 2.75`, 'today.html');
  chk(mc.dxy && ageDays(mc.dxy.lastDate) > 5, `broad dollar last printed ${mc.dxy?.lastDate} (${Math.round(ageDays(mc.dxy?.lastDate))}d old)`, 'today.html');
  chk(flags.allDown == null, 'breadth-all-down could not be computed this pass (index D1 bars unavailable)', 'server globalRead tick');
  const missing = GLOBAL_READ_ENDPOINTS.filter(p => D[p] == null && !skip.includes(p));
  for (const p of missing) chk(true, `/api/${p} returned nothing: its inputs are absent from this read`, 'route down');

  // ── persistence / base rates ──────────────────────────────────────────────
  const hist = D.regime?.history ?? [];
  const cur = D.regime?.now?.regime;
  let stay = 0, tot = 0; for (let i = 0; i + 1 < hist.length; i++) if (hist[i].regime === cur) { tot++; if (hist[i + 1].regime === cur) stay++; }
  const persist = { vixInvert5d: 1 - Math.pow(1 - 86 / (18.8 * 252), 5), macroMonthly: tot ? stay / tot : null };

  const ev = st('event-range');
  const eventsDue = ev?.firing ? [{ label: (ev.detail ?? '').split('→')[0].trim() || ev.label, effects: (ev.expect ?? []).filter(e => Number.isFinite(e.effAtr)).map(e => ({ inst: e.inst, effAtr: +e.effAtr.toFixed(2) })) }] : [];

  // ── context: read and shown, never weighted ───────────────────────────────
  const cr = D['chain-read']?.read;
  const context = [
    D.regime?.now ? `Macro quadrant: ${D.regime.now.label} for ${D.regime.now.months} months (${D.regime.now.what}).` : null,
    cr?.hook ? `Chain read: ${cr.hook}` : null,
    ...(cr?.stories ?? []).map(s => `Story: ${s.name} (${s.status}).`),
    D['morning-brief']?.analysis?.headline ? `Brief: ${D['morning-brief'].analysis.headline}` : null,
    ...((D['cot-extremes']?.instruments ?? []).filter(c => c.specPct >= 95 || c.specPct <= 5).map(c => `COT extreme: ${c.label} specs at the ${c.specPct}th percentile (context; COT direction is a banked null).`)),
    mrfx?.policy ? `Front end: 2Y ${mrfx.policy.twoYear}% vs policy ${mrfx.policy.policyRate}%, ${mrfx.policy.movesPriced} ${mrfx.policy.direction} priced.` : null,
  ].filter(Boolean);

  // ── invalidation: the live thresholds that would change the read ──────────
  const maxZ = ys?.signals ? Math.max(...Object.values(ys.signals).map(s => Math.abs(s.z))) : null;
  const invalidation = [
    `VIX closes ≥ VIX3M (now ${obs.vix ?? '?'} vs ${obs.vix3m ?? '?'}) → alternative scenario; index, USDJPY and gold ranges widen.`,
    `HY above 4% (now ${mc.hy?.last ?? '?'}%) or another +25bp in a week → the credit axis turns to stress.`,
    `Any 2Y spread |z| ≥ ${ysThr} (largest now ${maxZ != null ? maxZ.toFixed(2) : '?'}) → a tested directional input switches on for that pair.`,
    'An IV÷σ tag flips (continue ↔ exhaust) at the 22:00 rebuild → that instrument\'s behaviour label flips.',
    'A tier-1 release enters the 24h window → event scaling applies; direction is still not part of it.',
    'Next FOMC → the five-session USD-drift window opens (the only tested event-direction input).',
  ];

  return {
    obs, rows, flags, dir, tags, currencies,
    // RANGE only when the HMM's own filtered probability agrees with its Viterbi label (EURUSD read RANGE at 34%)
    hmm: Object.fromEntries(Object.entries(hmm).map(([k, v]) => [hmmKey(k), v.regime === 'RANGE' && !(v.rangeProb >= 0.5) ? 'MIXED' : v.regime])),
    health, checks, persist, eventsDue, context, invalidation,
    meta: {
      asOf: new Date(now).toISOString(),
      dailyReadAt: drDay?.setup?.at ?? null,
      chain: D['chain-read']?.read ? { hook: D['chain-read'].read.hook ?? null, shouldHave: D['chain-read'].read.shouldHave ?? null, stories: (D['chain-read'].read.stories ?? []).map(x => ({ name: x.name, status: x.status, legs: x.legs, evidence: x.evidence })), ageMin: D['chain-read'].ageMin ?? null } : null,
      prices: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.price ?? null])),
      forward: { lean: D.ledger?.summary?.overall ?? null, rangeCalls: D['range-calls']?.summary?.flagged ? { ...D['range-calls'].summary.flagged, n: D['range-calls'].summary.n } : null },
      missing,
    },
  };
}

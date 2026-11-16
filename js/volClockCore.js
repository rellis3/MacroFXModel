/**
 * Vol clock board (Desk Terminal, Assets tab): the pure shaping. No fetch, no DOM; `now` is passed in.
 *
 *   buildVolClock({ dailyRead, intel, live, now })   what /api/vol-clock serves
 *   describeVolClock(vc)                             the rule-built paragraph
 *   wilson(k, n)                                     95% interval for a share
 *
 * Two readings of how big a market's move is expected to be, side by side:
 *   - IV over sigma: the options-implied daily sigma (CME settlement IV30, VXN for the Nasdaq) against the forecaster's own sigma for the day.
 *     Above the tag's upper edge the options price more movement than the forecast lines assume ("lines likely too tight"), below the lower edge
 *     less ("likely too wide"). It exists for the nine markets the Daily Read tags (js/dailyRead*, /api/daily-read).
 *   - The vol clock: how much of the forecast day's median range the session has used, against how much of the day has gone (the live layer's
 *     range state). While the FX week is shut it is the last completed session's range against that day's forecast median.
 * The ranking table adds every market the vol intelligence covers (realised-vol percentile, vol of vol, the IV term shape, IV minus realised).
 *
 * Evidence Book wording kept: iv-forecast (VALIDATED: implied vol forecasts the coming range better than realised-vol models), iv-ladder
 * (VALIDATED on 5 of 7), iv-over-rv-wider (VALIDATED: indices run wider after implied sits far above realised), vol-curve-front (VALIDATED for
 * the index range lines). Direction is not claimed anywhere: it is how much a market is expected to move, not which way. The Daily Read's own
 * forward record is small and is shown with its interval, never as a rule.
 */
const fin = v => v != null && v !== '' && Number.isFinite(+v);
const r1 = v => (fin(v) ? Math.round(+v * 10) / 10 : null);
const r2 = v => (fin(v) ? Math.round(+v * 100) / 100 : null);
const r3 = v => (fin(v) ? Math.round(+v * 1000) / 1000 : null);

/** The tags' plain meaning, worded as the size of the move (never the Daily Read's trade wording). */
export const TAGS = {
  continue: { label: 'CONTINUE', short: 'lines likely too tight', plain: 'options price more movement than the forecast lines assume' },
  fair: { label: 'FAIR', short: 'lines about right', plain: 'options and the forecast lines agree' },
  exhaust: { label: 'EXHAUST', short: 'lines likely too wide', plain: 'options price less movement than the forecast lines assume' },
};
export const DESIGN_P75 = 0.25;
/** Where the dial's marks sit: the forecast median line is 1.0 on its scale, p75 and p90 are the market's own ratios to it. */
export const DIAL_MAX = 2;

/** Wilson 95% interval for k of n. */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return null;
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: r3((c - h) / d), hi: r3((c + h) / d) };
}

const keysDesc = days => Object.keys(days ?? {}).sort().reverse();
/** The newest day that carries a setup with rows ({ date, setup }), or null. */
export function latestSetup(days) {
  for (const d of keysDesc(days)) { const s = days[d]?.setup; if (s?.rows?.length) return { date: d, setup: s }; }
  return null;
}
/** The newest day with a scored session AND the setup it was scored against ({ date, score, setup }), or null. */
export function lastScored(days) {
  for (const d of keysDesc(days)) { const x = days[d]; if (x?.score?.rows?.length && x?.setup?.rows?.length) return { date: d, score: x.score, setup: x.setup }; }
  return null;
}

/** The clock for one market: live range used so far, or the last completed session's, or nothing. */
export function clockFor(sym, { live, scored }) {
  const lr = live?.state?.range?.rows?.find(r => r.name === sym);
  const open = live && live.closed === false;
  if (open && lr && fin(lr.used)) return { mode: 'live', used: r2(lr.used), hours: lr.hours ?? null, pace: lr.pace ?? null, state: lr.state ?? null };
  if (open && lr) return { mode: 'live', used: null, hours: lr.hours ?? null, pace: null, state: lr.state ?? 'early' };
  if (scored) {
    const sc = scored.score.rows.find(r => r.sym === sym), st = scored.setup.rows.find(r => r.sym === sym), p50 = st?.lines?.hl_p50;
    if (sc && fin(sc.hl) && fin(p50) && p50 > 0) return { mode: 'last', used: r2(sc.hl / p50), date: scored.date, hit: sc.hit ?? null };
  }
  return { mode: 'none', used: null };
}

/** The forward record by tag, each with its 95% interval, the share the lines imply and the 25% by design. */
export function recordOf(dailyRead) {
  const t = dailyRead?.tally;
  if (!t) return null;
  const rows = ['continue', 'fair', 'exhaust'].filter(k => t[k]?.n > 0).map(k => {
    const x = t[k], ci = wilson(x.p75, x.n);
    return { tag: k, n: x.n, p75: x.p75, p75Rate: r3(x.p75Rate ?? x.p75 / x.n), lo: ci?.lo ?? null, hi: ci?.hi ?? null, expect: fin(dailyRead.expectP75?.[k]) ? r3(dailyRead.expectP75[k]) : null };
  });
  const firstDay = Object.keys(dailyRead.days ?? {}).filter(d => dailyRead.days[d]?.score?.rows?.length).sort()[0] ?? null;
  return rows.length ? { rows, design: DESIGN_P75, since: firstDay, updatedAt: dailyRead.updatedAt ?? null } : null;
}

export function buildVolClock({ dailyRead = null, intel = null, live = null, now = Date.now() } = {}) {
  const sp = latestSetup(dailyRead?.days), scored = lastScored(dailyRead?.days);
  const inst = intel?.instruments ?? {};
  if (!sp && !Object.keys(inst).length) return { ok: false, error: 'neither the Daily Read nor the vol intelligence has been built yet' };
  const tiles = (sp?.setup.rows ?? []).filter(r => fin(r.ratio) && fin(r.iv)).map(r => {
    const L = r.lines ?? {}, p50 = L.hl_p50;
    return {
      sym: r.sym, cls: inst[r.sym]?.assetClass ?? null, iv: r2(r.iv), sigma: r2(r.sigma), ratio: r3(r.ratio), tag: r.tag ?? null, edges: Array.isArray(r.edges) ? r.edges.map(r3) : null,
      ivrv: r2(r.ivrv), ivSource: r.ivSource ?? null, provisional: r.provisional ?? null, event: r.event ?? null, eventMult: r2(r.eventMult),
      lines: fin(p50) && p50 > 0 ? { p50: r2(p50), p75: r2(L.hl_p75), p90: r2(L.hl_p90), k75: r2(L.hl_p75 / p50), k90: r2(L.hl_p90 / p50) } : null,
      clock: clockFor(r.sym, { live, scored }),
    };
  });
  const rank = Object.entries(inst).map(([name, v]) => {
    const t = tiles.find(x => x.sym === name);
    return { name, cls: v.assetClass ?? null, volPct: fin(v.vol_pct) ? v.vol_pct : null, volAnnual: r1(v.vol_annual), vov: v.vol_vov_label ?? null,
      ivShape: v.iv_term_structure?.shape ?? null, ivFront: r1(v.iv_term_structure?.front?.iv), vrpPct: r1(v.vrp?.premium_pct), ratio: t?.ratio ?? null, tag: t?.tag ?? null, edges: t?.edges ?? null };
  });
  return {
    ok: true, builtAt: new Date(now).toISOString(),
    closed: live ? live.closed !== false : null, quoteAt: live?.quoteAt ?? null,
    setup: sp ? { date: sp.date, at: sp.setup.at ?? null, forecastAt: sp.setup.forecastAt ?? null } : null,
    lastSession: scored ? { date: scored.date } : null,
    tiles, rank, record: recordOf(dailyRead),
    noIv: rank.filter(x => x.ratio == null).length, counts: { tagged: tiles.length, total: rank.length },
    intelAt: intel?.computed_at ?? null, dailyReadAt: dailyRead?.updatedAt ?? null,
  };
}

const pc = v => `${Math.round(v * 100)}%`;
/** One paragraph by rule: how many markets sit above, at and below their forecast sigma, the extremes, and the forward record with its interval. */
export function describeVolClock(vc) {
  if (!vc?.ok || !vc.tiles?.length) return null;
  const by = { continue: [], fair: [], exhaust: [] };
  for (const t of vc.tiles) if (by[t.tag]) by[t.tag].push(t);
  const hi = [...vc.tiles].sort((a, b) => b.ratio - a.ratio);
  const n = vc.tiles.length;
  let out = `Of the ${n} markets with an options-implied number, ${by.continue.length} sit above their forecast sigma (${TAGS.continue.short}), ${by.fair.length} about at it and ${by.exhaust.length} below it (${TAGS.exhaust.short}).`;
  out += ` Highest: ${hi[0].sym} at ${hi[0].ratio.toFixed(2)}×; lowest: ${hi.at(-1).sym} at ${hi.at(-1).ratio.toFixed(2)}×.`;
  const rc = vc.record?.rows ?? [], a = rc.find(x => x.tag === 'continue'), b = rc.find(x => x.tag === 'exhaust');
  if (a && b) {
    const overlap = a.lo <= b.hi && b.lo <= a.hi;
    out += ` The Daily Read's forward record so far: on "${TAGS.continue.short}" days ${pc(a.p75Rate)} ended past the 75th-percentile line (n=${a.n}, 95% interval ${pc(a.lo)} to ${pc(a.hi)}), on "${TAGS.exhaust.short}" days ${pc(b.p75Rate)} (n=${b.n}, ${pc(b.lo)} to ${pc(b.hi)}), against ${pc(vc.record.design)} by design${overlap ? '; the two intervals overlap, so this record cannot yet tell them apart' : ''}.`;
  }
  return `${out} This is how much movement is priced against how much the lines expect, not which way.`;
}

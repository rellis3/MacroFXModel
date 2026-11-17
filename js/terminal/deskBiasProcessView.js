// js/terminal/deskBiasProcessView.js: the Desk Terminal "Bias process" tab (plans/DESK_BIAS_PROCESS_SPEC.md "Desk Terminal", "Head to head",
// "Weekly review"). The pure half (HTML strings and small helpers: no DOM, no fetch, no clock unless passed) is tested in
// deskBiasProcessView.test.mjs; `mount` at the bottom is the only part that touches the page. server.js imports weeklyReview for
// GET /api/desk-bias-process/h2h.
//
// Data: GET /api/desk-bias-process (?date, ?live=1) for the cards; GET /api/desk-bias-process/h2h for the head to head and the weekly review;
// GET/POST /api/fundabias-log for the owner's FundaBias log.
//
// Surfaces (js/terminal/tabRegistry.js):
//   tab.bprocess       the tab and its cards: a direction read with no forward record yet, so 'preview' (owner sees it, desk login opt-in)
//   panel.bp.invalid   the invalidation line on each card: reads as a stop, so 'trade'
//   panel.bp.h2h       the head-to-head table: the competitors' scored record, so 'pnl'
//   panel.bp.review    the weekly review of wrong calls: the process's scored record, so 'pnl'
//   panel.bp.fundabias the owner's FundaBias log form: 'internal' (the POST is owner-only on the server too)
// Colours are theme tokens only.

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fin = x => typeof x === 'number' && Number.isFinite(x);
const sideOf = d => (d === 'BULLISH' || d === 1 ? 1 : d === 'BEARISH' || d === -1 ? -1 : 0);
const WORD = { BULLISH: 'Bullish', BEARISH: 'Bearish', NEUTRAL: 'Neutral' };
const cls = s => (s > 0 ? 'up' : s < 0 ? 'dn' : '');
const arrow = s => (s > 0 ? '▲' : s < 0 ? '▼' : '–');
const f = (x, k = 2) => (fin(x) ? (+x).toFixed(k) : '–');
const pct = x => (fin(x) ? `${Math.round(x * 100)}%` : '–');
const sgn = (x, k = 2) => (!fin(x) ? '–' : Number(Math.abs(x).toFixed(k)) === 0 ? (0).toFixed(k) : `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(k)}`);
/** A price with sensible decimals for its size. */
export const px = x => (!fin(x) ? '–' : Math.abs(x) >= 1000 ? x.toFixed(1) : Math.abs(x) >= 20 ? x.toFixed(2) : Math.abs(x) >= 2 ? x.toFixed(3) : x.toFixed(5));

export const NOTE = 'A rule-based daily bias reviewed by an AI analyst that may accept or override it. Scored forward head to head; no forward record yet, not a trade signal.';

// ── markets and groups ───────────────────────────────────────────────────────────────────────────────────────────
export const GROUPS = [['all', 'All'], ['fx', 'FX'], ['metals', 'Metals'], ['indices', 'Indices'], ['commodities', 'Commodities']];
const METALS = new Set(['GOLD', 'XAUUSD', 'SILVER', 'XAGUSD', 'COPPER', 'PLATINUM']);
const INDICES = new Set(['NQ', 'NAS100', 'SPX500', 'US500', 'ES', 'US30', 'DJI', 'US2000', 'DE30', 'DE40', 'UK100', 'JP225']);
const COMMOD = new Set(['WTI', 'BRENT', 'USOIL', 'UKOIL', 'NATGAS']);
/** 'fx' | 'metals' | 'indices' | 'commodities' for a market name. */
export function groupOf(market) {
  const m = String(market ?? '').toUpperCase();
  if (METALS.has(m)) return 'metals';
  if (INDICES.has(m)) return 'indices';
  if (COMMOD.has(m)) return 'commodities';
  return /^[A-Z]{6}$/.test(m) ? 'fx' : 'commodities';
}
/** Cards filtered by group and sorted: by conviction (high first, Neutral last, then the stored order) or in the stored order. */
export function filterSort(cards, { group = 'all', sort = 'conviction' } = {}) {
  const list = (cards ?? []).map((c, i) => ({ c, i })).filter(({ c }) => group === 'all' || groupOf(c.market) === group);
  if (sort === 'conviction') list.sort((a, b) => (fin(b.c.call?.conviction) && sideOf(b.c.call?.dir) ? b.c.call.conviction : -1) - (fin(a.c.call?.conviction) && sideOf(a.c.call?.dir) ? a.c.call.conviction : -1) || a.i - b.i);
  return list.map(x => x.c);
}

// ── one card ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** Five dots, `n` of them lit ('' for a Neutral call). */
export function dots(n) {
  if (!fin(n)) return '';
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return `<span class="bp-dots" title="conviction ${k} of 5" aria-label="conviction ${k} of 5">${'<i class="on"></i>'.repeat(k)}${'<i></i>'.repeat(5 - k)}</span>`;
}
export const BY_LABEL = { 'ai-accept': 'AI accept', 'ai-override': 'AI override', system: 'system', 'system-fallback': 'system (AI failed)' };
export const byLabel = by => BY_LABEL[by] ?? (by ? String(by) : 'system');
export function dirChip(dir, conviction) {
  const s = sideOf(dir);
  return `<span class="chip ${cls(s)} bp-dir">${arrow(s)} ${esc(WORD[dir] ?? 'Neutral')}</span>${s ? dots(conviction) : ''}`;
}
const evList = xs => (xs ?? []).map(e => `${e.ccy ?? e.country ?? ''} ${e.event ?? ''}`.trim()).filter(Boolean);
const hhmm = iso => { const t = String(iso ?? ''); return t.length >= 16 ? `${t.slice(11, 16)} UTC` : ''; };
/** The six layers as compact rows: [{ key, label, text, side }] (side ±1 / 0 / null colours the row). */
export function layerRows(card) {
  const L = card?.layers ?? {};
  const ev = L.event ?? {}, rg = L.regime ?? {}, mc = L.macro ?? {}, st = L.structure ?? {}, ps = L.positioning ?? {}, rn = L.range ?? {};
  const pend = evList(ev.pending), later = evList(ev.laterToday);
  const evText = !ev.state ? `unknown${ev.why ? ` (${ev.why})` : ''}`
    : `${ev.state}${pend.length ? `: ${pend.slice(0, 2).join(', ')}${pend.length > 2 ? ` +${pend.length - 2}` : ''}` : ''}${later.length ? ` · later today: ${later.slice(0, 2).join(', ')}` : ''}`;
  const rgText = [rg.risk ? `risk-${rg.risk}${fin(rg.R) ? ` (${sgn(rg.R)})` : ''}` : 'risk n/a', rg.vol ? `vol ${rg.vol}${fin(rg.volPct1y) ? ` p${rg.volPct1y}` : ''}` : null, rg.smile ? `smile ${rg.smile}` : null].filter(Boolean).join(' · ');
  const drv = (mc.drivers ?? []).slice(0, 2).map(d => `${d.leg ? `${d.leg} ` : ''}${d.label ?? d.key} ${sgn(d.contrib)}`);
  const mcText = fin(mc.score) ? `${sgn(mc.score)}${drv.length ? ` · ${drv.join(', ')}` : ''}` : `n/a${mc.why ? ` (${mc.why})` : ''}`;
  const tf = k => `${k.toUpperCase()} ${arrow(st[k])}`;
  const sw = [st.swingHigh ? `swing H ${px(st.swingHigh.level)}` : null, st.swingLow ? `swing L ${px(st.swingLow.level)}` : null].filter(Boolean).join(' · ');
  const bos = st.bos === 1 ? 'BOS up' : st.bos === -1 ? 'BOS down' : st.bos === 0 ? 'inside swings' : null;
  const stText = `${['w1', 'd1', 'h4'].map(tf).join(' ')}${sw ? ` · ${sw}` : ''}${bos ? ` · ${bos}` : ''}`;
  const psText = ps.crowded ? `crowded ${ps.crowdedSide > 0 ? 'long' : ps.crowdedSide < 0 ? 'short' : 'both ways'}` : ps.readings ? 'not crowded' : `n/a${ps.why ? ` (${ps.why})` : ''}`;
  const rnText = fin(rn.p50Pct) ? `p50 ${f(rn.p50Pct)}% · p75 ${f(rn.p75Pct)}%${fin(rn.p50) ? ` (${px(rn.p50)} / ${px(rn.p75)})` : ''}${fin(rn.usedOfP50) ? ` · used ${pct(rn.usedOfP50)} of p50` : ''}` : `n/a${rn.why ? ` (${rn.why})` : ''}`;
  return [
    { key: 'event', label: 'Event', text: evText, side: null },
    { key: 'regime', label: 'Regime', text: rgText, side: regimeSide(card) },
    { key: 'macro', label: 'Macro', text: mcText, side: fin(mc.side) ? mc.side : null },
    { key: 'structure', label: 'Structure', text: stText, side: fin(st.side) ? st.side : null },
    { key: 'positioning', label: 'Positioning', text: psText, side: fin(ps.crowdedSide) ? -ps.crowdedSide : null },
    { key: 'range', label: 'Day range', text: rnText, side: null },
  ];
}
/** The side the regime leans for this market (risk-on: its pro-risk side; risk-off: its haven side), or null. */
export function regimeSide(card) {
  const rg = card?.layers?.regime, role = rg?.role;
  if (!rg?.risk || !fin(role) || role === 0 || rg.risk === 'neutral') return null;
  return rg.risk === 'on' ? Math.sign(role) : -Math.sign(role);
}
/** One market card in the FundaBias layout. The invalidation line is its own 'trade' surface. */
export function cardHtml(card) {
  const c = card?.call ?? {}, sys = card?.system ?? {}, ai = card?.ai ?? null;
  const reason = ai?.reason ?? (ai?.error ? `AI step failed (${ai.error}); the system call stands.` : sys.rule ? `Rules: ${sys.rule}` : '');
  const overrode = c.by === 'ai-override' && sys.dir;
  const inv = fin(c.invalidation) ? c.invalidation : null;
  const rows = layerRows(card).map(r => `<li data-k="${r.key}"><b>${esc(r.label)}</b><span class="${cls(r.side)}">${esc(r.text)}</span></li>`).join('');
  return `<div class="card bp-card" data-market="${esc(card?.market)}" data-group="${groupOf(card?.market)}">
<div class="ch"><span class="lbl bp-mkt">${esc(card?.market)}</span><span class="r">${dirChip(c.dir, c.conviction)}</span></div>
<div class="bp-by"><span class="chip ${c.by === 'ai-override' ? 'gold' : c.by?.startsWith('ai') ? 'pur' : ''}">by ${esc(byLabel(c.by))}</span>${overrode ? `<span class="muted bp-sys" title="${esc(sys.rule ?? '')}">system said ${esc(WORD[sys.dir] ?? sys.dir)}${fin(sys.conviction) ? ` ${sys.conviction}/5` : ''}</span>` : ''}</div>
${reason ? `<p class="bp-reason">${esc(reason)}</p>` : ''}
<ul class="bp-layers">${rows}</ul>
${inv != null ? `<div class="bp-inv" data-surface="panel.bp.invalid">Invalidation <b class="mono">${esc(px(inv))}</b>${card?.invalidation?.basis ? ` <span class="muted">${esc(card.invalidation.basis)}</span>` : ''}</div>` : ''}
</div>`;
}
/** The cards block: the filter pills, the sort, the grid. */
export function cardsHtml(rec, { group = 'all', sort = 'conviction' } = {}) {
  const cards = Object.values(rec?.markets ?? {});
  if (!cards.length) return '<p class="muted">No cards: the process has not issued yet.</p>';
  const shown = filterSort(cards, { group, sort });
  const pills = GROUPS.filter(([g]) => g === 'all' || cards.some(c => groupOf(c.market) === g))
    .map(([g, l]) => `<button type="button" class="bp-pill" data-group="${g}" aria-pressed="${g === group}">${l}</button>`).join('');
  return `<div class="bp-tools"><div class="bp-pills" role="group" aria-label="Filter markets">${pills}</div><label class="muted bp-sort">Sort <select data-bp="sort"><option value="conviction"${sort === 'conviction' ? ' selected' : ''}>by conviction</option><option value="market"${sort !== 'conviction' ? ' selected' : ''}>market order</option></select></label></div>
<div class="bp-grid">${shown.map(cardHtml).join('') || '<p class="muted">No market in this group.</p>'}</div>`;
}
export function headHtml(rec) {
  if (!rec) return '';
  const when = rec.live ? `live read · ${hhmm(rec.asOf)}` : `issue ${esc(rec.date)}${rec.issuedAt ? ` · ${hhmm(rec.issuedAt)}` : ''}`;
  const by = Object.values(rec.markets ?? {}).reduce((a, c) => ((a[c.call?.by ?? 'system'] = (a[c.call?.by ?? 'system'] ?? 0) + 1), a), {});
  return `<div class="ch"><span class="lbl">Bias process · ${when}</span><span class="r">${rec.live ? '<span class="chip gold" title="computed now: the system call only, no AI step; not stored and not scored">live, rules only</span>' : ''}<span class="chip pur">${esc(rec.version ?? '')}</span>${Object.entries(by).map(([k, n]) => `<span class="chip">${esc(byLabel(k))} ${n}</span>`).join('')}</span></div>
<p class="muted bp-note">${esc(rec.liveNote ?? NOTE)}</p>`;
}

// ── head to head ─────────────────────────────────────────────────────────────────────────────────────────────────
export const COMPETITORS = [['process-ai', 'Process (AI)'], ['process-system', 'Process (rules)'], ['max-signals', 'Max'], ['fundabias', 'FundaBias'], ['desk-rating', 'Desk'], ['bias-engine', 'Engine'], ['h4-trend', 'H4 trend']];
export const JUDGE_AT = [60, 120];
/** The next London weekday the process issues on (today when it is a weekday before 08:00 London). nowMs is passed in. */
export function nextIssueDate(nowMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(nowMs)).map(x => [x.type, x.value]));
  let d = `${p.year}-${p.month}-${p.day}`;
  const wk = s => { const g = new Date(`${s}T12:00:00Z`).getUTCDay(); return g >= 1 && g <= 5; };
  if (wk(d) && +p.hour < 8) return d;
  do d = new Date(Date.parse(`${d}T12:00:00Z`) + 864e5).toISOString().slice(0, 10); while (!wk(d));
  return d;
}
/** "n days so far" and where the formal 60 / 120 shared-day verdicts stand. */
export function judgement(H) {
  const days = H?.days ?? 0, shared = H?.sharedDays ?? 0;
  const points = JUDGE_AT.map(n => ({ at: n, left: Math.max(0, n - shared), reached: shared >= n }));
  const next = points.find(p => !p.reached);
  return { days, shared, points, text: `${days} day${days === 1 ? '' : 's'} so far${H?.first ? ` (${H.first} to ${H.last})` : ''}; ${shared} shared day${shared === 1 ? '' : 's'}. ${next ? `First formal verdict at ${next.at} shared days (${next.left} to go)` : 'Both formal verdicts (60 and 120 shared days) are due'}; until then it is a running table, not a verdict.` };
}
const ci = c => (Array.isArray(c) ? `<span class="muted">[${sgn(c[0])}, ${sgn(c[1])}]</span>` : '');
/** Calibration "1: 50% (4) · 3: 62% (8)" in conviction order. */
export function calibText(cal) {
  const e = Object.entries(cal ?? {}).sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : +a - +b));
  return e.length ? e.map(([k, v]) => `${k === 'none' ? 'n/a' : k}: ${pct(v.hit)} (${v.n})`).join(' · ') : '–';
}
/** Table rows, one per competitor in the fixed order (a competitor with no record yet still gets its row). `which` = 'shared' | 'all'. */
export function h2hRows(H, which = 'all') {
  const by = new Map((H?.table ?? []).map(r => [r.competitor, r]));
  const extra = (H?.table ?? []).filter(r => !COMPETITORS.some(([k]) => k === r.competitor)).map(r => [r.competitor, r.competitor]);
  return [...COMPETITORS, ...extra].map(([k, label]) => {
    const r = by.get(k), b = r?.[which] ?? null;
    return { key: k, label, has: !!(b && b.records), records: b?.records ?? 0, calls: b?.speaking ?? 0, neutral: b?.neutralShare ?? null,
      hit: b?.hits?.d21?.hit ?? null, b0: b?.hits?.d21?.b0 ?? null, excess: b?.hits?.d21?.excess ?? null, excessCi: b?.hits?.d21?.excessCi ?? null, hitN: b?.hits?.d21?.n ?? 0,
      hitN07: b?.hits?.n07?.hit ?? null, trades: b?.R?.trades ?? 0, meanR: b?.R?.meanRnet ?? null, meanRCi: b?.R?.meanRnetCi ?? null, totalR: b?.R?.totalRnet ?? null, calib: calibText(b?.calibration) };
  });
}
export function h2hHtml(P, { which = 'all', nowMs = Date.now() } = {}) {
  if (!P || P.ok === false) return `<p class="muted">${esc(P?.error === 'owner only' ? 'The head to head is the process\'s scored record: owner only.' : `The head to head did not load${P?.error ? ` (${P.error})` : ''}.`)}</p>`;
  if (P.empty || !P.h2h) return `<p class="muted bp-empty">No record yet: the head to head starts with the first stored issue, ${esc(nextIssueDate(nowMs))} at 07:30 London. Forward only; nothing is back-issued.</p>`;
  const H = P.h2h, J = judgement(H), rows = h2hRows(H, which);
  const o = H.override ?? {};
  const body = rows.map(r => `<tr${r.has ? '' : ' class="muted"'}><th>${esc(r.label)}</th><td class="n">${r.records}</td><td class="n">${r.calls}</td>
<td class="n">${pct(r.hit)} <span class="muted">vs ${pct(r.b0)}</span></td><td class="n ${cls(r.excess)}">${sgn(r.excess)} ${ci(r.excessCi)}</td><td class="n">${pct(r.hitN07)}</td>
<td class="n">${r.trades}</td><td class="n ${cls(r.meanR)}">${sgn(r.meanR)} ${ci(r.meanRCi)}</td><td class="n ${cls(r.totalR)}">${sgn(r.totalR, 1)}</td><td class="n">${pct(r.neutral)}</td><td class="bp-cal">${esc(r.calib)}</td></tr>`).join('');
  return `<p class="bp-judge">${esc(J.text)}</p>
<div class="bp-tools"><div class="bp-pills" role="group" aria-label="Rows"><button type="button" class="bp-pill" data-which="all" aria-pressed="${which === 'all'}">All own rows</button><button type="button" class="bp-pill" data-which="shared" aria-pressed="${which === 'shared'}">Shared market-days</button></div></div>
<div class="scroll"><table class="bp-h2h"><thead><tr><th>Competitor</th><th class="n">records</th><th class="n" title="non-Neutral calls">calls</th><th class="n" title="call time to 21:00 London, against the point-in-time base rate">hit to 21:00</th><th class="n" title="hit minus base rate, with a day-cluster bootstrap 95% interval">excess [95%]</th><th class="n" title="to 07:00 the next weekday">hit to 07:00</th><th class="n">trades</th><th class="n" title="the fixed trade rule, net of the bar spread">mean R net [95%]</th><th class="n">total R</th><th class="n">Neutral</th><th title="hit rate to 21:00 by conviction (n)">calibration</th></tr></thead><tbody>${body}</tbody></table></div>
<p class="bp-ov"><b>Override record (process-ai):</b> ${o.n ? `${o.n} override${o.n === 1 ? '' : 's'}; the AI was better on ${o.aiBetter}, the rules on ${o.systemBetter}; mean (AI − rules) ${sgn(o.meanDiffSigma)} σ ${ci(o.diffCi)}.` : 'no override scored yet.'}</p>
<p class="muted bp-foot">One fixed trade rule for everyone: enter at the call time; stop at the competitor's invalidation if it gave one, else 1 σ_day; exit on a flip or Neutral, at the stop or Friday 21:00; real spread. ${esc(H.note ?? '')}</p>`;
}

// ── weekly review ────────────────────────────────────────────────────────────────────────────────────────────────
const LAYER_SIDES = [['macro', 'macro'], ['structure', 'structure'], ['w1', 'W1 trend'], ['d1', 'D1 trend'], ['h4', 'H4 trend'], ['regime', 'regime'], ['positioning', 'positioning (contrarian)']];
/** Each layer's side for a card: ±1 or null. */
export function layerSides(card) {
  const L = card?.layers ?? {}, st = L.structure ?? {};
  const s = x => (fin(x) && x !== 0 ? Math.sign(x) : null);
  return { macro: s(L.macro?.side), structure: s(st.side), w1: s(st.w1), d1: s(st.d1), h4: s(st.h4), regime: regimeSide(card), positioning: fin(L.positioning?.crowdedSide) && L.positioning.crowdedSide ? -L.positioning.crowdedSide : null };
}
/**
 * The week's review of the published call (process-ai). records: stored day records; outcomes: { 'MARKET|DATE': { d21: { y, ret } | null } };
 * endDate: the last date to include; days: calendar days back (7). Returns { from, to, rows (wrong calls, newest first), calls, right, wrong,
 * pending, overrides: { n, helped, hurt, same } }. A row: { date, market, dir, conviction, by, system, moveSign, wrongLayers[], override, eventAfter[] }.
 */
export function weeklyReview(records, outcomes, { endDate, days = 7 } = {}) {
  const end = endDate ?? (records ?? []).map(r => r.date).sort().at(-1) ?? null;
  if (!end) return { from: null, to: null, rows: [], calls: 0, right: 0, wrong: 0, pending: 0, overrides: { n: 0, helped: 0, hurt: 0, same: 0 } };
  const from = new Date(Date.parse(`${end}T12:00:00Z`) - (days - 1) * 864e5).toISOString().slice(0, 10);
  const out = { from, to: end, rows: [], calls: 0, right: 0, wrong: 0, pending: 0, overrides: { n: 0, helped: 0, hurt: 0, same: 0 } };
  for (const r of records ?? []) {
    if (!r?.date || r.date < from || r.date > end) continue;
    for (const [market, c] of Object.entries(r.markets ?? {})) {
      const s = sideOf(c.call?.dir), o = outcomes?.[`${market}|${r.date}`]?.d21 ?? null;
      const m = o && fin(o.ret) && o.ret !== 0 ? Math.sign(o.ret) : null;
      if (c.call?.by === 'ai-override' && m != null) {
        const ai = s * m, sys = sideOf(c.system?.dir) * m;
        out.overrides.n++; out.overrides[ai > sys ? 'helped' : ai < sys ? 'hurt' : 'same']++;
      }
      if (!s) continue;
      out.calls++;
      if (m == null) { out.pending++; continue; }
      if (s === m) { out.right++; continue; }
      out.wrong++;
      const sides = layerSides(c);
      const sys = sideOf(c.system?.dir);
      out.rows.push({ date: r.date, market, dir: c.call.dir, conviction: c.call.conviction ?? null, by: c.call.by ?? null, system: c.system?.dir ?? null, moveSign: m,
        wrongLayers: LAYER_SIDES.filter(([k]) => sides[k] === -m).map(([, l]) => l),
        override: c.call.by === 'ai-override' ? (sys === m ? 'hurt' : sys === 0 ? 'hurt (rules were Neutral)' : 'same side as the rules') : null,
        eventAfter: evList(c.layers?.event?.laterToday) });
    }
  }
  out.rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.market < b.market ? -1 : 1));
  return out;
}
export function reviewHtml(P, { nowMs = Date.now() } = {}) {
  if (!P || P.ok === false) return `<p class="muted">${esc(P?.error === 'owner only' ? 'The weekly review is the process\'s scored record: owner only.' : `The review did not load${P?.error ? ` (${P.error})` : ''}.`)}</p>`;
  const R = P.review;
  if (P.empty || !R || !R.to) return `<p class="muted bp-empty">No week to review yet: the first issue is ${esc(nextIssueDate(nowMs))} at 07:30 London.</p>`;
  const o = R.overrides ?? {};
  const head = `<p class="bp-judge">${esc(R.from)} to ${esc(R.to)}: ${R.calls} call${R.calls === 1 ? '' : 's'}, ${R.right} right, ${R.wrong} wrong${R.pending ? `, ${R.pending} not scored yet` : ''} (to 21:00 London). Overrides: ${o.n ? `${o.n}, helped ${o.helped}, hurt ${o.hurt}${o.same ? `, no difference ${o.same}` : ''}` : 'none scored'}.</p>`;
  if (!R.rows.length) return `${head}<p class="muted">No wrong calls this week.</p>`;
  return `${head}<div class="scroll"><table class="bp-review"><thead><tr><th>Day</th><th>Market</th><th>Call</th><th>Moved</th><th>Layer that pointed the wrong way</th><th>Override</th><th>Event after the call</th></tr></thead><tbody>${R.rows.map(r => `<tr><td class="mono">${esc(r.date)}</td><th>${esc(r.market)}</th><td><span class="${cls(sideOf(r.dir))}">${esc(WORD[r.dir] ?? r.dir)}${fin(r.conviction) ? ` ${r.conviction}/5` : ''}</span> <span class="muted">${esc(byLabel(r.by))}</span></td><td class="${cls(r.moveSign)}">${r.moveSign > 0 ? 'up' : 'down'}</td><td>${r.wrongLayers.length ? esc(r.wrongLayers.join(', ')) : '<span class="muted">none: every layer with a side agreed with the call</span>'}</td><td>${r.override ? esc(r.override) : '<span class="muted">–</span>'}</td><td>${r.eventAfter.length ? esc(r.eventAfter.join(', ')) : '<span class="muted">none</span>'}</td></tr>`).join('')}</tbody></table></div>
<p class="muted bp-foot">A rule changes only by a dated, versioned amendment (desk-bias-process-v2, ...); the old version keeps being scored for 20 days beside it.</p>`;
}

// ── FundaBias log ────────────────────────────────────────────────────────────────────────────────────────────────
/** The message to show for a POST /api/fundabias-log answer. */
export function fbMessage(status, body) {
  if (status === 200 && body?.ok) return { ok: true, text: `Logged ${body.row?.market} ${WORD[body.row?.dir] ?? body.row?.dir} ${body.row?.score10}/10 at ${hhmm(body.row?.loggedAt)}.` };
  if (status === 409) return { ok: false, text: body?.error ?? 'Already logged today (write-once).' };
  if (status === 403) return { ok: false, text: body?.error && body.error !== 'owner only' ? body.error : 'Owner only: the FundaBias log is the owner\'s record.' };
  if (status === 400) return { ok: false, text: body?.error ?? 'The server refused the entry.' };
  return { ok: false, text: body?.error ? `Not logged: ${body.error}` : `Not logged (the server answered ${status}).` };
}
/** Validate the form before sending: { ok, body } or { ok: false, error }. */
export function fbBody({ market, dir, score10 }) {
  if (!market) return { ok: false, error: 'Pick a market.' };
  if (!['BULLISH', 'BEARISH', 'NEUTRAL'].includes(dir)) return { ok: false, error: 'Pick Bullish, Bearish or Neutral.' };
  const n = Number(score10);
  if (score10 === '' || score10 == null || !Number.isInteger(n) || n < 0 || n > 10) return { ok: false, error: 'The score is a whole number from 0 to 10.' };
  return { ok: true, body: { market, dir, score10: n } };
}
export function fbHtml(markets, rows, { msg = null } = {}) {
  const logged = new Set((rows ?? []).map(r => r.market));
  const opts = (markets ?? []).map(m => `<option value="${esc(m)}"${logged.has(m) ? ' disabled' : ''}>${esc(m)}${logged.has(m) ? ' (logged)' : ''}</option>`).join('');
  return `<form class="bp-fb" data-bp="fb" autocomplete="off">
<label>Market <select name="market"><option value="">pick…</option>${opts}</select></label>
<span class="bp-dirs" role="radiogroup" aria-label="Direction">${['BULLISH', 'BEARISH', 'NEUTRAL'].map(d => `<label class="bp-radio"><input type="radio" name="dir" value="${d}"> ${WORD[d]}</label>`).join('')}</span>
<label>Score <input name="score10" type="number" min="0" max="10" step="1" inputmode="numeric" style="width:4.5em"> /10</label>
<button type="submit" class="bp-pill">Log</button></form>
<p class="bp-msg ${msg ? (msg.ok ? 'up' : 'dn') : ''}" role="status">${msg ? esc(msg.text) : ''}</p>
<div class="bp-fbrows">${(rows ?? []).length ? `<table><thead><tr><th>Market</th><th>FundaBias</th><th class="n">score</th><th class="n">logged</th></tr></thead><tbody>${rows.map(r => `<tr><th>${esc(r.market)}</th><td class="${cls(sideOf(r.dir))}">${esc(WORD[r.dir] ?? r.dir)}</td><td class="n">${esc(r.score10)}/10</td><td class="n mono">${esc(hhmm(r.loggedAt))}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing logged today.</p>'}</div>
<p class="muted bp-foot">Today's London date only, write-once per market, stamped with the server's time. A log after 16:00 London is not a row for today on the scoreboard.</p>`;
}

export const CSS = `
.bp-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin:8px 0 12px}
.bp-pills{display:flex;flex-wrap:wrap;gap:6px}
.bp-pill{font:600 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px;border:1px solid var(--line2);background:var(--bg2);color:var(--tx2);cursor:pointer}
.bp-pill[aria-pressed="true"]{color:var(--pur2);border-color:rgba(var(--purrgb),.5);background:var(--purbg)}
.bp-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))}
.bp-card .ch{display:flex;justify-content:space-between;align-items:center;gap:8px}
.bp-mkt{font:700 14px var(--mono);color:var(--tx)}
.bp-dir{margin-right:6px}
.bp-dots{display:inline-flex;gap:3px;vertical-align:middle}
.bp-dots i{width:7px;height:7px;border-radius:50%;background:var(--line2)}
.bp-dots i.on{background:var(--pur2)}
.bp-by{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 4px}
.bp-sys{font-size:11.5px}
.bp-reason{font-size:12.5px;color:var(--tx2);margin:6px 0 8px;line-height:1.4}
.bp-layers{list-style:none;margin:0;padding:0}
.bp-layers li{display:grid;grid-template-columns:82px minmax(0,1fr);gap:8px;padding:3px 0;border-bottom:1px solid var(--line);font-size:12px}
.bp-layers li b{font-weight:600;color:var(--tx3);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.bp-layers li span{overflow-wrap:anywhere;color:var(--tx2)}
.bp-layers li span.up{color:var(--up)} .bp-layers li span.dn{color:var(--dn)}
.bp-inv{margin-top:8px;font-size:12px;border-left:3px solid var(--line2);background:var(--bg3);border-radius:0 8px 8px 0;padding:6px 10px}
.bp-note,.bp-foot{font-size:11.5px}
.bp-judge{font-size:13px;color:var(--tx2);margin:4px 0 8px}
.bp-h2h th,.bp-h2h td,.bp-review th,.bp-review td{padding:5px 6px;white-space:nowrap;vertical-align:top}
.bp-h2h .bp-cal{white-space:normal;min-width:160px;font-size:11.5px}
.bp-review td:nth-child(5),.bp-review td:nth-child(7){white-space:normal;min-width:140px}
.bp-ov{font-size:12.5px;margin:8px 0}
.bp-fb{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0}
.bp-fb select,.bp-fb input{background:var(--bg2);color:var(--tx);border:1px solid var(--line2);border-radius:6px;padding:4px 6px;font:inherit}
.bp-dirs{display:inline-flex;gap:8px}
.bp-radio{font-size:12.5px}
.bp-msg{min-height:1.2em;font-size:12.5px;margin:4px 0}
.bp-msg.up{color:var(--up)} .bp-msg.dn{color:var(--dn)}
.bp-sec{margin-top:14px}
.bp-empty{padding:6px 0}
`;

// ── the page (DOM) ───────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Mount the tab into `root` (the <section id="bprocess">). ctx: { getJson(url) -> json, win, doc }. Idempotent: a second call refreshes the cards.
 * The h2h route is asked for only when one of its panels is on for this session; the FundaBias form only for the owner.
 */
export function mount(root, { getJson, win = globalThis, doc = globalThis.document } = {}) {
  if (!root) return null;
  const on = id => (typeof win.deskSurfaceOn === 'function' ? win.deskSurfaceOn(id) : true);
  const owner = () => (typeof win.deskIsViewer === 'function' ? !win.deskIsViewer() : true) && doc?.documentElement?.dataset?.role !== 'viewer';
  if (root.dataset.bpMounted) { root.__bpRefresh?.(); return root.__bp; }
  root.dataset.bpMounted = '1';
  if (!doc.getElementById('bp-css')) { const st = doc.createElement('style'); st.id = 'bp-css'; st.textContent = CSS; doc.head.appendChild(st); }
  const S = { group: 'all', sort: 'conviction', which: 'all', rec: null, h2h: null, date: '', live: false, fb: null, fbMsg: null };
  try { const v = win.localStorage?.getItem('deskBp:v1'); if (v) { const p = JSON.parse(v); if (GROUPS.some(([g]) => g === p.group)) S.group = p.group; if (p.sort === 'market') S.sort = 'market'; } } catch { /* private window */ }
  root.innerHTML = `<div class="card"><div data-bp="head"><div class="ch"><span class="lbl">Bias process</span></div></div>
<div class="bp-tools"><span class="muted">Issue <input type="date" data-bp="date" aria-label="Issue date"> <button type="button" class="bp-pill" data-bp="today">Today</button> <button type="button" class="bp-pill" data-bp="live" aria-pressed="false" title="the system call computed now (no AI step, not stored, not scored)">Live rules</button></span></div>
<div data-bp="cards"><p class="muted">Loading the cards…</p></div></div>
<div class="card bp-sec" data-surface="panel.bp.h2h"><div class="ch"><span class="lbl">Head to head</span><span class="r muted">forward only · ${COMPETITORS.length} competitors</span></div><div data-bp="h2h"><p class="muted">Loading…</p></div></div>
<div class="card bp-sec" data-surface="panel.bp.review"><div class="ch"><span class="lbl">Weekly review · the wrong calls</span><span class="r muted">last 7 days</span></div><div data-bp="review"><p class="muted">Loading…</p></div></div>
<div class="card bp-sec" data-surface="panel.bp.fundabias"><div class="ch"><span class="lbl">FundaBias log</span><span class="r muted">owner only</span></div><div data-bp="fb"><p class="muted">Loading…</p></div></div>`;
  const q = k => root.querySelector(`[data-bp="${k}"]`);
  const save = () => { try { win.localStorage?.setItem('deskBp:v1', JSON.stringify({ group: S.group, sort: S.sort })); } catch { /* private window */ } };
  const drawCards = () => { q('cards').innerHTML = S.rec?.ok === false ? `<p class="muted">${esc(S.rec.error === 'owner only' ? 'The bias process is a preview: switched off for this login.' : S.rec.error ?? 'Did not load.')}</p>` : cardsHtml(S.rec, S); q('head').innerHTML = S.rec?.ok === false ? '<div class="ch"><span class="lbl">Bias process</span></div>' : headHtml(S.rec); };
  const drawH2h = () => { q('h2h').innerHTML = h2hHtml(S.h2h, { which: S.which }); q('review').innerHTML = reviewHtml(S.h2h); };
  const drawFb = () => { if (S.fb) q('fb').innerHTML = S.fb.ok === false ? `<p class="muted">${esc(S.fb.error ?? 'Did not load.')}</p>` : fbHtml(S.fb.markets, S.fb.rows, { msg: S.fbMsg }); };
  async function loadCards() {
    const u = S.live ? '/api/desk-bias-process?live=1' : S.date ? `/api/desk-bias-process?date=${encodeURIComponent(S.date)}` : '/api/desk-bias-process';
    q('cards').innerHTML = '<p class="muted">Loading the cards…</p>';
    try { S.rec = await getJson(u); } catch (e) { S.rec = { ok: false, error: e.message }; }
    if (S.rec && S.rec.ok !== false && S.rec.date && !S.date && q('date')) q('date').value = S.rec.date;
    drawCards();
  }
  async function loadH2h() {
    if (!on('panel.bp.h2h') && !on('panel.bp.review')) return;
    try { S.h2h = await getJson('/api/desk-bias-process/h2h'); } catch (e) { S.h2h = { ok: false, error: e.message }; }
    drawH2h();
  }
  async function loadFb() {
    if (!owner() || !on('panel.bp.fundabias')) return;
    try { S.fb = await getJson('/api/fundabias-log'); } catch (e) { S.fb = { ok: false, error: e.message }; }
    drawFb();
  }
  root.addEventListener('click', e => {
    const b = e.target.closest?.('button'); if (!b || !root.contains(b)) return;
    if (b.dataset.group) { S.group = b.dataset.group; save(); drawCards(); }
    else if (b.dataset.which) { S.which = b.dataset.which; drawH2h(); }
    else if (b.dataset.bp === 'today') { S.date = ''; S.live = false; q('live').setAttribute('aria-pressed', 'false'); loadCards(); }
    else if (b.dataset.bp === 'live') { S.live = !S.live; b.setAttribute('aria-pressed', String(S.live)); loadCards(); }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset?.bp === 'sort') { S.sort = t.value; save(); drawCards(); }
    else if (t.dataset?.bp === 'date') { S.date = t.value; S.live = false; q('live').setAttribute('aria-pressed', 'false'); loadCards(); }
  });
  root.addEventListener('submit', async e => {
    const form = e.target.closest?.('[data-bp="fb"]'); if (!form) return;
    e.preventDefault();
    const fd = new win.FormData(form), v = fbBody({ market: fd.get('market'), dir: fd.get('dir'), score10: fd.get('score10') });
    const say = m => { S.fbMsg = m; const p = root.querySelector('.bp-msg'); if (p) { p.textContent = m.text; p.className = `bp-msg ${m.ok ? 'up' : 'dn'}`; } };
    if (!v.ok) return say({ ok: false, text: v.error });
    let status = 0, body = null;
    try { const r = await win.fetch('/api/fundabias-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(v.body) }); status = r.status; body = await r.json().catch(() => null); }
    catch (err) { body = { error: err.message }; }
    const m = fbMessage(status, body);
    if (m.ok) { S.fbMsg = m; await loadFb(); } else say(m);   // a refusal keeps what was typed
  });
  root.__bpRefresh = () => { loadCards(); };
  loadCards(); loadH2h(); loadFb();
  root.__bp = { refresh: root.__bpRefresh, state: S };
  return root.__bp;
}

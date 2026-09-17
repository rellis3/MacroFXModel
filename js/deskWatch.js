/**
 * Desk watch — the early-warning layer. Tier-1 brick, pure.
 *
 * Reads one snapshot of the tape and says which conditions are firing. Two
 * kinds of condition:
 *   'tested'    — a validated finding from js/deskEvidence.js (the book). The
 *                 message carries the measured number and its evidence id.
 *   'described' — a regime or chain transition worth knowing about (curve
 *                 inverts, a chain link breaks, stocks and bonds fall together,
 *                 credit crosses a level). Stamped ~ context; it says what
 *                 changed, never what happens next.
 *
 * The server keeps the previous state and only speaks on a TRANSITION (a
 * condition starting or stopping), never on a repeat. Nothing here emits a
 * direction. Tested by js/deskWatch.test.mjs.
 *
 * Inputs (all optional; a missing input silently disables the triggers that
 * need it):
 *   fred      { vix:{value}, vix3m, us2y, us10y, us30y, tips, bei, hy, dxy }  latest + prev
 *   hist      { vix:[{date,value}], vix3m, us2y, us10y, us30y, tips, hy, dxy }  ascending, ~90 obs
 *   series    { nq:[{date,value}], oil, gold, ... }                          ascending daily closes
 *   chain     evaluated links from js/macroChain.js (evaluateChain output)
 *   stockBond { corr, asOf }                                                  20d SPY/TLT correlation
 *   events    [{ country, event, impact, ms, estimate }]                      next 48h + last 3h
 *   fomcDates ['2026-09-16', ...]
 *   now       epoch ms
 */

const _last = a => Array.isArray(a) && a.length ? a[a.length - 1] : null;
const _nth = (a, k) => Array.isArray(a) && a.length > k ? a[a.length - 1 - k] : null;
const _fmt = (v, dp = 1) => v == null ? '?' : `${v > 0 ? '+' : ''}${Number(v).toFixed(dp)}`;
const _sign = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

export const EVENT_FAMILY_RE = [
  ['cpi', /\bcpi\b|consumer price|inflation rate/i],
  ['employment', /non-farm|nonfarm|payroll|unemployment|jobless|claims|employment change/i],
  ['gdp', /\bgdp\b/i],
  ['rate decision', /rate decision|cash rate|official bank rate|federal funds|interest rate|policy rate|refinancing/i],
  ['pmi', /\bpmi\b|ism /i],
];
// Validated S7 cells: family → pair → effect text. Kept in step with today.html.
export const EVENT_RANGE_EFFECT = {
  'rate decision': { EURUSD: '+0.42 ATR on the day', USDJPY: '+0.27 ATR on the day', GBPUSD: '+0.37 ATR the session after' },
  employment:      { AUDUSD: '+0.19 ATR on the day (big surprises)', EURUSD: '+0.16 ATR on the day (big surprises)', USDJPY: '+0.16 ATR the session after', USDCAD: '+0.11 ATR on the day' },
  cpi:             { EURUSD: '+0.27 ATR the session after', USDJPY: '+0.25 ATR the session after', GBPUSD: '+0.19 ATR on the day' },
  gdp:             { EURUSD: '+0.22 ATR on the day (big surprises)', USDCAD: '+0.16 ATR on the day' },
  pmi:             { USDJPY: '+0.22 ATR on the day' },
};
const CCY_PAIRS = { US: ['EURUSD', 'USDJPY'], GB: ['GBPUSD'], EU: ['EURUSD'], JP: ['USDJPY'], AU: ['AUDUSD'], CA: ['USDCAD'] };
import { eventImpact } from './eventImpactMap.js';

/**
 * Evaluate every trigger. Returns [{ id, kind, label, firing, detail, evidenceId, instruments, value }].
 * `detail` is the plain-words message body used when the trigger starts firing.
 */
export function evaluateTriggers(inp = {}) {
  const { fred = {}, hist = {}, series = {}, chain = [], stockBond = null, events = [], fomcDates = [], now = Date.now() } = inp;
  const out = [];
  const push = t => out.push({ firing: false, instruments: [], evidenceId: null, ...t });

  // ── tested: VIX above VIX3M ────────────────────────────────────────────────
  {
    const v = fred.vix?.value, v3 = fred.vix3m?.value;
    if (v != null && v3 != null) {
      const inv = v >= v3;
      let dayN = 0;
      if (inv) { dayN = 1; const h = hist.vix ?? [], h3 = hist.vix3m ?? []; for (let i = h.length - 2, j = h3.length - 2; i >= 0 && j >= 0; i--, j--) { if (h[i].date !== h3[j].date) break; if (h[i].value >= h3[j].value) dayN++; else break; } }
      push({ id: 'vix-inversion', kind: 'tested', evidenceId: 'vix-inversion', label: 'VIX above VIX3M', firing: inv, value: { vix: v, vix3m: v3, dayN },
        instruments: ['SPX500', 'NQ', 'USDJPY', 'GOLD'],
        detail: inv
          ? `VIX ${v.toFixed(1)} is above VIX3M ${v3.toFixed(1)} (day ${dayN}): near-term fear priced above the 3-month. Tested here: on the first day of an inversion the next five sessions ran +0.76 ATR wider on SPX500, +0.82 on Nasdaq, +0.44 on USD/JPY, +0.43 on gold (86 inversions since 2008). Inversions usually last a session or two. Range, not direction.`
          : `VIX ${v.toFixed(1)} back below VIX3M ${v3.toFixed(1)}: the term structure has normalised.` });
    }
  }
  // ── tested: Nasdaq down-week ───────────────────────────────────────────────
  {
    const nq = series.nq; const last = _last(nq), ref = _nth(nq, 5);
    if (last && ref) {
      const wk = (last.value / ref.value - 1) * 100; const on = wk <= -1;
      push({ id: 'nq-down-week', kind: 'tested', evidenceId: 'nq-down-week', label: 'Nasdaq down-week', firing: on, value: { wk }, instruments: ['NQ'],
        detail: on ? `NAS100 is ${wk.toFixed(1)}% over five sessions (${ref.date} → ${last.date}). Tested here: after a down-week of 1%+ the next session has run about 20% wider (+0.19 to +0.23 ATR, n=1,232). Range, not direction; the 5-day up-share afterwards is 58%, a base rate.` : `NAS100 is ${wk.toFixed(1)}% over five sessions — no longer a down-week.` });
    }
  }
  // ── tested: a release that has MOVED markets is due (two books agree) ──────
  // Two independent measurements feed this: S7 (release-session range by family,
  // this desk's surprise store) and the Event Response Book (30-minute spike and
  // next-day size per family x instrument, 76 families). A release is worth a
  // page when either says it moves the pair; the message carries both numbers
  // where both exist. The book's own headline -- most releases move nothing --
  // is why the trigger stays quiet for housing starts.
  {
    const soon = events.filter(e => (e.impact ?? '').toLowerCase() === 'high' && e.ms - now < 24 * 3600e3 && e.ms - now > -3 * 3600e3);
    const hits = [];
    for (const e of soon) {
      const fam = EVENT_FAMILY_RE.find(([, re]) => re.test(e.event ?? ''))?.[0]; if (!fam) continue;
      const imp = eventImpact(e.country, fam);
      const pairs = new Set([...(CCY_PAIRS[e.country] ?? []), ...Object.keys(imp?.instruments ?? {})]);
      for (const pair of pairs) {
        const eff = EVENT_RANGE_EFFECT[fam]?.[pair]; const bk = imp?.instruments?.[pair];
        if (!eff && !(bk && bk.spike >= 2)) continue;
        hits.push({ fam, pair, eff, bk, e });
      }
    }
    const seen = new Set(); const uniq = hits.filter(h => { const k = `${h.fam}|${h.pair}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const when = e => e.ms > now ? `in ${Math.max(1, Math.round((e.ms - now) / 3600e3))}h` : `${Math.round((now - e.ms) / 3600e3)}h ago`;
    const line = h => `${h.e.country} ${h.e.event} ${when(h.e)}${h.e.estimate != null ? ` (consensus ${h.e.estimate})` : ''} → ${h.pair}: ` +
      [h.bk ? `has moved ${h.bk.spike}× an ordinary half-hour on release and left a next day ${h.bk.next}× normal (n=${h.bk.n}; next-day direction ${h.bk.upPct}% up — a coin flip)` : null,
       h.eff ? `release-session range ${h.eff} vs matched days (S7)` : null].filter(Boolean).join('; ') + '. Size, not direction.';
    push({ id: 'event-range', kind: 'tested', evidenceId: 'surprise-size', label: 'Market-moving release in the next 24h', firing: uniq.length > 0, value: { n: uniq.length }, instruments: [...new Set(uniq.map(h => h.pair))],
      detail: uniq.length ? uniq.map(line).join('\n') : 'No release that has measurably moved a pair is due in the next 24h.' });
  }
  // ── described: front-end shock (tested: FX ran calmer after hawkish ones) ──
  {
    const h = hist.us2y; const last = _last(h), ref = _nth(h, 5);
    if (last && ref) {
      const d = (last.value - ref.value) * 100; const on = Math.abs(d) >= 14;
      push({ id: 'front-end-shock', kind: 'described', evidenceId: 'front-end-shock', label: '2-year weekly shock', firing: on, value: { d }, instruments: ['EURUSD', 'USDJPY', 'GBPUSD'],
        detail: on ? `The 2-year has moved ${_fmt(d, 0)}bp in five sessions (${ref.date} → ${last.date}) — a top-decile front-end repricing. Tested here: this does NOT mean a volatile week in FX; after 2Y-up shocks EUR/USD and GBP/USD ran calmer (−0.3 ATR). Description of the policy repricing, nothing more.` : `The 2-year's five-session move is back inside ±14bp.` });
    }
  }
  // ── described: curve inversions (2s10s, 2s30s) ─────────────────────────────
  for (const [id, longKey, label] of [['curve-2s10s', 'us10y', '2s10s'], ['curve-2s30s', 'us30y', '2s30s']]) {
    const s2 = fred.us2y?.value, sl = fred[longKey]?.value;
    if (s2 != null && sl != null) {
      const spread = (sl - s2) * 100; const inv = spread < 0;
      push({ id, kind: 'described', label: `${label} inverted`, firing: inv, value: { spread },
        detail: inv ? `${label} is ${spread.toFixed(0)}bp: the short end is above the long end. Historically read as the market pricing cuts because growth is failing (2s10s) or doubting the long run (2s30s). Description, not a forecast.` : `${label} is back to ${_fmt(spread, 0)}bp — no longer inverted.` });
    }
  }
  // ── described: stocks and bonds falling together ───────────────────────────
  if (stockBond && Number.isFinite(stockBond.corr)) {
    const on = stockBond.corr >= 0.2;   // SPY vs TLT PRICE correlation positive = moving together
    push({ id: 'stock-bond-together', kind: 'described', evidenceId: 'stock-bond-flip', label: 'Stocks and bonds moving together', firing: on, value: { corr: stockBond.corr },
      detail: on ? `20-day SPY/TLT correlation is +${stockBond.corr.toFixed(2)} (as of ${stockBond.asOf}): stocks and bonds are moving together, so bonds are not hedging equities — the inflation-regime shape. Such episodes have lasted a median 5 sessions (p75 17) since 2008. A sizing fact, not a direction.` : `20-day SPY/TLT correlation is ${stockBond.corr.toFixed(2)}: bonds are hedging equities again.` });
  }
  // ── described: VIX and credit crossing levels ──────────────────────────────
  {
    const v = fred.vix?.value; if (v != null) push({ id: 'vix-20', kind: 'described', label: 'VIX above 20', firing: v >= 20, value: { vix: v }, detail: v >= 20 ? `VIX ${v.toFixed(1)}: the fear gauge is above 20 — the page's "jittery" line.` : `VIX ${v.toFixed(1)}: back under 20.` });
    const hy = fred.hy?.value; if (hy != null) push({ id: 'hy-400', kind: 'described', label: 'HY spreads above 4%', firing: hy >= 4, value: { hy }, detail: hy >= 4 ? `High-yield spreads ${hy.toFixed(2)}%: above the 4% line the page's credit gate treats as stress.` : `High-yield spreads ${hy.toFixed(2)}%: back under 4%.` });
  }
  // ── described: chain links broken (one trigger per broken link) ────────────
  for (const l of chain) {
    if (!l?.id) continue;
    const broken = l.verdict === 'broken';
    push({ id: `chain-${l.id}`, kind: 'described', label: `Chain link broken: ${l.short ?? l.id}`, firing: broken, value: { a: l.a?.text, b: l.b?.text },
      detail: broken ? `${l.textbook}: ${l.a?.label} ${l.a?.text} → ${l.b?.label} ${l.b?.text}, textbook said ${l.expected === 'up' ? '↑' : '↓'}. ${l.punch ?? ''}` : `${l.textbook}: ${l.verdict} again (${l.a?.label} ${l.a?.text} → ${l.b?.label} ${l.b?.text}).` });
  }
  // ── described: oil moved, breakevens did not (tested: no lag to wait for) ──
  {
    const oil = series.oil, bei = hist.bei; const lo = _last(oil), ro = _nth(oil, 20), lb = _last(bei), rb = _nth(bei, 14);
    if (lo && ro && lb && rb) {
      const o20 = (lo.value / ro.value - 1) * 100, b20 = (lb.value - rb.value) * 100; const on = Math.abs(o20) >= 10 && Math.abs(b20) < 5;
      push({ id: 'oil-without-breakevens', kind: 'described', evidenceId: 'oil-to-breakevens', label: 'Oil moved, breakevens did not', firing: on, value: { o20, b20 },
        detail: on ? `Oil ${_fmt(o20, 1)}% over 20 sessions while 10-year breakevens moved ${_fmt(b20, 0)}bp. Tested here: breakevens move with oil in the same window, not after it (only 43% of ±10% oil moves ever get 5bp of breakeven) — this is the bond market's verdict, not a delay.` : `Oil ${_fmt(o20, 1)}% / breakevens ${_fmt(b20, 0)}bp over 20 sessions: no longer a divergence.` });
    }
  }
  // ── described: FOMC day −1 / 0 / +1 ────────────────────────────────────────
  {
    const today = new Date(now).toISOString().slice(0, 10);
    const near = fomcDates.find(d => Math.abs(Date.parse(d + 'T18:00:00Z') - now) < 36 * 3600e3);
    push({ id: 'fomc-window', kind: 'described', evidenceId: 'fed-two-moves', label: 'FOMC window', firing: !!near, value: { date: near ?? null },
      detail: near ? `FOMC decision ${near === today ? 'today' : near > today ? 'tomorrow' : 'yesterday'} (${near}). Tested here: decision days run ~1.3 ATR whether or not the move was "priced in"; the day-0 close has even odds of being half-undone within a month, same as any big day; a crowded bond short into the meeting has NOT been followed by a long-end rally.` : 'Outside the FOMC window.' });
  }
  return out;
}

/** Transitions between two evaluated lists: what started, what stopped. */
export function diffStates(prev = [], curr = []) {
  const byId = new Map((prev ?? []).map(t => [t.id, t]));
  const started = [], stopped = [];
  for (const t of curr) {
    const p = byId.get(t.id);
    if (t.firing && !(p && p.firing)) started.push(t);
    if (!t.firing && p && p.firing) stopped.push(t);
  }
  return { started, stopped };
}

const _esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** One Telegram message (HTML) for a set of transitions. Empty string when nothing changed. */
export function formatTelegram({ started = [], stopped = [] }, when = new Date()) {
  if (!started.length && !stopped.length) return '';
  const stamp = when.toISOString().slice(11, 16) + ' UTC';
  const tag = t => t.kind === 'tested' ? '✓' : '~';
  const lines = [`<b>Desk watch · ${stamp}</b>`];
  for (const t of started) lines.push(`\n${tag(t)} <b>${_esc(t.label)}</b>\n${_esc(t.detail)}`);
  for (const t of stopped) lines.push(`\n· <b>${_esc(t.label)} — cleared</b>\n${_esc(t.detail)}`);
  if (started.length >= 2) lines.push(`\n<i>${started.length} conditions started in the same pass — read them together; that is the domino the chain panel is for.</i>`);
  lines.push(`\n<i>✓ tested on this desk (range, never direction) · ~ described state</i>`);
  return lines.join('\n').slice(0, 4000);
}

// js/deskViewerView.js: what a Desk Terminal VIEWER (the separate desk login) is shown of the desk's own outputs. Pure: no fetch, no env, no clock.
//
// THE LENS (owner, 2026-11-13): the desk login is an EDUCATION tool and a macro dashboard, not a signal service.
//   ANALYSIS is shown: the bias of the day, risk state, regime, currency strength, correlations, surprises, forecast ranges, what the data is showing.
//   A TRADE SIGNAL is not: "this is a trade", buy here / short there, entries, stops, targets, invalidation levels as a plan, position size,
//   "best expression", playbooks, hedge recommendations, scenario P&L on the owner's book. The owner's PRIVATE area (his book, record,
//   journal, research, bots, ops) is not shown either.
// The desk's morning book (/api/desk-run) carries both kinds in the same objects (a card has a rating AND a size AND a plan), so this module builds the
// viewer's copy from an ALLOWLIST: only the analytic fields are copied. A field that is not listed here never reaches a viewer, whatever the page does.
// The owner can switch a trade-level sub-surface back on in the admin panel (panel.asset.plan, panel.asset.size, ...): `on(id)` says whether a surface is visible to
// viewers, and the matching fields are then included. Wired in server.js (a res.json wrapper for requests that carry only a desk cookie).
// Tested by js/deskViewerView.test.mjs.

// ── trade language ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// A sentence is dropped from viewer text when it reads as an instruction or a trade plan. The patterns are deliberately about the PLAN words (entry, stop,
// take-profit, a target at a number, invalidation at a level, sizing, buy/sell as an instruction) and not about analysis that uses the same words ("the
// inflation target", "central-bank buying", "short-term yields").
const TRADE_RES = [
  /\b(entry|entries|enter (long|short|at|on|the))\b/i,
  /\bstop[- ]?loss(es)?\b/i,
  /\bstops?\s+(at|above|below|beyond|under|over|near)\b/i,
  /\btake[- ]?profits?\b/i,
  /\btp\s*\d/i,
  /\b(price )?targets?\s*(of|at|near|around|to|:|=)?\s*[$£€]?\d/i,
  /\btargets?\s+(hit|reached|met)\b/i,
  /\binvalidat(ion|ed|es)\b[^.]{0,30}(\d|\babove\b|\bbelow\b)/i,
  /\binvalid(ation)?\s*[:=]?\s*[$£€]?\d/i,
  /\b(go|going|stay|get|be)\s+(long|short)\b/i,
  /\b(buy|sell|long|short)\s+(on|at|near|around|above|below|into)\s+[$£€]?\d/i,
  /\b(buy|sell)\s+(the\s+)?(dip|dips|rally|rallies|breakout|retest|pullback|bounce)\b/i,
  /\b(buy|sell)\b[^.]{0,30}\b(at|near|around|above|below|from)\s+[$£€]?\d/i,
  /\b(buy|sell|short|long)\s+(it|them|now|here|this|that)\b/i,
  /\b(we|i|the desk)\s+(recommend|suggest|advise)\b/i,
  /\bshould\s+(buy|sell|go long|go short|be long|be short|add|trim)\b/i,
  /\b(position[- ]siz(e|ing)|size\s+(up|down)|sizing)\b/i,
  /\bsize\s+(of\s+)?[0-9]/i,
  /\brisk[- ]?(to[- ]?)?reward\b|\br:r\b/i,
  /\b(scale|add)\s+(in|to)\b/i,
];
/** Does this text read as an instruction or a trade plan? */
export function isTradeText(s) {
  const t = String(s ?? '');
  return TRADE_RES.some(re => re.test(t));
}
const SENT = /[^\n]+?(?:[.!?;](?=\s|$)|$|\n)\s*/g;   // a '.' between digits (1.0850) is not a sentence end
/** The text with every trade-language sentence removed ('' when nothing is left). Plain strings only. */
export function scrubText(s, max = 1200) {
  const t = String(s ?? '');
  if (!t) return '';
  const keep = (t.match(SENT) ?? [t]).filter(x => !isTradeText(x));
  return keep.join('').trim().slice(0, max);
}
const list = (xs, n = 8, len = 400) => (Array.isArray(xs) ? xs.map(x => scrubText(x, len)).filter(Boolean).slice(0, n) : []);
const num = v => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
const onFn = on => (typeof on === 'function' ? on : () => false);

// ── the morning book ───────────────────────────────────────────────────────────────────────────────────────────────────────────
function card(c, on) {
  if (!c || typeof c !== 'object') return c;
  const out = { rating: c.rating, conviction: c.conviction, why: scrubText(c.why, 700) };
  if (c.missing) out.missing = true;
  if (c.levels && typeof c.levels === 'object') out.levels = c.levels;           // the forecast ranges: information (p50 / p75 / p90 each side of the open)
  if (on('panel.asset.size')) for (const k of ['size', 'sizeBeforeCap', 'cappedBy']) if (c[k] !== undefined) out[k] = c[k];
  if (on('panel.asset.plan')) {
    if (c.plan && typeof c.plan === 'object') out.plan = { zone: c.plan.zone ?? null, invalidation: c.plan.invalidation ?? null, timing: c.plan.timing ?? null };
    if (c.invalidation !== undefined) out.invalidation = c.invalidation;
  }
  return out;
}
const mapObj = (o, f) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v, k)])) : o);
const ccyBlock = v => (v && typeof v === 'object' ? { bias: v.bias, conviction: v.conviction, why: scrubText(v.why, 700), ...(v.flip ? { flip: scrubText(v.flip, 300) } : {}) } : v);

/** The viewer's copy of a desk run: analysis only. `on(id)` says which trade-level sub-surfaces the owner switched on for viewers. */
export function sanitizeRun(run, on) {
  const O = onFn(on);
  if (!run || typeof run !== 'object') return run;
  if (run.ok === false) return { ok: false, error: run.error ?? 'no desk run yet', running: run.running };
  const out = { ok: true, date: run.date, startedAt: run.startedAt, finishedAt: run.finishedAt };
  const b = run.head?.book;
  out.head = { ok: !!run.head?.ok };
  if (run.head?.ok && b) {
    out.head.book = {
      headline: scrubText(b.headline, 400),
      global: b.global ? { tone: b.global.tone, summary: scrubText(b.global.summary, 800) } : null,
      currencies: mapObj(b.currencies, ccyBlock),
      instruments: mapObj(b.instruments, c => card(c, O)),
      risks: list(b.risks, 8, 400),
      gaps: list(b.gaps, 8, 300),
    };
  }
  const d = run.debate;
  if (d) {
    out.debate = {};
    const cv = d.currency?.view;
    if (cv) out.debate.currency = { view: { currencies: mapObj(cv.currencies, ccyBlock), ranking: cv.ranking } };
    const gv = d.global?.view;
    if (gv) out.debate.global = { view: { tone: gv.tone, conviction: gv.conviction, summary: scrubText(gv.summary, 800), drivers: list(gv.drivers, 6, 200), flip: list(gv.flip, 5, 300) } };
    if (d.assets && typeof d.assets === 'object') {
      out.debate.assets = mapObj(d.assets, g => ({ view: g?.view ? { summary: scrubText(g.view.summary, 600), instruments: mapObj(g.view.instruments, i => card({ rating: i?.rating, conviction: i?.conviction, why: i?.why, plan: i?.plan }, O)) } : null }));
    }
  }
  if (run.analysts && typeof run.analysts === 'object') {
    out.analysts = mapObj(run.analysts, a => (a?.ok && a.report
      ? { ok: true, id: a.id, report: { headline: scrubText(a.report.headline, 300), confidence: a.report.confidence, gaps: list(a.report.gaps, 6, 200),
          points: (a.report.points ?? []).slice(0, 12).map(p => ({ claim: scrubText(p.claim, 400), evidence: scrubText(p.evidence, 300), impact: p.impact })).filter(p => p.claim) } }
      : { ok: false, id: a?.id }));
  }
  if (run.economist) {
    out.economist = {
      releases: (run.economist.releases ?? []).map(r => ({ at: r.at, event: r.event, playbook: r.playbook })),
      view: run.economist.view ? { briefs: (run.economist.view.briefs ?? []).map(x => ({ event: x.event, sizeAndSpeed: scrubText(x.sizeAndSpeed, 500), priced: scrubText(x.priced, 400), ifHot: scrubText(x.ifHot, 400), ifCold: scrubText(x.ifCold, 400), watch: scrubText(x.watch, 300) })) } : null,
    };
  }
  return out;
}

/** The index of runs (/api/desk-run/index): dates only. */
export function sanitizeRunIndex(ix) {
  if (!ix || typeof ix !== 'object') return ix;
  return { ok: ix.ok !== false, days: (ix.days ?? []).map(d => ({ date: d.date, headOk: !!d.headOk })) };
}

/** Session updates (/api/desk-update): the headlines and what changed, no sizes, no job state. */
export function sanitizeUpdate(u, on) {
  const O = onFn(on);
  if (!u || typeof u !== 'object') return u;
  const slotOut = s => {
    if (!s || typeof s !== 'object') return s;
    const v = s.view ?? s;
    const view = { headline: scrubText(v.headline, 300), globalStillHolds: v.globalStillHolds, watch: list(v.watch, 5, 300),
      changes: (v.changes ?? []).slice(0, 12).map(c => ({ instrument: c.instrument, to: c.to, why: scrubText(c.why, 400), ...(O('panel.asset.size') && c.size !== undefined ? { size: c.size } : {}) })) };
    return { ...(s.at ? { at: s.at } : {}), ...(s.label ? { label: s.label } : {}), view };
  };
  return { ok: u.ok !== false, date: u.date, slots: mapObj(u.slots, slotOut),
    live: u.live && u.live.instruments ? { ...u.live, instruments: mapObj(u.live.instruments, i => ({ rating: i?.rating, from: i?.from, was: i?.was, why: scrubText(i?.why, 300), ...(O('panel.asset.size') && i?.size !== undefined ? { size: i.size } : {}) })) } : (u.live ?? null) };
}

/** The weekly strategist (/api/desk-weekly): the view, themes, dates and what-ifs; no job state. */
export function sanitizeWeekly(w) {
  if (!w || typeof w !== 'object') return w;
  if (w.ok === false) return { ok: false, error: w.error };
  const v = w.view ?? {};
  return { ok: true, week: w.week, label: w.label, view: {
    headline: scrubText(v.headline, 400), ranking: v.ranking, currencies: mapObj(v.currencies, ccyBlock),
    themes: (v.themes ?? []).map(t => ({ title: scrubText(t.title, 200), body: scrubText(t.body, 800) })).filter(t => t.title || t.body),
    week: (v.week ?? []).map(x => ({ when: x.when, event: x.event, why: scrubText(x.why, 300) })),
    scenarios: (v.scenarios ?? []).map(x => ({ if: scrubText(x.if, 300), then: scrubText(x.then, 400) })).filter(x => x.if && x.then),
    lastWeek: scrubText(v.lastWeek, 800) } };
}

/** The daily history (/api/desk-history): the ranking, biases and tone per day. The desk's own score for a day is its private record: dropped. */
export function sanitizeHistory(h) {
  if (!h || typeof h !== 'object') return h;
  return { ...h, rows: (h.rows ?? []).map(r => ({ date: r.date, tone: r.tone, conviction: r.conviction, ranking: r.ranking, biases: r.biases })) };
}

/** The wire (/api/desk-news): the read of each headline (tier, impact, why), without the line about the owner's book or his card's stance. */
export function sanitizeNews(res) {
  if (!res || typeof res !== 'object' || !Array.isArray(res.items)) return res;
  return { ...res, items: res.items.map(h => {
    const { read, pairs, ...rest } = h;
    const r = read && typeof read === 'object' ? { ...read } : read;
    if (r && typeof r === 'object') { delete r.book; if (r.why) r.why = scrubText(r.why, 500); }
    return { ...rest, ...(r ? { read: r } : {}), ...(Array.isArray(pairs) ? { pairs: pairs.map(p => ({ inst: p.inst, dir: p.dir })) } : {}) };
  }) };
}

// ── the shared reads ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The shared, signal-free market read: ONE stored copy that every desk user sees. Checks the model's JSON and returns
 * { ok, value, errors, stripped }: every free-text field is scrubbed of trade language (and the count of removed sentences reported), the
 * reference levels are kept only when they carry no entry/stop/target wording, and a read with no headline is refused.
 */
export function validateSharedRead(o) {
  const errors = []; let stripped = 0;
  if (!o || typeof o !== 'object') return { ok: false, errors: ['not an object'], stripped };
  const clean = (s, n) => { const raw = String(s ?? '').trim(); const out = scrubText(raw, n); if (raw && out.length < raw.slice(0, n).length) stripped++; return out; };
  const cleanList = (xs, n = 8, len = 400) => (Array.isArray(xs) ? xs.map(x => clean(x, len)).filter(Boolean).slice(0, n) : []);
  const headline = clean(o.headline, 400); if (!headline) errors.push('no headline (or it was a trade instruction)');
  const FITS = new Set(['supports', 'contradicts', 'mixed', 'no data']);
  const drivers = (Array.isArray(o.drivers) ? o.drivers : []).filter(d => d && typeof d === 'object').slice(0, 14)
    .map(d => ({ driver: clean(d.driver, 160), reading: clean(d.reading, 600), fits: FITS.has(String(d.fits).toLowerCase()) ? String(d.fits).toLowerCase() : 'mixed' })).filter(d => d.driver);
  if (!drivers.length) errors.push('no drivers');
  if (errors.length) return { ok: false, errors, stripped };
  const bias = ['bullish', 'bearish', 'neutral', 'mixed'].includes(String(o.bias).toLowerCase()) ? String(o.bias).toLowerCase() : 'mixed';
  const confidence = ['low', 'medium', 'high'].includes(o.confidence) ? o.confidence : 'low';
  const value = { headline, drivers, contradictions: cleanList(o.contradictions), bull: clean(o.bull, 1200), bear: clean(o.bear, 1200), bias, biasWhy: clean(o.biasWhy, 600),
    levels: clean(o.levels, 800), watch: cleanList(o.watch), gaps: cleanList(o.gaps), confidence, audience: 'shared' };
  return { ok: true, stripped, errors: [], value };
}

/**
 * A stored market read written BEFORE the shared read became signal-free (it carries the owner's card, size and a "levels" line that may quote the plan):
 * the copy a viewer may see. A read already marked audience 'shared' passes through. Never mutates its argument.
 */
export function sanitizeStoredRead(read) {
  if (!read || typeof read !== 'object') return read;
  if (read.analysis?.audience === 'shared') return read;
  const a = read.analysis ?? {};
  const v = validateSharedRead({ headline: a.headline, drivers: a.drivers, contradictions: a.contradictions, bull: a.bull, bear: a.bear, bias: 'mixed', levels: a.levels, watch: a.watch, gaps: a.gaps, confidence: a.confidence });
  const { card, meta, ...rest } = read;
  const empty = { headline: "An earlier read of this market is not shown: it was written before the shared reads became analysis only. Today's shared read replaces it.", drivers: [], contradictions: [], bull: '', bear: '', bias: 'mixed', biasWhy: '', levels: '', watch: [], gaps: [], confidence: 'low', audience: 'shared' };
  return { ...rest, card: null, analysis: v.ok ? v.value : empty, label: 'educational context: not a trade signal' };
}

/** The routes whose JSON a viewer receives as an allowlisted copy: (body, on) => body. Wired in server.js (a res.json wrapper). */
export const VIEWER_SANITISERS = {
  '/api/desk-run': sanitizeRun,
  '/api/desk-run/index': body => sanitizeRunIndex(body),
  '/api/desk-update': sanitizeUpdate,
  '/api/desk-weekly': body => sanitizeWeekly(body),
  '/api/desk-history': body => sanitizeHistory(body),
  '/api/desk-news': body => sanitizeNews(body),
};
export const sanitizerFor = path => VIEWER_SANITISERS[String(path ?? '').split('?')[0].replace(/\/+$/, '')] ?? null;

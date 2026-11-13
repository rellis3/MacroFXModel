// js/deskViewerView.js: what a Desk Terminal VIEWER (the separate desk login) is shown of the desk's own outputs. Pure: no fetch, no env, no clock.
//
// THE THREE RULES (owner, 2026-11-13; see js/terminal/tabRegistry.js): the desk login is an education tool and a macro dashboard. Hide ONLY what reads as
// a TRADE INSTRUCTION, what COSTS money, and the owner's own tooling / P&L. EVERYTHING ELSE IS SHOWN: the directional analysis and why (which
// currencies the desk leans bullish or bearish, with the reasons), the ratings and convictions, the book's exposure, risk and scenarios, drivers, regime.
// The desk's morning book (/api/desk-run) carries analysis and trade-level fields in the same objects (a card has a rating AND a size AND a plan), so
// this module builds the viewer's copy with a DENYLIST: the whole payload is kept and only the trade-level fields are removed:
//   plan (zone, invalidation, timing), invalidation, entry, stop / stop-loss, target / take-profit / tp, risk-reward, the desk edition's trade `ideas`,
//   the risk desk's `adjustments` (sizes and vetoes), plus internal job fields (tokens, roles, cost, job, mode, stack).
// `size` is KEPT: it is how the book's exposure and scenarios are computed (the exposure panels are shown). The place a size is DISPLAYED as a trade
// line is the market card's size row, which is its own switch (panel.asset.size, a 'trade' surface). Free text loses only the imperative trade
// sentences that carry a LEVEL ("buy at 1.0850", "stop at 1.0800", "target 4,100", "entry 1.0840"); analytic sentences are never cut.
// The owner can switch a trade-level surface back on in the admin panel (panel.asset.plan): `on(id)` says whether a surface is visible to viewers,
// and the plan fields are then kept. Wired in server.js (a res.json wrapper for requests that carry only a desk cookie). Tested by js/deskViewerView.test.mjs.
// The SHARED once-a-day reads (validateSharedRead below) stay strict: one stored copy for everyone, no trade language at all.

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

// ── the morning book (denylist) ──────────────────────────────────────────────────────────────────────────────────────────────────
// Trade-level KEYS, removed wherever they appear. `plan` and `invalidation` come back when the owner switches panel.asset.plan on.
const TRADE_KEYS = new Set(['entry', 'entries', 'stop', 'stops', 'stopLoss', 'stop_loss', 'takeProfit', 'take_profit', 'tp', 'target', 'targets', 'riskReward', 'risk_reward', 'rr',
  'ideas', 'adjustments', 'veto']);
const PLAN_KEYS = new Set(['plan', 'invalidation']);
const INTERNAL_KEYS = new Set(['tokens', 'roles', 'cost', 'costs', 'stack', 'job', 'mode']);
// Imperative trade sentences that carry a LEVEL. Narrower than TRADE_RES above on purpose: "go long the dollar" is a lean, "buy at 1.0850" is an instruction.
const LEVEL_RES = [
  /\b(entry|entries|enter(ing)?)\b[^.\n]{0,40}[$£€]?\d/i,
  /\bstop[- ]?loss(es)?\b/i,
  /\bstops?\s+(at|above|below|beyond|under|over|near)\b[^.\n]{0,20}\d/i,
  /\btake[- ]?profits?\b/i,
  /\btp\s*\d/i,
  /(?<!\b(?:inflation|policy|rate|growth|employment|yield|curve|debt)\s)\b(price )?targets?\s*(of|at|near|around|to|:|=)?\s*[$£€]?\d/i,
  /\binvalidat(ion|ed|es)\b[^.]{0,30}(\d|\babove\b|\bbelow\b)/i,
  /\binvalid(ation)?\s*[:=]?\s*[$£€]?\d/i,
  /\b(buy|sell|long|short)\s+(on|at|near|around|above|below|into)\s+[$£€]?\d/i,
  /\b(buy|sell)\b[^.]{0,30}\b(at|near|around|above|below|from)\s+[$£€]?\d/i,
  /\brisk[- ]?(to[- ]?)?reward\b|\br:r\b/i,
];
/** Does this text read as an imperative trade sentence with a level? */
export function isTradeLevelText(s) { const t = String(s ?? ''); return LEVEL_RES.some(re => re.test(t)); }
/** The text with every trade-LEVEL sentence removed ('' when nothing is left). Analytic sentences are kept whole. */
export function scrubLevels(s, max = 4000) {
  const t = String(s ?? '');
  if (!t) return '';
  if (!LEVEL_RES.some(re => re.test(t))) return t.length > max ? t.slice(0, max) : t;
  return (t.match(SENT) ?? [t]).filter(x => !LEVEL_RES.some(re => re.test(x))).join('').trim().slice(0, max);
}
const hasText = o => Object.values(o).some(x => typeof x === 'string' && x.trim());
const hasContent = y => (typeof y === 'string' ? y.trim() !== '' : Array.isArray(y) ? y.some(hasContent) : y && typeof y === 'object' ? Object.values(y).some(hasContent) : y != null);
/** A deep copy with the trade-level keys, the internal keys and the trade-level sentences removed. on(id): which switchable surfaces the owner turned on. */
export function stripTrade(v, on, depth = 0) {
  const O = onFn(on);
  if (typeof v === 'string') return scrubLevels(v);
  if (Array.isArray(v)) {
    // an item that was text (or a card of text) and is left with nothing once its trade sentences are cut is dropped, not shown as a blank bullet
    const out = [];
    for (const x of v) { const y = stripTrade(x, on, depth + 1); if ((typeof x === 'string' || (x && typeof x === 'object' && hasText(x))) && !hasContent(y)) continue; out.push(y); }
    return out;
  }
  if (!v || typeof v !== 'object' || depth > 14) return v;
  const planOn = O('panel.asset.plan');
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (INTERNAL_KEYS.has(k) || TRADE_KEYS.has(k)) continue;
    if (PLAN_KEYS.has(k) && !planOn) continue;
    out[k] = stripTrade(x, on, depth + 1);
  }
  return out;
}

/** The viewer's copy of a desk run: the whole book with the trade-level fields removed. `on(id)` says which trade-level sub-surfaces the owner switched on. */
export function sanitizeRun(run, on) {
  if (!run || typeof run !== 'object') return run;
  if (run.ok === false) return { ok: false, error: run.error ?? 'no desk run yet', running: run.running };
  return stripTrade(run, on);
}

/** The index of runs (/api/desk-run/index): dates only. */
export function sanitizeRunIndex(ix) {
  if (!ix || typeof ix !== 'object') return ix;
  return { ok: ix.ok !== false, days: (ix.days ?? []).map(d => ({ date: d.date, headOk: !!d.headOk })) };
}

/** Session updates (/api/desk-update): the headlines, what changed and the live ratings; trade-level fields removed, job state dropped. */
export function sanitizeUpdate(u, on) {
  if (!u || typeof u !== 'object') return u;
  return stripTrade(u, on);
}

/** The weekly strategist (/api/desk-weekly): the view, themes, dates and what-ifs; the desk edition's trade ideas are dropped with the trade keys. */
export function sanitizeWeekly(w, on) {
  if (!w || typeof w !== 'object') return w;
  if (w.ok === false) return { ok: false, error: w.error };
  return stripTrade(w, on);
}

/** The daily history (/api/desk-history): the ranking, biases and tone per day. The desk's own score for a day is its record (P&L class): dropped
 *  unless the owner switched a record surface on. */
export function sanitizeHistory(h, on) {
  if (!h || typeof h !== 'object') return h;
  const O = onFn(on);
  if (O('panel.ana.track') || O('panel.ana.days') || O('panel.ana.fall') || O('panel.ov.record')) return stripTrade(h, on);
  return { ...stripTrade({ ...h, rows: undefined }, on), rows: (h.rows ?? []).map(r => ({ date: r.date, tone: r.tone, conviction: r.conviction, ranking: r.ranking, biases: r.biases })) };
}

/** The wire (/api/desk-news): the read of each headline, its pairs and its line on the book (analysis); trade-level sentences removed. */
export function sanitizeNews(res, on) {
  if (!res || typeof res !== 'object' || !Array.isArray(res.items)) return res;
  return stripTrade(res, on);
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

/** The routes whose JSON a viewer receives with the trade-level fields removed: (body, on) => body. Wired in server.js (a res.json wrapper). */
export const VIEWER_SANITISERS = {
  '/api/desk-run': sanitizeRun,
  '/api/desk-run/index': body => sanitizeRunIndex(body),
  '/api/desk-update': sanitizeUpdate,
  '/api/desk-weekly': sanitizeWeekly,
  '/api/desk-history': sanitizeHistory,
  '/api/desk-news': sanitizeNews,
  '/api/desk-risk': (body, on) => stripTrade(body, on),    // the model description of the book's risk and exposure: analysis; stripped defensively
  '/api/desk-watch': (body, on) => stripTrade(body, on),   // the setup watch and the chain-link log
};
export const sanitizerFor = path => VIEWER_SANITISERS[String(path ?? '').split('?')[0].replace(/\/+$/, '')] ?? null;

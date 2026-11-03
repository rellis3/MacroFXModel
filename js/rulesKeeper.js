/**
 * Agent 20: the rules keeper (plans/DESK_ANALYST_PIPELINE.md §9y). Holds the live bots to what the research found.
 *
 * For each bot in js/botRegistry.js it reads the bot's own status (mode, running, last update, positions) and the
 * research that governs its idea (Evidence Book entries and research-register rows, mapped by hand in BOT_BASIS), and
 * raises a flag where the two disagree:
 *   tested-against   the idea was tested and the book says not to trade it (a null whose "use" says so);
 *   before-verdict   the bot trades while the study that decides it is still open;
 *   no-basis         the bot trades real money and no study on record covers its idea;
 *   mode-mismatch    the registry calls it paper and the bot reports live, or the other way round;
 *   silent           the bot has not updated its status for hours on a weekday;
 *   new-verdict      a verdict on its idea was banked in the last 14 days: check its settings.
 * Severity is higher when the bot reports live. It reports; it never changes a bot.
 *
 * The map is curated: an idea the map does not know is reported as "no study linked", never guessed. Pure. Tested in
 * js/rulesKeeper.test.mjs (which also checks every id in the map exists).
 */

/** Bot status key → the idea it trades and the research that governs it. */
export const BOT_BASIS = {
  volatility_bot_v2_status: { idea: 'Vote Atlas: fade or follow the vol lines by the component vote', evidence: ['iv-regime-fade-follow', 'live-range-line-race', 'conviction-vote'], register: ['atlas-honest-gonogo'] },
  volatility_bot_v3_status: { idea: 'Vote Atlas v3: fade or follow the vol lines by the component vote', evidence: ['iv-regime-fade-follow', 'live-range-line-race', 'conviction-vote'], register: ['atlas-honest-gonogo'] },
  fib_atlas_bot_status: { idea: 'Fib Atlas: fade or follow the Asia/Monday fib extensions', evidence: ['vol-asia-fib-confluence', 'range-ladder-placebo'], register: ['atlas-honest-gonogo'] },
  fib_atlas_bot_v2_status: { idea: 'Fib Atlas v2: fade or follow the Asia/Monday fib extensions', evidence: ['vol-asia-fib-confluence', 'range-ladder-placebo'], register: ['atlas-honest-gonogo'] },
  range_line_bot_status: { idea: 'fade or follow at the range-ladder lines', evidence: ['range-ladder-placebo', 'live-range-line-race', 'level-touch'], register: ['range-ladder-placebo'] },
  oi_bot_status: { idea: 'trade the options walls and max pain', evidence: ['oi-max-pain', 'hedge-flow', 'gex-range-es'], register: ['oi-wall-building-forward', 'oi-level-map'] },
  oi_vol_bot_status: { idea: 'trade the options walls where they sit near a vol line', evidence: ['oi-max-pain', 'hedge-flow', 'live-range-line-race'], register: ['oi-wall-building-forward', 'oi-level-map'] },
  oi_conf_bot_status: { idea: 'trade the options walls with confluence', evidence: ['oi-max-pain', 'hedge-flow'], register: ['oi-wall-building-forward', 'oi-level-map'] },
  nq_qmr_status: { idea: 'QMR-gated Nasdaq days', evidence: ['qmr-direction-vs-geometry'] },
  spx_qmr_status: { idea: 'QMR-gated S&P days', evidence: ['qmr-direction-vs-geometry'] },
  dow_qmr_status: { idea: 'QMR-gated Dow days', evidence: ['qmr-direction-vs-geometry'] },
  dax_qmr_status: { idea: 'QMR-gated DAX days', evidence: ['qmr-direction-vs-geometry'] },
  yield_spread_status: { idea: 'the yield-spread sleeve', evidence: ['yield-spread-sleeve', 'ys-long-confirm', 'meta-label-long'] },
  motif_bot_status: { idea: 'motif touches', evidence: ['motif-regime-lookahead'] },
  confluence_bot_status: { idea: 'macro confluence direction', evidence: ['macro-confluence-direction', 'macro-confluence-baa-credit'] },
  volatility_bot_status: { idea: 'trades at the vol lines', evidence: ['live-range-line-race', 'line-touch-reach'] },
  volatility_ride_status: { idea: 'ride breaks of the vol lines', evidence: ['live-range-line-race', 'line-touch-reach'] },
  macro_equity_bot_status: { idea: 'the macro-equity allocator', evidence: [], register: ['q6-netliq-rerun'] },
};

/** The registry list from js/botRegistry.js's text (a classic script, so it is parsed, not imported). */
export function parseRegistry(text) {
  return [...String(text ?? '').matchAll(/\{\s*key:\s*'([^']+)',\s*label:\s*'([^']+)'[^}]*?paper:\s*(true|false)/g)].map(m => ({ key: m[1], label: m[2], paper: m[3] === 'true' }));
}

// "Do not trade it" language only. A usage rule ("a day selector, not a direction forecast") or a note about a technique
// ("meta-labelling closed") is a caution, not a verdict against the idea.
const AGAINST = /do not trade|has no edge|no edge\b|is dead|dead regardless|do not build|do not resurrect|not a signal|no fade or continue edge|not a magnet/i;
/** How an Evidence Book entry bears on trading the idea: against | support | caution. */
export function bearing(e) {
  if (!e) return 'unknown';
  if (e.verdict === 'validated') return 'support';
  if (e.verdict === 'null' && AGAINST.test(`${e.use ?? ''} ${e.claim ?? ''}`)) return 'against';
  return 'caution';
}

const OPEN = new Set(['CLAIMED', 'REGISTERED', 'RUNNING', 'RE-RUN']);
const tsOf = s => { const v = s?.generatedAt ?? s?.pushed_at ?? s?.timestamp ?? s?.updated_at ?? s?.last_update ?? null; const ms = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v ?? ''); return Number.isFinite(ms) ? ms : null; };

/**
 * One bot's read. status: the bot's status object (or null); reg: its registry row; evidence: the Evidence Book;
 * rows: the research register; now: ms; weekday: whether markets are open (silence only matters then).
 */
export function assessBot(reg, status, { evidence = [], rows = [], now = Date.now(), weekday = true } = {}) {
  if (status && typeof status === 'object' && Object.keys(status).length === 1 && status.error) status = null;   // a status write that only carries an error is no status
  const basis = BOT_BASIS[reg.key] ?? null, E = Object.fromEntries(evidence.map(e => [e.id, e])), R = Object.fromEntries(rows.map(r => [r.id, r]));
  const mode = status ? (status.mode ?? (status.paper === true ? 'paper' : status.paper === false ? 'live' : null)) : null;
  const live = mode === 'live' || (mode == null && !!status && reg.paper === false);
  const ts = tsOf(status), ageMin = ts ? Math.round((now - ts) / 60_000) : null;
  const ev = (basis?.evidence ?? []).map(id => ({ id, verdict: E[id]?.verdict ?? 'missing', date: E[id]?.date ?? null, bearing: bearing(E[id]), use: (E[id]?.use ?? '').slice(0, 240) }));
  const rg = (basis?.register ?? []).map(id => ({ id, status: R[id]?.status ?? 'missing', next: (R[id]?.next ?? '').slice(0, 200) }));
  const flags = [], add = (kind, severity, text) => flags.push({ kind, severity, text });
  if (status) {
    if (mode && reg.paper && mode === 'live') add('mode-mismatch', 'medium', 'The registry lists it as paper, but the bot reports mode "live". Check which account it trades and fix whichever is wrong.');
    if (mode === 'paper' && reg.paper === false) add('mode-mismatch', 'low', 'The registry lists it as live money, but the bot reports paper.');
    const against = ev.filter(e => e.bearing === 'against');
    if (against.length) add('tested-against', live ? 'high' : 'medium', `Its idea was tested and the book says not to trade it: ${against.map(e => e.id).join(', ')} (“${against[0].use.split(/(?<=\.)\s/)[0]}”).${live ? ' It is running live.' : ' It runs on paper, which only makes sense as a forward test with a register row.'}`);
    const rules = ev.filter(e => e.bearing === 'caution' && e.verdict === 'null');
    if (rules.length && !against.length) add('usage-rule', 'low', `The book allows its idea only in a limited way: ${rules.map(e => `${e.id} (“${e.use.split(/(?<=\.)\s/)[0]}”)`).join('; ')}. Check the bot uses it that way.`);
    const open = rg.filter(r => OPEN.has(r.status));
    if (open.length) add('before-verdict', live ? 'high' : 'low', `The study that decides it is still open: ${open.map(r => `${r.id} (${r.status})`).join(', ')}.${live ? ' Live before the verdict.' : ''}`);
    if (!basis && live) add('no-basis', 'medium', 'Runs live and no study on record covers its idea (not in the rules keeper\'s map).');
    if (!basis && !live) add('no-basis', 'low', 'No study linked to its idea.');
    if (weekday && ageMin != null && ageMin > 180 && (status.running !== false)) add('silent', 'medium', `No status update for ${ageMin >= 1440 ? `${Math.round(ageMin / 1440)} day(s)` : `${Math.round(ageMin / 60)} h`}.`);
    if (status.kill_switch === true) add('kill-switch', 'low', 'Its kill switch is on.');
    const fresh = ev.filter(e => e.date && now - Date.parse(e.date) < 14 * 864e5);
    if (fresh.length) add('new-verdict', 'low', `A verdict on its idea was banked in the last 14 days (${fresh.map(e => e.id).join(', ')}): check its settings still match.`);
  }
  const closed = status?.today_closed_trades ?? [];
  return { key: reg.key, label: reg.label, registryPaper: reg.paper, present: !!status, mode, live, running: status?.running ?? null, ageMin,
    positions: (status?.mt5_positions ?? []).length, todayClosed: closed.length, todayPnl: closed.length ? +closed.reduce((s, t) => s + (Number(t.profit) || 0), 0).toFixed(2) : null,
    idea: basis?.idea ?? null, evidence: ev, register: rg, flags };
}

const RANK = { high: 0, medium: 1, low: 2 };
/** The whole read, most serious first. statuses: { key: status|null }. */
export function rulesReport(registry, statuses, opts = {}) {
  const bots = registry.map(r => assessBot(r, statuses?.[r.key] ?? null, opts));
  const worst = b => Math.min(3, ...b.flags.map(f => RANK[f.severity] ?? 3));
  bots.sort((a, b) => worst(a) - worst(b) || Number(b.present) - Number(a.present) || a.label.localeCompare(b.label));
  const count = s => bots.reduce((n, b) => n + b.flags.filter(f => f.severity === s).length, 0);
  return { bots, counts: { high: count('high'), medium: count('medium'), low: count('low') }, reporting: bots.filter(b => b.present).length, total: bots.length, live: bots.filter(b => b.live).length };
}

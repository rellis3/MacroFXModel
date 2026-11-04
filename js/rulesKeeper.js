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
  macro_equity_bot_status: { idea: 'the macro-equity allocator (5-factor FRED composite, VIX filter)', evidence: ['net-liquidity-tailwind-spx', 'macro-confluence-baa-credit', 'stress-filter-hold-beyond-vt'], register: ['q6-netliq-rerun'], note: 'components and a 3-factor subset are tested; the 5-factor allocator as a whole only by the exploratory q6-netliq-rerun' },
  // mapped 2026-11-04 from the bots' own source and docs against the Evidence Book and the register
  bot_status: { idea: 'star-graded Asia/Monday fib-confluence entries (MacroFX V1)', evidence: ['range-ladder-placebo', 'range-ladder-placebo-confirm', 'range-edge-limit-fade', 'vol-asia-fib-confluence'], register: ['range-book-family'], note: 'its levels are tested; its own star ranking is not' },
  regime_bot_status: { idea: 'HMM regime-following (long in bull, short in bear)', evidence: [], register: [], note: 'no study on record; MD files/BACKTEST_INDEX.md flags regime-backtest.html for a one-bar-future ADX shift' },
  regime_bot_v2_status: { idea: 'HMM regime-following with confidence and debounce gates', evidence: [], register: [], note: 'no study on record' },
  regime_bot_v7_status: { idea: 'HMM regime-following on M30 with a slope gate and MFE-retrace exit', evidence: [], register: [], note: 'no study on record' },
  gold_bot_status: { idea: 'XAUUSD golden-pocket zones with VuManChu confirmation', evidence: ['zone-engine', 'swing-structure-vwap'], register: [], note: 'zone-engine tested ConfluenceBot, the same method family, not this bot\'s own code' },
  gold_v2_status: { idea: 'XAUUSD golden-pocket zones, level matrix and capped target', evidence: ['zone-engine', 'swing-structure-vwap'], register: [], note: 'zone-engine tested ConfluenceBot, which runs this bot\'s engine' },
  dyn_anchor_status: { idea: 'counter-regime fade of the projected high/low p50 rung back to the open', evidence: ['level-touch', 'day-recon-path-book-expectancy', 'day-recon-path-book-behaviour'], register: ['day-recon-path-book', 'day-reconstruction'], note: 'its counter-regime filter and its own widths are not tested' },
  hedge_bot_status: { idea: 'correlation pair signals from /api/hedge-signals', evidence: [], register: [], note: 'no Evidence Book entry; MD files/HEDGING_VS_SPREAD.md records the v1 hedge signals as a null, in prose only' },
  position_hedge_bot_status: { idea: 'a correlation-sized offset for every other bot\'s position', evidence: [], register: [], note: 'no Evidence Book entry; MD files/HEDGING_VS_SPREAD.md says it lost money and did not reduce risk, in prose only' },
  backtestsystem_status: { idea: 'Asia/Monday fib confluence with a feature-vote direction', evidence: ['conviction-vote', 'range-edge-limit-fade', 'vol-asia-fib-confluence', 'range-ladder-placebo'], register: ['range-book-family'] },
  signal_copier_status: { idea: 'copies C.OG\'s discretionary Telegram signals to MT5', evidence: ['cog-setups-direction', 'dip-with-bias'], register: [], note: 'only mechanical replicas of his setups are tested, not the copied signal record itself' },
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
/**
 * Bots the registry lists as paper that send orders through an MT5 account the owner has confirmed is a demo account
 * (so "live" in their status is not real money and the mode-mismatch flag is not raised). With a login, a different
 * login reported later raises the flag again.
 */
export const MT5_DEMO = {
  oi_bot_status: { confirmed: '2026-11-04' },
  oi_vol_bot_status: { confirmed: '2026-11-04' },
  signal_copier_status: { confirmed: '2026-11-04', login: 26365117 },
};

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
    const demo = MT5_DEMO[reg.key], demoOk = demo && (!demo.login || !status.account_login || String(status.account_login) === String(demo.login));
    if (mode && reg.paper && mode === 'live' && !demoOk) {
      const acct = [Number.isFinite(status.balance) ? `balance ${Math.round(status.balance).toLocaleString('en-GB')}` : null, status.account_login ? `MT5 login ${status.account_login}` : null].filter(Boolean).join(', ');
      add('mode-mismatch', 'medium', `The registry lists it as paper, but it reports "live": it is sending orders through MT5${acct ? ` (${acct})` : ''}, not the built-in paper broker. If that MT5 account is a demo account, nothing is wrong (record it in MT5_DEMO in js/rulesKeeper.js); if it is real money, mark it live in js/botRegistry.js.${demo ? ` The owner confirmed MT5 login ${demo.login} as demo; this is a different login.` : ''}`);
    }
    if (mode === 'paper' && reg.paper === false) add('mode-mismatch', 'low', 'The registry lists it as live money, but the bot reports paper.');
    const against = ev.filter(e => e.bearing === 'against');
    if (against.length) add('tested-against', live ? 'high' : 'medium', `Its idea was tested and the book says not to trade it: ${against.map(e => e.id).join(', ')} (“${against[0].use.split(/(?<=\.)\s/)[0]}”).${live ? ' It is running live.' : ' It runs on paper, which only makes sense as a forward test with a register row.'}`);
    const rules = ev.filter(e => e.bearing === 'caution' && e.verdict === 'null');
    if (rules.length && !against.length) add('usage-rule', 'low', `Related tests came back null without saying to stop: ${rules.map(e => `${e.id} (“${e.use.split(/(?<=\.)\s/)[0]}”)`).join('; ')}. Check the bot uses the idea within that.${basis?.note ? ` Note: ${basis.note}.` : ''}`);
    const open = rg.filter(r => OPEN.has(r.status));
    if (open.length) add('before-verdict', live ? 'high' : 'low', `The study that decides it is still open: ${open.map(r => `${r.id} (${r.status})`).join(', ')}.${live ? ' Live before the verdict.' : ''}`);
    const empty = !basis || (!(basis.evidence ?? []).length && !(basis.register ?? []).length);
    if (empty) add('no-basis', live ? 'medium' : 'low', basis ? `No study on record covers its idea${basis.note ? ` (${basis.note})` : ''}.${live ? ' It runs live.' : ''}` : `${live ? 'Runs live and no' : 'No'} study linked to its idea (not in the rules keeper's map).`);
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

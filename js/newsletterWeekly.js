/**
 * The weekly edition's own pages: the desk's week ahead (agent 19, the weekly strategist, Sundays from 16:00 London: GET /api/desk-weekly)
 * and the Saturday market review (scripts/market-review: analysis/output/market-review/latest/pack.json, 40 markets).
 *
 * The weekly used to be the daily's old layout with Friday morning's brief on the cover. These pages give it a week's material instead:
 *   - the strategist's view: last week, the themes carrying over, a bias and ranking for each currency, the key dates, the scenarios, what to watch;
 *   - the review digest, built by rule from the pack (no model): the week across every market, which story the market is trading (the regime
 *     gauges, last 20 sessions against the 60 before), the moves that are unusual against two years of history, the markets whose driver
 *     changed or whose move the textbook drivers do not explain, and positioning at an extreme of three years.
 * Every figure in the digest is observed data; the strategist's text is the desk's view and is labelled as a hypothesis, never a forecast.
 *
 * Pure. Tested in js/newsletterWeekly.test.mjs.
 */
import { evBadge, flatTable, guide } from './newsletterMag.js';

const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const MINUS = '−';
const fin = v => typeof v === 'number' && Number.isFinite(v);
const sg = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(d)}`;
const ord = p => { const n = Math.min(99, Math.round(p)), s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'; return `${n}${s}`; };
const DAY = 864e5;

/* ── the Saturday market review ─────────────────────────────────────────────────────────────── */

/** A pack move in its own unit: percent for prices, basis points for yields (the pack stores yield changes in percentage points), points for vol. */
export function packMove(m, v) {
  if (!fin(v)) return null;
  if (m?.units === 'bp') return `${sg(v * 100, 0)}bp`;
  if (m?.units === 'pt') return `${sg(v, 1)} pts`;
  return `${sg(v * 100, 1)}%`;
}
/** The same move as a plain number for sorting and bars: % for prices, bp for yields. */
const moveNum = (m, v) => (fin(v) ? (m?.units === 'bp' ? v * 100 : m?.units === 'pt' ? v : v * 100) : null);

const GROUP_ORDER = ['G10 FX', 'G10 crosses', 'EM FX', 'CE3 FX', 'Equities', 'Rates', 'Commodities', 'Crypto'];
const SYM_NAME = { 'CL=F': 'WTI crude', US10Y: 'US 10y', '^NDX': 'Nasdaq 100', 'HYG_TLT': 'Credit (HYG vs TLT)', 'DX-Y.NYB': 'Dollar index', '^GSPC': 'S&P 500', 'AUDUSD=X': 'AUD/USD', 'BTC-USD': 'Bitcoin', XLE: 'Energy stocks', 'USDJPY=X': 'USD/JPY', 'SI=F': 'Silver', SOXX: 'Semiconductors', '^VIX': 'VIX', T10YIE: 'Expected inflation', DFII10: 'Real yield', DE10Y: 'Bund 10y', US_JP10: 'US-Japan 10y gap', US_EA2: 'US-euro 2y gap', US_DE10: 'US-German 10y gap', 'BZ=F': 'Brent', '^STOXX50E': 'Euro Stoxx 50', FR_DE: 'French spread', IT_DE: 'Italian spread', 'GC=F': 'Gold', 'HG=F': 'Copper', 'EURPLN=X': 'EUR/PLN', 'EURUSD=X': 'EUR/USD', 'GBPUSD=X': 'GBP/USD', 'USDBRL=X': 'USD/BRL', 'USDCNH=X': 'USD/CNH', EWZ: 'Brazil stocks', GB10Y: 'Gilt 10y', US2Y: 'US 2y', US_CA2: 'US-Canada 2y gap', US_GB10: 'US-UK 10y gap', '^AXJO': 'ASX 200', '^KS11': 'KOSPI' };
export const symName = s => SYM_NAME[s] ?? String(s ?? '').replace(/=X$|=F$/, '').replace(/^\^/, '');
const corrWord = r => (Math.abs(r) >= 0.3 ? (r > 0 ? 'together' : 'opposite') : 'no clear link');

/**
 * The digest of one pack. nowMs dates it: a pack more than 8 days old is marked stale (the Saturday run failed or was not deployed).
 * Returns null without a usable pack.
 */
export function reviewDigest(pack, { nowMs = Date.now() } = {}) {
  const M = pack?.markets;
  if (!M || typeof M !== 'object' || !Object.keys(M).length) return null;
  const rows = Object.entries(M).filter(([, m]) => m?.move && fin(m.move.last)).map(([name, m]) => ({ name, m }));
  const ageDays = /^\d{4}-\d{2}-\d{2}/.test(pack.asof ?? '') ? Math.floor((nowMs - Date.parse(`${pack.asof.slice(0, 10)}T12:00:00Z`)) / DAY) : null;
  // the regime gauges: a gauge has shifted when its link changed side or strength (|recent − before| ≥ 0.4 and at least one end beyond ±0.3)
  const gauges = (pack.regime ?? []).filter(g => fin(g?.recent)).map(g => {
    const shifted = fin(g.prior) && Math.abs(g.recent - g.prior) >= 0.4 && (Math.abs(g.recent) >= 0.3 || Math.abs(g.prior) >= 0.3);
    return { pair: `${symName(g.a)} vs ${symName(g.b)}`, recent: g.recent, prior: fin(g.prior) ? g.prior : null, status: String(g.status ?? ''), why: String(g.why ?? ''), shifted };
  });
  // moves that are unusual against the market's own two years (the 4-week move's percentile of |4-week moves|)
  const unusual = rows.filter(r => fin(r.m.move.move4_pct) && r.m.move.move4_pct >= 90).sort((a, b) => b.m.move.move4_pct - a.m.move.move4_pct).slice(0, 10)
    .map(r => ({ name: r.name, group: r.m.group, w1: packMove(r.m, r.m.move.w1), w4: packMove(r.m, r.m.move.w4), pct: r.m.move.move4_pct, rangePos: fin(r.m.move.range_pos) ? r.m.move.range_pos : null }));
  // a driver whose label went from textbook to inverted or back over the last 20 sessions against the 60 before: the market changed stories
  const flips = rows.flatMap(r => (r.m.drivers ?? []).filter(d => d?.flipped).map(d => ({ name: r.name, driver: symName(d.key), why: d.why ?? '', now: d.lab, before: d.lab_prior, recent: d.recent })));
  // a move the textbook drivers explain badly: over half of the last 20 sessions' move left unexplained, on a move big enough to matter (≥ 60th percentile)
  const unexplained = rows.filter(r => r.m.decomp && fin(r.m.decomp.actual) && fin(r.m.decomp.resid) && fin(r.m.move.move4_pct) && r.m.move.move4_pct >= 60 && Math.abs(r.m.decomp.resid) > 0.5 * Math.abs(r.m.decomp.actual))
    .sort((a, b) => b.m.move.move4_pct - a.m.move.move4_pct).slice(0, 8)
    .map(r => ({ name: r.name, actual: packMove(r.m, r.m.decomp.actual), resid: packMove(r.m, r.m.decomp.resid), r2: r.m.decomp.r2, inCharge: r.m.in_charge ? symName(r.m.in_charge) : null }));
  const noDriver = rows.filter(r => !r.m.in_charge && (r.m.drivers ?? []).some(d => fin(d.recent))).map(r => r.name);
  // positioning at a three-year extreme (CFTC, as of the Tuesday before), per trader group
  const crowded = rows.flatMap(r => (r.m.cot?.groups ?? []).filter(g => fin(g.pct3y) && (g.pct3y >= 95 || g.pct3y <= 5)).map(g => ({ name: r.name, contract: r.m.cot.name, date: r.m.cot.date, group: g.group, pct: g.pct3y, side: g.net > 0 ? 'long' : g.net < 0 ? 'short' : 'flat', chg4: g.chg4 })))
    .sort((a, b) => Math.abs(b.pct - 50) - Math.abs(a.pct - 50)).slice(0, 10);
  // every market's week, by asset class
  const board = GROUP_ORDER.concat([...new Set(rows.map(r => r.m.group))].filter(g => !GROUP_ORDER.includes(g))).map(g => ({ group: g, rows: rows.filter(r => r.m.group === g).map(r => ({ name: r.name, level: r.m.level_text ?? '', w1: packMove(r.m, r.m.move.w1), w4: packMove(r.m, r.m.move.w4), w1n: moveNum(r.m, r.m.move.w1), pct: fin(r.m.move.move4_pct) ? r.m.move.move4_pct : null, rangePos: fin(r.m.move.range_pos) ? r.m.move.range_pos : null, units: r.m.units, date: r.m.move.last_date ?? null })) })).filter(g => g.rows.length);
  // the Fed path: the nearest and the furthest contract with their move on the week
  const fp0 = (pack.fed_path ?? []).filter(x => Array.isArray(x) && fin(x[1])), fpLast = fp0.map(x => String(x[3] ?? '')).sort().at(-1) ?? '', fp = fp0.filter(x => String(x[3] ?? '') === fpLast);   // an expired contract stops printing: keep the ones on the latest date
  const fedPath = fp.length >= 2 ? { near: { m: fp[0][0], v: fp[0][1], d: fin(fp[0][2]) ? fp[0][1] - fp[0][2] : null }, far: { m: fp.at(-1)[0], v: fp.at(-1)[1], d: fin(fp.at(-1)[2]) ? fp.at(-1)[1] - fp.at(-1)[2] : null } } : null;
  return { asof: pack.asof ?? null, ageDays, stale: ageDays != null && ageDays > 8, notes: (pack.notes ?? []).map(String).slice(0, 8), n: rows.length, gauges, unusual, flips, unexplained, noDriver, crowded, board, fedPath };
}

/** The weekly tape: the week's move for a fixed set of price markets (not yields), from the pack. Rows for composeMagazine's ticker. */
export function weekTicker(pack) {
  const M = pack?.markets ?? {}, pick = ['S&P 500', 'Nasdaq 100', 'DAX', 'FTSE 100', 'Nikkei 225', 'EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'Gold', 'WTI crude', 'Copper', 'Bitcoin'];
  return pick.map(k => [k, M[k]]).filter(([, m]) => m?.units === 'pct' && fin(m.move?.w1)).map(([k, m]) => ({ label: k, price: m.level_text ?? '', chg: m.move.w1 * 100, day: { pct: m.move.w1 * 100, mult: null, word: 'week' }, night: null }));
}

/** One line for the cover: the gauges that shifted and the most unusual move, in words. */
export function reviewLine(dg) {
  if (!dg) return '';
  const sh = dg.gauges.filter(g => g.shifted), top = dg.unusual[0];
  const a = sh.length ? `${sh.length === 1 ? 'One regime gauge' : `${sh.length} regime gauges`} shifted${sh.length > 2 ? ', among them' : ''}: ${sh.slice(0, 2).map(g => `${g.pair} now moves ${corrWord(g.recent)} (${sg(g.recent, 2)}, was ${sg(g.prior, 2)})`).join('; ')}` : 'No regime gauge shifted';
  const b = top ? `the most unusual 4-week move is ${top.name}, ${top.w4} (${ord(top.pct)} percentile of two years)` : '';
  return `${a}.${b ? ` ${b.charAt(0).toUpperCase()}${b.slice(1)}.` : ''}`;
}

/** The review pages, as composeMagazine page bodies: [{ section, html }]. H = { esc }. */
export function reviewPages(dg, H) {
  if (!dg) return [];
  const { esc } = H, out = [];
  const asof = `Saturday market review, Friday closes${dg.asof ? ` to ${esc(dg.asof)}` : ''}`;
  const stale = dg.stale ? `<div class="box warn"><p><b>This pack is ${dg.ageDays} days old.</b> The Saturday run did not produce a newer one, so these figures describe an earlier week.</p></div>` : '';
  const notes = dg.notes.length ? `<p class="small muted" style="font-family:var(--sans)"><b>Data notes from the pack:</b> ${esc(dg.notes.join(' · '))}</p>` : '';
  // page 1: which story the market is trading, and the moves that are unusual
  const gaugeRows = dg.gauges.map(g => [`<b>${esc(g.pair)}</b>${g.shifted ? ' <span class="kt a">shifted</span>' : ''}`, esc(sg(g.recent, 2)), g.prior != null ? esc(sg(g.prior, 2)) : '·', esc(g.status), `<span class="m">${esc(g.why)}</span>`]);
  const unRows = dg.unusual.map(u => [`<b>${esc(u.name)}</b>`, esc(u.group ?? ''), esc(u.w1 ?? '·'), esc(u.w4 ?? '·'), `${ord(u.pct)}`, u.rangePos != null ? `${Math.round(u.rangePos * 100)}%` : '·']);
  out.push({ section: 'The week across markets', html: `<div class="kick">The Saturday market review · ${dg.n} markets</div><h2 class="sh">Which story the market is trading</h2>
<p class="evl">${evBadge('observed')}<span style="font:11px var(--sans);color:#5b6b82">${asof}. Correlations of daily moves, the last 20 sessions against the 60 before. Descriptive, not a signal.</span></p>${stale}
${dg.gauges.length ? flatTable(['Gauge', 'Last 20', 'The 60 before', 'Now', 'What the sign means'], gaugeRows, ['l', 'r', 'r', 'l', 'l']) : '<p class="small muted">The pack has no regime gauges this week.</p>'}
${guide({ looking: 'Eight pairs of markets whose link says which story is in charge: whether oil is an inflation story or a growth tax, whether bonds hedge stocks, whether credit and tech are one trade.', matters: 'When a gauge shifts, the market has changed which story it trades, so the textbook reaction to the week\'s news may not be the one you get.', tells: dg.gauges.some(g => g.shifted) ? `This week: ${dg.gauges.filter(g => g.shifted).map(g => `${g.pair} (${sg(g.prior, 2)} to ${sg(g.recent, 2)})`).join(', ')}.` : 'No gauge moved far enough to count as a shift this week.', unsure: 'Twenty sessions is a short window: one week can move a correlation a lot. A shift is a question to ask, not an answer.' }, H, 'sm')}
<h3 class="ss" style="margin-top:14px">The moves that are unusual</h3>
<p class="evl">${evBadge('observed')}<span style="font:11px var(--sans);color:#5b6b82">Ranked by the 4-week move against the market's own 4-week moves over two years. Below about the 75th percentile is ordinary; above the 90th needs a story.</span></p>
${dg.unusual.length ? flatTable(['Market', 'Class', '1 week', '4 weeks', 'Percentile', 'In 52w range'], unRows, ['l', 'l', 'r', 'r', 'r', 'r']) : '<p class="small" style="font-family:var(--sans)">No market made a 4-week move above the 90th percentile of its own two years: an ordinary month everywhere.</p>'}
${dg.fedPath ? `<p class="small" style="margin-top:8px;font-family:var(--sans)"><b>Fed path (fed funds futures):</b> ${esc(dg.fedPath.near.m)} ${dg.fedPath.near.v.toFixed(3)}%${dg.fedPath.near.d != null ? ` (${sg(dg.fedPath.near.d * 100, 1)}bp on the week)` : ''} · ${esc(dg.fedPath.far.m)} ${dg.fedPath.far.v.toFixed(3)}%${dg.fedPath.far.d != null ? ` (${sg(dg.fedPath.far.d * 100, 1)}bp)` : ''}. The implied average rate in each contract month.</p>` : ''}${notes}` });
  // page 2: where the textbook is not working, market by market, and positioning at an extreme
  const flipRows = dg.flips.map(f => [`<b>${esc(f.name)}</b>`, esc(f.driver), `${esc(f.before)} → <b>${esc(f.now)}</b>`, fin(f.recent) ? esc(sg(f.recent, 2)) : '·', `<span class="m">${esc(f.why)}</span>`]);
  const unxRows = dg.unexplained.map(u => [`<b>${esc(u.name)}</b>`, esc(u.actual ?? '·'), esc(u.resid ?? '·'), fin(u.r2) ? u.r2.toFixed(2) : '·', esc(u.inCharge ?? 'none clear')]);
  const crRows = dg.crowded.map(c => [`<b>${esc(c.name)}</b>`, esc(c.group), esc(c.side), `${ord(c.pct)}`, fin(c.chg4) ? esc(`${c.chg4 > 0 ? '+' : c.chg4 < 0 ? MINUS : ''}${Math.abs(Math.round(c.chg4)).toLocaleString('en-GB')}`) : '·', esc(c.date ?? '')]);
  const p2 = [
    dg.flips.length ? `<h3 class="ss">Markets that changed stories</h3><p class="evl">${evBadge('observed')}<span style="font:11px var(--sans);color:#5b6b82">A driver whose link went from textbook to inverted, or back, over the last 20 sessions against the 60 before.</span></p>${flatTable(['Market', 'Driver', 'Before → now', 'Corr. now', 'The driver'], flipRows, ['l', 'l', 'l', 'r', 'l'])}` : '',
    dg.unexplained.length ? `<h3 class="ss" style="margin-top:12px">Moves the textbook drivers do not explain</h3><p class="evl">${evBadge('model')}<span style="font:11px var(--sans);color:#5b6b82">A regression of daily moves on each market's textbook drivers over 60 sessions, applied to the last 20. Shown where more than half of a sizeable move is left over.</span></p>${flatTable(['Market', 'Move, 20 sessions', 'Unexplained', 'R²', 'Driver in charge'], unxRows, ['l', 'r', 'r', 'r', 'l'])}<p class="small muted" style="font-family:var(--sans)">Something off the list is moving these, or the drivers cancel. Either is worth knowing before reading the week's news through the textbook.</p>` : '',
    dg.noDriver.length ? `<p class="small" style="margin-top:6px;font-family:var(--sans)"><b>No clear driver</b> (every link under 0.3): ${esc(dg.noDriver.join(', '))}.</p>` : '',
    dg.crowded.length ? `<h3 class="ss" style="margin-top:12px">Positioning at a three-year extreme</h3><p class="evl">${evBadge('context')}<span style="font:11px var(--sans);color:#5b6b82">CFTC, as of the Tuesday before. Percentile of the group's net position in its own three years: 99th is the most long (or least short) in three years, 1st the most short (or least long). Who is exposed, not which way price goes.</span></p>${flatTable(['Market', 'Traders', 'Net', 'Percentile', '4-week change', 'Report'], crRows, ['l', 'l', 'l', 'r', 'r', 'l'])}` : '',
  ].filter(Boolean).join('');
  if (p2) out.push({ section: 'Where the textbook is not working', html: `<div class="kick">The Saturday market review · market by market</div><h2 class="sh">Drivers, leftovers and crowding</h2>${p2}` });
  // page 3: every market's week (reference)
  const bd = dg.board.map(g => `<h3 class="ss" style="margin-top:10px">${esc(g.group)}</h3>${flatTable(['Market', 'Level', '1 week', '4 weeks', '4w percentile', 'In 52w range'], g.rows.map(r => [`<b>${esc(r.name)}</b>`, esc(r.level), r.w1n == null ? '·' : `<span class="${r.w1n > 0 ? 'up' : r.w1n < 0 ? 'dn' : ''}">${esc(r.w1)}</span>`, esc(r.w4 ?? '·'), r.pct != null ? ord(r.pct) : '·', r.rangePos != null ? `${Math.round(r.rangePos * 100)}%` : '·']), ['l', 'r', 'r', 'r', 'r', 'r'])}`).join('');
  out.push({ section: 'Every market, the week', html: `<div class="kick">Reference</div><h2 class="sh">Every market's week</h2><p class="evl">${evBadge('observed')}<span style="font:11px var(--sans);color:#5b6b82">${asof}. Yields in basis points, everything else in percent. 52-week range: 0% at the low, 100% at the high.</span></p>${bd}` });
  return out;
}

/* ── the weekly strategist (agent 19) ───────────────────────────────────────────────────────── */

/** The strategist's record if it is usable: { rec, fresh } where fresh means written for the week this issue covers. */
export function weekDeskState(rec, expectWeek) {
  if (!rec?.ok || !rec.view?.headline) return null;
  return { rec, fresh: !expectWeek || rec.week === expectWeek };
}

/** The strategist's pages: [{ section, html }]. H = { esc }. */
export function weekDeskPages(st, H) {
  if (!st) return [];
  const { esc } = H, v = st.rec.view, rec = st.rec;
  const written = rec.writtenAt ? new Date(rec.writtenAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : rec.writtenOn ?? '';
  const old = st.fresh ? '' : `<div class="box warn"><p><b>Written for ${esc(rec.week)}, not the coming week.</b> The strategist has not written this week's view yet (Sundays from 16:00 London). Read it as last week's thinking.</p></div>`;
  const bar = b => { const w = Math.abs(b) * 22; return `<span style="display:inline-block;width:92px;height:10px;position:relative;background:#eef2f7;border-radius:2px;vertical-align:middle"><span style="position:absolute;left:46px;top:0;width:1px;height:10px;background:#8aa0bd"></span>${b ? `<span style="position:absolute;${b > 0 ? 'left:46px' : `left:${46 - w}px`};top:1px;width:${w}px;height:8px;border-radius:2px;background:${b > 0 ? '#0f9f6e' : '#d4433b'}"></span>` : ''}</span>`; };
  const ranking = (v.ranking ?? []).filter(c => CCYS.includes(c));
  const ccyRows = ranking.map((c, i) => [`${i + 1}`, `<b>${esc(c)}</b>`, `${bar(v.currencies?.[c]?.bias ?? 0)} ${esc(sg(v.currencies?.[c]?.bias ?? 0, 0))}`, `<span class="m">${esc(v.currencies?.[c]?.why ?? '')}</span>`]);
  const themes = (v.themes ?? []).map(t => `<div class="th2"><h3>${esc(t.title)}</h3><p>${esc(t.body)}</p></div>`).join('');
  const pages = [{ section: "The desk's week ahead", html: `<div class="kick">The desk's view of the week · ${esc(rec.week ?? '')}</div><h2 class="sh">${esc(v.headline)}</h2>
<p class="evl">${evBadge('hyp')}<span style="font:11px var(--sans);color:#5b6b82">The weekly strategist${written ? `, written ${esc(written)} UK` : ''}${rec.basedOn?.length ? `, from ${rec.basedOn.length} morning books (${esc(rec.basedOn[0])} to ${esc(rec.basedOn.at(-1))})` : ''}. Context for the week, not a forecast or a trade.</span></p>${old}
${v.lastWeek ? `<h3 class="ss">Last week</h3><p>${esc(v.lastWeek)}</p>` : ''}
${themes ? `<h3 class="ss" style="margin-top:12px">The themes carrying into the week</h3>${themes}` : ''}` }];
  const sc = (v.scenarios ?? []).map(x => `<li><b>If ${esc(x.if.replace(/^if\s+/i, ''))}</b><small>${esc(x.then)}</small></li>`).join('');
  const kd = (v.week ?? []).map(w => [esc(w.when ?? ''), `<b>${esc(w.event)}</b>`, `<span class="m">${esc(w.why ?? '')}</span>`]);
  pages.push({ section: 'The currencies for the week', html: `<div class="kick">The desk's view of the week · currencies</div><h2 class="sh">Strongest to weakest, for the week</h2>
<p class="evl">${evBadge('hyp')}<span style="font:11px var(--sans);color:#5b6b82">A bias from −2 to +2 per currency, with the strategist's reason. A view to test against the week, not a call to trade.</span></p>
${ccyRows.length ? flatTable(['#', 'Currency', 'Bias', 'Why'], ccyRows, ['r', 'l', 'l', 'l']) : ''}
${kd.length ? `<h3 class="ss" style="margin-top:12px">The dates that matter for the view</h3>${flatTable(['When', 'Release', 'Why it matters'], kd, ['l', 'l', 'l'])}` : ''}
${sc ? `<h3 class="ss" style="margin-top:12px">What would change the view</h3><ul class="lst">${sc}</ul>` : ''}
${(v.watch ?? []).length ? `<h3 class="ss" style="margin-top:12px">What to watch on Monday morning</h3><ul class="lst">${v.watch.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}` });
  return pages;
}

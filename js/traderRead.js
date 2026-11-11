/**
 * The Trader's Read: how a discretionary macro trader would read today, built only from what the desk measures.
 * The method is the eight questions and the named patterns in education/podcast_transcripts/HOW_THEY_THINK.md
 * (The Macro Trading Floor, decoded). The Desk Terminal's Trader's Read tab draws it (js/terminal/traderReadView.js).
 *
 * WHAT IT ADDS TO THE NEWSLETTER'S "IDEA OF THE DAY" (js/macroIdea.js, used here unchanged for the story):
 *   - the story on every chain window (live, 1, 5, 20 days), so a day whose story differs from the month's shows it;
 *   - four checks the hosts run that change every day:
 *       follow-through (E05 V)      did FX and rates move with a big stock move, or is it a liquidation?
 *       two clocks (E05 W)          markets pulling one way today and the other way over the month;
 *       crowded and exposed (W)     a shock moves the crowded positions: which crowded ones are moving, and which way;
 *       news against price (E01 A, E05 X)  clear surprises where price went the other way from what history says.
 *
 * WHAT IT DOES NOT CLAIM. Every check is a heuristic from the podcast, untested on this desk (backlog R13 in
 * PODCAST_INSIGHTS.md would test the first). Sizes are in noise-band units (a move ÷ the chain's floor for that
 * window), never a forecast, and nothing here names a direction to trade: this desk's direction tests are null.
 *
 * Pure: no fetch, no clock. Tested in js/traderRead.test.mjs.
 */
import { buildIdea } from './macroIdea.js';
import { CHAIN_NODES, CHAIN_WINDOW_DAYS, scaledFloor } from './macroChain.js';

const num = x => Number.isFinite(x);
export const WIN_LABEL = { live: 'Live', 1: 'Today', 5: 'This week', 20: 'This month' };

/** A node's move over the window in noise-band units (1 = exactly its floor), or null when it has no data. */
export function zOf(vals, key, win = CHAIN_WINDOW_DAYS) {
  const v = vals?.[key], n = CHAIN_NODES[key];
  if (!n || !num(v?.delta)) return null;
  const f = win === CHAIN_WINDOW_DAYS ? n.floor : scaledFloor(n, win);
  return f > 0 ? v.delta / f : null;
}
const moveText = (vals, key) => {
  const v = vals?.[key], n = CHAIN_NODES[key]; if (!n || !num(v?.delta)) return '–';
  const s = v.delta > 0 ? '+' : v.delta < 0 ? '−' : '';
  return `${s}${Math.abs(v.delta).toFixed(n.dp ?? 1)}${n.unit === 'pct' ? '%' : n.unit === 'bp' ? 'bp' : n.unit === 'pt' ? ' pt' : ''}`;
};

/** The idea (js/macroIdea.js) on each window. linksByWin: { live?, 1, 5, 20: evaluated chain links }. */
export function storyByWindow(linksByWin = {}, ctx = {}) {
  const out = {};
  for (const [w, links] of Object.entries(linksByWin)) {
    if (!links?.length) continue;
    const win = w === 'live' ? 'live' : Number(w);
    out[w] = buildIdea({ ...ctx, links, window: win });
  }
  const today = out[1] ?? out.live, month = out[20];
  return { byWin: out, shifted: !!(today && month && today.storyId !== month.storyId) };
}

// ── follow-through (Pattern V): a big stock move that nothing else confirms reads as a liquidation, not a macro story ──
export const FT_GROUPS = [['Stocks', ['nq', 'spx']], ['Dollar and FX', ['dxy', 'usdjpy', 'eurusd', 'audusd']], ['Rates', ['us2y', 'us10y']], ['Credit', ['hy']]];
export const FT_MIN_LEAD = 1.5;   // the stock move must be at least 1.5x its noise band before there is anything to test
export function followThrough(vals = {}, win = 1) {
  const rows = FT_GROUPS.flatMap(([group, keys]) => keys.map(k => ({ group, key: k, label: CHAIN_NODES[k]?.label ?? k, z: zOf(vals, k, win), text: moveText(vals, k) }))).filter(r => r.z != null);
  const stocks = rows.filter(r => r.group === 'Stocks'), lead = stocks.slice().sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0] ?? null;
  const others = rows.filter(r => r.group === 'Dollar and FX' || r.group === 'Rates'), moved = others.filter(r => Math.abs(r.z) >= 1);
  let verdict, line;
  if (!lead) { verdict = 'none'; line = 'No stock data for this window.'; }
  else if (Math.abs(lead.z) < FT_MIN_LEAD) { verdict = 'quiet'; line = `${lead.label} moved ${lead.text}, inside ${FT_MIN_LEAD}x its noise band: no big stock move to test.`; }
  else if (!others.length) { verdict = 'none'; line = 'No FX or rates data to compare with.'; }
  else if (moved.length >= 2) { verdict = 'followed'; line = `${lead.label} moved ${lead.text} and ${moved.length} of ${others.length} FX and rates markets moved past their noise band with it: the market is treating it as macro.`; }
  else if (moved.length === 1) { verdict = 'partial'; line = `${lead.label} moved ${lead.text}; only ${moved[0].label} followed past its noise band. Half a macro story.`; }
  else { verdict = 'contained'; line = `${lead.label} moved ${lead.text} and no FX or rates market moved past its noise band: by the hosts' rule this is a positioning liquidation, not a macro story.`; }
  return { win, rows, lead, moved: moved.length, of: others.length, verdict, line };
}

// ── two clocks (Pattern W): the same market pushed one way today and the other way over the month ──
export const CLOCK_KEYS = ['dxy', 'eurusd', 'usdjpy', 'audusd', 'gold', 'oil', 'nq', 'spx', 'us2y', 'us10y', 'real', 'hy', 'vix', 'btc', 'copper'];
export function twoClocks(valsShort = {}, winShort = 1, valsLong = {}, winLong = CHAIN_WINDOW_DAYS, keys = CLOCK_KEYS) {
  const rows = keys.map(k => {
    const zs = zOf(valsShort, k, winShort), zl = zOf(valsLong, k, winLong);
    if (zs == null || zl == null) return null;
    const both = Math.abs(zs) >= 1 && Math.abs(zl) >= 1;
    const state = both ? (Math.sign(zs) === Math.sign(zl) ? 'aligned' : 'opposed') : 'one';
    return { key: k, label: CHAIN_NODES[k].label, zs, zl, state, short: moveText(valsShort, k), long: moveText(valsLong, k) };
  }).filter(Boolean);
  const rank = { opposed: 0, aligned: 1, one: 2 };
  rows.sort((a, b) => rank[a.state] - rank[b.state] || Math.min(Math.abs(b.zs), Math.abs(b.zl)) - Math.min(Math.abs(a.zs), Math.abs(a.zl)));
  const opposed = rows.filter(r => r.state === 'opposed');
  const line = opposed.length
    ? `${opposed.map(r => r.label).join(', ')} ${opposed.length === 1 ? 'is' : 'are'} being pushed one way ${winShort === 'live' ? 'since the close' : `over ${winShort} day${winShort === 1 ? '' : 's'}`} and the other way over ${winLong} days. Two clocks pulling apart usually means no edge until one wins.`
    : 'No market is moving against its own monthly trend past its noise band today.';
  return { rows, opposed: opposed.length, line };
}

// ── crowded and exposed (Pattern W, positioning half): a shock moves the crowded positions ──
// /api/cot-state instrument keys -> chain nodes (instruments with no chain node keep their crowding but have no move)
export const COT_NODE = { EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', AUDUSD: 'audusd', USDCAD: 'usdcad', GOLD: 'gold', NQ: 'nq', SPX500: 'spx', WTI: 'oil', COPPER: 'copper', BTC: 'btc' };
export function crowdedExposed(cot = null, vals = {}, win = 1) {
  const inst = cot?.instruments ?? {};
  const rows = Object.entries(inst).map(([k, v]) => {
    const node = COT_NODE[k] ?? null, z = node ? zOf(vals, node, win) : null;
    const crowd = num(v.crowd) ? v.crowd : 0;
    const against = crowd !== 0 && z != null && Math.abs(z) >= 1 && Math.sign(z) === -crowd;
    const withIt = crowd !== 0 && z != null && Math.abs(z) >= 1 && Math.sign(z) === crowd;
    return { key: k, crowd, pct: num(v.pct) ? v.pct : null, label: v.label ?? '', line: v.line ?? '', ev: v.ev ?? null, verdict: v.verdict ?? null, z, move: node ? moveText(vals, node) : null, against, withIt };
  });
  rows.sort((a, b) => Math.abs(b.crowd) - Math.abs(a.crowd) || Math.abs((b.pct ?? 50) - 50) - Math.abs((a.pct ?? 50) - 50));
  const crowded = rows.filter(r => r.crowd !== 0), pressed = crowded.filter(r => r.against);
  const line = !Object.keys(inst).length ? 'The weekly CFTC report is not loaded.'
    : !crowded.length ? 'Nothing is crowded in the weekly CFTC report, so a shock has no big position to push around: expect less follow-through in FX.'
    : pressed.length ? `${pressed.map(r => r.key).join(', ')}: crowded and moving against the crowd past its noise band. That is who has to act if it continues; it says nothing about which way it goes next.`
    : `${crowded.map(r => r.key).join(', ')} ${crowded.length === 1 ? 'is' : 'are'} crowded, and none is moving hard against the crowd yet.`;
  return { reportDate: cot?.reportDate ?? null, rows, crowded: crowded.length, pressed: pressed.length, line };
}

// ── news against price (Patterns A and X): clear surprises where price went the other way from what history says ──
export const CLEAR_Z = 1;
export function newsVsPrice(recent = [], { nowMs = null, days = 14 } = {}) {
  const pts = [], rel = [];
  for (const r of recent ?? []) {
    const s = r?.surprise; if (!s?.ok || !num(s.z) || Math.abs(s.z) < CLEAR_Z) continue;
    if (num(nowMs) && num(r.ms) && nowMs - r.ms > days * 864e5) continue;
    const ms = (r.markets ?? []).filter(m => num(m.exp30) && num(m.m30) && Math.abs(m.exp30) > 1e-9);
    if (!ms.length) continue;
    let w = 0, a = 0;
    for (const m of ms) {
      const cls = Math.sign(m.m30) !== Math.sign(m.exp30) ? 'against' : Math.abs(m.m30) >= 0.5 * Math.abs(m.exp30) ? 'with' : 'muted';
      if (cls === 'against') a++; else if (cls === 'with') w++;
      pts.push({ release: r.event, at: r.at, z: s.z, id: m.id, label: m.label, exp: m.exp30, act: m.m30, cls });
    }
    rel.push({ event: r.event, ccy: r.ccy ?? r.country ?? null, at: r.at, z: s.z, direction: s.direction ?? null, n: ms.length, against: a, with: w, call: a > w ? 'price fought the news' : w > a ? 'price went with the news' : 'mixed' });
  }
  const fought = rel.filter(r => r.call === 'price fought the news');
  const line = !rel.length ? `No clear surprise (|z| of at least ${CLEAR_Z}) in the last ${days} days to judge.`
    : fought.length ? `${fought.length} of ${rel.length} clear surprises in the last ${days} days saw price go the other way from what history says: ${fought.slice(0, 3).map(r => `${r.event} (${r.direction ?? ''} by ${Math.abs(r.z).toFixed(1)}σ)`).join(', ')}. When news is clear and price won't follow, the hosts read that as already priced.`
    : `All ${rel.length} clear surprises in the last ${days} days moved price the way history says: the market is still reacting to news.`;
  return { pts, releases: rel, fought: fought.length, line };
}

// ── the eight questions as a checklist: each gets a state from the measurements, not from the story's wording ──
// state: ok (the evidence agrees), watch (something is pulling the other way), broken, none (no data), info (a fact, nothing to judge)
export function checklist({ idea = null, links = [], ft = null, clocks = null, crowd = null, news = null, events = [], nowMs = null } = {}) {
  if (!idea) return [];
  const Q = Object.fromEntries((idea.q ?? []).map(x => [x.n, x]));
  const judged = links.filter(l => l.verdict === 'holding' || l.verdict === 'broken'), holding = judged.filter(l => l.verdict === 'holding').length;
  const share = judged.length ? holding / judged.length : null;
  const ahead = (events ?? []).filter(e => e.impact === 'high' && num(e.ms) && (!num(nowMs) || (e.ms >= nowMs && e.ms - nowMs <= 48 * 3600e3)));
  const st = (n, state, tag) => ({ n, g: Q[n]?.g, t: Q[n]?.t, body: Q[n]?.body ?? '', state, tag });
  return [
    st(1, 'info', idea.broken ? 'a broken link' : 'a link holding'),
    st(2, idea.weakest === 'broken' ? 'broken' : 'watch', idea.weakest),
    st(3, share == null ? 'none' : share >= 0.6 ? 'ok' : share >= 0.4 ? 'watch' : 'broken', share == null ? 'no data' : `${holding}/${judged.length} holding`),
    st(4, !crowd || !crowd.rows?.length ? 'none' : crowd.pressed ? 'watch' : 'ok', !crowd?.rows?.length ? 'no report' : crowd.crowded ? `${crowd.crowded} crowded` : 'nothing crowded'),
    st(5, news?.fought ? 'watch' : ft?.verdict === 'contained' ? 'watch' : 'ok', news?.fought ? `${news.fought} fought the news` : ft?.verdict === 'contained' ? 'no follow-through' : 'price reacting'),
    st(6, ahead.length ? 'watch' : 'ok', ahead.length ? `${ahead.length} in 48h` : 'clear 48h'),
    st(7, clocks?.opposed ? 'watch' : 'ok', clocks?.opposed ? `${clocks.opposed} pulling apart` : 'clocks agree'),
    st(8, 'info', 'the line to watch'),
  ];
}

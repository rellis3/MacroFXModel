/**
 * The terminal's own computations — risk gauges, movers, the cross-asset matrix and
 * event risk.
 *
 * WHAT THIS PAGE IS, AND IS NOT. market-view.html teaches: it narrates, checks
 * mechanisms and asks questions. This one does none of that. It is a monitoring
 * surface for someone who already knows what a real yield is and wants the whole
 * board's state at a glance, at density. Same engines underneath, no explanation.
 *
 * NO COMPOSITE SCORE, DELIBERATELY. The obvious thing is to average six risk gauges
 * into one "RISK: 72/100" dial. Every reference dashboard does it and it is the least
 * defensible number on the screen: the weights are invented, nobody calibrated them,
 * and a single figure hides which of the six actually moved. This reports each gauge
 * separately and COUNTS how many are elevated. A count is honest; a weighted index of
 * things nobody weighted is not.
 *
 * Pure: no fetch, no DOM. Tested in js/terminal.test.mjs.
 */

const z = (board, key) => board.find(b => b.key === key)?.z ?? null;
const lv = (board, key) => board.find(b => b.key === key)?.last ?? null;
const ch = (board, key) => board.find(b => b.key === key)?.change ?? null;

/** calm | elevated | stressed, from a z and its thresholds. */
const band = (v, warn, bad) => v == null ? 'unknown' : Math.abs(v) >= bad ? 'stressed' : Math.abs(v) >= warn ? 'elevated' : 'calm';

/**
 * Six independent risk readings.
 *
 * Each carries the number it is built from, so a reader can disagree with the band
 * rather than having to trust it.
 */
export function riskMonitor(board = [], state = null, book = null) {
  const B = Array.isArray(board) ? board : [];
  const g = [];

  const vixLvl = lv(B, 'vix'), term = lv(B, 'vixterm');
  g.push({ id: 'vol', label: 'Equity volatility',
    value: vixLvl == null ? '—' : vixLvl.toFixed(1),
    sub: term == null ? 'curve unreadable' : term < 0 ? `curve INVERTED by ${Math.abs(term).toFixed(1)}` : `curve normal, +${term.toFixed(1)}`,
    // an inverted curve is the tested one, so it dominates the level
    state: term != null && term < 0 ? 'stressed' : band(z(B, 'vix'), 1.5, 2.6),
    note: term != null && term < 0 ? 'Cover costs more now than later — validated here for wider range, not direction.' : 'Longer cover costs more, which is the ordinary state.' });

  const hy = z(B, 'hy'), ccc = z(B, 'ccc'), ig = z(B, 'ig');
  g.push({ id: 'credit', label: 'Credit',
    value: lv(B, 'hy') == null ? '—' : `${lv(B, 'hy').toFixed(2)}%`,
    sub: `HY z ${hy?.toFixed(1) ?? '—'} · CCC z ${ccc?.toFixed(1) ?? '—'} · IG z ${ig?.toFixed(1) ?? '—'}`,
    state: band(Math.max(Math.abs(hy ?? 0), Math.abs(ccc ?? 0)), 1.5, 2.6),
    note: (ccc ?? 0) > 1.5 && Math.abs(ig ?? 0) < 1 ? 'Stress at the bottom of the stack only — a sector problem, not a systemic one.' : 'The whole stack moving together is the version that reaches equities.' });

  const c2 = z(B, 'curve'), f2 = z(B, 'us2y');
  g.push({ id: 'rates', label: 'Rates',
    value: lv(B, 'us2y') == null ? '—' : `${lv(B, 'us2y').toFixed(2)}%`,
    sub: `2y z ${f2?.toFixed(1) ?? '—'} · curve ${ch(B, 'curve') == null ? '—' : Math.round(ch(B, 'curve')) + 'bp'}`,
    state: band(Math.max(Math.abs(f2 ?? 0), Math.abs(c2 ?? 0)), 1.5, 2.6),
    note: 'The front end is the market voting on the central bank; the curve is where banks feel it.' });

  const dxy = z(B, 'dxy');
  g.push({ id: 'dollar', label: 'Dollar',
    value: lv(B, 'dxy') == null ? '—' : lv(B, 'dxy').toFixed(2),
    sub: `z ${dxy?.toFixed(1) ?? '—'} · ${ch(B, 'dxy') == null ? '—' : (ch(B, 'dxy') > 0 ? '+' : '') + ch(B, 'dxy').toFixed(1) + '% / 20d'}`,
    state: band(dxy, 1.5, 2.6),
    note: 'The unit everything else is priced in. When it moves, half the board moves for no reason of its own.' });

  const conc = state?.breadth?.concentration ?? null;
  const up = state?.breadth?.sectorsUp, tot = state?.breadth?.sectorsTotal;
  g.push({ id: 'breadth', label: 'Breadth',
    value: conc == null ? '—' : `${conc > 0 ? '+' : ''}${conc.toFixed(1)}%`,
    sub: up == null ? 'sectors unavailable' : `${up}/${tot} sectors rising · spread ${state?.breadth?.spread ?? '—'}pts`,
    state: conc == null ? 'unknown' : conc <= -3 ? 'stressed' : conc <= -1 ? 'elevated' : 'calm',
    note: 'Equal-weight against cap-weight. Negative means the index is being carried by its largest members.' });

  const dPct = B.find(b => b.key === 'dspx')?.pct ?? null;   // B, not board: a null arg skips the default
  g.push({ id: 'dispersion', label: 'Dispersion',
    value: lv(B, 'dspx') == null ? '—' : lv(B, 'dspx').toFixed(1),
    sub: dPct == null ? '—' : `${Math.round(dPct * 100)}th percentile since 2014`,
    state: dPct == null ? 'unknown' : dPct >= 0.95 ? 'stressed' : dPct >= 0.8 ? 'elevated' : 'calm',
    note: 'Single-name vol against index vol. High means the index looks calm over a market crowded into a few names.' });

  if (book?.ok) {
    const out = book.rows.filter(r => r.inside === false).length;
    g.push({ id: 'positioning', label: 'Options book',
      value: book.stale ? 'STALE' : `${out}/${book.rows.length}`,
      sub: book.stale ? `${Math.round(book.ageH ?? 0)}h old` : 'markets outside their wall band',
      state: book.stale ? 'unknown' : out >= book.rows.length / 2 ? 'elevated' : 'calm',
      note: 'Where price sits against the strikes carrying open interest. Descriptive — max pain tested null here.' });
  }

  return {
    gauges: g,
    // a COUNT, not an average: which of them is elevated is the information
    elevated: g.filter(x => x.state === 'elevated').length,
    stressed: g.filter(x => x.state === 'stressed').length,
    calm: g.filter(x => x.state === 'calm').length,
  };
}

/** Biggest moves in both directions, ranked by how unusual they are for that market. */
export function movers(board = [], n = 8) {
  const ok = (Array.isArray(board) ? board : []).filter(b => b.z != null && b.change != null);
  return {
    up: ok.filter(b => b.change > 0).sort((a, b) => b.z - a.z).slice(0, n),
    down: ok.filter(b => b.change < 0).sort((a, b) => a.z - b.z).slice(0, n),
  };
}

/**
 * Group × horizon: how each part of the board is behaving over each window.
 *
 * `tone` is the SHARE of the group moving one way, not an average of its members —
 * averaging a group whose members are in different units produces a number with no
 * meaning at all.
 */
export function matrix(horizonRows = []) {
  const H = Array.isArray(horizonRows) ? horizonRows : [];
  const groups = [...new Set(H.map(r => r.group))];
  return groups.map(gname => {
    const rows = H.filter(r => r.group === gname);
    const cell = w => {
      const vals = rows.map(r => r[w]).filter(v => v != null);
      if (!vals.length) return null;
      const upN = vals.filter(v => v > 0).length;
      return { up: upN, n: vals.length, share: +(upN / vals.length).toFixed(2) };
    };
    const shapes = {};
    for (const r of rows) shapes[r.shape] = (shapes[r.shape] ?? 0) + 1;
    return {
      group: gname, n: rows.length,
      d1: cell('d1'), d5: cell('d5'), d20: cell('d20'),
      shapes,
      // what the group is doing, in one word, from the 20-day share
      tone: (() => {
        const c = cell('d20'); if (!c) return 'unknown';
        if (c.share >= 0.75) return 'broadly up';
        if (c.share <= 0.25) return 'broadly down';
        return 'mixed';
      })(),
    };
  });
}

/** Upcoming releases, grouped by day, highest impact first. */
export function eventRisk(events = [], nowMs = Date.now(), { days = 10 } = {}) {
  const end = nowMs + days * 864e5;
  const up = (events ?? []).filter(e => e.ms >= nowMs - 36e5 && e.ms <= end);
  const byDay = new Map();
  for (const e of up.sort((a, b) => a.ms - b.ms)) {
    const d = new Date(e.ms).toISOString().slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    const list = byDay.get(d);
    // the feed carries exact duplicates; one line per event per time is enough
    if (!list.some(x => x.event === e.event && x.ms === e.ms)) list.push(e);
  }
  return [...byDay.entries()].map(([date, list]) => ({
    date, n: list.length,
    // the next session is the one that actually constrains today's risk
    imminent: new Date(date).getTime() <= nowMs + 2 * 864e5,
    events: list,
  }));
}

/**
 * Feed health — what this screen actually knows, and what it is guessing at.
 *
 * WHY A MONITORING SURFACE NEEDS THIS. The event panel reported "No high-impact
 * releases scheduled in the next ten days" on a day when the calendar CSV had ended
 * twelve weeks earlier and the live top-up was returning nothing. Both sources were
 * dead and the page said the calendar was CLEAR. Absence of data rendered as absence
 * of risk is the single worst thing a monitor can do, and it is the failure this desk
 * has hit before on other feeds.
 *
 * So every source reports its own state, and "cannot tell" is a state.
 */
export function feedHealth(bundle = null, book = null, cal = null, nowMs = Date.now()) {
  const rows = [];
  const day = 864e5;

  const to = bundle?.to ? Date.parse(bundle.to + 'T00:00:00Z') : null;
  const lag = to == null ? null : Math.round((nowMs - to) / day);
  rows.push({ id: 'board', label: 'Price board',
    state: lag == null ? 'unknown' : lag <= 4 ? 'ok' : lag <= 8 ? 'warn' : 'bad',
    detail: lag == null ? 'no date on the bundle' : `${bundle.n?.toLocaleString?.() ?? '?'} sessions to ${bundle.to} (${lag}d ago)` });

  const carried = (bundle?.carried ?? []).length, missing = (bundle?.missing ?? []).length;
  rows.push({ id: 'series', label: 'Series',
    state: missing ? 'bad' : carried ? 'warn' : 'ok',
    detail: missing ? `${missing} missing: ${(bundle.missing ?? []).slice(0, 4).join(', ')}`
      : carried ? `${carried} carried forward from the previous run` : `${Object.keys(bundle?.series ?? {}).length} series, none carried` });

  rows.push({ id: 'book', label: 'Options book',
    state: !book?.ok ? 'bad' : book.stale ? 'warn' : 'ok',
    detail: !book?.ok ? 'not captured' : `${book.count} instruments, ${Math.round(book.ageH ?? 0)}h old${book.stale ? ' — past the 30h mark' : ''}` });

  // The one that matters: a calendar window entirely past the CSV's end depends
  // wholly on the live top-up, so zero events means the top-up said nothing, NOT
  // that the diary is empty.
  const csvEnd = cal?.csvLastMs ?? 0;
  const n = cal?.events?.length ?? 0;
  const beyondCsv = csvEnd > 0 && nowMs > csvEnd;
  rows.push({ id: 'calendar', label: 'Economic calendar',
    state: !cal ? 'bad' : (beyondCsv && n === 0) ? 'bad' : n ? 'ok' : 'warn',
    detail: !cal ? 'request failed'
      : (beyondCsv && n === 0) ? `file ends ${new Date(csvEnd).toISOString().slice(0, 10)} and the live feed returned nothing — treat as UNKNOWN, not clear`
      : n ? `${n} high-impact releases ahead` : 'no releases in range' });

  return { rows, bad: rows.filter(r => r.state === 'bad').length, warn: rows.filter(r => r.state === 'warn').length };
}

/**
 * The desk brief — what is happening, what is exposed, what we cannot see.
 *
 * WHY THIS EXISTS AFTER I REMOVED IT. Building the terminal I stripped out the
 * narrative along with the teaching, on the theory that a professional reader wants
 * numbers rather than prose. That was wrong and the owner said so. Synthesis and
 * hand-holding are different things: an institutional reader still wants the
 * conclusion first, they just do not want the mechanism explained on the way past.
 *
 * So this is the same computation as deskRead in a different register. Terse lines,
 * no sentences where a clause will do, no explaining what a real yield is. Every
 * line is still a computed number and a line with no number does not print.
 *
 * BLIND is the one no reference dashboard carries and every desk needs: what this
 * screen cannot currently see. A monitor that never reports its own blind spots is
 * worse than no monitor, because you trust it.
 */
export function deskBrief({ board = [], sectors = [], links = [], horizons = [], state = null, health = null } = {}) {
  const B = Array.isArray(board) ? board : [];
  const by = k => B.find(x => x.key === k) ?? null;
  const sec = k => (sectors ?? []).find(x => x.key === k) ?? null;
  const L = [];
  const pct = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  const bp = v => `${v > 0 ? '+' : ''}${Math.round(v)}bp`;

  if (state && !state.quiet) {
    const b = state.breadth ?? {};
    L.push({ tag: 'STATE', text: [state.state,
      b.sectorsUp != null ? `${b.sectorsUp}/${b.sectorsTotal} sectors up` : null,
      b.concentration != null ? `avg share vs index ${pct(b.concentration)}` : null].filter(Boolean).join(' · ') });
  }

  const t = by('tips'), be = by('bei'), n10 = by('us10y'), n2 = by('us2y');
  if (t && be && n10 && Math.abs(n10.change) >= 12) {
    const d = Math.abs(t.change) + Math.abs(be.change);
    const share = d > 0 ? Math.abs(t.change) / d : 0.5;
    L.push({ tag: 'DRIVING', text: `10y ${bp(n10.change)}, ${Math.round(share * 100)}% ${share >= 0.65 ? 'real' : 'breakevens'} (real ${bp(t.change)} / BE ${bp(be.change)})${n2 ? ` · 2y ${bp(n2.change)}` : ''}` });
  }

  const hit = ['xlre', 'xlu', 'xlf'].map(sec).filter(Boolean).filter(s => s.change < 0);
  if (hit.length >= 2) L.push({ tag: 'LANDED', text: hit.map(s => `${s.label} ${pct(s.change)}`).join(' · ') });

  // which single names the move actually reached -- the thing sectors cannot say
  const names = B.filter(x => x.group === 'Single names' && x.change != null);
  if (names.length >= 4) {
    const srt = names.slice().sort((a, b2) => b2.change - a.change);
    L.push({ tag: 'NAMES', text: `${srt.slice(0, 3).map(s => `${s.label} ${pct(s.change)}`).join(' · ')}  |  ${srt.slice(-3).map(s => `${s.label} ${pct(s.change)}`).join(' · ')}` });
  }

  const rev = (horizons ?? []).filter(h => h.shape === 'reversing');
  const stall = (horizons ?? []).filter(h => h.shape === 'stalling');
  if (rev.length || stall.length) L.push({ tag: 'ROLLING', text: [
    rev.length ? `${rev.length} reversing (${rev.slice(0, 3).map(r => r.label).join(', ')})` : null,
    stall.length ? `${stall.length} stalling (${stall.slice(0, 3).map(r => r.label).join(', ')})` : null].filter(Boolean).join(' · ') });

  // EXPOSED: what a move already on the board lands on next, named not explained
  const exp = [];
  const curve = by('curve');
  if (curve && curve.change <= -15) exp.push(`banks (curve ${bp(curve.change)})`);
  if (t && t.change >= 15) exp.push('long-duration equity and anything priced off the real rate');
  if ((by('dxy')?.change ?? 0) >= 1.5) exp.push('dollar-funded and commodity exporters');
  const ccc = by('ccc'), ig = by('ig');
  if (ccc && ig && ccc.change > 20 && Math.abs(ig.change) < 10) exp.push('weakest borrowers only, not the system');
  if (exp.length) L.push({ tag: 'EXPOSED', text: exp.join(' · ') });

  const apart = (links ?? []).filter(l => !l.weak && Math.abs(l.z) >= 3.1);
  if (apart.length) L.push({ tag: 'APART', text: apart.slice(0, 3).map(l => `${l.labelA}/${l.labelB}`).join(' · ') });

  const blind = (health?.rows ?? []).filter(r => r.state === 'bad');
  if (blind.length) L.push({ tag: 'BLIND', text: blind.map(r => `${r.label.toLowerCase()} — ${r.detail}`).join(' · '), bad: true });

  if (!L.length) L.push({ tag: 'STATE', text: 'Nothing on the board is outside its own ordinary range.' });
  return L;
}

/**
 * The live tape — the one thing on this page that is actually current.
 *
 * WHY IT EXISTS. Everything else the terminal draws comes from the daily-close bundle:
 * the board, the momentum shapes, the sector split, the links. That is the right source
 * for a twenty-session z-score and the wrong one for a page calling itself a monitor —
 * until now it fetched once on load, never refreshed, and showed last night's closes
 * with no indication that is what they were.
 *
 * HOW IT IS BUILT, AND WHY THAT WAY. The session open comes from the daily brief (48KB)
 * and does not change once the session is running, so it is read ONCE. The price comes
 * from the hedge-signals feed, which is 2.9KB for thirty-two instruments and can
 * therefore be polled without the egress bill noticing — this repo's cost is egress, and
 * polling the 48KB brief every minute would be roughly 70MB a day from a single tab left
 * open. Move is simply price minus open.
 *
 * `ageS` travels with each quote and is carried through, because a feed that has stopped
 * updating and a market that has stopped moving look identical on a screen. A quote past
 * `staleAfterS` is marked rather than drawn as live.
 */
/**
 * The price feed keys its own way, and not the board's. FX is the six-letter name with
 * a slash, but gold is XAU/USD, the Nasdaq is NAS100/USD and crude is WTICO/USD — so a
 * naive slash rule silently found four of eight instruments and quietly fell back to the
 * brief's older price for the rest, which looked like data rather than like a gap.
 */
const FEED_ALIAS = {
  GOLD: 'XAU/USD', XAUUSD: 'XAU/USD', SILVER: 'XAG/USD', PLATINUM: 'XPT/USD', COPPER: 'XCU/USD',
  NQ: 'NAS100/USD', SPX500: 'SPX500/USD', US30: 'US30/USD', US2000: 'US2000/USD',
  OIL: 'WTICO/USD', WTI: 'WTICO/USD', BRENT: 'BCO/USD',
};
const feedKeys = name => [name, FEED_ALIAS[name], name.length === 6 ? `${name.slice(0, 3)}/${name.slice(3)}` : null].filter(Boolean);

/**
 * `staleAfterS` defaults to ten minutes, not one.
 *
 * The upstream writes every ~5 minutes despite a comment claiming 3 seconds, so a
 * 3-minute threshold would paint the strip amber all day. A marker that fires
 * permanently teaches nothing — the same reason a one-session FRED lag is not flagged on
 * the board. The exact age travels with every row regardless, so the reader always has
 * the real number rather than a verdict derived from a made-up threshold.
 */
export function liveTape(opens = {}, prices = {}, { staleAfterS = 600, only = null } = {}) {
  const rows = [];
  for (const [name, o] of Object.entries(opens ?? {})) {
    if (only && !only.includes(name)) continue;
    const open = o?.session_open;
    let q = null;
    for (const k of feedKeys(name)) { if (prices?.[k]) { q = prices[k]; break; } }
    const px = q?.price ?? o?.current_price ?? null;
    if (!Number.isFinite(open) || !Number.isFinite(px) || open === 0) continue;
    const pip = q?.pip ?? (o?.ac === 'fx' ? (/JPY/.test(name) ? 0.01 : 0.0001) : 1);
    const ageS = Number.isFinite(q?.ageS) ? q.ageS : null;
    rows.push({
      name, open, price: px,
      move: +((px - open) / pip).toFixed(0),
      pct: +(((px / open) - 1) * 100).toFixed(2),
      unit: pip === 1 ? 'pts' : 'pips',
      dp: q?.digits ?? o?.dp ?? (pip === 1 ? 2 : 5),
      ageS, stale: ageS != null && ageS > staleAfterS,
      fromStream: !!q,          // false = the brief's own last price, which is older
      regime: o?.regime?.label ?? null,
      volPct: o?.vol_pct ?? null,
    });
  }
  return rows.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}

/**
 * Is the live layer actually live?
 *
 * A monitor whose feed has died must say so rather than keep drawing the last quote it
 * happened to receive. `worstAgeS` is the oldest quote on the strip, because one frozen
 * instrument is the tell that the stream is half-broken.
 */
export function tapeHealth(rows = [], { staleAfterS = 600 } = {}) {
  const live = (Array.isArray(rows) ? rows : []).filter(r => r.ageS != null);
  if (!rows.length) return { state: 'bad', detail: 'no live prices — the strip is showing nothing, not a quiet market' };
  if (!live.length) return { state: 'warn', detail: 'prices came from the daily brief, not the live feed — minutes old, not seconds' };
  const worstAgeS = Math.max(...live.map(r => r.ageS));
  const stale = rows.filter(r => r.stale).length;
  if (stale === rows.length) return { state: 'bad', worstAgeS, detail: `every quote is over ${staleAfterS}s old — the feed has stopped, the market has not necessarily` };
  if (stale) return { state: 'warn', worstAgeS, detail: `${stale} of ${rows.length} quotes are over ${staleAfterS}s old` };
  return { state: 'ok', worstAgeS, detail: `${rows.length} instruments, oldest quote ${worstAgeS}s` };
}

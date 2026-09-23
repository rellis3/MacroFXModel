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

/**
 * The 07:00 digest -- five lines from what the desk already knows, and the one
 * forecast it is allowed to make: today's expected range per instrument, built
 * only from tested range facts, posted so it can be scored at the close.
 *
 * Pure: takes the pieces the server has (regime, week map, watch states, the
 * calendar with the book's sizes, calls, yesterday's ledger) and returns text.
 */
const UNIT = { SPX500: [1, 'pts', 0], NQ: [1, 'pts', 0], GOLD: [1, '$', 0], USDJPY: [100, 'pips', 0], EURUSD: [10000, 'pips', 0], GBPUSD: [10000, 'pips', 0], AUDUSD: [10000, 'pips', 0], USDCAD: [10000, 'pips', 0] };
const disp = n => n.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2');
const amt = (v, unit) => unit === '$' ? `$${v}` : `${v} ${unit}`;

// Today's expected range per instrument: 1.0 ATR (the unconditional median
// day) plus the effect of every firing TESTED trigger that carries a one-session
// expectation; five-session expectations are spread evenly. Nothing else is
// allowed in -- no lean, no regime, no story.
export function expectedRanges(states, atrBy) {
  const out = {};
  for (const [inst, atr] of Object.entries(atrBy ?? {})) {
    if (!atr) continue;
    const drivers = []; let add = 0;
    for (const t of states ?? []) {
      if (!t.firing || t.kind !== 'tested' || !t.expect?.length) continue;
      const e = t.expect.find(x => x.inst === inst); if (!e || !Number.isFinite(e.effAtr)) continue;
      const perDay = e.window === 1 ? e.effAtr : e.effAtr / e.window;
      add += perDay; drivers.push({ id: t.id, label: t.label, effAtr: +perDay.toFixed(2) });
    }
    const [mult, unit, dp] = UNIT[inst] ?? [1, '', 2];
    const expAtr = +(1.0 + add).toFixed(2);
    out[inst] = { inst, atr: +(atr * mult).toFixed(dp), unit, expectedAtr: expAtr, expected: +(expAtr * atr * mult).toFixed(dp), drivers, realisedAtr: null };
  }
  return out;
}

export function formatDigest(d, { html = true } = {}) {
  const b = s => html ? `<b>${s}</b>` : s;
  const L = [];
  L.push(`${b('☀️ ' + d.dateLabel)} · the desk, 07:00`);
  // 1. regime + the week
  const RW = { goldilocks: 'Goldilocks', reflation: 'Reflation', stagflation: 'Stagflation', deflation: 'Deflation / risk-off' };
  if (d.regime) L.push(`${b('Backdrop')}: ${RW[d.regime.regime] ?? d.regime.regime}, month ${d.regime.months} — ${d.regime.what}.`);
  if (d.weekUnusual?.length) L.push(`${b('Unusual this week')}: ${d.weekUnusual.map(x => `${x.label} z ${x.z >= 0 ? '+' : ''}${x.z.toFixed(1)}`).join(', ')}; the rest ordinary.`);
  else if (d.weekUnusual) L.push(`${b('This week')}: nothing unusual in any macro series.`);
  // 2. firing
  const firing = (d.states ?? []).filter(t => t.firing);
  const tested = firing.filter(t => t.kind === 'tested'), described = firing.filter(t => t.kind !== 'tested');
  L.push(tested.length ? `${b('On, tested')}: ${tested.map(t => t.label + (t.expect?.length ? ` → ${t.expect.slice(0, 2).map(e => `${disp(e.inst)} ~${e.after}${e.unit}`).join(', ')}` : '')).join(' · ')}.` : `${b('On, tested')}: nothing.`);
  if (described.length) L.push(`${b('Described')}: ${described.map(t => t.label).join(' · ')}.`);
  // 3. today's prints
  if (d.prints?.length) L.push(`${b('Today')}: ` + d.prints.map(p => `${p.time} ${p.country} ${p.event}${p.estimate != null ? ` (${p.estimate} exp.${p.model ? `, model ${p.model}` : ''})` : ''}${p.size ? ` — ${p.size}` : ''}${p.call ? ` — you: ${p.call}` : ''}`).join(' · ') + '.');
  else L.push(`${b('Today')}: no high-impact print.`);
  // 4. expected range
  const er = Object.values(d.ranges ?? {}); const moved = er.filter(r => r.expectedAtr !== 1);
  if (er.length) L.push(`${b('Expected range')}: ${moved.length ? moved.map(r => `${disp(r.inst)} ~${amt(r.expected, r.unit)} (${r.expectedAtr}× a normal day: ${r.drivers.map(x => x.label).join(', ')})`).join(' · ') + (moved.length < er.length ? ` · the rest an ordinary day (${er.filter(r => r.expectedAtr === 1).map(r => `${disp(r.inst)} ~${r.expected}`).join(', ')})` : '') : `an ordinary day everywhere (${er.map(r => `${disp(r.inst)} ~${amt(r.expected, r.unit)}`).join(', ')})`}. Scored at the close.`);
  // 4b. the board: the lines either side, so the lines do not need the page.
  // Only the fitted ladder's medians and 75ths, with how often each is reached --
  // "reached on 45% of days" is a base rate (T7b), never a suggestion to trade there.
  // 4b. The board. The prices are the fitted ladder; the READ is the Asia
  // conditioner (T7b): Asia is finished by 07:00, and a wide or narrow Asia moves
  // the odds of tagging each side after 07:00 by up to 29pp on gold. That is the
  // only part of this that varies day to day -- the unconditional hit rates barely
  // move, which is why they are not printed. "Side" means which line is likelier to
  // be TAGGED, never which way the day closes: direction after the fact is a coin
  // flip on everything this desk has scored.
  if (d.board?.length) {
    const fmt = (v, dp) => v == null ? '?' : Number(v).toFixed(dp);
    const pc = v => v == null ? '?' : Math.round(v * 100) + '%';
    const CW = { high: 'the wide/narrow difference is a finding', low: 'weak', none: '' };
    const NL = '\n';
    const rows = d.board.map(r => {
      const head = `  ${disp(r.inst).padEnd(8)} ${fmt(r.open, r.dp)} · down ${fmt(r.dn1?.price, r.dp)} → ${fmt(r.dn2?.price, r.dp)} · up ${fmt(r.up1?.price, r.dp)} → ${fmt(r.up2?.price, r.dp)}`;
      const k = r.read; if (!k) return head;
      const asiaTxt = `Asia ${k.band}${k.asiaAtr != null ? ` (${Number(k.asiaAtr).toFixed(2)} ATR)` : ''}`;
      if (k.up == null || k.dn == null) return `${head}${NL}           ${asiaTxt} — ${k.why ?? 'no read from here'}`;
      // both sides against what the OTHER tercile would have given: a wide Asia
      // saying 21%/17% against 51%/45% is the useful read even with no side favoured
      const vs = k.alt ? ` (after a ${k.band === 'wide' ? 'narrow' : 'wide'} Asia they are ${pc(k.alt.up)} / ${pc(k.alt.dn)})` : '';
      const odds = `${pc(k.up)} up vs ${pc(k.dn)} down from here${vs}`;
      // the confidence line is about how much of the day is left, which is what was
      // tested; the tilt is reported with its size and no interval, because the
      // up-vs-down split never had one
      const note = k.finding ? ` [tested: ${CW[k.confidence] ?? k.confidence}]` : ' [the wide/narrow difference is not a finding here]';
      if (k.side == null) {
        const spent = k.alt && (k.up + k.dn) < (k.alt.up + k.alt.dn) - 0.2;
        return `${head}${NL}           ${asiaTxt} — ${spent ? 'the day has largely spent itself overnight: both sides unlikely' : 'neither side favoured'}, ${odds}${note}`;
      }
      const word = k.side === 'up' ? '▲ up' : '▼ down';
      const size = k.tilt === 'slight' ? 'a slight tilt' : 'a tilt';
      return `${head}${NL}           ${asiaTxt} — ${odds}; ${size} ${word} (${Math.abs(Math.round(k.gap * 100))}pp, untested on its own)${note}`;
    });
    const src = d.board[0]?.source === 'fitted-ladder' ? ` (fitted ladder${d.board[0].estimator ? ' ' + d.board[0].estimator : ''}, the lines the bots trade)` : '';
    L.push(`${b('The board')} — open, then the lines either side${src}. The read is which side is likelier to be TAGGED after 07:00 given Asia, not which way it closes:` + '\n' + rows.join('\n'));
  }
  // 4c. our own lean, never without its record
  if (d.leanRecord) {
    const R = d.leanRecord;
    L.push(`${b('Our record')}: the page's direction tags have been right ${R.hits} of ${R.n} at the next close (${Math.round(R.rate * 100)}%, interval ${Math.round(R.lo * 100)}-${Math.round(R.hi * 100)}%) — ${R.clears ? 'clear of a coin flip' : 'not yet clear of a coin flip'}. Read every lean on the page against that number.`);
  }
  // 5. yesterday scored
  const y = d.yesterday;
  if (y) L.push(`${b('Yesterday')}: ${[y.leans ? `page leans ${y.leans.hits} of ${y.leans.n} right` : null, y.ranges?.length ? `expected range vs realised: ${y.ranges.map(r => `${disp(r.inst)} ${r.expectedAtr}× → ${r.realisedAtr}×`).join(', ')}` : null, y.calls?.length ? `your calls: ${y.calls.map(c => `${c.event} ${c.result === 'hit' ? '✓' : c.result === 'miss' ? '✗' : '='}`).join(', ')}` : null].filter(Boolean).join(' · ') || 'nothing to score'}.`);
  return L.join('\n');
}

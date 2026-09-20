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
  if (er.length) L.push(`${b('Expected range')}: ${moved.length ? moved.map(r => `${disp(r.inst)} ~${r.expected} ${r.unit} (${r.expectedAtr}× a normal day: ${r.drivers.map(x => x.label).join(', ')})`).join(' · ') + (moved.length < er.length ? ` · the rest an ordinary day (${er.filter(r => r.expectedAtr === 1).map(r => `${disp(r.inst)} ~${r.expected}`).join(', ')})` : '') : `an ordinary day everywhere (${er.map(r => `${disp(r.inst)} ~${r.expected} ${r.unit}`).join(', ')})`}. Scored at the close.`);
  // 5. yesterday scored
  const y = d.yesterday;
  if (y) L.push(`${b('Yesterday')}: ${[y.leans ? `page leans ${y.leans.hits} of ${y.leans.n} right` : null, y.ranges ? `expected range vs realised: ${y.ranges.map(r => `${disp(r.inst)} ${r.expectedAtr}× → ${r.realisedAtr}×`).join(', ')}` : null, y.calls?.length ? `your calls: ${y.calls.map(c => `${c.event} ${c.result === 'hit' ? '✓' : c.result === 'miss' ? '✗' : '='}`).join(', ')}` : null].filter(Boolean).join(' · ') || 'nothing to score'}.`);
  return L.join('\n');
}

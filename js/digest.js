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

/**
 * Render the digest for Telegram.
 *
 * WHAT WAS WRONG WITH THE OLD ONE. It was correct and unreadable: every section ran
 * into the next with no blank line, and the board repeated a full sentence of caveat
 * under each of eight instruments — "[the wide/narrow difference is not a finding
 * here]", eight times — so the genuinely useful numbers were buried in boilerplate
 * that never changed. A caveat repeated eight times is not eight caveats, it is one
 * caveat and seven lines of noise.
 *
 * WHAT CHANGED. Sections are separated and led by an emoji so the eye can find them
 * on a phone. The board is two lines per instrument with the prices in monospace so
 * the columns line up. Anything that is identical on every row moved to a single
 * footnote, with a one-character marker per row pointing at it.
 *
 * Only <b> and <code> are used. Both have been in the Bot API since it gained HTML
 * parsing; newer tags like expandable blockquote would read better still but a parse
 * failure here means no morning brief at all, and this is not the place to find out.
 */
export function formatDigest(d, { html = true } = {}) {
  const b = s => html ? `<b>${s}</b>` : s;
  const c = s => html ? `<code>${s}</code>` : s;
  const S = [];                       // sections; joined by a BLANK line

  S.push(`${b('☀️ ' + d.dateLabel)} · the desk, 07:00`);

  // ── the backdrop ──────────────────────────────────────────────────────────
  const RW = { goldilocks: 'Goldilocks', reflation: 'Reflation', stagflation: 'Stagflation', deflation: 'Deflation / risk-off' };
  const back = [];
  if (d.regime) back.push(`${b('🌍 Backdrop')}  ${RW[d.regime.regime] ?? d.regime.regime}, month ${d.regime.months} — ${d.regime.what}.`);
  if (d.weekUnusual?.length) back.push(`${b('📈 This week')}  ${d.weekUnusual.map(x => `${x.label} z ${x.z >= 0 ? '+' : ''}${x.z.toFixed(1)}`).join(', ')}; the rest ordinary.`);
  else if (d.weekUnusual) back.push(`${b('📈 This week')}  nothing unusual in any macro series.`);
  if (back.length) S.push(back.join('\n'));

  // ── what is on, and what is on the calendar ───────────────────────────────
  const firing = (d.states ?? []).filter(t => t.firing);
  const tested = firing.filter(t => t.kind === 'tested'), described = firing.filter(t => t.kind !== 'tested');
  const on = [];
  on.push(tested.length
    ? `${b('✅ On, tested')}  ${tested.map(t => t.label + (t.expect?.length ? ` → ${t.expect.slice(0, 2).map(e => `${disp(e.inst)} ~${e.after}${e.unit}`).join(', ')}` : '')).join(' · ')}.`
    : `${b('✅ On, tested')}  nothing.`);
  if (described.length) on.push(`${b('📝 Described')}  ${described.map(t => t.label).join(' · ')}.`);
  on.push(d.prints?.length
    ? `${b('📅 Today')}  ` + d.prints.map(p => `${p.time} ${p.country} ${p.event}${p.estimate != null ? ` (${p.estimate} exp.${p.model ? `, model ${p.model}` : ''})` : ''}${p.size ? ` — ${p.size}` : ''}${p.call ? ` — you: ${p.call}` : ''}`).join(' · ') + '.'
    : `${b('📅 Today')}  no high-impact print.`);
  S.push(on.join('\n'));

  // ── expected range ────────────────────────────────────────────────────────
  const er = Object.values(d.ranges ?? {}); const moved = er.filter(r => r.expectedAtr !== 1);
  if (er.length) {
    const body = moved.length
      ? moved.map(r => `${disp(r.inst)} ~${amt(r.expected, r.unit)} (${r.expectedAtr}× normal: ${r.drivers.map(x => x.label).join(', ')})`).join(' · ')
        + (moved.length < er.length ? `\n     the rest an ordinary day — ${er.filter(r => r.expectedAtr === 1).map(r => `${disp(r.inst)} ~${amt(r.expected, r.unit)}`).join(' · ')}` : '')
      : `an ordinary day everywhere — ${er.map(r => `${disp(r.inst)} ~${amt(r.expected, r.unit)}`).join(' · ')}`;
    S.push(`${b('📏 Expected range')}  ${body}\n     Scored at the close.`);
  }

  // ── the board ─────────────────────────────────────────────────────────────
  // The prices are the fitted ladder (the lines the bots trade). The READ is the
  // Asia conditioner (T7b): Asia is finished by 07:00, and a wide or narrow Asia
  // moves the odds of tagging each side after 07:00 by up to 29pp on gold. "Side"
  // means which line is likelier to be TAGGED, never which way the day closes.
  if (d.board?.length) {
    const fmt = (v, dp) => v == null ? '?' : Number(v).toFixed(dp);
    const pc = v => v == null ? '?' : Math.round(v * 100) + '%';
    const rows = [];
    let anyFinding = false, anyNot = false;
    for (const r of d.board) {
      const k = r.read;
      rows.push(`${b(disp(r.inst))}  ${c(fmt(r.open, r.dp))}`);
      rows.push(`   ▼ ${c(fmt(r.dn1?.price, r.dp))} → ${c(fmt(r.dn2?.price, r.dp))}   ▲ ${c(fmt(r.up1?.price, r.dp))} → ${c(fmt(r.up2?.price, r.dp))}`);
      if (!k) continue;
      const asia = `Asia ${k.band}${k.asiaAtr != null ? ` ${Number(k.asiaAtr).toFixed(2)} ATR` : ''}`;
      if (k.up == null || k.dn == null) { rows.push(`   ${asia} — ${k.why ?? 'no read from here'}`); continue; }
      // the marker replaces a full sentence that was identical on every row
      const mark = k.finding ? (k.confidence === 'low' ? '†' : '✓') : '·';
      if (k.finding) anyFinding = true; else anyNot = true;
      const alt = k.alt ? ` (a ${k.band === 'wide' ? 'narrow' : 'wide'} Asia: ${pc(k.alt.up)}/${pc(k.alt.dn)})` : '';
      let verdict;
      if (k.side == null) {
        const spent = k.alt && (k.up + k.dn) < (k.alt.up + k.alt.dn) - 0.2;
        verdict = spent ? 'day largely spent overnight, both sides unlikely' : 'neither side favoured';
      } else {
        verdict = `${k.tilt === 'slight' ? 'slight tilt' : 'tilt'} ${k.side === 'up' ? '▲ up' : '▼ down'} ${Math.abs(Math.round(k.gap * 100))}pp, untested alone`;
      }
      rows.push(`   ${asia} · ${c(pc(k.up))} up / ${c(pc(k.dn))} down${alt} — ${verdict} ${mark}`);
    }
    const src = d.board[0]?.source === 'fitted-ladder' ? ` (fitted ladder${d.board[0].estimator ? ' ' + d.board[0].estimator : ''} — the lines the bots trade)` : '';
    // the separator cannot be "·" -- one of the markers IS "·", and the key read
    // "... for that pair · · it is not a finding there"
    const key = [anyFinding ? '✓ the wide/narrow difference is tested for that pair' : null,
                 anyNot ? '"·" it is not a finding there' : null,
                 anyFinding ? '† tested but weak' : null].filter(Boolean).join('  |  ');
    S.push(`${b('🎯 The board')}${src}\n   Which side is likelier to be TAGGED after 07:00 given Asia — not which way it closes.\n\n${rows.join('\n')}\n\n   ${key}`);
  }

  // ── the record, then yesterday ────────────────────────────────────────────
  const tail = [];
  if (d.leanRecord) {
    const R = d.leanRecord;
    tail.push(`${b('🧾 Our record')}  direction tags right ${R.hits} of ${R.n} at the next close — ${Math.round(R.rate * 100)}% (${Math.round(R.lo * 100)}–${Math.round(R.hi * 100)}%), ${R.clears ? 'clear of a coin flip' : 'NOT yet clear of a coin flip'}. Read every lean against that.`);
  }
  const y = d.yesterday;
  if (y) {
    const parts = [y.leans ? `page leans ${y.leans.hits}/${y.leans.n} right` : null,
      y.ranges?.length ? `range ${y.ranges.map(r => `${disp(r.inst)} ${r.expectedAtr}×→${r.realisedAtr}×`).join(', ')}` : null,
      y.calls?.length ? `your calls ${y.calls.map(cc => `${cc.event} ${cc.result === 'hit' ? '✓' : cc.result === 'miss' ? '✗' : '='}`).join(', ')}` : null,
    ].filter(Boolean);
    tail.push(`${b('📊 Yesterday')}  ${parts.join(' · ') || 'nothing to score'}.`);
  }
  if (tail.length) S.push(tail.join('\n'));

  return S.join('\n\n');
}

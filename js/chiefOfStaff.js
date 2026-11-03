/**
 * Agent 22: the chief of staff (plans/DESK_ANALYST_PIPELINE.md §9w). Two short Telegram notes a day that say what the
 * Desk Office holds, so the owner does not have to open ten panels to know whether anything needs them.
 *   morning   after the book (and its claims check) is written: the call, the biggest cards, what to fix before
 *             sharing, what the data officer held, the releases ahead, what research is waiting on the owner.
 *   evening   after the day is scored: the score against the placebo, what the watcher caught, the review's headline.
 * Built from what the desk already wrote: no model call, no new numbers. Pure. Tested in js/chiefOfStaff.test.mjs.
 */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f2 = x => (Number.isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(2) : '–');
const DIRW = { STRONG_LONG: 2, LONG: 1, SHORT: -1, STRONG_SHORT: -2 };
const CONV = { low: 0.6, medium: 0.8, high: 1 };

/** The largest live cards, by size × conviction × strength. */
export function topCards(cards, k = 4) {
  return Object.entries(cards ?? {}).filter(([, c]) => DIRW[c.rating] && c.size > 0)
    .sort((a, b) => b[1].size * (CONV[b[1].conviction] ?? 0.8) * Math.abs(DIRW[b[1].rating]) - a[1].size * (CONV[a[1].conviction] ?? 0.8) * Math.abs(DIRW[a[1].rating]))
    .slice(0, k).map(([n, c]) => `${DIRW[c.rating] > 0 ? '▲' : '▼'} ${n} ${c.rating.replace('_', ' ').toLowerCase()} (${c.conviction}, ${c.size})`);
}

/**
 * Morning. in: { date, run, claims, dataQuality, ops, theory, releases }. run is the day's desk run; claims the claims
 * check; ops the research-ops report; theory the latest theory-desk record; releases the economist's releases.
 */
export function morningText({ date, run, claims, ops, theory } = {}) {
  const b = run?.head?.book; if (!b) return null;
  const L = [`☀️ <b>Desk morning · ${esc(date)}</b>`];
  L.push(`<b>${esc(String(b.global?.tone ?? '').replace('_', '-').toUpperCase())}</b>: ${esc(b.headline ?? '')}`);
  const top = topCards(b.instruments); if (top.length) L.push(`Biggest cards: ${top.map(esc).join(' · ')}`);
  const todo = [];
  if (claims?.ok) {
    if (claims.verdict === 'hold') todo.push(`⛔ The claims check says HOLD the newsletter: ${esc(claims.review?.summary ?? 'see the Desk Office')}`);
    else if (claims.verdict === 'fix') todo.push(`✏️ Fix ${(claims.review?.items?.length ?? claims.numbers?.unsourced?.length ?? 0)} thing(s) in the newsletter before sharing (Atlas shows them).`);
  }
  const dq = run?.dataQuality; if (dq?.decision === 'hold') todo.push(`📉 The data officer flagged the pack: ${esc((dq.reasons ?? []).slice(0, 2).join('; ') || 'see the Desk Office')}`);
  if ((run?.failed ?? []).length) todo.push(`⚠️ Analysts that failed: ${run.failed.map(esc).join(', ')}`);
  if (todo.length) L.push(...todo); else L.push('✅ Nothing needs you before sharing.');
  const rel = run?.economist?.releases ?? [];
  if (rel.length) L.push(`📅 ${rel.map(r => `${esc(r.event)} ${new Date(r.at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })}`).join(' · ')}`);
  const r = [];
  if (ops?.readyToBank?.length) r.push(`${ops.readyToBank.length} result(s) ready to bank`);
  if (ops?.exploratory?.length) r.push(`${ops.exploratory.length} exploratory find(s) waiting on your call`);
  if (theory?.ok && theory.date && Date.now() - Date.parse(theory.writtenAt) < 3 * 864e5) r.push(`new theories this week: "${esc(theory.headline)}"`);
  if (r.length) L.push(`🔬 Research: ${r.join('; ')}.`);
  L.push('<i>Desk Office and Terminal for the detail · context, not orders</i>');
  return L.join('\n');
}

/** Evening. in: { date, score, reflection, watch, record }. */
export function eveningText({ date, score, reflection, watch, record } = {}) {
  if (!score) return null;
  const L = [`🌙 <b>Desk evening · ${esc(date)}</b>`];
  const vs = Number.isFinite(score.placebo?.p95) ? ` (placebo 95th ${f2(score.placebo.p95)})` : '';
  L.push(`Day score <b>${f2(score.S)} u</b>${vs} · ${score.scored}/${score.live} cards scored${score.eligible ? '' : ' · not counted in the test'}`);
  if (Number.isFinite(score.control?.unweighted)) L.push(`Single-analyst control ${f2(score.control.unweighted)} u`);
  const ev = watch?.events ?? [];
  if (ev.length) {
    const by = k => ev.filter(e => e.kind === k).map(e => e.inst);
    const z = by('zone'), t = by('target'), i = by('invalid');
    L.push(`🎯 Watcher: ${[z.length && `${z.length} in zone (${z.slice(0, 5).join(', ')})`, t.length && `${t.length} hit target (${t.slice(0, 5).join(', ')})`, i.length && `${i.length} invalidated (${i.slice(0, 5).join(', ')})`].filter(Boolean).join(' · ')}`);
  }
  if (reflection?.headline) L.push(`📝 ${esc(reflection.headline)}`);
  if (reflection?.lessons?.length) L.push(`Lesson: ${esc(reflection.lessons[0].lesson)}`);
  if (record?.eligibleDays != null) L.push(`Record: ${record.eligibleDays} counted day(s), mean ${f2(record.S?.mean)} u (judged at 120+)`);
  L.push('<i>Evening edition in the newsletter archive · context, not a verdict</i>');
  return L.join('\n');
}

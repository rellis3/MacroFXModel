/**
 * Phase 16: the claims checker (plans/DESK_ANALYST_PIPELINE.md §9v). Checks what the desk publishes (the desk
 * edition of the newsletter and the economist's briefs, which go into the shared PDF) against what the desk had.
 *
 * Two passes:
 *  1. Numbers (here, no model): every number in the published text is looked for in the run's own material (the
 *     book, the debate, the analysts' reports, the economist's playbooks). A number found nowhere, not even rounded,
 *     is listed as unsourced, with the sentence it sits in. Times, years and small counts are skipped.
 *  2. Claims (one model call, desk/roles/claims_checker.md): overstated certainty, an idea the Evidence Book tested
 *     null or underpowered written as if it works, forecast wording, contradictions with the book. The unsourced
 *     numbers from pass 1 go to the model too, so it can say which matter.
 * The verdict: clean, fix (something to change before sharing) or hold (do not share as written).
 *
 * Pure (the model call is passed in by the caller). Tested in js/claimsCheck.test.mjs.
 */

/** The published text: the issue's subject, standfirst, sections and ideas, and the economist's briefs. */
export function publishedText(run) {
  const i = run?.newsletter?.issue, parts = [];
  if (i) {
    parts.push(['subject', i.subject], ['standfirst', i.standfirst]);
    for (const s of i.sections ?? []) parts.push([`section: ${s.title}`, s.body]);
    for (const x of i.ideas ?? []) parts.push([`idea: ${x.instrument}`, [x.view, x.level, x.invalidation, x.why].filter(Boolean).join(' · ')]);
  }
  for (const b of run?.economist?.view?.briefs ?? []) parts.push([`release: ${b.event}`, [b.priced, b.sizeAndSpeed, b.ifHot, b.ifCold, b.bookAtRisk, b.watch].filter(Boolean).join(' ')]);
  return parts.filter(([, t]) => t);
}

/** Everything the desk had: the book, the debate, the analysts, the economist's inputs, as one string. */
export function sourceText(run) {
  const a = Object.values(run?.analysts ?? {}).filter(x => x.ok).map(x => x.report);
  return JSON.stringify([run?.head?.book, run?.debate, a, run?.economist?.releases, run?.packHealth, run?.dataQuality]);
}

const NUM = /[-+−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[-+−]?\d+(?:\.\d+)?/g;
/** The numbers worth checking in a text, each with its sentence. */
export function numbersIn(text) {
  const out = [], t = String(text ?? '');
  for (const sent of t.split(/(?<=[.!?;])\s+/)) {
    const clean = sent.replace(/\b\d{1,2}:\d{2}\b/g, ' ').replace(/\b(19|20)\d{2}-\d{2}-\d{2}\b/g, ' ');   // times and dates
    for (const m of clean.matchAll(NUM)) {
      const raw = m[0].replace(/[−]/g, '-').replace(/,/g, ''), v = Math.abs(parseFloat(raw));
      if (!Number.isFinite(v)) continue;
      if (Number.isInteger(v) && v <= 12 && !raw.includes('.')) continue;   // small counts ("six pairs", "3 bets")
      if (Number.isInteger(v) && v >= 1990 && v <= 2100) continue;          // years
      out.push({ raw, value: v, sentence: sent.trim().slice(0, 300) });
    }
  }
  return out;
}

/**
 * Is this number in the source? Either written the same way (sign aside), or a rounding of a more precise source
 * number (2.85 written as 2.9), or a fraction written as a percent (0.0137 as 1.37). A short number matching some
 * unrelated longer one by tolerance alone does not count: the source number must round to exactly what was written.
 */
export function sourced(n, src) {
  const dec = (n.raw.replace(/^[-+]/, '').split('.')[1] ?? '').length, want = n.value.toFixed(dec);
  if (src.tokens.has(want)) return true;
  for (const t of src.list) {
    const tdec = (t.split('.')[1] ?? '').length, v = Math.abs(parseFloat(t));
    if (tdec > dec && v.toFixed(dec) === want) return true;
    if (tdec >= dec + 2 && (v * 100).toFixed(dec) === want) return true;
  }
  return false;
}
const sourceNumbers = text => { const list = [...String(text).matchAll(NUM)].map(m => m[0].replace(/,/g, '').replace(/^[-+−]/, '')); return { list: [...new Set(list)], tokens: new Set(list) }; };

/** Pass 1. Returns { checked, unsourced: [{ where, raw, sentence }] }. */
export function numberCheck(run) {
  const src = sourceNumbers(sourceText(run));
  const unsourced = [], seen = new Set();
  let checked = 0;
  for (const [where, text] of publishedText(run)) {
    for (const n of numbersIn(text)) {
      checked++;
      if (sourced(n, src)) continue;
      const k = `${where}|${n.raw}`; if (seen.has(k)) continue; seen.add(k);
      unsourced.push({ where, raw: n.raw, sentence: n.sentence });
    }
  }
  return { checked, unsourced };
}

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const PROBLEMS = ['unsourced', 'overstated', 'tested-null', 'forecast', 'contradiction', 'other'];
/** Pass 2's reply: { verdict: clean|fix|hold, summary, items[{ quote, problem, severity, why, fix }] }. */
export function validateClaims(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const items = (Array.isArray(obj.items) ? obj.items : []).slice(0, 20).map(x => ({
    quote: str(x?.quote, 400), problem: PROBLEMS.includes(x?.problem) ? x.problem : 'other', severity: ['high', 'medium', 'low'].includes(x?.severity) ? x.severity : 'medium',
    why: str(x?.why, 500) ?? '', fix: str(x?.fix, 500) ?? '',
  })).filter(x => x.quote);
  const high = items.some(x => x.severity === 'high');
  let verdict = ['clean', 'fix', 'hold'].includes(obj.verdict) ? obj.verdict : (items.length ? 'fix' : 'clean');
  if (verdict === 'clean' && items.length) verdict = high ? 'hold' : 'fix';   // the items decide, not the label
  return { ok: true, value: { verdict, summary: str(obj.summary, 400) ?? '', items } };
}

/** The sections for the model call. */
export function claimsSections(run, numbers, evidence) {
  const nulls = (evidence ?? []).filter(e => e.verdict === 'null' || e.verdict === 'underpowered').map(e => `- [${e.id}, ${e.verdict}] ${e.claim}`).join('\n');
  return [
    ['What the desk published (each part labelled)', publishedText(run).map(([w, t]) => `### ${w}\n${t}`).join('\n\n')],
    ['Numbers in it that were not found in the desk\'s material (found by a script; rounding allowed)', numbers.unsourced.length ? numbers.unsourced.map(u => `- ${u.raw} (${u.where}): "${u.sentence}"`).join('\n') : '(none: every number was found)'],
    ["The desk's book", { headline: run?.head?.book?.headline, global: run?.head?.book?.global, currencies: run?.head?.book?.currencies, risks: run?.head?.book?.risks, cards: Object.fromEntries(Object.entries(run?.head?.book?.instruments ?? {}).map(([n, c]) => [n, { rating: c.rating, conviction: c.conviction, size: c.size }])) }],
    ["The analysts' reports", Object.fromEntries(Object.entries(run?.analysts ?? {}).filter(([, a]) => a.ok).map(([id, a]) => [id, { headline: a.report.headline, points: (a.report.points ?? []).map(p => p.claim) }]))],
    ['Ideas the Evidence Book tested and found null or underpowered', nulls || '(none)'],
  ];
}

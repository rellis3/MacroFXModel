/**
 * Phase 4, layer 5: the desk's memory (plans/DESK_ANALYST_PIPELINE.md §9k).
 *
 * After the day is scored (js/deskScore.js), a reviewer (desk/roles/reflection.md) reads the morning book next to
 * each card's score and writes what went right, what went wrong and at most five lessons. The next mornings' evidence
 * clerk reads the last few reflections through the Desk Pack feed desk-memory. This is how TradingAgents' reflection
 * step works; here every lesson is labelled a one-day anecdote, and nothing in it is evidence until a prereg tests it.
 *
 * Pure: builds the reviewer's sections and the memory text. Tested in js/deskReflect.test.mjs.
 */
import { cardDir } from './deskScore.js';

const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);

/** The sections the reviewer reads: the score, every live card with its result, and the morning's rulings. */
export function reflectionSections(run, score) {
  const b = run?.head?.book ?? {}, d = run?.debate ?? {};
  const cards = Object.entries(score?.cards ?? {}).map(([n, s]) => {
    const c = b.instruments?.[n] ?? {};
    return s.missing ? `${n}: ${c.rating} size ${c.size ?? '-'} · not scored (${s.missing})`
      : `${n}: ${c.rating} (${c.conviction ?? '-'}) size ${s.size ?? '-'} · R ${r2(s.R)} u · ${s.race > 0 ? 'lean-side p50 first' : s.race < 0 ? 'opposite p50 first' : 'neither p50 line reached first'} · why: ${String(c.why ?? '').slice(0, 220)}`;
  });
  const sum = [
    `Day score (size-weighted, 08:00-21:00 London, in u): ${score?.S ?? 'n/a'}. Unweighted: ${score?.unweighted ?? 'n/a'}.`,
    `Shuffled-book placebo for scale: mean ${score?.placebo?.mean ?? 'n/a'}, 95th percentile ${score?.placebo?.p95 ?? 'n/a'}.`,
    `Single-prompt control, unweighted: ${score?.control?.unweighted ?? 'n/a'}. Long-everything drift: ${score?.drift ?? 'n/a'}.`,
    `STRONG cards mean R ${score?.strong?.mean ?? 'n/a'} (n ${score?.strong?.n ?? 0}); other live cards ${score?.plain?.mean ?? 'n/a'} (n ${score?.plain?.n ?? 0}).`,
    `Race: ${score?.race?.leanFirst ?? 0} of ${score?.race?.resolved ?? 0} resolved cards touched the lean-side p50 first.`,
    score?.eligible ? 'This day counts in the pre-registered test.' : `This day does not count in the test (${score?.why ?? 'not eligible'}).`,
  ].join('\n');
  return [
    ['The score', sum],
    ['Every live card, with its result', cards.join('\n') || '(no live cards)'],
    ["The morning's global ruling", d.global?.view ? { tone: d.global.view.tone, conviction: d.global.view.conviction, summary: d.global.view.summary } : b.global ?? null],
    ["The morning's currency ruling", d.currency?.view ? Object.fromEntries(Object.entries(d.currency.view.currencies ?? {}).map(([k, v]) => [k, { bias: v.bias, why: v.why }])) : b.currencies ?? null],
    ["The risk desk's warnings and the Head's risks", { risks: b.risks ?? [], gaps: b.gaps ?? [], warnings: Object.values(d.risk ?? {}).flatMap(v => v?.view?.warnings ?? []).slice(0, 8) }],
  ];
}

/** Which cards moved the day most, either way, for the page (largest |size x R|). */
export function movers(run, score, k = 3) {
  const rows = Object.entries(score?.cards ?? {}).filter(([, s]) => !s.missing && s.size > 0).map(([n, s]) => ({ inst: n, rating: run?.head?.book?.instruments?.[n]?.rating, R: s.R, w: s.size * s.R }));
  rows.sort((a, b) => b.w - a.w);
  return { best: rows.slice(0, k), worst: rows.slice(-k).reverse().filter(r => r.w < 0) };
}

/**
 * The memory the next mornings read: the last few days' score and lessons, newest first, each labelled. Kept short:
 * the clerk gets it inside its slice budget.
 */
export function memoryFeed(days, { keep = 5 } = {}) {
  const rows = [...days].filter(x => x?.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, keep);
  return {
    label: 'one-day anecdotes from the desk\'s own end-of-day reviews; not evidence, not tested',
    asOf: rows[0]?.savedAt ?? null,
    days: rows.map(x => ({ date: x.date, dayScore: x.score?.S ?? null, placeboP95: x.score?.placebo?.p95 ?? null, counts: !!x.score?.eligible,
      headline: x.reflection?.headline ?? null, lessons: (x.reflection?.lessons ?? []).map(l => `${l.scope}${l.about ? ` (${l.about})` : ''}: ${l.lesson}`), watch: x.reflection?.watch ?? [] })),
  };
}

export { cardDir };

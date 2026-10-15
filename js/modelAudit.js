/**
 * Does this model's answer contradict something the desk has already tested?
 *
 * WHY THIS EXISTS. The whole value of the AI layer here is that it OBEYS the evidence
 * ledger: 155 pre-registered findings, 90 of them null, whose job is to stop the model
 * claiming things this desk has measured and falsified. Swapping in a cheaper model is
 * cheap to do and expensive to get wrong, because the failure is silent — you do not get
 * an error, you get fluent, confident analysis that quietly contradicts a banked null.
 * Without a check for that, "the cheap one seemed fine" is not evidence of anything.
 *
 * WHAT THIS IS. A SCREEN, not a judge. It cannot read, and it is not pretending to. It
 * finds sentences where the model is talking about the subject of a tested-null finding
 * AND using forecasting language in the same breath, and hands them to a person with the
 * ledger entry attached. Some flags will be fair comment and some will be noise.
 *
 * WHAT IT IS ACTUALLY RELIABLE FOR, and this is the point: running the SAME crude screen
 * over two models' answers to the SAME prompt. Whatever the screen's absolute error rate,
 * it is the same error applied to both, so a model that trips it three times as often is
 * genuinely worse at respecting the ledger. Comparative use is sound even where absolute
 * use is not — so `compareOutputs` is the function this module is for, and `auditText`
 * is the thing it is built out of.
 *
 * The prohibitions are mined from the ledger's own `use` fields — the desk's own words
 * ("Never a direction", "Do not pre-position in equities off a turn in short-term
 * rates") — rather than a list invented here. 72 of the 155 entries carry one.
 *
 * Pure: no fetch, no DOM. Tested in js/modelAudit.test.mjs.
 */

/** Words that carry no topic. Kept short on purpose; over-filtering loses the subject. */
const STOP = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'has', 'had', 'was', 'were', 'been',
  'are', 'its', 'it', 'for', 'not', 'but', 'any', 'all', 'one', 'two', 'can', 'will', 'does',
  'did', 'when', 'what', 'which', 'than', 'then', 'they', 'their', 'there', 'into', 'over',
  'more', 'most', 'less', 'only', 'same', 'each', 'other', 'every', 'some', 'such', 'about',
  'after', 'before', 'between', 'under', 'while', 'where', 'how', 'own', 'off', 'out', 'up',
  'down', 'day', 'days', 'week', 'weeks', 'next', 'last', 'here', 'desk', 'test', 'tested',
  'never', 'always', 'do', 'to', 'of', 'in', 'on', 'is', 'a', 'an', 'as', 'at', 'by', 'or',
  'be', 'so', 'if', 'no', 'yes', 'you', 'your', 'say', 'says', 'said', 'write', 'written',
]);

const words = s => String(s ?? '').toLowerCase().match(/[a-z][a-z0-9/-]{2,}/g) ?? [];

/** The content terms of a claim — what the finding is ABOUT. */
export function claimTerms(claim, { min = 4 } = {}) {
  const seen = new Set();
  for (const w of words(claim)) if (w.length >= min && !STOP.has(w)) seen.add(w);
  return [...seen];
}

/**
 * The explicit "never do this" sentences the desk wrote into its own ledger.
 *
 * Only `verdict: 'null'` and `'underpowered'` entries are mined. A validated finding's
 * `use` may also contain a prohibition ("use it for range, never direction"), and those
 * are kept too — a validated range result being quoted as a direction call is exactly the
 * mistake worth catching.
 */
export function prohibitions(ledger = []) {
  const out = [];
  for (const e of ledger) {
    const use = String(e?.use ?? '');
    if (!use) continue;
    for (const m of use.match(/[^.;]*\b(never|do not|don'?t|must not|is not a)\b[^.;]*[.;]?/gi) ?? []) {
      const sentence = m.trim();
      if (sentence.length < 12) continue;
      out.push({
        id: e.id, verdict: e.verdict, sentence,
        // the TOPIC comes from the claim, not from the prohibition sentence: "Never a
        // direction." has no subject of its own and would otherwise match nothing
        terms: claimTerms(e.claim),
        doc: e.doc ?? null,
      });
    }
  }
  return out;
}

/** Hedged or flatly asserted? Only the second kind is worth flagging. */
const FORECAST = /\b(will|won'?t|expect(?:ed|s)?|should|likely|set to|poised|points? to|signals?|predicts?|implies|suggests?|means? (?:a|the|that)|look(?:s|ing) for|target(?:s|ing)?|bias(?:ed)? (?:to|toward))\b/i;
const DIRECTION = /\b(rise|rising|rally|rallies|higher|up(?:side)?|fall|falling|drop|lower|down(?:side)?|bullish|bearish|squeeze|break ?out|break ?down|reversal|revert|bounce|sell-?off|strengthen|weaken)\b/i;
const HEDGE = /\b(null|untested|not tested|no edge|coin flip|context only|descriptive|never a direction|does not predict|not a (?:signal|lean|forecast)|tested here)\b/i;

const sentences = text => String(text ?? '')
  .replace(/\s+/g, ' ')
  .split(/(?<=[.!?])\s+(?=[A-Z("'‘“])/)
  .map(s => s.trim()).filter(Boolean);

/**
 * Screen one answer against the ledger.
 *
 * A sentence is flagged when it names at least `minTerms` content words from a tested
 * finding AND asserts something forward-looking AND is not itself hedged with the
 * desk's own caveat language. All three are required: naming the topic is not a
 * violation, forecasting in general is not a violation, and a sentence that says "tested
 * here and null" is the model doing exactly what it was asked.
 */
export function auditText(text, ledger = [], { minTerms = 2, maxFlags = 50 } = {}) {
  const rules = prohibitions(ledger);
  const sents = sentences(text);
  const flags = [];
  for (const s of sents) {
    if (!FORECAST.test(s) || !DIRECTION.test(s)) continue;
    if (HEDGE.test(s)) continue;
    const low = s.toLowerCase();
    for (const r of rules) {
      const hit = r.terms.filter(t => low.includes(t));
      if (hit.length < minTerms) continue;
      flags.push({
        id: r.id, verdict: r.verdict, matched: hit.slice(0, 6),
        sentence: s.length > 240 ? s.slice(0, 237) + '…' : s,
        prohibition: r.sentence.length > 160 ? r.sentence.slice(0, 157) + '…' : r.sentence,
        doc: r.doc,
      });
      break;   // one flag per sentence; the first matching finding is enough to review
    }
    if (flags.length >= maxFlags) break;
  }
  return {
    flags,
    counts: {
      sentences: sents.length,
      flagged: flags.length,
      byEntry: flags.reduce((a, f) => ((a[f.id] = (a[f.id] ?? 0) + 1), a), {}),
    },
    // never presented as a verdict -- see the header
    note: 'A screen, not a judge. Each flag is a sentence to read with the named finding open.',
  };
}

/**
 * The function this module is for: the same screen over two answers to the same prompt.
 *
 * Absolute flag counts are noisy. The DIFFERENCE between two models measured the same
 * crude way is not, which is what makes this usable for deciding whether a cheaper model
 * is safe on a ledger-carrying task.
 */
export function compareOutputs({ a, b, aLabel = 'A', bLabel = 'B' }, ledger = [], opts = {}) {
  const A = auditText(a, ledger, opts), B = auditText(b, ledger, opts);
  const ids = new Set([...Object.keys(A.counts.byEntry), ...Object.keys(B.counts.byEntry)]);
  const perEntry = [...ids].map(id => ({
    id, a: A.counts.byEntry[id] ?? 0, b: B.counts.byEntry[id] ?? 0,
  })).sort((x, y) => (y.a + y.b) - (x.a + x.b));
  return {
    [aLabel]: A.counts, [bLabel]: B.counts, perEntry,
    flags: { [aLabel]: A.flags, [bLabel]: B.flags },
    verdict: verdictLine(A.counts.flagged, B.counts.flagged, aLabel, bLabel),
  };
}

function verdictLine(a, b, aLabel, bLabel) {
  if (a === b) return `Both tripped the ledger screen ${a} time(s). No separation on this prompt.`;
  const worse = a > b ? aLabel : bLabel, better = a > b ? bLabel : aLabel;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return `${worse} tripped the screen ${hi} time(s) against ${better}'s ${lo}. `
       + `Same screen on both, so the gap is real even where any single flag may not be. `
       + `Read ${worse}'s flags before using it on a ledger-carrying task.`;
}

/**
 * The structural checks a cheap model fails first, and that need no ledger at all.
 *
 * Long-context instruction-following degrades in boring ways before it degrades in
 * interesting ones: the JSON comes back fenced, or truncated, or with the required keys
 * missing. Worth separating from ledger violations, because this kind is loud and fixable
 * with a retry while the other kind is silent.
 */
export function structuralCheck(text, { requireJson = true, requiredKeys = [] } = {}) {
  const problems = [];
  const t = String(text ?? '');
  if (!t.trim()) problems.push('empty reply');
  if (/^```/m.test(t)) problems.push('markdown fence around the JSON');
  if (requireJson) {
    let obj = null;
    try { obj = JSON.parse(t); } catch { /* try harder below */ }
    if (!obj) {
      const i = t.indexOf('{');
      if (i < 0) problems.push('no JSON object in the reply');
      else {
        try { obj = JSON.parse(t.slice(i, t.lastIndexOf('}') + 1)); }
        catch { problems.push('JSON present but unparseable (often truncation)'); }
        if (obj) problems.push('JSON had commentary around it');
      }
    }
    for (const k of requiredKeys) if (obj && !(k in obj)) problems.push(`missing required key: ${k}`);
  }
  return { ok: problems.length === 0, problems };
}

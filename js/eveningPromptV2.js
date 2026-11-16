/**
 * The Evening writer's second brief (owner, 2026-11-16): open with the day's story in time order, using the rule-built
 * timeline as structured input. OFF by default: the old brief stays in force until the owner approves a live run (it changes
 * the model call's input, so it changes what each evening issue costs). Turn on with EVENING_V2_PROMPT=1.
 *
 * The model polishes; it does not invent. A cause may be stated only when a headline in the supplied timeline supports it.
 */
export const eveningV2On = (env = process.env) => String(env?.EVENING_V2_PROMPT ?? '') === '1';

export const EVENING_V2_ADDENDUM = `

## This issue opens with the day in order (evening brief, version 2)

You are given THE DAY IN ORDER: a rule-built timeline of the day in London time (Asia, London, New York) with the prints, the wire headlines, the scheduled speakers and the busiest half hour of each big mover. Write the first section ("What happened") as the story of the day in that order, in plain sentences a reader can follow without the numbers beside them.

Rules for that section:
- State a cause ONLY if a headline or print in THE DAY IN ORDER supports it, and say which one (for example "after the 13:30 Canadian CPI"). If the timeline offers nothing near a move, describe the move as a puzzle ("no headline in the wire explains it") and do not guess.
- A scheduled event marked "no headline captured" was not seen: say it was not captured. Do not say it had no effect, and do not describe what was said.
- Do not name or quote anything that is not in the supplied material. Do not add direction claims, forecasts or trade views.
- Keep every claim's evidence label as before (Observed data, Model output, Untested interpretation).
- Keep "Into tomorrow" to ONE short line: the page after this one carries tomorrow's calendar from the data.
`;

/** Rough extra input per issue, for the cost note: characters of the addendum plus the timeline text, at about 4 characters a token. */
export const extraInputTokens = timelineText => Math.round((EVENING_V2_ADDENDUM.length + String(timelineText ?? '').length) / 4);

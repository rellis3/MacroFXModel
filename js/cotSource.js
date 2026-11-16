// js/cotSource.js: is a stale COT report OUR lag or the CFTC's? (the "Data check" line under the newsletter masthead, /api/cot-source)
//
// The CFTC measures positions on Tuesday and publishes them the Friday after (js/cotFreshness.js expectedReportDate says which report SHOULD
// be out). On 2026-11-16 the newsletter said "Speculative positioning is the report for 3 Nov, but the one for 10 Nov is out", yet the CFTC's own
// public API (publicreporting.cftc.gov, dataset gpe5-46if) still listed 3 Nov as its newest: the report was late at the source, not missing here.
// This compares three dates and says which side the gap is on.
//   expected  the Tuesday of the newest report that should be published by now
//   atSource  the newest report date the CFTC API actually lists (null when the probe failed)
//   held      the report date of the payload we serve

/** 'current' (we hold what is published and it is what was due), 'source-late' (the CFTC has not published the due report), 'ours-behind' (the CFTC has a newer report than we hold), 'unknown' (probe failed). */
export function cotSourceState({ expected, atSource, held }) {
  if (!atSource) return { state: 'unknown', note: 'The CFTC could not be reached to check what it has published.' };
  if (held && held < atSource) return { state: 'ours-behind', note: `The CFTC has published the report for ${atSource}; we still serve ${held}. The refresh on our side is behind.` };
  if (expected && atSource < expected) return { state: 'source-late', note: `The CFTC has not published the report for ${expected} yet; its newest is ${atSource}, which is what we hold.` };
  return { state: 'current', note: `We hold the CFTC's newest report (${atSource}).` };
}

// js/cogFindings.js: the findings section of cog-chart.html. One entry per question tested on the rate legs (C.OG's SOFR - Euribor line and its relatives),
// each checked against the results file named in `source`. Add a row here when a new result is banked (and in .claude/skills/cog-knowledge/references/verdicts.md).
// verdict: works | real-not-tradeable | no-edge | underpowered (the plain-English buckets; verdictWords keeps the file's own word).

export const VERDICTS = {
  'works': { label: 'Works', means: 'reproduced or validated' },
  'real-not-tradeable': { label: 'Real, not tradeable', means: 'the effect exists, but it is same-time only or gives no edge after costs' },
  'no-edge': { label: 'No edge', means: 'tested properly and nothing there' },
  'underpowered': { label: 'Can\'t tell yet', means: 'not enough data to rule it in or out' },
};

export const THEMES = {
  'what-the-line-is': 'What the line is',
  'does-it-lead-nasdaq': 'Does it lead Nasdaq?',
  'his-setups-and-signals': 'His setups and signals on the line',
  'other-assets': 'Other assets (FX, gold, indices)',
  'macro-rates-context': 'Wider rates and macro tests',
};

export const BOTTOM_LINE = ['Findings are being checked against their results files and will be listed here.'];

export const FINDINGS = [];

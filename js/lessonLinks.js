/**
 * Board condition → the Theory Lab lesson section that explains its mechanism.
 *
 * Only conditions the live board actually displays, and only lessons that actually
 * explain them. Anchors must be ids that already exist in the lesson file (lesson
 * headings carry no ids, so these point at story blocks / interactive charts inside
 * the relevant section). `evidence` is the deskEvidence ledger id the lesson cites
 * via data-evidence, where one fits. js/lessonLinks.test.mjs checks every file,
 * anchor and citation exists.
 *
 * The Theory Lab is the separate 'education' login zone, so a dashboard-only user
 * clicking through lands on its login page — hence the link says where it goes.
 *
 * Pure data + one string helper. No fetch, no DOM.
 */

export const LESSON_LINKS = {
  // Yield Curves card: a 2s10s row whose status reads "Inverted".
  curveInverted: {
    href: '/theory-lab/lessons/yield-curve-growth-expectations.html#yc-grid',
    label: 'What a 2s10s inversion is (and isn’t) pricing',
    evidence: 'curve-inversion',
  },
  // OI card GEX stat: negative net GEX ("Amplifying") — dealers short gamma.
  gexNegative: {
    href: '/theory-lab/lessons/gamma-exposure-dealer-hedging.html#story-1',
    label: 'Why short dealer gamma amplifies moves',
    evidence: 'gex-range',
  },
  // OI card IV reads: front-expiry IV above back-expiry IV ("IV term … inverted").
  ivTermInverted: {
    href: '/theory-lab/lessons/vega-volatility-surface.html#story-2',
    label: 'What an inverted vol term structure means',
    evidence: 'vix-inversion',
  },
  // Key indicator row: VIX above 25 (the board's red threshold).
  vixElevated: {
    href: '/theory-lab/lessons/vix-uncertainty-not-fear.html#vx-svg',
    label: 'A VIX reading is an expected-move size, not a direction',
  },
};

// Small, muted "Theory Lab: why →" link for a mapped condition; '' for an unknown key.
export function lessonLinkHTML(key, style = '') {
  const l = LESSON_LINKS[key];
  if (!l) return '';
  return `<a href="${l.href}" target="_blank" rel="noopener" title="${l.label} — opens the Theory Lab (separate login)" style="font-size:9px;font-weight:400;color:var(--text3);text-decoration:none;white-space:nowrap;${style}">Theory Lab: why →</a>`;
}

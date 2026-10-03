// Desk material in the Theory Lab. Everything that is about THIS desk — its tested
// verdicts, its own record, its systems, its live data — is wrapped in
//   <!-- DESK:START --> … <!-- DESK:END -->
// and the server strips those blocks for anyone without the education ADMIN login,
// so the curriculum can be shared while the owner still sees the full version at
// the same address. Pure functions; checked by js/deskStrip.test.mjs.

export const DESK_START = '<!-- DESK:START -->';
export const DESK_END = '<!-- DESK:END -->';
const DESK_BLOCK_RE = /<!-- DESK:START -->[\s\S]*?<!-- DESK:END -->\n?/g;

export function stripDesk(html) {
  const src = String(html);
  const out = src.replace(DESK_BLOCK_RE, '');
  if (out === src) return out;
  // Removing a desk-only section or quiz question would leave gaps ("Section 05" then
  // "Section 07", "Q4" then "Q6"), so renumber what is left, in the page's own format.
  let sec = 0, q = 0;
  return out
    .replace(/(<div class="tl-section-mark"><span>Section )(\d+)(<\/span>)/g,
      (m, a, n, b) => a + String(++sec).padStart(n.length, '0') + b)
    .replace(/(<summary>Q)(\d+)(\.)/g, (m, a, n, b) => a + (++q) + b);
}

/** Markers must pair up and never nest; returns a list of problems (empty = fine). */
export function deskMarkerProblems(html) {
  const problems = [];
  let open = false;
  for (const m of String(html).matchAll(/<!-- DESK:(START|END) -->/g)) {
    if (m[1] === 'START') { if (open) problems.push('nested DESK:START at ' + m.index); open = true; }
    else { if (!open) problems.push('DESK:END without START at ' + m.index); open = false; }
  }
  if (open) problems.push('unclosed DESK:START');
  return problems;
}

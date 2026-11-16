/** js/newsletterTermV2Wrap.js: word wrapping for the poster. Wraps at word boundaries, never cuts a word. A word longer than a line gets a line of its own. */
export function wrapLines(s, n) {
  const w = String(s ?? '').split(/\s+/).filter(Boolean), L = []; let c = '';
  for (const x of w) { if ((c + ' ' + x).trim().length > n && c) { L.push(c); c = x; } else c = (c + ' ' + x).trim(); }
  if (c) L.push(c); return L;
}

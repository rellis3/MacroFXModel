// Theory Lab URL normalisation. Pure; used by server.js, checked by js/theoryLabUrl.test.mjs.
//
// Every rule that decides who may see a Theory Lab page (the desk strip, the admin-only 404s, the
// institutional block, the visual-guide strip) is keyed on the page's ".html" path. express.static is
// configured with `extensions: ['html']`, so /theory-lab/replay serves the same file as
// /theory-lab/replay.html but WITHOUT passing any of those rules. Rewriting the extensionless form to
// the .html form before the rules run closes that, and makes /theory-lab/ the start page (index.html).
//
// Returns { redirect } for /theory-lab (so relative links resolve), { path } with the path to serve,
// or null when the request is not for a page that needs touching.
export function normaliseTheoryLabPath(p) {
  if (p === '/theory-lab') return { redirect: '/theory-lab/' };
  if (p === '/theory-lab/') return { path: '/theory-lab/index.html' };
  // a page, or a lesson, asked for without its extension. Anything with a dot (assets, audio, json) is left alone.
  if (/^\/theory-lab\/(?:[^/.]+|lessons\/[^/.]+)$/.test(p)) return { path: p + '.html' };
  return null;
}

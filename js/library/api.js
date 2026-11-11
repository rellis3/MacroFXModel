// Thin client for the /api/library/* contract (plans/PAPER_LIBRARY.md). Same-origin, cookie auth.
async function j(url, opt) {
  let r;
  const go = () => fetch(url, Object.assign({ credentials: 'same-origin' }, opt));
  try { r = await go(); }
  catch (e1) {   // "Failed to fetch": the connection dropped (phone signal, a server restart). A GET is safe to try once more.
    const get = !opt || !opt.method || String(opt.method).toUpperCase() === 'GET';
    if (get) { await new Promise(res => setTimeout(res, 900)); try { r = await go(); } catch { /* fall through */ } }
    if (!r) { const e = new Error('Could not reach the server (the connection dropped). Check your signal and reload.'); e.network = true; throw e; }
  }
  if (r.status === 401 || (r.redirected && /\/login/.test(r.url))) { const e = new Error('Please sign in again'); e.auth = true; e.status = 401; throw e; }
  let d = null; try { d = await r.json(); } catch { /* not json */ }
  if (!r.ok || !d || d.ok === false) { const e = new Error((d && d.error) || ('Request failed (' + r.status + ')')); e.status = r.status; throw e; }
  return d;
}
const post = (url, body) => j(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const q = o => Object.entries(o).filter(([, v]) => v != null && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
export const api = {
  papers: () => j('/api/library/papers'),
  paper: id => j('/api/library/paper?' + q({ id })),
  search: (text, tags, sources, years, limit = 40) => j('/api/library/search?' + q({ q: text, tags: (tags || []).join(','), sources: (sources || []).join(','), years: (years || []).join(','), limit })),
  index: () => j('/api/library/index'),
  find: (text, o = {}) => j('/api/library/find?' + q({ q: text, n: o.n || 40, topics: (o.topics || []).join(','), sources: (o.sources || []).join(','), years: (o.years || []).join(',') })),
  concepts: () => j('/api/library/concepts'),
  reviewConcept: body => post('/api/library/concepts/review', body),
  librarian: q => post('/api/research-pod/librarian', { q, n: 6 }),
  todo: () => j('/api/library/todo'),
  readNext: () => j('/api/library/read-next'),
  listen: (id, mode) => j('/api/library/listen?' + q({ id, mode })),
  progress: body => post('/api/library/progress', body),
  tags: body => post('/api/library/tags', body),
  makeCase: id => post('/api/library/case', { id }),
  makeAudio: id => post('/api/library/audio', { id, mode: 'briefing' }),
  audioStatus: id => j('/api/library/audio?' + q({ id, status: 1 })).then(d => d.briefing),
  pdfUrl: id => '/api/library/pdf?' + q({ id }),
};

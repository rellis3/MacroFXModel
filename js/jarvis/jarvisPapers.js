// js/jarvis/jarvisPapers.js: GET /api/jarvis/papers?q=&limit= (owner-only, read-only, no model call). BM25 over the paper library (KV research_pod_papers, the same store the
// research hub reads) plus keyword-matched Evidence Book entries. The index is held in memory (term counts only) and rebuilt when the library size or newest stamp changes.
import { buildIndex, search, matchEvidence } from './paperRank.js';

const KEY = 'research_pod_papers';
export async function mount(app, deps) {
  const { kv, ownerOnly } = deps;
  let idx = null, sig = '', checkedAt = 0, evidence = null;
  async function index() {
    if (idx && Date.now() - checkedAt < 60_000) return idx;
    const raw = await kv.get(KEY); let lib = []; try { lib = raw ? JSON.parse(raw) : []; } catch { lib = []; }
    if (!Array.isArray(lib)) lib = [];
    const stamp = lib.reduce((m, p) => Math.max(m, Number(p?.updatedAt ?? p?.addedAt ?? p?.at ?? 0) || 0), 0), s = `${lib.length}:${stamp}`;
    if (!idx || s !== sig) { idx = buildIndex(lib); sig = s; }
    lib = null; checkedAt = Date.now(); return idx;
  }
  app.get('/api/jarvis/papers', ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const q = String(req.query.q ?? '').slice(0, 400), limit = Math.min(20, Math.max(1, Number(req.query.limit) || 8));
    try {
      if (!evidence) evidence = (await import('../deskEvidence.js')).DESK_EVIDENCE;
      let ix = null, note = null;
      try { ix = await index(); } catch (e) { note = `library not readable: ${e.message}`; }
      res.json({ ok: true, q, indexed: ix?.n ?? 0, note: note ?? (ix?.n ? null : 'the paper library is empty or not loaded'), papers: ix ? search(ix, q, limit) : [], ourTests: matchEvidence(evidence, q, 6) });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

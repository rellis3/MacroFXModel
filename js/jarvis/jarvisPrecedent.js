// js/jarvis/jarvisPrecedent.js: GET /api/jarvis/precedent?family=&market= (owner-only, no-store). How a market moved in the 30 minutes after past releases of one family, from the Release Reaction
// record (/api/release-layer1 and its paths), in the Event replay's own unit. Description only; no model call.
import { buildPrecedent, resolveKeys } from './precedentCore.js';

const TTL = 3 * 3600e3;
export async function mount(app, deps) {
  const cache = new Map();
  app.get('/api/jarvis/precedent', deps.ownerOnly, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { family, market } = resolveKeys(req.query.family, req.query.market);
      if (!family || !market) return res.status(400).json({ ok: false, error: 'unknown family or market' });
      const key = `${family}|${market}`, hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL) return res.json(hit.v);
      const rows = (await deps.selfJson('/api/release-layer1')).rows ?? [];
      const v = await buildPrecedent(rows, family, market, async id => (await deps.selfJson(`/api/release-layer1/paths?id=${encodeURIComponent(id)}`)).paths);
      cache.set(key, { at: Date.now(), v }); res.json(v);
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

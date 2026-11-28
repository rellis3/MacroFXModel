// js/realYieldsRoutes.js: GET /api/real-yields, the real-yield layer beside the nominal curve (logic js/realYields.js, pure and tested).
// Inputs: the /api/chapters series already held in memory (FRED DFII5, DFII10, T5YIE, T10YIE, DGS5, DGS10; the same prints the curve
// boards use) and two R2 archive series (archive/series/g10_yields/AU_10Y and AU_10Y_REAL, js/macroCapture.js). One cached build per
// hour, one build in flight. Read only; no new external host.
import { buildRealYields } from './realYields.js';

const TTL = 3600e3, KEEP_POINTS = 400;

export function mountRealYields(app, { chapters, r2GetJSON = null, r2Ok = () => false, now = () => Date.now(), log = console }) {
  let val = null, at = 0, p = null;
  const au = async id => {
    if (!r2GetJSON || !r2Ok()) return null;
    try { const j = await r2GetJSON(`archive/series/g10_yields/${id}.json`); return Array.isArray(j?.points) ? j.points.slice(-KEEP_POINTS) : null; } catch (e) { return null; }
  };
  const build = async () => {
    const S = (await chapters().catch(e => { log.warn?.('[real-yields] chapters', e.message); return null; })) ?? {};
    const [real10, nom10] = await Promise.all([au('AU_10Y_REAL'), au('AU_10Y')]);
    return { ...buildRealYields({ us: { real5: S.real5, real10: S.real10, bei5: S.bei5, bei10: S.bei10, nom5: S.y5, nom10: S.y10 }, au: { real10, nom10 } }, { now: now() }), builtAt: new Date(now()).toISOString() };
  };
  const get = async () => {
    if (val && now() - at < TTL) return val;
    if (p) return p;
    p = build().then(v => { if (v.ok || !val) { val = v; at = now(); } return val; }).finally(() => { p = null; });
    return p;
  };
  app.get('/api/real-yields', async (_req, res) => {
    try { const j = await get(); res.set('Cache-Control', 'public, max-age=600'); res.json(j); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  return { get };
}

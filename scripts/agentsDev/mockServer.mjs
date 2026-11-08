// Dev / test server for the Bot Config Agents tab: serves the repo's static files and mocks GET /api/agents and POST /api/agents/toggle with the REAL
// payload builder (js/agentsApi.js) and the REAL switch store (js/agentSettings.js) over an in-memory KV. No model call, no network, no production data.
// Not shipped: nothing references it.   node scripts/agentsDev/mockServer.mjs [port]
//   POST /__fail?on=1   make the next toggles answer 500 (to see the error state);  POST /__fail?on=0 clears it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAgentsPayload } from '../../js/agentsApi.js';
import { createToggleStore, validateToggleBody, KV_KEY } from '../../js/agentSettings.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

export function startServer(port = 0, { env = {} } = {}) {
  const mem = new Map();
  const kv = { getStrict: async k => mem.get(k) ?? null, get: async k => mem.get(k) ?? null, put: async (k, v) => { mem.set(k, v); } };
  const store = createToggleStore({ kv, env, ttlMs: 0 });
  const state = { fail: false, posts: [] };
  const capsRaw = { library_math_v1: { used: 1440 }, library_figs_v1: { used: 37 }, library_librarian_v1: { used: 12 } };
  const models = {
    'research-pod': { provider: 'deepseek', model: 'deepseek-chat' }, 'research-head': { provider: 'anthropic', model: 'claude-sonnet-5' }, 'research-vision': { provider: 'anthropic', model: 'claude-sonnet-5' },
    'research-reader': { provider: 'deepseek', model: 'deepseek-chat' }, 'library-math': { provider: 'deepseek', model: 'deepseek-chat' }, 'library-figs': { provider: 'deepseek', model: 'deepseek-chat' },
    'library-librarian': { provider: 'deepseek', model: 'deepseek-chat' }, 'desk-analyst': { provider: 'anthropic', model: 'claude-sonnet-5' }, 'desk-head': { provider: 'anthropic', model: 'claude-sonnet-5' },
    'desk-news': { provider: 'deepseek', model: 'deepseek-chat' },
  };
  const jobs = { researchPod: { pageOn: true, railwayOn: true, lastRunAt: Date.parse('2026-11-08T09:04:00Z') }, deskRun: { pageOn: false, railwayOn: true, lastRunAt: null }, newsWire: { pageOn: true, railwayOn: true, lastRunAt: null } };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname;
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
    try {
      if (p === '/api/agents' && req.method === 'GET') return json(200, buildAgentsPayload({ toggles: await store.all(), capsRaw, models, jobs, stats: { calls: 0 }, spendTodayUsd: 0.37 }));
      if (p === '/api/agents/toggle' && req.method === 'POST') {
        let body = ''; for await (const c of req) body += c;
        let o = null; try { o = JSON.parse(body); } catch { /* bad json */ }
        state.posts.push(o);
        if (state.fail) return json(500, { ok: false, error: 'kv write failed (simulated)' });
        const v = validateToggleBody(o); if (!v.ok) return json(400, { ok: false, error: v.error });
        const r = await store.set(v.id, v.value);
        return json(200, { ok: true, id: v.id, value: r.value, source: 'setting', at: r.at, toggles: await store.all() });
      }
      if (p === '/__fail') { state.fail = u.searchParams.get('on') === '1'; return json(200, { ok: true, fail: state.fail }); }
      if (p === '/__state') return json(200, { posts: state.posts, saved: mem.get(KV_KEY) ?? null });
      if (p.startsWith('/api/')) return json(404, { ok: false, error: 'not mocked' });
      const rel = decodeURIComponent(p === '/' ? '/bot-config.html' : p);
      const file = path.join(root, rel);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
    } catch (e) { json(500, { ok: false, error: e.message }); }
  });
  return new Promise(resolve => srv.listen(port, '127.0.0.1', () => resolve({ srv, port: srv.address().port, state, mem })));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await startServer(Number(process.argv[2]) || 8099);
  console.log(`agents dev server on http://127.0.0.1:${port}/bot-config.html#tab-agents`);
}

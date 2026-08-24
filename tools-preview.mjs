/**
 * Local preview: serves YOUR working-copy HTML/JS, proxies every /api/* call to
 * the live Railway origin. Lets you see today.html's new tabbed drawer against
 * real market data before anything is committed or deployed.
 *
 *   node preview.mjs "<repo path>" [port]
 *   → http://localhost:8850/today.html
 *
 * READ-ONLY BY DEFAULT. Anything that would write to production (POST/PUT/DELETE,
 * and the handful of GETs that trigger work server-side) is refused locally and
 * logged, so opening the page cannot fire a Telegram alert, rebuild a book, or
 * overwrite a KV key. Flip ALLOW_WRITES only if you mean it.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT   = process.argv[2];
const PORT   = Number(process.argv[3] ?? 8850);
const ORIGIN = process.env.RAILWAY_ORIGIN || 'https://macrofxmodel-production.up.railway.app';
const ALLOW_WRITES = process.env.ALLOW_WRITES === '1';

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

// GETs that are actually commands — refused even though they're not POSTs.
const SIDE_EFFECTING = /\/(refresh|reload|rebuild|run|run-now|fetch-now|send|test|scan|clear-stale|reanalyse|broadcast|backfill|train|sync|ack|capture-now)(\/|$|\?)/i;

let proxied = 0, blocked = 0;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');

  if (url.pathname.startsWith('/api/')) {
    const write = req.method !== 'GET' && req.method !== 'HEAD';
    if (!ALLOW_WRITES && (write || SIDE_EFFECTING.test(url.pathname))) {
      blocked++;
      console.log(`  ✋ blocked ${req.method} ${url.pathname}`);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'blocked by local preview (read-only)' }));
    }
    try {
      const upstream = await fetch(ORIGIN + url.pathname + url.search, {
        method: req.method,
        headers: { accept: req.headers.accept ?? '*/*' },
        redirect: 'manual',
      });
      proxied++;
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      });
      return res.end(body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: 'proxy: ' + e.message }));
    }
  }

  // Everything else comes off YOUR disk — the whole point of the exercise.
  const rel  = normalize(url.pathname === '/' ? '/today.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found: ' + rel);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Local preview  →  http://localhost:${PORT}/today.html`);
  console.log(`  Files from     :  ${ROOT}`);
  console.log(`  API proxied to :  ${ORIGIN}`);
  console.log(`  Mode           :  ${ALLOW_WRITES ? '⚠ WRITES ALLOWED' : 'read-only (writes blocked)'}\n`);
});

setInterval(() => {
  if (proxied || blocked) { console.log(`  … ${proxied} api calls proxied, ${blocked} blocked`); proxied = blocked = 0; }
}, 15000).unref?.();

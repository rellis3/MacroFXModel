#!/usr/bin/env node
// The shared research shelf, read from a Claude session (laptop or phone): the same papers, rooms and drop-box queue the
// research hub (research.html) and its rooms use. Server route: /api/research-shared/* (server.js, js/researchHub.js).
//
// Token: env RESEARCH_READ_TOKEN (or the laptop's ROE_PUSH_TOKEN), the same value as the Railway variable. Never put it in a
// file in the repo or on the command line. Base URL: env RESEARCH_BASE_URL (default: production).
// Papers are private: print them into the conversation or the session scratchpad, never into the repo (the repo is public).
//
//   node shelf.mjs papers "rough volatility hurst"        library search, each paper's desk notes (claim, mechanism, data, effect, caveats)
//   node shelf.mjs paper <id> [--full]                     one paper's notes; --full adds its full text when the library holds it
//   node shelf.mjs rooms                                   every research room: question, status, the Head's latest verdict and next step
//   node shelf.mjs queue [queued|done|all]                 the hub's drop box (videos, links, pictures, text waiting for learn-intake)
//   node shelf.mjs image <id> <out-file>                   save a dropped picture (then read it)
//   node shelf.mjs done <id> --path <note path> [--note "one line"] [--status done|failed|dropped]   mark a drop-box item processed
const BASE = (process.env.RESEARCH_BASE_URL || 'https://macrofxmodel-production.up.railway.app').replace(/\/+$/, '');
const TOKEN = (process.env.RESEARCH_READ_TOKEN || process.env.ROE_PUSH_TOKEN || '').trim();
const [cmd, ...rest] = process.argv.slice(2);
const flag = name => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const die = msg => { console.error(msg); process.exit(1); };

if (!cmd || cmd === 'help') die('usage: shelf.mjs papers "<q>" | paper <id> [--full] | rooms | queue [status] | image <id> <out> | done <id> --path <p> [--note <n>] [--status s]');
if (TOKEN.length < 24) die('No token: set RESEARCH_READ_TOKEN (or ROE_PUSH_TOKEN) in the environment, the same value as on Railway. On a phone/cloud session, add it to the environment settings.');

async function call(pathname, { method = 'GET', body = null, raw = false } = {}) {
  const r = await fetch(`${BASE}${pathname}`, { method, headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) { if (!r.ok) die(`${r.status}: ${await r.text()}`); return Buffer.from(await r.arrayBuffer()); }
  const d = await r.json().catch(() => ({ ok: false, error: `unreadable reply (${r.status})` }));
  if (!r.ok || d.ok === false) die(`${r.status}: ${d.error ?? 'failed'}`);
  return d;
}

if (cmd === 'papers') {
  const q = rest.filter(x => !x.startsWith('--')).join(' ');
  const d = await call(`/api/research-shared/papers?q=${encodeURIComponent(q)}&n=${encodeURIComponent(flag('n') ?? 8)}`);
  for (const p of d.papers) {
    console.log(`\n## ${p.title}${p.year ? ` (${p.year})` : ''}  [${p.id}]`);
    if (p.notes) for (const [k, v] of Object.entries(p.notes)) if (v && typeof v !== 'object') console.log(`- ${k}: ${v}`);
    else if (p.abstract) console.log(`- abstract: ${p.abstract}`);
  }
  if (!d.papers.length) console.log('No papers matched. Try other words.');
} else if (cmd === 'paper') {
  const d = await call(`/api/research-shared/paper?id=${encodeURIComponent(rest[0] ?? '')}${rest.includes('--full') ? '&full=1' : ''}`);
  console.log(JSON.stringify(d.paper, null, 2));
  if (rest.includes('--full')) console.log(d.text ? `\n--- full text (${d.text.length} characters) ---\n${d.text}` : '\n(no full text held: notes and abstract only)');
} else if (cmd === 'rooms') {
  const d = await call('/api/research-shared/rooms');
  for (const r of d.rooms) {
    console.log(`\n## ${r.title}  [${r.id}] ${r.status}, ${r.rounds} rounds, updated ${String(r.updatedAt).slice(0, 10)}`);
    console.log(String(r.question ?? '').slice(0, 600));
    if (r.head) console.log(`Head: ${r.head.headline}${r.head.nextStep ? ` -> next: ${r.head.nextStep}` : ''}${r.head.why ? ` (${r.head.why})` : ''}`);
    for (const t of r.remarks) console.log(`- ${t.who}: ${t.text}`);
  }
} else if (cmd === 'queue') {
  const d = await call(`/api/research-shared/queue?status=${encodeURIComponent(rest[0] ?? 'queued')}`);
  console.log(JSON.stringify(d.items, null, 2));
} else if (cmd === 'image') {
  const [id, out] = rest; if (!id || !out) die('usage: shelf.mjs image <id> <out-file>');
  const fs = await import('node:fs'); fs.writeFileSync(out, await call(`/api/research-shared/image?id=${encodeURIComponent(id)}`, { raw: true })); console.log(`saved ${out}`);
} else if (cmd === 'done') {
  const id = rest[0]; if (!id) die('usage: shelf.mjs done <id> --path <note path> [--note "..."] [--status done|failed|dropped]');
  await call('/api/research-shared/queue/done', { method: 'POST', body: { id, status: flag('status') ?? 'done', path: flag('path') ?? '', note: flag('note') ?? '' } });
  console.log(`marked ${id} ${flag('status') ?? 'done'}`);
} else die(`unknown command: ${cmd}`);

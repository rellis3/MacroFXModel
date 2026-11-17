// Pull the paper library (notes from KV, text from R2) into the scratchpad. Read-only.
import fs from 'node:fs';
const ROOT = process.argv[2], OUT = process.argv[3];
const kv = await import('file:///' + ROOT + '/kv.js');
const r2 = await import('file:///' + ROOT + '/js/r2Store.js');
await kv.load?.();
const papers = await kv.get('research_pod_papers');
const queue = await kv.get('research_pod_queue');
fs.writeFileSync(OUT + '/papers.json', JSON.stringify(papers));
fs.writeFileSync(OUT + '/queue.json', JSON.stringify(queue));
const P = Array.isArray(papers) ? papers : (papers?.papers ?? Object.values(papers ?? {}));
console.log('papers', P.length, 'queue', (queue?.items ?? queue ?? []).length);
const keys = await r2.listKeys('research/papers/');
const txt = keys.filter(k => k.endsWith('.txt'));
console.log('r2 keys', keys.length, 'txt', txt.length);
fs.mkdirSync(OUT + '/txt', { recursive: true });
let n = 0;
for (const k of txt) { const f = OUT + '/txt/' + k.split('/').pop(); if (fs.existsSync(f)) continue; const b = await r2.getBuffer(k); if (b) { fs.writeFileSync(f, b); n++; } }
console.log('downloaded', n);
process.exit(0);

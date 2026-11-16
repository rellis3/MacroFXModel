// Build the terminal newsletter v2 from the LIVE routes and write the page, the poster and a stats line (a sample for the owner and for checking).
//   node scripts/newsletter-term-v2-sample.mjs <outDir> [baseUrl]
// Reads only public GET routes the terminal itself uses. Never writes to the site.
import fs from 'node:fs';
import path from 'node:path';
import { fetchTerminalData, composeTerminalV2, allSentences } from '../js/newsletterTermV2.js';
const out = process.argv[2], base = (process.argv[3] ?? 'https://macrofxmodel-production.up.railway.app').replace(/\/$/, '');
if (!out) { console.error('usage: node scripts/newsletter-term-v2-sample.mjs <outDir> [baseUrl]'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const getJson = async u => { const r = await fetch(base + u, { signal: AbortSignal.timeout(90000) }); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };
const { data, failed } = await fetchTerminalData(getJson);
const c = composeTerminalV2(data);
fs.writeFileSync(path.join(out, 'terminal_v2_dark.html'), c.html); fs.writeFileSync(path.join(out, 'terminal_v2_light.html'), c.htmlLight); fs.writeFileSync(path.join(out, 'terminal_v2_poster.svg'), c.posterSvg);
const ss = allSentences(c.model), dup = ss.length - new Set(ss.map(s => s.toLowerCase())).size;
console.log(JSON.stringify({ failed, words: c.words, stories: c.model.stories.map(s => `${s.id}${s.na ? '(na)' : ''}`), sentences: ss.length, duplicateSentences: dup, htmlKB: Math.round(c.html.length / 1024), takeaways: c.model.takeaways.map(t => t.id) }, null, 1));

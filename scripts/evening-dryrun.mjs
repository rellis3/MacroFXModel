#!/usr/bin/env node
// Dry run of the new Evening edition for one past day, with NO model call: the stored issue's own narrative (old brief) plus the new rule-built
// look-back pages, built from live routes. Writes the html and (with CHROME set or found) a PDF, so the owner can see the new issue before approving
// a live run. Headlines come from the news record's recent rows when the live wire is empty (shortened titles: the record keeps a slug, not the title).
//
//   node scripts/evening-dryrun.mjs 2026-11-16 [outDir]
//   env: BASE (default the Railway site), CHROME (path to chrome.exe), FINNHUB_KEY (optional, for the calendar)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderEvening, dayMoves } from '../js/newsletterEvening.js';
import { buildEveningDay } from '../js/eveningDay.js';
import { timelineText } from '../js/eveningTimeline.js';
import { extraInputTokens, EVENING_V2_ADDENDUM } from '../js/eveningPromptV2.js';
import { windowFor } from '../js/deskScore.js';

const BASE = process.env.BASE ?? 'https://macrofxmodel-production.up.railway.app';
const date = process.argv[2] ?? '2026-11-16', outDir = process.argv[3] ?? path.join(process.cwd(), 'evening_dryrun');
fs.mkdirSync(outDir, { recursive: true });
const J = async u => { const r = await fetch(BASE + u, { signal: AbortSignal.timeout(90_000) }); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.json(); };
const unesc = s => String(s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const H = { esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };

// 1. the stored issue's narrative (the old brief's output): subject, standfirst, the six sections with their evidence labels
const oldHtml = await (await fetch(`${BASE}/api/newsletter/issue?id=desk-evening-${date}`)).text();
const LBL = { observed: 'Observed data', model: 'Model output', untested: 'Untested interpretation', context: 'Context, not a signal', tested: 'Tested association', hyp: 'Hypothesis' };
const sections = [...oldHtml.matchAll(/<h3 class="ss"[^>]*>([\s\S]*?)<\/h3><p class="evl"><span class="evb (\w+)"[^>]*>[\s\S]*?<\/span><\/p><p>([\s\S]*?)<\/p>/g)].map(m => ({ title: unesc(m[1]), label: LBL[m[2]] ?? 'Untested interpretation', body: unesc(m[3]) }));
const subject = unesc((oldHtml.match(/<title>Evening: ([\s\S]*?)<\/title>/) ?? [])[1] ?? ''), standfirst = unesc((oldHtml.match(/<p class="ld">([\s\S]*?)<\/p>/) ?? [])[1] ?? '');
console.log(`stored issue: "${subject}", ${sections.length} sections`);

// 2. the morning book, the score, the review, the thesis-vs-reality day
const runRes = await J(`/api/desk-run?date=${date}`), run = runRes.run ?? runRes;
const cards = run.head?.book?.instruments ?? {};
const sc = await J(`/api/desk-score?date=${date}`), rec = (await J('/api/desk-score/record')).record, tr = (await J(`/api/thesis-reality?date=${date}`)).day;
console.log(`book: ${Object.keys(cards).length} cards; score S ${sc.score?.S}; tr ${tr ? 'yes' : 'no'}`);

// 3. the day's bars (15-minute here; the server uses M1): stamped as ending one minute before their close so no sample sees a bar that has not closed
const bars = {}; const names = Object.keys(cards); let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (i < names.length) { const n = names[i++]; try { const r = await J(`/api/desk-bars?inst=${n}&tf=15m&days=3`); if (r.ok && r.bars?.length) bars[n] = r.bars.map(b => ({ time: b.time + 14 * 60, open: b.open, high: b.high, low: b.low, close: b.close })); } catch { /* a market the bars route does not know */ } } }));
for (let pass = 0; pass < 3 && Object.keys(bars).length < names.length; pass++) {   // the bars route can refuse a burst of requests: retry the ones that failed, one at a time
  await new Promise(r => setTimeout(r, 4000));
  for (const n of names.filter(x => !bars[x])) { try { const r = await J(`/api/desk-bars?inst=${n}&tf=15m&days=3`); if (r.ok && r.bars?.length) bars[n] = r.bars.map(b => ({ time: b.time + 14 * 60, open: b.open, high: b.high, low: b.low, close: b.close })); } catch { /* still not there */ } }
}
console.log(`bars for ${Object.keys(bars).length} of ${names.length} markets${Object.keys(bars).length < names.length ? ` (missing: ${names.filter(x => !bars[x]).join(', ')})` : ''}`);
const moves = dayMoves(bars, cards, date);

// 4. the day's wire: the live store if it holds the day, else the news record's recent rows (slug titles, tier, the 30-minute label)
const { entryMs, exitMs } = windowFor(date);
let wire = [], wireFrom = 'the live wire';
try { const w = await J('/api/desk-news?hours=72'); wire = (w.items ?? []).filter(h => h.ms >= entryMs - 8 * 3600e3 && h.ms < exitMs + 3600e3); } catch { /* none */ }
{   // add the news record's rows the live wire has already dropped (the record keeps a cut-off slug, not the title: trimmed to whole words and marked with an ellipsis), once each
  const words = t => new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2));
  const same = (a, b) => [...words(a)].filter(x => words(b).has(x)).length >= 2;
  const rc = await J('/api/desk-news/record'); let added = 0;
  for (const r of (rc.recent ?? []).filter(r => r.ms >= entryMs - 8 * 3600e3 && r.ms < exitMs + 3600e3 && r.tier <= 2).sort((a, b) => a.ms - b.ms)) {
    let slug = r.id.replace(/^\d+-/, '').trim(); if (slug.length >= 38) slug = slug.replace(/\s+\S*$/, '');
    if (wire.some(h => Math.abs(h.ms - r.ms) < 30 * 60_000 && same(h.title, slug))) continue;
    wire.push({ ms: r.ms, title: `${slug.charAt(0).toUpperCase()}${slug.slice(1)}…`, sources: r.sources, tier: r.tier, read: { tier: r.tier, impact: {} }, react: { m30: { label: r.m30 } } }); added++;
  }
  if (added) wireFrom += ` plus ${added} from the news record (cut-off titles: the live wire had already dropped them)`;
}
console.log(`wire: ${wire.length} headlines from ${wireFrom}`);

// 5. the calendar (this week) and the moves' busiest half hours
let events = [], nextEvents = []; try { const all = await J('/api/events'); const arr = Array.isArray(all) ? all : (all.events ?? []); events = arr.filter(e => e.ms >= entryMs - 8 * 3600e3 && e.ms < exitMs); nextEvents = arr; } catch (e) { console.log('calendar:', e.message); }
const { moveTiming } = await import('../js/eveningFacts.js');
const bursts = moveTiming(bars, moves, date);
const { eventNote } = await import('../js/newsletter.js'); const CCY = { US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF' };
const day = buildEveningDay({ date, wire, events, scorecards: [], bursts, bars, cards, tr, nextEvents, noteFn: e => { const n = eventNote({ event: e.event, ccy: CCY[String(e.country ?? '').toUpperCase()] }, null, Object.keys(cards)); return n?.measured ? n : null; }, now: exitMs + 600e3 });
console.log(`timeline: ${day.timeline.counts.releases} prints, ${day.timeline.counts.headlines} headlines, ${day.timeline.counts.bursts} bursts (${day.timeline.counts.unexplained} with no news); paths ${Object.keys(day.paths).length}; book ${day.book ? day.book.at(-1).v : 'none'}; tomorrow ${day.tomorrow?.rows.length ?? 0} releases`);

const out = renderEvening({ date, issue: { subject, standfirst, sections }, score: sc.score, reflection: sc.reflection, movers: sc.movers, record: rec, moves, cards, day }, H);
const htmlPath = path.join(outDir, `evening_${date}_new.html`); fs.writeFileSync(htmlPath, out.html);
const tl = timelineText(day.timeline);
console.log(`wrote ${htmlPath}. Extra model input per issue if the v2 brief is turned on: about ${extraInputTokens(tl)} tokens (addendum ${Math.round(EVENING_V2_ADDENDUM.length / 4)} + timeline ${Math.round(tl.length / 4)}).`);
fs.writeFileSync(path.join(outDir, `timeline_${date}.txt`), tl);

// 6. PDF through headless Chrome
const chrome = process.env.CHROME ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
if (chrome) {
  const pdf = path.join(outDir, `evening_${date}_new.pdf`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, `file:///${htmlPath.replace(/\\/g, '/')}`], { stdio: 'ignore', timeout: 120_000 });
  console.log(`wrote ${pdf}`);
} else console.log('no Chrome found: set CHROME to render the PDF');

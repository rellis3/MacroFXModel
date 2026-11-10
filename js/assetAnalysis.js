/**
 * One market, analysed on demand (owner 2026-11-10): the Analyse button on a Desk Terminal asset card and the Pair tab.
 *
 * The morning run rates ~41 instruments in 7 group calls, so each market gets a few sentences and no drivers of its
 * own: gold is read as "global tone + USD", never against real yields, breakevens or its ETF flows. This is the deep
 * read for ONE market, pressed by the owner, on DeepSeek (task 'desk-asset' in js/modelRouter.js, about a cent a call).
 *
 * The prompt carries: the market's driver checklist (DRIVERS below; the model must say for each driver whether
 * today's data supports, contradicts or cannot see it), the morning card and the asset desk's view, the global and
 * currency rulings for its legs, the analysts' reports, the market's own pack data (vol lines, levels, implied vol,
 * swing map, trade-decision state), recent headlines and the Evidence Book entries for its area.
 *
 * Rules kept from the desk pipeline (plans/DESK_ANALYST_PIPELINE.md §3): context, never a signal; it never changes
 * the card's rating or size; gaps are said, not filled; a null or underpowered Evidence Book entry is never leaned on.
 * Pure functions only; the server does the I/O.
 */
import { groupOf, instrumentLegs } from './deskPack.js';
import { groupData, selectEvidence, evidenceBlock } from './deskRoles.js';

/**
 * What moves each kind of market. Each driver names what to look for in the data; the model must reconcile the
 * day's move with every one, and name the ones that contradict the card (gold up while real yields rise).
 */
const FX_DRIVERS = [
  'rate differential: the 2y spread and central-bank pricing for the two legs (rates_cb, yields_curve)',
  'each leg\'s currency ruling and the strength ranking (currency ruling)',
  'risk tone: equities, credit and VIX; the pair\'s usual risk sensitivity (global ruling, global_market, credit_funding)',
  'USD broadly: is the move this pair\'s own, or the dollar moving everything?',
  'macro surprises and data due today for either leg (macro_economy, events_news)',
  'positioning: COT and the retail book (cot_positioning)',
  'the forecast range: how much of today\'s expected move is already used (vol lines, session, levels)',
  'options: walls, gamma, the swing map where it exists (options_oi, swing)',
];
export const DRIVERS = {
  fx_majors: FX_DRIVERS,
  fx_crosses: [...FX_DRIVERS, 'for NOK and SEK: Norges Bank / the Riksbank, and Brent for NOK (scandi)'],
  indices: [
    'real and nominal yields: the 10y real yield and the front end; long-duration equities fall when real yields rise (yields_curve)',
    'credit spreads and funding stress (credit_funding)',
    'the home currency\'s ruling and central-bank path',
    'earnings and big-company news in the window (events_news)',
    'volatility: VIX level and term structure, implied against realised (vol_iv)',
    'dealer gamma and options walls (options_oi, swing)',
    'the forecast range used so far (vol lines, session, levels)',
  ],
  metals: [
    'real yields: the 10y TIPS yield; gold usually falls when real yields rise (yields_curve)',
    'inflation expectations: breakevens, and oil as their driver',
    'the US dollar: DXY and USD ruling; is the move the dollar or the metal?',
    'risk tone and geopolitical stress (global_market, gpr)',
    'flows: gold ETF holdings and central-bank buying where reported (gold-etf-flow)',
    'for industrial metals: China and global growth, copper/gold (macro_economy)',
    'the forecast range used so far, implied vol and options walls',
  ],
  energy: [
    'supply news: OPEC+, inventories, outages, sanctions (events_news)',
    'demand and growth: PMIs, China, the risk tone (macro_economy, global_market)',
    'the curve and cracks: backwardation or contango, refining margins (crack)',
    'the US dollar',
    'geopolitical risk (gpr)',
    'the oil-to-yields link: is oil driving inflation pricing today or decoupled from it?',
    'the forecast range used so far and implied vol',
  ],
  ags: [
    'weather and crop reports, USDA releases in the window (events_news)',
    'the US dollar and BRL',
    'energy costs and biofuel demand (oil)',
    'risk tone and the commodity complex',
    'the forecast range used so far',
  ],
  crypto: [
    'liquidity: real yields, the dollar and the Fed path',
    'risk tone: Nasdaq and credit',
    'flows and crypto-specific news (events_news)',
    'the forecast range used so far and implied vol',
  ],
};
/** Evidence Book domains each group reads (js/deskEvidence.js domains). */
const EVIDENCE_DOMAINS = {
  fx_majors: ['price', 'volatility', 'macro', 'positioning'], fx_crosses: ['price', 'volatility', 'macro', 'positioning'],
  indices: ['price', 'volatility', 'macro', 'positioning'], metals: ['price', 'volatility', 'macro'],
  energy: ['price', 'volatility', 'macro'], ags: ['price', 'volatility'], crypto: ['price', 'volatility'],
};

export const ANALYSIS_SCHEMA = `{
  "headline": "one sentence: what this market is doing today and why",
  "drivers": [ { "driver": "name from the checklist", "reading": "what today's data shows, with the number and its source", "fits": "supports | contradicts | mixed | no data" } ],
  "contradictions": ["any driver that argues against the price move or against the morning card, and what would explain it; empty if none"],
  "bull": "the best case for higher prices today, 1-3 sentences",
  "bear": "the best case for lower prices today, 1-3 sentences",
  "card": { "agree": "agree | disagree | partly", "why": "how this read compares with the morning card; the card itself is not changed" },
  "levels": "the levels that matter today, quoted in price from the data (zone, invalidation, forecast lines, options walls)",
  "watch": ["what to watch in the next session that would change the read"],
  "gaps": ["data the read needed and did not have"],
  "confidence": "low | medium | high"
}`;

const FITS = new Set(['supports', 'contradicts', 'mixed', 'no data']);
/** The reply, checked and trimmed. Returns { ok, value, errors }. */
export function validateAnalysis(o) {
  const errors = [];
  if (!o || typeof o !== 'object') return { ok: false, errors: ['not an object'] };
  const str = (v, n = 1200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const list = (v, n = 8) => (Array.isArray(v) ? v.map(x => str(x, 400)).filter(Boolean).slice(0, n) : []);
  const headline = str(o.headline, 400); if (!headline) errors.push('no headline');
  const drivers = (Array.isArray(o.drivers) ? o.drivers : []).filter(d => d && typeof d === 'object').slice(0, 14)
    .map(d => ({ driver: str(d.driver, 160), reading: str(d.reading, 600), fits: FITS.has(String(d.fits).toLowerCase()) ? String(d.fits).toLowerCase() : 'mixed' }))
    .filter(d => d.driver);
  if (!drivers.length) errors.push('no drivers');
  const agree = ['agree', 'disagree', 'partly'].includes(o.card?.agree) ? o.card.agree : 'partly';
  const confidence = ['low', 'medium', 'high'].includes(o.confidence) ? o.confidence : 'low';
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { headline, drivers, contradictions: list(o.contradictions), bull: str(o.bull), bear: str(o.bear),
    card: { agree, why: str(o.card?.why, 600) }, levels: str(o.levels, 800), watch: list(o.watch), gaps: list(o.gaps), confidence } };
}

const cut = (s, n) => { const t = typeof s === 'string' ? s : JSON.stringify(s ?? null); return t.length > n ? `${t.slice(0, n)} …[cut]` : t; };

/**
 * The prompts for one market. `run` is the stored desk run (may be null: the read still goes ahead on the pack and
 * says the book is missing), `pack` the day's Desk Pack, `ledger` the Evidence Book, `newsText` recent headlines.
 * Budget: DeepSeek's 64k-token context, so the whole prompt is held under about 150k characters.
 */
export function buildAssetPrompt({ name, run = null, pack = null, ledger = [], newsText = '', date = null }) {
  const g = groupOf(name);
  if (!g) throw new Error(`unknown market ${name}`);
  const legs = instrumentLegs(name) ?? [];
  const drivers = DRIVERS[g] ?? FX_DRIVERS;
  const book = run?.head?.ok ? run.head.book : null;
  const card = book?.instruments?.[name] ?? null;
  const deskView = run?.debate?.assets?.[g]?.view?.instruments?.[name] ?? null;
  const ccyViews = run?.debate?.currency?.view?.currencies ?? null;
  const legViews = Object.fromEntries(legs.map(c => [c, book?.currencies?.[c] ?? ccyViews?.[c] ?? null]));
  const ranking = run?.debate?.currency?.view?.ranking ?? null;
  const globalView = run?.debate?.global?.view ?? (book ? { tone: book.global?.tone, summary: book.global?.summary } : null);
  const analysts = Object.fromEntries(Object.entries(run?.analysts ?? {}).filter(([, a]) => a?.ok && a.report)
    .map(([id, a]) => [id, { headline: a.report.headline, confidence: a.report.confidence, points: (a.report.points ?? []).map(p => ({ claim: p.claim, evidence: p.evidence, impact: p.impact })), gaps: a.report.gaps ?? [] }]));
  const own = pack ? groupData(pack, [name])[name] : null;
  const ev = selectEvidence(ledger, EVIDENCE_DOMAINS[g] ?? ['price', 'volatility'], { max: 25 });

  const system = `You are the desk's analyst for ONE market: ${name}. The owner pressed "Analyse" because the morning book gives each market only a few sentences. Your job is a deeper read of this market alone, top-down: the global tone, then the currency legs (${legs.join('/') || 'none'}), then the market's own drivers and levels.

Work through EVERY driver in the checklist. For each one, say what today's data shows (quote the number and the feed or analyst it came from) and whether it supports the price move and the card, contradicts it, is mixed, or is not in the data. Then reconcile them: where a driver contradicts the move (for example gold rising while real yields rise), say so plainly and give the explanations the data allows, ranked, rather than a story that ignores the contradiction.

Rules:
- Use only the material below. Never invent a number, a level or a headline. If a driver has no data, say "no data" and list it under gaps.
- Quote levels in price, from the levels, forecast lines, swing map or trade-decision state given. Do not make levels up.
- An Evidence Book entry marked null or underpowered was tested and found no reliable edge: never present it as working.
- This is context for the desk, not a trade instruction. You do not change the morning card's rating or size; you say whether you agree with it.
- Be direct. Every field short: one to three sentences.
- Reply with JSON only, no text before or after it, in exactly this shape:
${ANALYSIS_SCHEMA}`;

  const sections = [
    ['Driver checklist for this market', drivers.map((d, i) => `${i + 1}. ${d}`).join('\n')],
    ['The morning card (Head of Desk)', card ? cut(card, 3000) : '(no card for this market today: the morning run is missing or failed)'],
    ['The asset desk\'s view', deskView ? cut(deskView, 2500) : '(none)'],
    ['Global ruling', globalView ? cut(globalView, 4000) : '(none)'],
    [`Currency rulings for the legs (${legs.join(', ')})`, cut({ legs: legViews, ranking }, 3000)],
    ['This market\'s own data (vol lines, session so far, forecast levels in price, implied vol, swing map, trade-decision state)', own ? cut(own, 30_000) : '(no Desk Pack today)'],
    ['Analysts\' reports', Object.keys(analysts).length ? cut(analysts, 70_000) : '(no analyst reports today)'],
    ['Headlines, last 24 hours, tier 1-2 (context, never a signal on its own)', newsText ? cut(newsText, 12_000) : '(none)'],
    ['Evidence Book entries for this area', evidenceBlock(ev)],
    ['Book risks and gaps', book ? cut({ risks: book.risks, gaps: book.gaps }, 3000) : '(none)'],
  ];
  const prompt = `Market: ${name} (${g}). Date: ${date ?? pack?.date ?? run?.date ?? 'unknown'}. Book written: ${run?.finishedAt ?? 'no book'}.\n\n${sections.map(([t, x]) => `## ${t}\n${x}`).join('\n\n')}\n\nAnalyse ${name} now. JSON only.`;
  return { system, prompt, meta: { group: g, legs, drivers: drivers.length, evidence: ev.map(e => e.id), hasCard: !!card, hasPack: !!own, chars: system.length + prompt.length } };
}

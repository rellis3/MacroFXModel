/**
 * Role files and prompt building for the desk pipeline.
 *
 * A role is a Markdown file in desk/roles/<id>.md: a small front-matter block that says what the role reads and
 * how it answers, then the role's instructions in plain prose. Keeping them as files lets the owner tune a role
 * the way a Claude Code skill is tuned, without touching server.js.
 *
 *   ---
 *   id: rates_cb
 *   layer: currency
 *   tier: quick              # quick | deep: which model task runs it (desk-analyst | desk-head)
 *   reads: rates_cb          # Desk Pack skill slice(s), comma-separated
 *   evidence: macro          # Evidence Book domain(s) the clerk pulls from, comma-separated; "validated" = validated, all domains
 *   output: analyst_report   # schema in js/deskSchemas.js
 *   ---
 *   You are the desk's central-bank and rates analyst ...
 *
 * Prompts are built from three parts: the role's own text, the slice of today's Desk Pack it reads (each feed
 * with its status and date, gaps named), and only the Evidence Book entries for its domains. The data part is
 * sliced by hand per feed (js/deskSlices.js, built from the first Railway pack) and then held to a character budget.
 *
 * Pure: the server reads the files and passes their text in. Tested in js/deskRoles.test.mjs.
 */
import { citable } from './deskEvidence.js';
import { sliceFeed } from './deskSlices.js';
import { SCHEMA_PROMPTS } from './deskSchemas.js';
import { DESK_UNIVERSE, instrumentLegs, allInstruments } from './deskPack.js';

const REQUIRED = ['id', 'layer', 'tier', 'output'];

/** Parse a role file. Throws on a missing front-matter block or field, so a broken role fails loudly at load. */
export function parseRole(text, file = 'role') {
  const m = String(text ?? '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no front-matter block`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.replace(/\s+#.*$/, '').match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  for (const k of REQUIRED) if (!meta[k]) throw new Error(`${file}: front matter is missing "${k}"`);
  if (!['quick', 'deep'].includes(meta.tier)) throw new Error(`${file}: tier must be quick or deep`);
  if (!SCHEMA_PROMPTS[meta.output]) throw new Error(`${file}: unknown output schema "${meta.output}"`);
  const list = v => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const body = m[2].trim();
  if (body.length < 80) throw new Error(`${file}: the role text is too short to be a role`);
  return { id: meta.id, layer: meta.layer, tier: meta.tier, output: meta.output, reads: list(meta.reads), evidence: list(meta.evidence), body };
}

const VERDICT_RANK = { validated: 0, null: 1, context: 2, underpowered: 3 };

/**
 * The Evidence Book entries a role sees: its domains, validated first, then nulls (they stop the role claiming
 * things already tested and found empty), newest first within each, capped at `max`. The domain "validated"
 * means every validated finding, whatever its domain (the evidence clerk's view).
 */
export function selectEvidence(ledger, domains, { max = 30 } = {}) {
  if (!domains?.length) return [];
  const all = domains.includes('validated');
  const pick = ledger.filter(e => (all && e.verdict === 'validated') || domains.includes(e.domain));
  pick.sort((a, b) => (VERDICT_RANK[a.verdict] ?? 9) - (VERDICT_RANK[b.verdict] ?? 9) || String(b.date).localeCompare(String(a.date)));
  return pick.slice(0, max);
}

export function evidenceBlock(entries) {
  if (!entries.length) return '(no Evidence Book entries for this role)';
  return entries.map(e => `- [${e.id} | ${citable(e).tag}] ${e.claim}. USE: ${e.use}`).join('\n');
}

/** One feed as prompt text: a header with status and age, then its slice (js/deskSlices.js) cut to `budget` characters. */
export function feedBlock(entry, budget, sliced) {
  const age = entry.ageH != null ? `, ${entry.ageH}h old` : entry.asOf == null ? ', undated' : '';
  const head = `### ${entry.id} [${entry.status}${entry.asOf ? `, as of ${entry.asOf}` : ''}${age}]`;
  if (entry.status !== 'ok' && entry.status !== 'stale') return `${head}\nGAP: ${entry.error ?? entry.status}`;
  let json = sliced ?? JSON.stringify(sliceFeed(entry.id, entry.data));
  if (json.length > budget) json = json.slice(0, budget) + ' …[cut]';
  return `${head}${entry.status === 'stale' ? '\nSTALE: older than this feed should be; say so if you use it.' : ''}\n${json}`;
}

/**
 * Share a character budget fairly: feeds that need less than an equal share take what they need, and what they
 * leave is shared between the bigger ones. So a 15 KB vol-forecast slice is not cut to an equal split with a
 * 100-byte feed.
 */
export function shareBudget(sizes, total) {
  const order = sizes.map((n, i) => [n, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(sizes.length);
  let left = total, n = sizes.length;
  for (const [size, i] of order) { const fair = Math.floor(left / n); out[i] = Math.min(size, fair); left -= out[i]; n--; }
  return out;
}

/** The data section for a role: every feed in its slices, the budget shared fairly between the feeds with data. */
export function sliceText(pack, reads, { maxChars = 40_000 } = {}) {
  const entries = reads.flatMap(r => Object.values(pack?.skills?.[r]?.feeds ?? {}));
  if (!entries.length) return { text: '(no feeds in this slice)', feeds: 0, usable: 0 };
  const isUsable = e => e.status === 'ok' || e.status === 'stale';
  const usable = entries.filter(isUsable);
  const sliced = new Map(usable.map(e => [e, JSON.stringify(sliceFeed(e.id, e.data))]));
  const budgets = shareBudget(usable.map(e => sliced.get(e).length), maxChars);
  const budgetOf = new Map(usable.map((e, i) => [e, budgets[i]]));
  return { text: entries.map(e => feedBlock(e, budgetOf.get(e) ?? 0, sliced.get(e))).join('\n\n'), feeds: entries.length, usable: usable.length };
}

const RULES = `Rules:
- Use only the data below and the Evidence Book entries given. Never invent a number. Name the feed id behind every claim.
- A feed marked GAP or STALE must be named in "gaps" if it mattered; a gap is not evidence that nothing happened.
- An Evidence Book entry tagged null or underpowered means the desk tested that idea and found no reliable edge: do not lean on it as if it worked.
- Context, not trade signals: you describe what the data says and what it means for currencies and risk.
- Reply with JSON only, no text before or after it, in exactly this shape:`;

/** The system and user prompts for one analyst. */
export function buildAnalystPrompt({ role, pack, ledger, maxChars }) {
  const slice = sliceText(pack, role.reads, { maxChars });
  const ev = selectEvidence(ledger, role.evidence);
  const system = `${role.body}\n\n${RULES}\n${SCHEMA_PROMPTS[role.output]}`;
  const prompt = `Desk date: ${pack.date} (pack built ${pack.builtAt}).\n\n## Evidence Book entries for your area\n${evidenceBlock(ev)}\n\n## Today's data\n${slice.text}`;
  return { system, prompt, meta: { feeds: slice.feeds, usable: slice.usable, evidence: ev.map(e => e.id) } };
}

/** The universe as prompt text: every instrument by group with the currency legs it is read from. */
export const SCANDI_RULE = 'NOK and SEK are traded but are not among the eight debated currencies (prereg A13): read EURNOK, EURSEK, USDNOK and USDSEK from the EUR or USD view, Norges Bank and the Riksbank (world-rates NO and SE), NOK against Brent (commodity-fx) and the risk tone (both krone and krona weaken in risk-off). Give them no currency bias of their own.';
export function universeText(universe = DESK_UNIVERSE) {
  const names = Object.values(universe).flat();
  return Object.entries(universe).map(([g, xs]) => `${g}: ${xs.map(n => `${n} (${instrumentLegs(n).join('/')})`).join(', ')}`).join('\n')
    + (names.some(n => /NOK|SEK/.test(n)) ? `\n${SCANDI_RULE}` : '');
}

/** The Head of Desk's prompts: the analysts' reports, in the owner's order, and the universe. */
export function buildHeadPrompt({ role, pack, reports, failed = [] }) {
  const order = ['global', 'currency', 'asset', 'evidence'];
  const lines = Object.values(reports)
    .sort((a, b) => order.indexOf(a.layer) - order.indexOf(b.layer))
    .map(r => `### ${r.skill} (${r.layer} layer, confidence ${r.report.confidence})\n${JSON.stringify(r.report)}`);
  const missing = failed.length ? `\n\nAnalysts that failed today (treat their areas as unseen): ${failed.join(', ')}` : '';
  const system = `${role.body}\n\n${RULES}\n${SCHEMA_PROMPTS[role.output]}`;
  const prompt = `Desk date: ${pack.date}.\n\n## Instruments (with the currency legs each is read from)\n${universeText()}\n\n## The analysts' reports, global first\n${lines.join('\n\n')}${missing}\n\nWrite a card for every one of the ${allInstruments().length} instruments.`;
  return { system, prompt };
}

// ── Phase 2: prompts for the debate, the managers, the asset desks and the risk desk ─────────────────────────────

const STAGE_RULES = `Rules:
- Use only the reports, rulings and data given below and the Evidence Book entries listed. Never invent a number.
- Name your sources (an analyst id, a feed id or a ledger tag) for every claim that carries weight.
- An Evidence Book entry tagged null or underpowered is an idea the desk tested and found no reliable edge in: do not lean on it as if it worked.
- This is context for the desk, not a tested signal.
- Reply with JSON only, no text before or after it, in exactly this shape:`;

/** Analyst reports of one layer as prompt text. */
export function reportsText(results, layer) {
  const rs = results.filter(r => r.ok && (layer == null || r.layer === layer));
  return rs.length ? rs.map(r => `### ${r.id} (confidence ${r.report.confidence})\n${JSON.stringify(r.report)}`).join('\n\n') : '(no analyst reports for this layer today)';
}

/** One pipeline stage's prompts: the role, its evidence, then named sections in order. */
export function buildStagePrompt({ role, pack, ledger, sections, tail = '' }) {
  const ev = selectEvidence(ledger ?? [], role.evidence, { max: 15 });
  const system = `${role.body}\n\n${STAGE_RULES}\n${SCHEMA_PROMPTS[role.output]}`;
  const body = sections.filter(([, text]) => text != null && text !== '').map(([title, text]) => `## ${title}\n${typeof text === 'string' ? text : JSON.stringify(text)}`).join('\n\n');
  const prompt = `Desk date: ${pack.date}.\n\n${ev.length ? `## Evidence Book entries for your area\n${evidenceBlock(ev)}\n\n` : ''}${body}${tail ? `\n\n${tail}` : ''}`;
  return { system, prompt, meta: { evidence: ev.map(e => e.id) } };
}

/** Decimal places for a price of this size, so levels read like quotes (1.12345, 157.734, 3940.8). */
const dp = p => (p >= 1000 ? 1 : p >= 100 ? 2 : p >= 10 ? 3 : p >= 2 ? 4 : 5);
/** NOK and SEK pairs trade near 10-12 with a 0.0001 pip (OANDA), so the size rule's 3 places would be 10 pips coarse. */
export const SCANDI_DIGITS = 4;
const isScandi = n => /NOK|SEK/.test(String(n ?? ''));

/**
 * Today's forecast lines as PRICES: the vol forecast keeps them as percent moves from the day's open (oh/ol at
 * p50/p75/p90), and the session feed has the open, so each line is open x (1 +/- pct/100). This gives every
 * instrument a level, including the ones with no options or level-engine coverage (metals, energy, ags, DE30,
 * UK100, BTC). Arithmetic on the desk's own lines only; nothing is invented.
 */
export function priceLadder(open, ladder, digits = null) {
  if (!Number.isFinite(open) || open <= 0 || !ladder?.oh || !ladder?.ol) return null;
  const r = x => Number(x.toFixed(digits ?? dp(open)));
  const up = {}, down = {};
  for (const q of ['p50', 'p75', 'p90']) {
    if (Number.isFinite(ladder.oh[q])) up[q] = r(open * (1 + ladder.oh[q] / 100));
    if (Number.isFinite(ladder.ol[q])) down[q] = r(open * (1 - ladder.ol[q] / 100));
  }
  return { open: r(open), up, down, note: 'today\'s forecast lines in price: up = open-to-high, down = open-to-low, p50/p75/p90' };
}

/**
 * What the desk reads a NOK or SEK pair from besides its EUR/USD leg (prereg A13; the currency debate covers only the
 * eight): Norges Bank / the Riksbank from the BIS policy-rate board (world-rates, monthly), NOK against Brent
 * (commodity-fx, monthly) and Brent's own session today. Read straight from the pack; null when none of it loaded.
 */
export function scandiContext(pack, name) {
  const feed = id => Object.values(pack?.skills ?? {}).map(s => s.feeds?.[id]).find(Boolean);
  const ccy = /NOK/.test(name) ? 'NOK' : 'SEK', area = ccy === 'NOK' ? 'NO' : 'SE';
  const out = { ccy, note: `${ccy} is not in the currency debate: read the pair from its ${name.slice(0, 3) === ccy ? name.slice(3) : name.slice(0, 3)} leg's ruling, this bank's cycle${ccy === 'NOK' ? ', NOK against Brent' : ''} and the risk tone (${ccy} weakens in risk-off)` };
  const b = feed('world-rates')?.data?.banks?.[area];
  if (b) out.bank = { name: ccy === 'NOK' ? 'Norges Bank' : 'Riksbank', rate: b.rate, asOf: b.asOf, change3m: b.change3m, change12m: b.change12m, cycle: b.cycle };
  const usd = feed('world-rates')?.data?.banks?.US, ez = feed('world-rates')?.data?.banks?.XM;
  if (out.bank && (usd || ez)) out.vs = { US: usd?.rate ?? null, euroArea: ez?.rate ?? null };
  if (ccy === 'NOK') {
    const row = (feed('commodity-fx')?.data?.rows ?? []).find(r => r?.ccy === 'NOK');
    if (row?.ok) out.oil = { basket: row.basket, asOf: row.asOf, brent3m: row.commodity3m, brent12m: row.commodity12m, nok3m: row.ccy3m, nok12m: row.ccy12m, gap12m: row.gap12m, corr36m: row.corr36m, read: row.read };
    const br = feed('vol-forecast/session')?.data?.instruments?.BRENT;
    if (br) out.brentToday = sliceFeed('vol-forecast/session', { instruments: { BRENT: br } })?.instruments?.BRENT ?? null;
  }
  return out.bank || out.oil || out.brentToday ? out : null;
}

/** Per-instrument data from the pack for one asset group: the vol lines, today's session, and the swing map / trade-decision state where they exist. */
export function groupData(pack, names) {
  const feed = id => Object.values(pack?.skills ?? {}).map(s => s.feeds?.[id]).find(Boolean);
  const out = {};
  const vf = sliceFeed('vol-forecast', feed('vol-forecast')?.data ?? {}), ses = sliceFeed('vol-forecast/session', feed('vol-forecast/session')?.data ?? {});
  const intel = sliceFeed('vol-forecast/intelligence', feed('vol-forecast/intelligence')?.data ?? {});
  const rawVf = feed('vol-forecast')?.data?.instruments ?? {}, rawSes = feed('vol-forecast/session')?.data?.instruments ?? {};
  const chosenFeed = feed('vol-forecast/persist-ladder/json'), chosen = chosenFeed?.data?.instruments ?? null;
  const chosenOk = !!chosen && (!chosenFeed.status || chosenFeed.status === 'ok');
  for (const n of names) {
    const row = { legs: instrumentLegs(n) };
    if (vf.instruments?.[n]) row.lines = vf.instruments[n];
    if (ses.instruments?.[n]) row.session = ses.instruments[n];
    // the price lines: the validated pick, "Forecast · chosen ★" (persistence + IV; Evidence Book forecast-pick, prereg A17)
    // where it covers the market and its feed is fresh, else the plain production ladder; the source travels with the lines
    const ch = chosenOk ? chosen?.[n] : null, useChosen = !!(ch?.oh && ch?.ol);
    const lv = priceLadder(Number(rawSes[n]?.anchor_open), useChosen ? ch : rawVf[n]?.ladder, isScandi(n) ? SCANDI_DIGITS : null);
    if (lv) row.levels = { ...lv, source: useChosen ? 'chosen' : 'plain' };
    if (isScandi(n)) { const sc = scandiContext(pack, n); if (sc) row.scandi = sc; }
    if (intel.instruments?.[n]) row.implied = intel.instruments[n];
    const sm = feed(`swing-map:${n}`); if (sm?.data) row.swing = sliceFeed(`swing-map:${n}`, sm.data);
    const td = feed(`trade-decision/state:${n}`); if (td?.data) row.tradeDecision = sliceFeed(`trade-decision/state:${n}`, td.data);
    // a stale or missing feed behind this row is named, so the asset desk never reads old lines (or no lines) as today's
    const flags = ['vol-forecast', 'vol-forecast/session', 'vol-forecast/intelligence', `swing-map:${n}`, `trade-decision/state:${n}`]
      .map(id => { const f = feed(id); return f && f.status && f.status !== 'ok' ? `${id}: ${f.status === 'stale' ? `STALE${f.ageH != null ? `, ${f.ageH}h old` : ''}` : `GAP (${f.status})`}` : null; }).filter(Boolean);
    if (flags.length) row.dataStatus = flags;
    out[n] = row;
  }
  return out;
}

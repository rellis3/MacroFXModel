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
 * cut to a character budget per feed. That cut is generic in Phase 1; plans/DESK_ANALYST_PIPELINE.md §9 says
 * hand-written slicers replace it once the first Railway packs show the real payloads.
 *
 * Pure: the server reads the files and passes their text in. Tested in js/deskRoles.test.mjs.
 */
import { citable } from './deskEvidence.js';
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

/** One feed as prompt text: a header with status and age, then its data cut to `budget` characters. */
export function feedBlock(entry, budget) {
  const age = entry.ageH != null ? `, ${entry.ageH}h old` : entry.asOf == null ? ', undated' : '';
  const head = `### ${entry.id} [${entry.status}${entry.asOf ? `, as of ${entry.asOf}` : ''}${age}]`;
  if (entry.status !== 'ok' && entry.status !== 'stale') return `${head}\nGAP: ${entry.error ?? entry.status}`;
  let json = JSON.stringify(entry.data);
  if (json.length > budget) json = json.slice(0, budget) + ' …[cut]';
  const cut = entry.truncatedCount ? `\n(long arrays were cut to their recent end in the pack: ${entry.truncatedCount} cuts)` : '';
  return `${head}${entry.status === 'stale' ? '\nSTALE: older than this feed should be; say so if you use it.' : ''}${cut}\n${json}`;
}

/** The data section for a role: every feed in its slices, the budget shared between the feeds that have data. */
export function sliceText(pack, reads, { maxChars = 36_000 } = {}) {
  const entries = reads.flatMap(r => Object.values(pack?.skills?.[r]?.feeds ?? {}));
  if (!entries.length) return { text: '(no feeds in this slice)', feeds: 0, usable: 0 };
  const usable = entries.filter(e => e.status === 'ok' || e.status === 'stale');
  const per = Math.max(1200, Math.floor(maxChars / Math.max(1, usable.length)));
  return { text: entries.map(e => feedBlock(e, per)).join('\n\n'), feeds: entries.length, usable: usable.length };
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
export function universeText(universe = DESK_UNIVERSE) {
  return Object.entries(universe).map(([g, names]) => `${g}: ${names.map(n => `${n} (${instrumentLegs(n).join('/')})`).join(', ')}`).join('\n');
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

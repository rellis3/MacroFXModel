// js/terminal/flagsView.js: the Risk flags board (Insight tab): the live state of the six market-stress lights (/api/risk-flags) set beside what the Evidence Book found for each.
// Only a flag with a VALIDATED range finding is presented as one that says something (the next days or weeks run wider, never which way); a light with no test of its own is
// shown as a light and labelled so; a nearest-test link is marked as nearest, not identical. Pure helpers + a small mount. Theme tokens only (insight.css).
import { DESK_EVIDENCE } from '../deskEvidence.js';
import { esc } from './boardViz.js';

/** Which Evidence Book entries speak to which flag. `nearest` = the test is about a related but different measure, said on the card. */
export const FLAG_EVIDENCE = {
  vix_term: { ids: ['vix-inversion', 'mv-vixterm-range'], nearest: false },
  hy_speed: { ids: ['mv-creditstack-range'], nearest: true },
  stock_bond_corr: { ids: ['stock-bond-flip'], nearest: false },
};
const VERDICT_WORD = { validated: 'Validated', context: 'Context only', null: 'No effect found', underpowered: 'Too little data to say' };

/** The first sentence or two of a long text, ending on a sentence boundary, at most `max` characters. */
export function brief(text, max = 260) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max), at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return at > 60 ? cut.slice(0, at + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}

/** Rows for the board from /api/risk-flags. */
export function flagRows(rf, evidence = DESK_EVIDENCE) {
  if (!rf?.ok || !Array.isArray(rf.flags)) return { ok: false, error: rf?.error ?? 'the risk flags are not available' };
  const byId = Object.fromEntries(evidence.map(e => [e.id, e]));
  const rows = rf.flags.map(f => {
    const map = FLAG_EVIDENCE[f.key], ev = (map?.ids ?? []).map(id => byId[id]).filter(Boolean);
    const validatedRange = ev.some(e => e.verdict === 'validated' && /range|wider/i.test(`${e.claim} ${e.use}`));
    return { key: f.key, label: f.label, on: f.on, value: f.value, detail: f.detail, nearest: !!map?.nearest, evidence: ev.map(e => ({ id: e.id, verdict: e.verdict, word: VERDICT_WORD[e.verdict] ?? e.verdict, claim: e.claim, result: brief(e.result), use: brief(e.use, 200) })), validatedRange };
  });
  return { ok: true, rows, level: rf.level ?? null, active: rf.active ?? rows.filter(r => r.on === true).length, available: rf.available ?? rows.filter(r => r.on !== null).length, total: rf.total ?? rows.length, at: rf.computed_at ?? null };
}

const light = on => `<i class="in-light ${on === true ? 'on' : on === null ? 'na' : 'off'}" aria-hidden="true"></i><b class="in-ls">${on === true ? 'ON' : on === null ? 'NOT AVAILABLE' : 'off'}</b>`;
function cardHtml(r) {
  const ev = r.evidence.map(e => `<div class="in-ev"><span class="in-vd ${esc(e.verdict)}">${esc(e.word)}</span> <b>${esc(e.claim)}</b>${r.nearest ? ' <i class="in-gr">nearest test, not the same measure</i>' : ''}<p class="in-cap">${esc(e.result)}</p><p class="in-cap"><b>How to use it:</b> ${esc(e.use)}</p></div>`).join('')
    || '<p class="in-cap">No test of its own in the Evidence Book: this is a light, not a finding. It says where a market is today and nothing about what follows.</p>';
  return `<div class="in-gcard${r.on === true ? ' in-hot' : ''}"><div class="in-gh"><span class="in-gl">${esc(r.label)}</span><span class="in-lt">${light(r.on)}</span></div><p class="in-cap">${esc(r.detail)}</p>${ev}</div>`;
}

export function flagsHtml(m) {
  if (!m.ok) return `<div class="in-empty">${esc(m.error)}.</div>`;
  const rng = m.rows.filter(r => r.validatedRange), other = m.rows.filter(r => !r.validatedRange);
  const head = `<p class="in-chance ${m.active ? 'busy' : 'quiet'}"><b>${m.active}</b> of ${m.available} measurable flags are on${m.level ? ` (state: ${esc(m.level)})` : ''}. A flag that is off says nothing about the days ahead; one that is on says only what its test found, and only when that test is validated.</p>`;
  return `${head}<h3 class="in-h">Flags with a validated range finding</h3><div class="in-ggrid">${rng.map(cardHtml).join('') || '<p class="in-cap">None of the lights has a validated range finding.</p>'}</div>
<h3 class="in-h">Other lights (no validated finding)</h3><div class="in-ggrid">${other.map(cardHtml).join('')}</div>
<p class="in-foot muted">Range means how big the moves run, never which way. The validated finding is the Evidence Book's own wording, with its sample and interval in the source study. Lights are re-read on every visit${m.at ? ` (last computed ${esc(m.at)})` : ''}.</p>`;
}

export function mountFlags(host, ctx) {
  let alive = true;
  host.innerHTML = '<div class="in-empty">Reading the risk flags…</div>';
  ctx.fetchJson('/api/risk-flags').then(j => { if (alive) host.innerHTML = flagsHtml(flagRows(j)); }).catch(e => { if (alive) host.innerHTML = `<div class="in-empty">Could not load the risk flags (${esc(e?.message ?? e)}).</div>`; });
  return { destroy() { alive = false; } };
}

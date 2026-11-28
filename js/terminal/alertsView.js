// js/terminal/alertsView.js: the ALERTS panel (the bell in the top bar). List the desk's alert rules, add one, mute, unmute or delete it. The rules, their wording and
// the episode logic are js/deskAlertRulesCore.js; the list lives on the server (/api/desk-alert-rules) and a note goes to Telegram when a rule fires.
// Only the OWNER can change rules: a desk login sees the list read only (and only once the owner switched widget.alerts on). A PREVIEW feature: js/terminal/terminalFeel.js
// only loads this file when the session may see it.
import { KINDS, KIND_IDS, FEEDS, LIVE_INDICES, LIVE_EM, MAX_RULES, DAILY_CAP, describeRule } from '../deskAlertRulesCore.js';
import { INSTRUMENTS as REPLAY_INSTRUMENTS } from '../replayCore.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const LABEL = { market: 'Market', pct: 'Share of the median range, %', bp: 'Move, basis points', feed: 'Feed', which: 'Level', minPct: 'Gap at least, %', q: 'Words in the headline (all must appear)', tier: 'Which headlines' };
const optionsFor = (kind, f) => (f === 'feed' ? Object.entries(FEEDS).map(([v, x]) => [v, x.label])
  : f === 'which' ? [['any', 'Option wall or forecast line'], ['oi', 'Option wall'], ['fc', 'Forecast line']]
    : f === 'tier' ? [['1', 'Tier 1 only'], ['2', 'Tier 1 and 2'], ['3', 'Any tier']]
    : kind === 'level_touch' && f === 'market' ? Object.keys(REPLAY_INSTRUMENTS).map(k => [k, k])
      : kind === 'gap_closed' && f === 'market' ? [...LIVE_INDICES, ...LIVE_EM].map(k => [k, k]) : null);
export const fieldHtml = (kind, [name, type, def]) => {
  const o = optionsFor(kind, name), id = `al-f-${name}`;
  return `<label class="al-f" for="${id}"><span>${esc(LABEL[name] ?? name)}</span>${o ? `<select id="${id}" data-f="${name}">${o.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(def) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>` : `<input id="${id}" data-f="${name}" type="${type === 'number' ? 'number' : 'text'}" value="${esc(def)}"${type === 'number' ? ' step="any"' : (name === 'q' ? ' maxlength="60"' : ' maxlength="12"')}>`}</label>`;
};
const when = iso => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : null; };
/** The automatic QLIKE level alerts (/api/qlike-alerts, js/qlikeLevelAlerts.js): the latest rows, sent or held. Pure, so the test reads it. */
export function qlikeHtml(q, n = 8) {
  if (!q?.ok) return '';
  const rows = (q.log ?? []).slice(0, n).map(e => `<li class="al-r${e.send ? '' : ' off'}"><div><b>${esc(e.market ?? '')}</b><span>${esc(e.text ?? '')}${e.at ? ` · ${esc(when(e.at) ?? '')}` : ''}${e.send ? '' : ` · ${esc(e.held ?? 'not sent')}`}</span></div></li>`).join('');
  return `<h4 class="al-sh">QLIKE level alerts (automatic)</h4><ul class="al-list">${rows || '<li class="muted">No QLIKE level reached yet this session.</li>'}</ul><p class="muted al-foot">${esc(q.rules ? `${q.rules.lines.join(', ')} on ${q.rules.markets.length} markets, ${q.rules.once}, quiet ${q.rules.quiet}, at most ${q.rules.dailyCap} a day; ${q.sentToday ?? 0} sent today${q.muted ? ' (muted on Bot Config)' : ''}. ` : '')}${esc(q.note ?? '')}</p>`;
}

export function mountAlerts({ doc = document, win = window, canEdit = () => !(win.deskIsViewer?.() ?? false), fetchJson = null } = {}) {
  const btn = doc.getElementById('alertsbtn');
  if (!btn || doc.getElementById('al-back')) return null;
  const call = fetchJson ?? (async (method, body) => { const r = await win.fetch('/api/desk-alert-rules', { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); let j = null; try { j = await r.json(); } catch { /* */ } return j ?? { ok: false, error: `The server answered ${r.status}.` }; });
  const back = doc.createElement('div');
  back.id = 'al-back'; back.className = 'al-back'; back.hidden = true;
  back.innerHTML = '<div class="al" role="dialog" aria-modal="true" aria-label="Alerts"><div class="al-h"><b>Alerts</b><span id="al-sub" class="muted"></span><button type="button" class="ws-x" id="al-x" aria-label="Close">×</button></div><div id="al-msg" class="al-msg" role="status" aria-live="polite"></div><div id="al-body"></div></div>';
  doc.body.appendChild(back);
  const body = back.querySelector('#al-body'), msg = back.querySelector('#al-msg'), sub = back.querySelector('#al-sub');
  let rules = [], sentToday = 0, kind = KIND_IDS[0], last = null, qlike = null;
  const say = t => { msg.textContent = t || ''; };

  function draw() {
    const edit = canEdit();
    sub.textContent = `${rules.length} of ${MAX_RULES} · ${sentToday} of ${DAILY_CAP} notes sent today`;
    const list = rules.length ? rules.map(r => `<li class="al-r${r.muted ? ' off' : ''}"><div><b>${esc(r.name || KINDS[r.kind]?.label || r.kind)}</b><span>${esc(describeRule(r))}${r.firedAt ? ` · last note ${esc(when(r.firedAt) ?? '')}` : ''}${r.muted ? ' · muted' : ''}</span></div>${edit ? `<span class="al-b"><button type="button" class="btn" data-mute="${esc(r.id)}" data-to="${r.muted ? 'unmute' : 'mute'}">${r.muted ? 'Unmute' : 'Mute'}</button><button type="button" class="btn" data-del="${esc(r.id)}">Delete</button></span>` : ''}</li>`).join('') : '<li class="muted">No alerts yet.</li>';
    const form = edit ? `<form class="al-form" id="al-form"><label class="al-f" for="al-kind"><span>Alert me when</span><select id="al-kind">${KIND_IDS.map(k => `<option value="${k}"${k === kind ? ' selected' : ''}>${esc(KINDS[k].label)}</option>`).join('')}</select></label><p class="muted al-help">${esc(KINDS[kind].help)}</p>${KINDS[kind].fields.map(f => fieldHtml(kind, f)).join('')}<label class="al-f" for="al-name"><span>Name (optional)</span><input id="al-name" type="text" maxlength="40"></label><button type="submit" class="btn">Add alert</button></form>` : '<p class="muted">Alerts can only be changed by the owner. You can see what is set.</p>';
    body.innerHTML = `<ul class="al-list">${list}</ul>${form}<p class="muted al-foot">A note goes to the desk's Telegram once per episode, never more than ${DAILY_CAP} a day. Notes describe a number, they are not trade instructions.</p>${qlikeHtml(qlike)}`;
  }
  const loadQlike = async () => { try { const r = await win.fetch('/api/qlike-alerts?n=8', { credentials: 'same-origin' }); qlike = r.ok ? await r.json() : null; } catch { qlike = null; } };
  async function load() { await loadQlike(); const r = await call('GET'); if (r.ok) { rules = r.rules; sentToday = r.sentToday ?? 0; say(''); } else say(r.error ?? 'Could not load the alerts.'); draw(); }
  async function post(b) { const r = await call('POST', b); if (r.ok) { rules = r.rules; sentToday = r.sentToday ?? sentToday; say(''); draw(); } else say(r.error ?? 'Could not save.'); return r; }

  body.addEventListener('change', e => { if (e.target.id === 'al-kind') { kind = e.target.value; draw(); body.querySelector('#al-kind')?.focus(); } });
  body.addEventListener('click', e => {
    const m = e.target.closest?.('[data-mute]'); if (m) { post({ action: m.dataset.to, id: m.dataset.mute }); return; }
    const d = e.target.closest?.('[data-del]'); if (d && win.confirm('Delete this alert?')) post({ action: 'delete', id: d.dataset.del });
  });
  body.addEventListener('submit', e => {
    e.preventDefault();
    const params = {}; for (const el of body.querySelectorAll('[data-f]')) params[el.dataset.f] = el.value;
    post({ action: 'add', kind, params, name: body.querySelector('#al-name')?.value ?? '' });
  });
  const open = () => { last = doc.activeElement; back.hidden = false; load(); back.querySelector('#al-x').focus(); };
  const close = () => { back.hidden = true; try { last?.focus?.(); } catch { /* gone */ } };
  back.addEventListener('click', e => { if (e.target === back || e.target.id === 'al-x') close(); });
  back.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  btn.hidden = false; btn.addEventListener('click', open);
  win.deskAlerts = { open, close, add: async b => { if (!canEdit()) { open(); say('Only the owner can add alerts: each one sends a Telegram note to the one shared chat.'); return { ok: false, error: 'owner only' }; } open(); const r = await post({ action: 'add', ...b }); say(r.ok ? 'Alert added.' : (r.error ?? '')); return r; } };
  return { open, close, destroy() { btn.hidden = true; btn.removeEventListener('click', open); back.remove(); delete win.deskAlerts; } };
}

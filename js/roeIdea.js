// The "New idea" tab on the Research Opportunities page: type a research idea in loose words, press Translate (ONE small AI call), read the brief the researchers will
// work from, and fix it before anything goes further. Pure render helpers (tested in roeIdea.test.mjs) plus a small DOM mount.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const EXAMPLE_TEXT = `I'm considering using yield curves. I want to find out about lead-lag values, using something like EURUSD. I'll need the euro 2-year versus 10-year yield against the US 2-year versus 10-year, to see if creating a spread on that gives a way to understand when price will move before it does, using a lagging yield indicator.

I'd perhaps start by looking at changes rather than absolute levels, then run cross-correlations across different time lags to establish whether one instrument consistently moves ahead of another.

You could also look for conditional relationships: instead of looking for a consistent correlation between 2 assets, ask "under what regime or circumstances does the relationship seem to be strongest?"`;

const chip = (ok, text) => `<span class="ib-chip ${ok ? 'ok' : 'no'}">${esc(text)}</span>`;
const li = a => (a ?? []).map(x => `<li>${esc(x)}</li>`).join('');
const sec = (h, body) => (body ? `<div class="ib-sec"><h3>${esc(h)}</h3>${body}</div>` : '');

export function briefHtml(res) {
  if (!res?.ok) return `<p class="ib-err" role="alert">${esc(res?.error ?? 'Something went wrong.')}</p>`;
  const b = res.brief, d = res.dataCheck ?? {};
  const target = b.target?.series || b.target?.unknownSeries
    ? `<p>${esc(b.target.label || b.target.series || b.target.unknownSeries)} ${d.target ? chip(d.target.have, d.target.have ? 'we hold it' : 'not held') : chip(false, 'not in the catalogue')}${b.target.note ? ` <small>${esc(b.target.note)}</small>` : ''}</p>` : '<p>No target series fits: this needs choosing.</p>';
  const vars = (d.variables ?? []).map((v, i) => {
    const src = b.variables?.[i] ?? {};
    return `<li><b>${esc(v.name)}</b> <small>(${esc(v.role)})</small><br>${esc(src.construction)}${src.transform ? `<br><small>${esc(src.transform)}</small>` : ''}<br>${(v.components ?? []).map(c => chip(c.have, `${c.id}${c.have ? '' : ' (missing)'}`)).join(' ')}${(v.unknown ?? []).map(u => chip(false, `${u} (not held)`)).join(' ')}</li>`;
  }).join('');
  const check = `<p>${chip(!!d.allHave, d.allHave ? 'every series is held' : 'some data is missing')} ${chip(!!d.quickTestReady, d.quickTestReady ? 'ready for the quick test' : 'not quick-test ready as it stands')}</p>${(d.notes ?? []).length ? `<ul>${li(d.notes)}</ul>` : ''}`;
  return `<article class="ib-brief"><h2>${esc(b.title)}</h2>`
    + `<p class="ib-hyp"><b>Hypothesis.</b> ${esc(b.hypothesis)}</p>${b.mechanism ? `<p><b>Why it might hold.</b> ${esc(b.mechanism)}</p>` : ''}`
    + sec('What is being predicted', target) + sec('The variables', vars ? `<ul>${vars}</ul>` : '')
    + sec('How it will be examined', `${b.method?.steps?.length ? `<ol>${li(b.method.steps)}</ol>` : ''}${b.method?.lags ? `<p><b>Lags.</b> ${esc(b.method.lags)}</p>` : ''}${b.method?.regimes?.length ? `<p><b>Regimes to split by.</b></p><ul>${li(b.method.regimes)}</ul>` : ''}`)
    + sec('Data check (done by code, not the model)', check)
    + sec('Still missing', (b.missing ?? []).length ? `<ul>${(b.missing ?? []).map(m => `<li>${esc(m.what)}${m.suggestedSource ? ` <small>(try: ${esc(m.suggestedSource)})</small>` : ''}</li>`).join('')}</ul>` : '')
    + sec('Assumptions made', (b.assumptions ?? []).length ? `<ul>${li(b.assumptions)}</ul>` : '')
    + (b.question ? `<div class="ib-q"><b>One question for you.</b> ${esc(b.question)}</div>` : '')
    + `<div class="ib-foot">Brief ${esc(res.id)} · ${res.callsUsed ?? '?'} of ${res.callsCap ?? '?'} translator calls used. Not a result: a hypothesis to be tested.</div>`
    + `<div class="ib-actions"><button type="button" class="lib-btn" data-act="edit">Edit my words</button><button type="button" class="lib-btn" disabled title="The next step: the researchers work from this brief">Go: send to the researchers (next step, not built yet)</button></div></article>`;
}

export function mount({ doc = document, fetchFn = (...a) => fetch(...a) } = {}) {
  const g = id => doc.getElementById(id), text = g('ideaText'), go = g('ideaGo'), out = g('ideaOut'), info = g('ideaInfo');
  const status = async () => { try { const r = await fetchFn('/api/research-pod/brief', { credentials: 'same-origin' }); const d = await r.json(); if (d.ok && d.callsUsed != null) info.textContent = `${d.callsUsed} of ${d.callsCap} translator calls used.`; } catch { /* the number is a nicety */ } };
  g('ideaEx').addEventListener('click', () => { text.value = EXAMPLE_TEXT; text.focus(); });
  go.addEventListener('click', async () => {
    const t = text.value.trim(); if (!t) { out.innerHTML = '<p class="ib-err">Write the idea first, in your own words.</p>'; return; }
    go.disabled = true; out.innerHTML = '<p class="rb-empty">Translating (one small AI call)…</p>';
    try {
      const r = await fetchFn('/api/research-pod/brief', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t }) });
      if (r.status === 401) { out.innerHTML = '<p class="ib-err">Log in to use this.</p>'; return; }
      out.innerHTML = briefHtml(await r.json().catch(() => ({ ok: false, error: 'The server sent something unreadable.' })));
      status();
    } catch (e) { out.innerHTML = `<p class="ib-err">Could not reach the server: ${esc(e.message)}</p>`; } finally { go.disabled = false; }
  });
  out.addEventListener('click', e => { if (e.target.closest?.('[data-act="edit"]')) { text.focus(); text.scrollIntoView?.({ block: 'center' }); } });
  return { status };
}

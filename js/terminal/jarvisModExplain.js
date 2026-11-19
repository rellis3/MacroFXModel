// js/terminal/jarvisModExplain.js: the EXPLAIN panel. Point at a day (default: the HUD's scrub date), pick a window, press EXPLAIN: ONE model call
// (owner-only, 40 a day, cached per day) describes what surrounded that stretch from the news, releases, desk book and the chain read.
// Description only: never a forecast, never a trade.
import { marketName } from './jarvisNames.js';
import { registerJarvisModule } from './jarvisModules.js';

const MARKETS = ['', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GOLD', 'NQ', 'ES'];
const ERR = { 429: 'The daily limit of 40 explanations is reached. Tomorrow it resets (London time).', 409: 'Another explanation is running. Try again in a moment.', 503: 'No model key is configured on the server, so nothing can be explained right now.' };

/** The compact chain summary sent with the request: moved nodes and link verdicts (kept well under 4 KB). */
export function chainSummary(graph, names = {}) {
  if (!graph?.nodes) return null;
  const moved = graph.nodes.filter(n => n.end?.text && n.end?.delta != null && Math.abs(n.end.delta) > 0).slice(0, 20).map(n => ({ node: names[n.key] ?? n.key, text: String(n.end.text).slice(0, 60) }));
  const links = (graph.edges ?? []).filter(e => e.verdict === 'holding' || e.verdict === 'broken').slice(0, 20).map(e => ({ link: String(e.short ?? `${e.from}-${e.to}`).slice(0, 60), verdict: e.verdict }));
  return { moved, links };
}

registerJarvisModule({
  id: 'explain', label: 'EXPLAIN',
  render(pane, api) {
    const { esc, st } = api, sc = api.st.dates?.[api.st.idx];
    const date = sc ?? st.dates?.[st.dates.length - 1] ?? new Date().toISOString().slice(0, 10);
    pane.innerHTML = `<div class="jv-sub">EXPLAIN A STRETCH OF TIME</div>
<p style="margin:6px 0"><label>Date <input type="date" data-x="date" value="${esc(date)}" style="background:var(--bg);color:var(--tx);border:1px solid var(--line)"></label>
<label style="margin-left:8px">Window <select data-x="days" style="background:var(--bg);color:var(--tx);border:1px solid var(--line)"><option value="1">1 day</option><option value="3">3 days</option><option value="5">5 days</option></select></label>
<label style="margin-left:8px">Market <select data-x="market" style="background:var(--bg);color:var(--tx);border:1px solid var(--line)">${MARKETS.map(m => `<option value="${m}">${m ? marketName(m) : 'any'}</option>`).join('')}</select></label></p>
<p style="margin:6px 0"><button type="button" data-x="go">EXPLAIN (1 model call)</button> <button type="button" data-x="say" hidden>READ IT TO ME</button></p>
<div data-x="out" style="color:var(--tx2)">Description only: what moved and what surrounded it. It never forecasts and never suggests a trade. One day's answer is kept, so asking again is free.</div>`;
    const q = s => pane.querySelector(`[data-x="${s}"]`), out = q('out'); let spoken = '';
    q('say').onclick = () => { if (spoken) api.say(spoken, true); };
    q('go').onclick = async () => {
      const body = { date: q('date').value, days: +q('days').value, market: q('market').value || undefined, chain: chainSummary(st.graph, api.names) };
      out.textContent = 'Reading the news, releases and desk book around that date...'; q('go').disabled = true; q('say').hidden = true;
      try {
        const r = await api.win.fetch('/api/jarvis/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) { out.innerHTML = `<span style="color:var(--gold)">${esc(ERR[r.status] ?? j.error ?? `Could not explain (${r.status}).`)}</span>`; return; }
        const cv = j.covered ?? {};
        out.innerHTML = `<p style="color:var(--tx);margin:4px 0">${esc(j.answer)}</p>
<div>${(j.drivers ?? []).map(d => `<div style="display:inline-block;margin:3px 6px 3px 0;padding:3px 9px;border:1px solid var(--line);border-radius:999px" title="${esc(d.evidence)}"><b style="color:var(--blue2)">${esc(d.claim)}</b><br><span style="color:var(--tx2);font-size:11px">${esc(d.evidence)}</span></div>`).join('')}</div>
${j.notExplained ? `<p style="margin:6px 0"><b style="color:var(--gold)">NOT EXPLAINED</b> ${esc(j.notExplained)}</p>` : ''}
${(j.caveats ?? []).map(c => `<p style="margin:2px 0;color:var(--gold)">Note: ${esc(c)}</p>`).join('')}
<p style="margin:6px 0;color:var(--tx2);font-size:11px">Sources: ${esc((j.sources ?? []).join(', ') || 'none named')} · Covered: ${esc(cv.news ?? 0)} headlines, ${esc(cv.events ?? 0)} events${j.cached ? ' · stored answer, no new call' : ''}${j.model ? ` · ${esc(j.model)}` : ''}</p>`;
        spoken = [j.answer, ...(j.drivers ?? []).map(d => d.claim), j.notExplained ? `Not explained: ${j.notExplained}` : ''].filter(Boolean).join('. ');
        q('say').hidden = false;
      } catch (e) { out.innerHTML = `<span style="color:var(--gold)">${esc(`Could not reach the server: ${e.message}`)}</span>`; }
      finally { q('go').disabled = false; }
    };
  },
});

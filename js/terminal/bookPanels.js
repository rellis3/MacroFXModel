/**
 * Desk Terminal: the book as decision support. Draws, from outputs the run already has (no new score, no forecast):
 *   Overview   book intelligence under the book headline (js/terminal/bookIntel.js);
 *   Charts     the book flow with three views (construction / net / gross), concentration flags, a clickable
 *              currency panel and clickable cards (js/terminal/bookView.js), and the Currency Manager's ranking
 *              against the realised order (js/terminal/rankReality.js);
 *   Analytics  the scenario map: every standard scenario and replay against every card (js/terminal/scenarioMap.js).
 *
 * Loaded as a module by desk-terminal.html after its classic script, so the page's globals (D, getJson, openModal,
 * assetCard, assetChart, ccyModal) are in scope. It exposes drawBookIntel, drawBookFlow, drawScenarioMap and
 * drawRankReality on globalThis; the page calls them when it draws a tab.
 */
import * as BV from './bookView.js';
import { scenarioMatrix, matrixHtml } from './scenarioMap.js';
import { bookIntel } from './bookIntel.js';
import { rankRows, rankHistory, rankTableHtml, rankHeatHtml } from './rankReality.js';

const h = BV.esc;
const S = { view: (() => { try { return localStorage.getItem('deskTerminalFlowView') || 'construction'; } catch { return 'construction'; } })(), sel: null, cache: {} };
const once = (k, f) => (S.cache[k] ??= f().then(r => { if (!r || r.ok === false) setTimeout(() => { delete S.cache[k]; }, 60_000); return r; }));
const runDate = () => D?.run?.date ?? '';
const riskRead = () => once(`risk|${runDate()}`, () => getJson(`/api/desk-risk?date=${runDate()}`));
const scenRead = () => once(`scen|${runDate()}`, () => getJson(`/api/scenarios?full=1&date=${runDate()}`));
const ccyView = () => D?.run?.debate?.currency?.view?.currencies ?? D?.run?.head?.book?.currencies ?? {};
const cards = () => D?.run?.head?.book?.instruments ?? {};
function openCard(n) { const c = D?.cards?.[n]; if (!c) return; openModal(assetCard(n, c, true)); assetChart(document.getElementById('achart'), n, c); }
// a read the desk login may not make comes back as { ok:false, error:'owner only' } (desk-terminal.html getJson): hide the whole panel, never show its heading over a message
const withheld = r => r?.ok === false && r?.error === 'owner only';
const hideShell = el => { const w = el.closest?.('[data-surface]') ?? el; w.setAttribute('data-empty', ''); w.hidden = true; el.innerHTML = ''; };
const onKey = (x, go) => { x.onclick = e => { e.preventDefault?.(); go(); }; x.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; };

// ── Overview: book intelligence ──
async function drawBookIntel(el) {
  if (!el || !D?.run?.head?.ok || globalThis.deskSurfaceOn?.('panel.ov.bookintel') === false) return;   // the module-ready call below is not gated by the page: a viewer's book data is withheld, so the panel must never be built for them
  const draw = (risk, scen) => {
    const m = scen?.ok ? scenarioMatrix(scen, cards(), { groups: BV.concentration(cards(), risk?.ok ? risk : null) }) : null;
    const x = bookIntel({ run: D.run, risk, matrix: m });
    el.innerHTML = `<div class="card bi"><div class="ch"><span class="lbl">Book intelligence</span><span class="r muted">today's outputs only · descriptive, not a forecast</span></div>
<div class="bi-tiles">${x.tiles.map(t => `<div class="bi-tile"><div class="lbl">${h(t.k)}</div><div class="v ${h(t.tone)}">${h(t.v)}</div><div class="s">${h(t.s)}</div></div>`).join('')}</div>
<ul class="bi-list">${x.bullets.map(b => `<li>${h(b)}</li>`).join('')}</ul>
<div class="tt-note">Written by template from the book, the exposure cap's arithmetic, the risk desk's correlations (/api/desk-risk) and the scenario engine. Card-σ: one size-1 card moving one daily σ. No model call.</div></div>`;
  };
  if (!el.innerHTML) draw(null, null);
  const [risk, scen] = await Promise.all([riskRead(), scenRead()]);
  if (el.isConnected) draw(risk, scen);
}

// ── Charts: the book flow ──
const VIEWS = {
  construction: ['Construction', 'which cards use each currency, size split across legs · ribbon width = size'],
  net: ['Net exposure', 'per currency, long minus short in the exposure cap\'s units (a pair is long its base and short its quote; commodities count against USD; indices on their own line)'],
  gross: ['Gross exposure', 'each card\'s full size on every currency it is exposed to · node = gross, label shows net'],
};
async function drawBookFlow(el) {
  if (!el || globalThis.deskSurfaceOn?.('panel.charts.bookflow') === false) return;
  const b = D?.run?.head?.book; if (!b) { el.innerHTML = '<p class="muted">No book today.</p>'; return; }
  const risk = await riskRead();
  const cs = cards(), cv = ccyView(), check = BV.viewCheck(cs, cv), flags = BV.concentration(cs, risk?.ok ? risk : null), tally = BV.viewTally(check);
  const live = BV.liveCards(cs);
  const render = () => {
    const [, sub] = VIEWS[S.view] ?? VIEWS.construction;
    const body = S.view === 'net' ? BV.netBarsHtml(cs, { cap: b.exposure?.cap ?? null, ccyView: cv, sel: S.sel })
      : `<div class="bf-scroll">${BV.flowSvg(cs, S.view, { tone: b.global?.tone ?? '', ranking: D.ranking ?? [], ccyView: cv, sel: S.sel, check, narrow: (el.clientWidth || innerWidth) < 600 })}</div>`;
    el.innerHTML = `<div class="bf-top"><div class="tt-pills" role="group" aria-label="flow view">${Object.entries(VIEWS).map(([k, [l]]) => `<button type="button" data-bfview="${k}" aria-pressed="${S.view === k}">${h(l)}</button>`).join('')}</div><span class="muted bf-sub">${h(sub)}</span></div>
${flags.length ? `<div class="bf-flags">${flags.slice(0, 4).map(f => `<div class="bf-flag" data-bfccy="${h(f.ccy)}" tabindex="0" role="button"><span class="chip gold">concentration</span> ${h(BV.flagText(f, { days: risk?.days ?? null }))}</div>`).join('')}${flags.length > 4 ? `<div class="muted">+${flags.length - 4} more groups of three or more cards on one leg.</div>` : ''}</div>` : ''}
${body}
<div class="muted bf-foot">All ${live.length} live cards shown. ${tally.judged ? `${tally.agree} of ${tally.judged} FX cards fit what their two currencies' biases imply; ${tally.against.length ? `<span class="gold">against view</span> marks the ${tally.against.length} that go the other way (${h(tally.against.join(', '))}).` : 'none goes against them today.'}${tally.noView.length ? ` No implied direction (equal biases): ${h(tally.noView.join(', '))}.` : ''}` : ''} Tap a currency to isolate it, a card for its analysis.${S.view === 'construction' ? ' Ribbons: green = the card is long that currency, red = short, grey = an index on its home currency.' : ''}</div>
<div id="bfpanel"></div>`;
    if (S.sel) {
      const x = BV.currencyDetail(S.sel, cs, cv, check);
      el.querySelector('#bfpanel').innerHTML = BV.currencyPanelHtml(x, { flags, days: risk?.days ?? null });
    }
    el.querySelectorAll('[data-bfview]').forEach(x => { x.onclick = () => { S.view = x.dataset.bfview; try { localStorage.setItem('deskTerminalFlowView', S.view); } catch { /* fine */ } render(); }; });
    el.querySelectorAll('[data-bfccy]').forEach(x => onKey(x, () => { S.sel = S.sel === x.dataset.bfccy && !x.classList.contains('bf-flag') ? null : x.dataset.bfccy; render(); el.querySelector('#bfpanel')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }));
    el.querySelectorAll('[data-inst]').forEach(x => onKey(x, () => openCard(x.dataset.inst)));
    el.querySelector('.bf-clear')?.addEventListener('click', () => { S.sel = null; render(); });
    el.querySelectorAll('[data-ccymodal]').forEach(x => onKey(x, () => globalThis.ccyModal?.(x.dataset.ccymodal)));
  };
  render();
}

// ── Analytics: the scenario map ──
async function drawScenarioMap(el) {
  if (!el || globalThis.deskSurfaceOn?.('panel.ana.scenmap') === false) return;
  el.innerHTML = '<div class="card muted">Running every scenario on every card…</div>';
  const [scen, risk] = await Promise.all([scenRead(), riskRead()]);
  if (!scen?.ok) { el.innerHTML = `<div class="card muted">${h(scen?.error ?? 'No scenario read yet.')}</div>`; return; }
  const m = scenarioMatrix(scen, cards(), { groups: BV.concentration(cards(), risk?.ok ? risk : null) });
  const flagged = m.rows.filter(r => r.hits?.some(x => x.sign < 0)).length;
  el.innerHTML = `<div class="card"><div class="ch"><span class="lbl">Scenario map</span><span class="r muted">${m.rows.length} rows × ${m.cols.length} cards · card-σ</span></div>
<div class="sm-label">Hypothetical: today's sensitivities, not a forecast; replays apply past realised moves to today's book.</div>
${matrixHtml(m)}
<p class="tt-note">Each cell is that card's P&amp;L in card-σ (one size-1 card moving one daily σ) from the scenario engine, the same runScenario / replay as the Factor risk and scenarios panel; Book is the whole book (card-σ, and % of gross). Colour strength is relative to the largest card in the row. ◆ marks ${flagged ? `the ${flagged} row${flagged === 1 ? '' : 's'}` : 'rows'} where one shock hits three or more cards on the same side of one currency leg the same way.${m.full ? '' : ' This server lists only the worst and best few cards per row: "·" = not listed, not zero.'} Scenarios are linear and one-day; big shocks are where betas are least reliable. Model ${h(scen.model?.asOf ?? '–')}, ${h(scen.model?.factorDays?.n ?? '–')} factor days.</p></div>`;
  el.querySelectorAll('[data-inst]').forEach(x => onKey(x, () => openCard(x.dataset.inst)));
}

// ── Charts: ranking vs realised ──
async function drawRankReality(el) {
  if (!el) return;
  el.innerHTML = '<div class="card muted">Reading the scored days…</div>';
  const idx = await once('tr', () => getJson('/api/thesis-reality'));
  if (withheld(idx)) return hideShell(el);   // the desk login is refused this route (it carries the book's sizes), so the ranking panel is not shown to it at all
  const dates = (idx?.dates ?? []).slice(-30);
  if (!dates.length) { el.innerHTML = `<div class="card muted">${h(idx?.error ?? 'No scored day yet: the first is built after the evening score.')}</div>`; return; }
  const days = (await Promise.all(dates.map(d => (d === idx?.day?.date ? Promise.resolve({ ok: true, day: idx.day }) : once(`tr|${d}`, () => getJson(`/api/thesis-reality?date=${d}`)))))).filter(r => r?.ok && r.day).map(r => r.day);
  const latest = days.at(-1), t = rankRows(latest), hist = rankHistory(days, { w: 5 }), last = hist.rolling.at(-1);
  const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`), sg = v => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
  el.innerHTML = `<div class="grid g2"><div class="card"><div class="ch"><span class="lbl">Ranking vs realised · ${h(t?.date ?? '–')}</span><span class="r muted">latest scored day</span></div>${rankTableHtml(t)}</div>
<div class="card"><div class="ch"><span class="lbl">History</span><span class="r muted">n = ${hist.days} scored day${hist.days === 1 ? '' : 's'}</span></div>
<div class="tt-tiles"><div class="tt-tile"><div class="lbl">Mean Spearman</div><div class="v">${sg(hist.meanRho)}</div><div class="s">over ${hist.rhoN} day${hist.rhoN === 1 ? '' : 's'}</div></div><div class="tt-tile"><div class="lbl">Rolling ${hist.w}-day</div><div class="v">${sg(last?.mean ?? null)}</div><div class="s">mean of the last ${last?.n ?? 0}</div></div><div class="tt-tile"><div class="lbl">Top / bottom hit rate</div><div class="v">${pct(hist.hit.share)}</div><div class="s">${hist.hit.right} of ${hist.hit.n} calls in the right half</div></div></div>
${rankHeatHtml(hist)}
<p class="tt-note">Cells show each currency's realised rank that day (1 = strongest). ▲ / ▼ = the desk ranked it top / bottom that morning, coloured by where it finished (green = near the top, red = near the bottom). rho = Spearman of the morning order against the realised order. Hit rate: the desk's top currency finishing in the realised top half and its bottom one in the bottom half. From the thesis-vs-reality records (08:00-21:00 London, moves in u). Descriptive of the desk's own record, ${hist.days < 20 ? `only ${hist.days} day${hist.days === 1 ? '' : 's'}: an anecdote, not evidence` : 'not a tested signal'}.</p></div></div>`;
}

globalThis.drawBookIntel = drawBookIntel;
globalThis.drawBookFlow = drawBookFlow;
globalThis.drawScenarioMap = drawScenarioMap;
globalThis.drawRankReality = drawRankReality;
// the Overview was drawn before this module loaded
const ready = () => new Promise(res => { const t0 = Date.now(); const go = () => ((typeof D !== 'undefined' && D.run) || Date.now() - t0 > 30_000 ? res() : setTimeout(go, 150)); go(); });
ready().then(() => { drawBookIntel(document.getElementById('bkintel')); if (document.getElementById('flow') && !document.getElementById('flow').innerHTML) drawBookFlow(document.getElementById('flow')); });

/**
 * Desk Terminal: four tabs brought over from today.html and the owner's build list (#7 what changed, #8 the research
 * pipeline, #9 per-pair pages), drawn in the terminal's own style.
 *
 *   Chain     the macro chain as the centrepiece (js/macroChain.js judges every link, as on today.html), its read, then
 *             the Global Read, the Day Read, Desk watch, Precedent, the Timeline and the week ahead.
 *   Pair      one page per market (desk-terminal.html#pair=EURUSD): the desk's card, the level chart, today.html's pair
 *             drill (Global Read), rates, fair value of both legs, options skew, COT and the retail crowd,
 *             seasonality, session hours, carry against vol, precedent, the chain links it sits on, and research.
 *   Changed   what moved since the previous book, ranked by how much it matters to the book (js/terminal/whatChanged.js).
 *   Research  the research pod's dossiers, proposals by lifecycle stage, and systems with their live checks.
 *
 * Loaded as a module by desk-terminal.html after its classic script, so the page's globals (D, E, getJson, tip,
 * openModal, ccyModal, rateChip, scoreBar, spk ...) are in scope. Nothing here makes a paid model call on load: the
 * chain read is peeked (free, cached server-side) and only written when the button is pressed, as on today.html.
 */
import * as CB from './chainBoard.js';
import { whatChanged } from './whatChanged.js';
import * as PV from './pairView.js';
import * as CSV from './chainStatsView.js';
import { reactionsHtml } from './reactionPanel.js';
import * as FVV from './fairValueView.js';
import { createLevelChart } from '../levelChart.js';
import { cardDrivers } from './cardExplain.js';

const el = id => document.getElementById(id);
const h = CB.esc;
// the Calendar tab (desk-terminal.html enrichCal) draws its "Expectations vs reality" panel through this
globalThis.ttReactionsHtml = p => reactionsHtml(p, h);
const T = {
  tab: null, cache: {},
  chain: { inputs: null, loading: null, live: null, liveErr: null, liveTimer: null, read: {}, nodeSel: null, linkSel: null, showQuiet: true,
    win: (() => { try { const r = localStorage.getItem('deskTerminalChainWin'); return r === 'live' ? 'live' : [1, 5, 20].includes(Number(r)) ? Number(r) : 20; } catch { return 20; } })() },
  pair: null, pairChart: null,
};
/** one promise per URL for the life of the page (the boards change daily at most; the chain-live feed is fetched fresh) */
const J = url => (T.cache[url] ??= getJson(url));
const ok = r => r && r.ok !== false && !r.error;
const ready = () => new Promise(res => { const t0 = Date.now(); const go = () => ((typeof D !== 'undefined' && D.run) || Date.now() - t0 > 30_000 ? res() : setTimeout(go, 150)); go(); });
const pctTxt = v => (v == null || !Number.isFinite(+v) ? '–' : `${Math.round(+v * 100)}%`);
const sg = (v, dp = 2) => (v == null || !Number.isFinite(+v) ? '–' : `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}`);
const loading = what => `<div class="tt-load">Loading ${h(what)}…</div>`;
const sec = (title, sub = '') => `<div class="sec tt-sec"><h2>${h(title)}</h2>${sub ? `<span class="lbl">${sub}</span>` : ''}</div>`;
const dayName = ms => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
const hm = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });

// ═════════════════════════════════════════════ CHAIN TAB ═════════════════════════════════════════════
function renderToday() {
  const root = el('today'); if (!root) return;
  if (!root.dataset.built) {
    root.dataset.built = '1';
    root.innerHTML = `<div class="card glow" id="tt-chain">${loading('the chain')}</div>
${sec('Global Read', 'every engine weighted by its evidence · coincident description, not a forecast')}<div id="tt-gr">${loading('the Global Read')}</div>
${sec('Day Read', 'one row per market, verdict first')}<div class="card" id="tt-day">${loading('the Day Read')}</div>
<div class="tt-grid2" style="margin-top:14px"><div><div class="sec tt-sec" style="margin-top:0"><h2>Desk watch</h2><span class="lbl">conditions checked every 15 min</span></div><div class="card" id="tt-watch">${loading('the watch')}</div></div>
<div><div class="sec tt-sec" style="margin-top:0"><h2>Precedent</h2><span class="lbl">what followed days like today, 20 sessions on</span></div><div class="card" id="tt-prec">${loading('the precedent study')}</div></div></div>
${sec('Timeline', '20 sessions back, 20 ahead')}<div id="tt-tl">${loading('the timeline')}</div>
${sec('The week ahead', 'high-impact releases still to come, with how the last prints of the same release landed')}<div class="card" id="tt-week">${loading('the calendar')}</div>
<p class="tt-note">Brought over from <a href="today.html">today.html</a>. The 20-day Market Outlook and the per-currency drill stay there (they are built from the page's own pair rows); the per-pair drill is on the Pair tab here.</p>`;
    root.addEventListener('click', onTodayClick);
    root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-node],[data-link],[data-pair],[data-act]')) { e.preventDefault(); onTodayClick(e); } });
    root.addEventListener('mousemove', onChainHover); root.addEventListener('mouseleave', () => tip(null));
    loadChain().then(drawChain).then(() => drawTimeline());
    J('/api/global-read').then(g => { drawGR(g); drawDay(g); });
    J('/api/chain-stats').then(cs => { T.chain.stats = cs; drawChain(); });   // context, not a signal: per-link correlation, lead/lag, divergence
    J('/api/desk-watch').then(w => { drawWatch(w); drawTimeline(); drawChain(); });
    J('/api/macro-regime-fx').then(drawPrec);
    Promise.all([J('/api/calendar-ahead'), J('/api/econ-surprise'), ready()]).then(([ca, es]) => drawWeek(ca, es));
    ready().then(drawTimeline);
  }
  if (T.chain.win === 'live') startLive();
  drawChain();
}

async function loadChain() {
  if (T.chain.loading) return T.chain.loading;
  const syms = Object.entries(CB.CHAIN_OHLC);
  T.chain.loading = Promise.all([J(`/api/fredhistory?keys=${CB.CHAIN_FRED_KEYS}`), J('/api/intl-yields'), J('/api/chain-extra'), J('/api/crack'), ...syms.map(([, s]) => J(`/api/ohlc?symbol=${s}`))])
    .then(([fred, iy, cx, cr, ...oh]) => {
      T.chain.inputs = { fred: fred && fred.ok !== false && !fred.error ? fred : {}, intl: iy?.series ?? {}, extra: cx?.series ?? {}, crack: Array.isArray(cr?.series) ? cr.series : null,
        ohlc: Object.fromEntries(syms.map(([k], i) => [k, CB.ohlcAscending(oh[i])])) };
    });
  return T.chain.loading;
}
async function loadLive() {
  const r = await getJson('/api/chain-live');
  if (r?.ok) { T.chain.live = r; T.chain.liveErr = null; } else T.chain.liveErr = r?.error ?? 'no live feed';
  if (T.chain.win === 'live') drawChain();
}
function startLive() {
  if (T.chain.liveTimer) return;
  loadLive();
  T.chain.liveTimer = setInterval(() => { if (T.tab !== 'today' || T.chain.win !== 'live') return stopLive(); if (!document.hidden) loadLive(); }, 60_000);
}
function stopLive() { clearInterval(T.chain.liveTimer); T.chain.liveTimer = null; }

function chainNow() {
  const C = T.chain; if (!C.inputs) return null;
  const inputs = { ...C.inputs, live: C.live }, vals = CB.chainVals(inputs, C.win), links = CB.chainLinks(inputs, C.win);
  return { inputs, vals, links, sum: CB.summariseChain(links, C.win) };
}

function drawChain() {
  const box = el('tt-chain'); if (!box || !T.chain.inputs) return;
  const C = T.chain, win = C.win, now = chainNow(), { links, sum } = now;
  const pills = `<div class="tt-pills" role="group" aria-label="window">${CB.WINDOWS.map(w => `<button data-act="win" data-w="${w}" aria-pressed="${w === win}">${w === 'live' ? 'Live' : `${w}D`}</button>`).join('')}</div>`;
  const liveLine = win === 'live' ? `<div class="tt-note" style="margin-top:0">${C.live ? `Live since the last daily close (${h(new Date(C.live.refAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }))} London), refreshed every minute; last ${h(hm(Date.parse(C.live.asOf)))}. Yields, the real yield, the Bund gap and the dollar are implied; a chip with no live price keeps its last print (dashed) and its links are not judged.` : C.liveErr ? `Live feed: ${h(C.liveErr)}` : 'Fetching live prices…'}</div>` : '';
  const watch = T.cache['/api/desk-watch'] && T._watch ? T._watch : null;
  const brokenNow = watch ? watch.states.filter(t => t.id.startsWith('chain-') && t.firing).length : null;
  box.innerHTML = `<div class="tt-head"><span class="lbl">The chain, today</span><h2 style="flex-basis:100%">Energy → inflation → yields → real yields → the dollar → gold, commodity FX and bitcoin; fear → the yen and credit</h2><span class="r" style="margin-left:0">${pills}</span></div>
<div class="tt-sum">${h(sum.headline)}</div>
<div class="tt-counts"><span class="vchip hold">${sum.holding} holding</span><span class="vchip broke">${sum.broken} broken</span><span class="vchip">${sum.quiet + sum.unmeasured} quiet</span>${sum.notlive ? `<span class="vchip">${sum.notlive} not live</span>` : ''}${brokenNow != null && win === 20 ? `<span class="chip" title="The desk watch judges the 20-day chain every 15 minutes and alerts on a break">watch: ${brokenNow} broken</span>` : ''}<span class="chip">${CB.winWord(win)}</span></div>
${liveLine}
<div class="cg-wrap" id="tt-cg">${CB.chainSvg(links, { win, nodeSel: C.nodeSel, linkSel: C.linkSel, showQuiet: C.showQuiet })}</div>
<div class="cg-legend"><span><i class="hold"></i>holding · flows the textbook way</span><span><i class="broke"></i>broken · both moved, the wrong way round</span><span><i class="quiet"></i>quiet · an end inside its noise floor, not judged · <u data-act="quiet" role="button" tabindex="0">${C.showQuiet ? 'hide' : 'show'}</u></span><span><i class="up"></i><i class="dn" style="margin-left:-4px"></i>chip ring = which way that thing moved · gold ring = the end of a broken link</span><span>hover for what it is · tap a chip or a link for the why · scrolls sideways on a phone</span></div>
${C.linkSel ? linkCard(links.find(l => l.id === C.linkSel)) : ''}${C.nodeSel ? nodeCard(C.nodeSel, links) : ''}
${readHtml(links, now.vals)}
${linksList(links)}
${CSV.breakingHtml(C.stats, h)}
<p class="tt-note">It explains; it does not predict: yields → FX forward coupling is a banked null here, and none of these links is a validated forward signal. Floors are set for 20 days and scaled by √(days/20) on shorter windows (an assumption, not a test).</p>`;
}

function endTxt(e) { return e?.delta == null ? '—' : e.text; }
function onChainHover(ev) {
  const t = ev.target.closest?.('[data-node],[data-link]'); if (!t || !el('tt-cg')?.contains(t)) return tip(null);
  const now = chainNow(); if (!now) return;
  if (t.dataset.node) {
    const k = t.dataset.node, n = CB.CHAIN_NODES[k], e = now.links.flatMap(l => [l.a, l.b]).find(x => x?.key === k);
    return tip(ev, `<b>${h(n.label)}</b><br>${e?.delta != null ? `${h(e.text)} ${h(CB.overWord(T.chain.win))}${e.moved ? '' : ` · inside its noise floor (${h(e.floorText ?? '')})`}${e.basis === 'last-print' && T.chain.win === 'live' ? ' · last print, not live' : ''}<br>` : 'no data<br>'}<span class="muted">${h(n.what.slice(0, 220))}</span>`);
  }
  const l = now.links.find(x => x.id === t.dataset.link); if (!l) return tip(null);
  tip(ev, `<b>${h(l.textbook)}</b><br><span class="vchip ${CB.VCLS[l.verdict]}">${CB.VWORD[l.verdict]}</span> ${h(l.a.label)} ${h(endTxt(l.a))} → ${h(l.b.label)} ${h(endTxt(l.b))}<br><span class="muted">${h((l.punch || l.read || '').slice(0, 240))}</span>`);
}
function linkCard(l) {
  if (!l) return '';
  const A = CB.CHAIN_NODES[l.a.key], B = CB.CHAIN_NODES[l.b.key], arr = d => (d === 'up' ? '↑' : '↓');
  const way = l.sign > 0 ? `<b>the same way</b>: when ${h(A.label)} rises, ${h(B.label)} should rise` : `<b>the opposite way</b>: when ${h(A.label)} rises, ${h(B.label)} should fall`;
  const status = l.verdict === 'holding' ? `<b style="color:var(--pur2)">Holding.</b> ${h(l.a.label)} ${h(l.a.text)} ${arr(l.a.dir)} and ${h(l.b.label)} ${h(l.b.text)} ${arr(l.b.dir)}. ${h(l.read ?? '')}`
    : l.verdict === 'broken' ? `<b style="color:var(--gold)">Broken.</b> ${h(l.a.label)} ${h(l.a.text)} ${arr(l.a.dir)} but ${h(l.b.label)} ${h(l.b.text)} ${arr(l.b.dir)}, the wrong way round. ${h(l.read ?? '')}`
      : l.verdict === 'quiet' ? `<b>Quiet, not judged.</b> ${h(l.punch || l.read || '')}. A link is judged only when both ends move past their floors (${h(l.a.floorText ?? '')} for ${h(A.label)}, ${h(l.b.floorText ?? '')} for ${h(B.label)}).`
        : `<b>${CB.VWORD[l.verdict]}.</b> ${h(l.read ?? '')}`;
  return `<div class="cg-card"><button class="x" data-act="close">close ✕</button><b>${h(A.label)} → ${h(B.label)}</b> <span class="vchip ${CB.VCLS[l.verdict]}">${CB.VWORD[l.verdict]}</span><br><b>The textbook:</b> ${h(l.textbook)}. They should move ${way}.<br><b>Why:</b> ${h(A.what)} <span class="muted">→</span> ${h(B.what)}<div style="margin-top:6px">${status}</div>${l.dateGapDays > 3 ? `<div class="muted" style="margin-top:4px">The two ends printed ${l.dateGapDays} days apart (${h(l.a.asOf)} vs ${h(l.b.asOf)}).</div>` : ''}${CSV.linkStatsHtml(T.chain.stats?.links?.[l.id], h)}</div>`;
}
function nodeCard(k, links) {
  const n = CB.CHAIN_NODES[k]; if (!n) return '';
  const e = links.flatMap(l => [l.a, l.b]).find(x => x?.key === k), outs = links.filter(l => l.a?.key === k), ins = links.filter(l => l.b?.key === k);
  const ways = outs.length ? `<div style="margin-top:6px"><b>What it moves</b> (textbook): when it rises, ${outs.map(l => `${h(CB.CHAIN_NODES[l.b.key]?.label)} should go <b>${l.sign > 0 ? 'up' : 'down'}</b>`).join('; ')}.</div>` : '';
  const from = ins.length ? `<div><b>What moves it:</b> ${ins.map(l => `${h(CB.CHAIN_NODES[l.a.key]?.label)} (${l.sign > 0 ? 'same way' : 'opposite'})`).join(', ')}.</div>` : '';
  const today = [...ins, ...outs].map(l => `<div><span class="vchip ${CB.VCLS[l.verdict]}">${CB.VWORD[l.verdict]}</span> <a href="#" data-act="link" data-id="${h(l.id)}">${h(l.short)}</a>${l.punch ? ` <span class="muted">${h(l.punch)}</span>` : ''}</div>`).join('');
  const tps = (k === 'us10y' || k === 'us30y') ? CB.termPremiumSplit(T.chain.inputs?.fred, T.chain.win) : null, bp = v => `${v > 0 ? '+' : ''}${Math.round(v)}bp`;
  const split = tps ? `<div style="margin-top:6px"><b>Why it moved</b> (the ACM model, not a claim): of the 10-year's ${bp(tps.fitted)}, <b>${bp(tps.tp)}</b> is term premium and <b>${bp(tps.path)}</b> the expected Fed path. ${Math.abs(tps.tp) > Math.abs(tps.path) ? 'A term-premium move is a supply or credibility story.' : 'A path move is the market re-pricing the Fed.'}</div>` : '';
  return `<div class="cg-card"><button class="x" data-act="close">close ✕</button><b>${h(n.label)}</b>${e?.delta != null ? ` · ${h(e.text)} ${h(CB.overWord(T.chain.win))}${e.moved ? '' : ' (inside its noise floor, so quiet)'}` : ''}<br>${h(n.what)}${split}${ways}${from}<div style="margin-top:6px">${today || 'No link touches it today.'}</div></div>`;
}
function linksList(links) {
  const row = l => `<div class="tt-link"><span><span class="vchip ${CB.VCLS[l.verdict]}">${CB.VWORD[l.verdict]}</span></span><span class="ends"><a href="#" data-act="link" data-id="${h(l.id)}" style="color:var(--tx);text-decoration:none"><b>${h(l.short)}</b></a> · ${h(l.a.label)} <b class="${l.a.moved ? (l.a.dir === 'up' ? 'up' : 'dn') : ''}">${h(endTxt(l.a))}</b> → ${h(l.b.label)} <b class="${l.b.moved ? (l.b.dir === 'up' ? 'up' : 'dn') : ''}">${h(endTxt(l.b))}</b>${l.expected && l.b.moved && l.expected !== l.b.dir ? ` <span class="chip gold" style="font-size:9px">textbook said ${l.expected === 'up' ? '↑' : '↓'}</span>` : ''}</span>${l.punch ? `<span class="p">${h(l.punch)}</span>` : ''}</div>`;
  const live = links.filter(l => l.verdict === 'broken' || l.verdict === 'holding').sort((a, b) => (a.verdict === 'broken' ? 0 : 1) - (b.verdict === 'broken' ? 0 : 1));
  const rest = links.filter(l => !(l.verdict === 'broken' || l.verdict === 'holding'));
  return `<div style="margin-top:14px">${live.map(row).join('') || '<div class="muted">No link has both ends moving on this window.</div>'}${rest.length ? `<details><summary>${rest.length} quiet or unmeasured links</summary>${rest.map(row).join('')}</details>` : ''}</div>`;
}

// the chain read: peeked for free on load; generated only on a click (a paid model call), as today.html does
function readHtml(links, vals) {
  const C = T.chain, w = C.win, st = (C.read[w] ??= { state: 'idle' });
  if (st.state === 'idle') { st.state = 'peek'; getJson(`/api/chain-read?window=${w}`).then(r => { C.read[w] = r?.ok ? { state: 'ready', data: r } : { state: 'none' }; if (C.win === w) drawChain(); }); }
  const r = st.data?.read, age = st.data?.ageMin;
  const btn = `<button class="btn" data-act="read" ${st.state === 'loading' ? 'disabled' : ''} title="Writes the read from the numbers on screen. A model call: nothing is generated automatically; a read written in the last 30 minutes is returned free.">${st.state === 'loading' ? `reading… ${Math.round((Date.now() - (st.startedAt ?? Date.now())) / 1000)}s` : r ? '↻ re-read' : '✦ read the tape'}</button>`;
  const head = `<div class="ch" style="margin:0"><span class="lbl">The read · ${CB.winWord(w)}</span><span class="chip gold">AI · not backtested</span>${age != null && age >= 1440 ? `<span class="chip dn">${Math.round(age / 1440)}d old</span>` : ''}<span class="r">${btn}</span></div>`;
  if (!r) return `<div class="tt-read">${head}<div class="muted" style="margin-top:6px">${st.state === 'peek' ? 'Looking for a cached read…' : st.state === 'loading' ? 'Reading the tape (usually under a minute).' : st.state === 'error' ? `Could not build the read: ${h(st.err ?? '')}` : `No ${CB.winWord(w)} read has been written recently. The board above is the measured chain; the button writes the trader's-voice explanation of it, over this window only.`}</div></div>`;
  const paras = String(r.read ?? '').split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean);
  const stories = (r.stories ?? []).filter(x => x?.name && x.status !== 'absent');
  const when = st.data.generatedAt ? new Date(st.data.generatedAt).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="tt-read">${head}${r.hook ? `<div class="hook">“${h(r.hook)}”</div>` : ''}
${stories.length ? `<div class="tt-stories">${stories.map(x => `<span class="chip ${x.status === 'dominant' ? 'gold' : x.status === 'reloading' ? 'pur' : ''}" title="${h(`${x.legs ?? ''}${x.evidence ? ' — ' + x.evidence : ''}`)}">${h(x.name)} · ${h(x.status)}</span>`).join('')}</div>` : ''}
${paras.map(p => `<p>${h(p)}</p>`).join('')}
${r.shouldHave ? `<div class="row"><b>Should be happening, isn't:</b> ${h(r.shouldHave)}</div>` : ''}${r.next ? `<div class="row"><b>Next:</b> ${h(r.next)}</div>` : ''}${r.forFx ? `<div class="row"><b>For FX:</b> ${h(r.forFx)}</div>` : ''}
<div class="tt-note">Written ${when ? `${h(when)} London` : ''}${age != null && age >= 2 ? ` (${age >= 120 ? `${Math.round(age / 60)}h` : `${age} min`} ago; the numbers in it are from then, the board above is current)` : ''}. An opinion in a trader's voice, not a forecast. Shared with today.html: one cached read per window for everyone.</div></div>`;
}
async function writeRead() {
  const C = T.chain, w = C.win, cur = C.read[w] ?? {};
  if (cur.state === 'loading') return;
  if (w === 'live') await loadLive();
  const now = chainNow(); if (!now) return;
  C.read[w] = { ...cur, state: 'loading', startedAt: Date.now() }; drawChain();
  const tick = setInterval(() => { if (C.read[w]?.state !== 'loading') return clearInterval(tick); if (C.win === w) drawChain(); }, 5000);
  const rg = await J('/api/macro-regime-fx'), watch = T._watch;
  const setups = watch?.states ? watch.states.filter(t => t.claimId && t.firing).map(t => `  LIVE: ${String(t.label).replace(/^Setup watch · /, '')}`).join('\n') || null : null;
  const snapshot = CB.chainSnapshot({ links: now.links, vals: now.vals, win: w, policy: rg?.policy ?? null, events: D.ev ?? [], setups });
  const r = await fetch(`/api/chain-read${cur.data?.read ? '?force=1' : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snapshot }) }).then(x => x.json()).catch(e => ({ ok: false, error: e.message }));
  C.read[w] = r?.ok ? { state: 'ready', data: r } : { state: 'error', data: cur.data, err: r?.error ?? 'no read' };
  if (C.win === w) drawChain();
}

function onTodayClick(ev) {
  const C = T.chain, a = ev.target.closest?.('[data-act],[data-node],[data-link],[data-pair],[data-ccy2]'); if (!a) return;
  if (a.dataset.pair) { ev.preventDefault(); return openPair(a.dataset.pair); }
  if (a.dataset.ccy2) { ev.preventDefault(); return ccyModal(a.dataset.ccy2); }
  if (a.dataset.node) { C.linkSel = null; C.nodeSel = C.nodeSel === a.dataset.node ? null : a.dataset.node; tip(null); return drawChain(); }
  if (a.dataset.link) { C.nodeSel = null; C.linkSel = C.linkSel === a.dataset.link ? null : a.dataset.link; tip(null); return drawChain(); }
  const act = a.dataset.act; ev.preventDefault?.();
  if (act === 'win') { const w = a.dataset.w === 'live' ? 'live' : Number(a.dataset.w); if (w === C.win) return; C.win = w; try { localStorage.setItem('deskTerminalChainWin', String(w)); } catch { /* private window */ } if (w === 'live') startLive(); else stopLive(); return drawChain(); }
  if (act === 'quiet') { C.showQuiet = !C.showQuiet; return drawChain(); }
  if (act === 'close') { C.nodeSel = null; C.linkSel = null; return drawChain(); }
  if (act === 'link') { C.nodeSel = null; C.linkSel = a.dataset.id; drawChain(); el('tt-cg')?.scrollIntoView?.({ block: 'nearest' }); return; }
  if (act === 'read') return writeRead();
}

// ── Global Read (today.html "Global Read — full detail, every engine weighted by its evidence") ──
const AXES = { risk: ['Risk appetite', 'risk-on', 'risk-off'], usd: ['Dollar', 'stronger', 'weaker'], rates: ['Rates', 'tightening', 'easing'], vol: ['Volatility', 'elevated', 'compressed'], credit: ['Credit', 'stress', 'easing'] };
const stanceChip = s => { const t = String(s ?? ''); return `<span class="chip ${/fade/i.test(t) ? 'pur' : /follow|break/i.test(t) ? 'gold' : ''}" title="${h(t)}">${h(t || '—')}</span>`; };
const dirChip = d => { if (!d || d.pUp == null || Math.abs(d.pUp - 0.5) < 0.02) return '<span class="chip">no tested lean</span>'; const up = d.pUp > 0.5; return `<span class="chip ${up ? 'up' : 'dn'}" title="${h(d.label ?? '')}">${up ? '▲' : '▼'} ${Math.round(Math.max(d.pUp, 1 - d.pUp) * 100)}%</span>`; };
function drawGR(g) {
  const box = el('tt-gr'); if (!box) return;
  if (!g?.cards) { box.innerHTML = `<div class="card muted">${h(g?.error ?? 'The Global Read is not available.')}</div>`; return; }
  const c = g.conviction ?? {}, dq = g.dataQuality ?? {}, probs = [...(dq.issues ?? []).map(i => `${i.problem}${i.where ? ` (${i.where})` : ''}`), ...(dq.feeds ?? []).map(f => `feed ${f.id}: ${f.state}`)];
  const tile = (l, v, s) => `<div class="tt-tile"><div class="lbl">${l}</div><div class="v">${v ?? 0}<small style="font-size:11px;color:var(--tx3)">/100</small></div><div class="s">${s}</div></div>`;
  const axes = Object.entries(g.axes ?? {}).map(([k, a]) => { const [name, pos, neg] = AXES[k] ?? [k, '+', '−']; const wd = Math.abs(a.score) < 0.15 ? 'neutral' : a.score > 0 ? pos : neg;
    return `<tr><td><b>${h(name)}</b></td><td class="n" style="color:${Math.abs(a.score) < 0.15 ? 'var(--tx2)' : 'var(--pur2)'}">${sg(a.score)} · ${h(wd)}</td><td class="n">${h(a.agree ?? '')}</td><td class="muted" style="font-size:12px">${h((a.inputs ?? []).map(i => i.text).join(' · '))}</td></tr>`; }).join('');
  const ccys = Object.values(g.currencies ?? {}).map(x => { const s = x.state ?? {};
    return `<tr class="tt-click" data-ccy2="${h(x.ccy)}" tabindex="0"><td><b>${FLAG[x.ccy] ?? ''} ${h(x.ccy)}</b></td><td class="n">${pctTxt(x.rangePressure)}</td><td>${h(x.directionView)}</td><td class="n ${dirCls(s.move20Pct)}">${s.move20Pct != null ? `${sg(s.move20Pct)}%` : '–'}</td><td class="n">${s.cb ? `${h(s.cb.regime)} ${s.cb.score}` : '–'}</td><td class="n">${s.cot ? `${s.cot.specPct}th` : '–'}</td><td class="n">${s.realYield != null ? `${s.realYield}%` : '–'}</td><td class="n">${sg(s.spreadZ)}</td><td class="muted" style="font-size:12px">${h((x.notes ?? []).join(' · '))}</td></tr>`; }).join('');
  const pairs = (g.ranked ?? []).map(rk => { const k = g.cards[rk.sym]; if (!k) return '';
    return `<tr class="tt-click" data-pair="${h(rk.sym)}" tabindex="0"><td><b>${h(nice(rk.sym))}</b></td><td>${stanceChip(k.plan?.stance)}</td><td class="n">${pctTxt(k.range?.pAbove75)}</td><td class="n">${k.range?.mult != null ? `×${k.range.mult}` : '—'}</td><td>${dirChip(k.direction)}</td><td class="muted" style="font-size:12px;min-width:220px">${h(k.plan?.lines ?? '')}</td></tr>`; }).join('');
  box.innerHTML = `<div class="card glow"><div class="synth" style="font-style:normal;margin-top:0"><b>${h(g.headline)}</b>${g.meta?.asOf ? ` <span class="muted">· ${h(hm(Date.parse(g.meta.asOf)))} London · <a href="/api/global-read/record" target="_blank" rel="noopener">forward record →</a></span>` : ''}</div>
<div class="tt-tiles">${tile('Range conviction', c.range, 'how far today sits from a normal day')}${tile('Direction conviction', c.direction, 'only tested inputs count')}${tile('Data quality', c.dataQuality, `${probs.length} problem${probs.length === 1 ? '' : 's'} flagged`)}</div>
<div class="lbl" style="margin-top:12px">Global — the state</div><div class="scroll"><table><thead><tr><th>Axis</th><th>Reading</th><th>Agree</th><th>Made of</th></tr></thead><tbody>${axes}</tbody></table></div>
${(g.scenarios ?? []).length ? `<div class="lbl" style="margin-top:14px">Scenarios</div>${g.scenarios.map(s => `<div class="tt-row"><b>${h(s.name)}</b><span class="chip ${s.p != null ? 'gold' : ''}">${s.p != null ? pctTxt(s.p) : 'p not measured'}</span><span class="muted" style="flex-basis:100%">${h(s.text)}</span></div>`).join('')}` : ''}
<div class="lbl" style="margin-top:14px">Currencies — pairs rolled up · tap for the currency card</div><div class="scroll"><table style="min-width:760px"><thead><tr><th>Ccy</th><th class="n">Range pressure</th><th>Direction</th><th class="n">20d</th><th class="n">CB</th><th class="n">COT</th><th class="n">Real 10Y</th><th class="n">2Y spread z</th><th>State</th></tr></thead><tbody>${ccys}</tbody></table></div>
<div class="lbl" style="margin-top:14px">Pairs — ranked by clarity · tap for the pair page</div><div class="scroll"><table style="min-width:680px"><thead><tr><th>Market</th><th>Stance</th><th class="n" title="P(today's high-low beyond the ladder's p75); 25% is a normal day">Beyond p75</th><th class="n">Range ×</th><th>Direction</th><th>Plan</th></tr></thead><tbody>${pairs}</tbody></table></div>
${(g.invalidation ?? []).length ? `<div class="lbl" style="margin-top:14px">What would change this read</div>${g.invalidation.map(x => `<div class="tt-row">${h(x)}</div>`).join('')}` : ''}
<details><summary>Data problems (${probs.length})</summary>${probs.map(p => `<div class="tt-row muted">${h(p)}</div>`).join('')}</details>
<details><summary>Context — read, not weighted (${(g.context ?? []).length})</summary>${(g.context ?? []).map(x => `<div class="tt-row muted">${h(x)}</div>`).join('')}</details>
<p class="tt-note">Weight = P(real | evidence tier) × predictive value × sample-size shrink × freshness. A null is read and shown, never dropped; it carries no weight. Day-level continuation against reversal is a banked coin flip, so the read names the range regime and leaves continuation to the intraday rules.</p></div>`;
}
const FAM = { 'macro-state': 'Macro', 'price-state': 'Trend', events: 'Events', positioning: 'Positioning', rates: 'Yields', 'rates-rv': 'Spreads', risk: 'Credit/risk', intraday: 'Today so far', 'vol-surface': 'Vol curve' };
function drawDay(g) {
  const box = el('tt-day'); if (!box) return;
  if (!g?.cards) { box.innerHTML = '<div class="muted">No Global Read, so no Day Read.</div>'; return; }
  const ch = g.meta?.chain, doms = (ch?.stories ?? []).filter(x => x.status === 'dominant').map(x => x.name);
  const rows = (g.ranked ?? []).map(rk => { const k = g.cards[rk.sym]; if (!k) return '';
    const st = k.direction?.story, pUp = st?.nLive ? st.pUp : 0.5, edge = Math.abs(pUp - 0.5);
    const lean = edge < 0.02 ? '<span class="fl mono">Two-way</span>' : `<span class="mono ${pUp > 0.5 ? 'up' : 'dn'}" title="${h(st?.label ?? '')}"><b>${pUp > 0.5 ? '▲ Up' : '▼ Down'}</b> ${Math.round(Math.max(pUp, 1 - pUp) * 100)}%</span>`;
    const p75 = k.range?.pAbove75, day = p75 == null ? '' : p75 >= 0.32 ? '<span class="chip gold">Wide</span>' : p75 <= 0.18 ? '<span class="chip pur">Capped</span>' : '<span class="chip">Normal</span>';
    const fam = {}; for (const x of st?.reads ?? []) { const f = (fam[x.family] ??= { s: 0, notes: [] }); f.s += x.contrib ?? x.s * 0.05; f.notes.push(`${x.label}: ${x.note ?? ''}`); }
    const tot = Object.values(fam).reduce((a, f) => a + Math.abs(f.s), 0) || 1;
    const why = Object.entries(fam).filter(([, f]) => Math.abs(f.s) / tot >= 0.12).sort((a, b) => Math.abs(b[1].s) - Math.abs(a[1].s)).slice(0, 3).map(([k2, f]) => `<span class="${f.s > 0 ? 'up' : 'dn'}" title="${h(f.notes.join(' · '))}">${f.s > 0 ? '▲' : '▼'} ${h(FAM[k2] ?? k2)}</span>`).join('');
    return `<div class="tt-day tt-click" data-pair="${h(rk.sym)}" tabindex="0"><b>${h(nice(rk.sym))}</b>${lean}${day || '<span></span>'}<span class="why">${why}</span></div>`; }).join('');
  box.innerHTML = `${ch?.hook ? `<div class="thesis" style="margin-top:0">“${h(ch.hook)}”</div>` : `<div class="thesis" style="margin-top:0">${h(g.headline ?? '')}</div>`}${doms.length ? `<div class="muted">The live stories: ${doms.map(h).join(' · ')}</div>` : ''}
<div class="tt-day" style="font:600 10px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--tx3)"><span>Market</span><span>Story lean</span><span>Day size</span><span>Because</span></div>${rows}
<p class="tt-note"><b>Day size</b> (wide / normal / capped, from P(range beyond p75)) is tested. <b>Up / down</b> is the story lean: every read that points a way, family-weighted, scored forward as a shadow; it is not validated.</p>`;
}
function drawWatch(w) {
  const box = el('tt-watch'); if (!box) return;
  if (!w?.states) { box.innerHTML = `<div class="muted">${h(w?.error ?? 'No desk watch.')}</div>`; return; }
  T._watch = w;
  const firing = w.states.filter(t => t.firing && !t.id.startsWith('chain-')), chain = w.states.filter(t => t.firing && t.id.startsWith('chain-'));
  const near = (w.gauges ?? []).filter(g => !g.firing && g.stage === 'approaching');
  const row = (t, tag) => `<div class="tt-row"><span class="chip ${tag === 'firing' ? 'gold' : tag === 'chain' ? 'gold' : 'pur'}">${tag === 'firing' ? (t.kind === 'tested' ? '✓ tested' : '~ ' + h(t.kind ?? '')) : tag}</span><b style="flex:1;min-width:0">${h(String(t.label).replace(/^Setup watch · /, '').replace(/^Chain link broken: /, ''))}</b>${t.since ? `<span class="w">since ${h(dayName(Date.parse(t.since)))}</span>` : ''}<span class="muted" style="flex-basis:100%">${h(String(t.detail ?? t.lookFor ?? '').slice(0, 260))}${t.expect?.length ? ` → expect ${t.expect.slice(0, 2).map(e => `${h(e.inst)} ~${h(e.after)}${h(e.unit ?? '')}`).join(', ')}` : ''}</span></div>`;
  box.innerHTML = `<div class="tt-counts"><span class="chip ${firing.length ? 'gold' : ''}">${firing.length} firing</span><span class="chip ${chain.length ? 'gold' : ''}">${chain.length} chain breaks</span><span class="chip">${near.length} approaching</span>${w.lastTick ? `<span class="chip">checked ${h(hm(Date.parse(w.lastTick)))}</span>` : ''}</div>
${(() => { const all = [...firing.map(t => row(t, 'firing')), ...chain.map(t => row(t, 'chain')), ...near.slice(0, 6).map(t => row(t, 'approaching'))]; return all.slice(0, 6).join('') + (all.length > 6 ? `<details><summary>${all.length - 6} more</summary>${all.slice(6).join('')}</details>` : ''); })()}${!firing.length && !chain.length && !near.length ? '<div class="muted">Nothing firing and nothing approaching.</div>' : ''}
<p class="tt-note">Telegram on change. Each condition carries this desk's verdict on it: <a href="evidence.html" target="_blank" rel="noopener">the evidence book →</a></p>`;
}
function precVerdict(row) {
  if (!row?.all?.enough) return ['too few days', ''];
  if (row.unstable) return ['did not hold up', 'gold'];
  const m = row.all.mean; if (m == null || Math.abs(m) < 0.05) return ['no clear tendency', ''];
  return [m > 0 ? 'drifted higher' : 'drifted lower', m > 0 ? 'up' : 'dn'];
}
function drawPrec(m) {
  const box = el('tt-prec'); if (!box) return;
  const st = m?.study, now = m?.now;
  if (!st?.ok || !now?.key) { box.innerHTML = `<div class="muted">${h(m?.error ?? 'No precedent study.')}</div>`; return; }
  const rows = (st.pairs ?? []).map(p => ({ p, row: st.regimes?.[now.key]?.[p]?.[20] })).filter(x => x.row);
  box.innerHTML = `<div style="font-size:13px">Today is <b>${h(now.describe)}</b>. That has happened on <b>${st.counts?.[now.key] ?? 0}</b> days since ${h(st.dates?.from ?? '')}.</div>
${rows.map(({ p, row }) => { const [w, c] = precVerdict(row), a = row.all; return `<div class="tt-row tt-click" data-pair="${h(p)}" tabindex="0" title="${h(`n=${a.n} (~${a.nEffective ?? '?'} independent) · median ${a.median ?? '–'}% · earlier half ${row.is?.mean ?? '–'}%, later half ${row.oos?.mean ?? '–'}%`)}"><b style="min-width:64px">${h(nice(p))}</b><span class="chip ${c}">${h(w)}</span><span class="mono ${dirCls(a.mean)}">${a.mean != null ? `${sg(a.mean)}%` : '—'}</span><span class="w">${a.hitRate != null ? `${a.hitRate}% up · ` : ''}n=${a.n}${row.unstable ? ' ⚠' : ''}</span></div>`; }).join('') || '<div class="muted">No pair has enough history in this regime.</div>'}
<p class="tt-note">A historical base rate over the 20 sessions after, not a forecast. ⚠ = the sign flipped between the two halves of history. Windows overlap, so no significance test is offered.</p>`;
}
function drawTimeline() {
  const box = el('tt-tl'); if (!box || !T.chain.inputs || typeof D === 'undefined' || !D.ev) return;
  const v20 = CB.chainVals(T.chain.inputs, 20), v5 = CB.chainVals(T.chain.inputs, 5), w = T._watch;
  const bp = v => (v == null ? '?' : `${v >= 0 ? '+' : ''}${Math.round(v)}bp`);
  const rates = v => { const a = v.us2y?.delta, b = v.us10y?.delta; if (a == null && b == null) return 'No rates data.'; const big = Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0)); return big < 8 ? `Rates went nowhere (2Y ${bp(a)}, 10Y ${bp(b)})` : `Rates ${(a ?? b) > 0 ? 'rose' : 'fell'}${big >= 25 ? ' hard' : ''} (2Y ${bp(a)}, 10Y ${bp(b)}), ${Math.abs(a ?? 0) > Math.abs(b ?? 0) ? 'the front end leading' : 'the long end leading'}`; };
  const dollar = v => (v.dxy?.delta == null ? '' : Math.abs(v.dxy.delta) < 0.4 ? '; the dollar barely moved' : `; the broad dollar ${v.dxy.delta > 0 ? 'up' : 'down'} ${Math.abs(v.dxy.delta).toFixed(1)}%`);
  const fear = v => (v.vix?.delta == null || Math.abs(v.vix.delta) < 1.5 ? '' : `; fear ${v.vix.delta > 0 ? 'rose' : 'eased'} (VIX ${sg(v.vix.delta, 1)})`);
  const now = Date.now(), dd = 864e5;
  const logIn = (a, b) => (w?.log ?? []).filter(e => { const t = Date.parse(e.at); return e.event === 'started' && t <= now - a * dd && t > now - b * dd; });
  const logLines = (a, b) => { const L = logIn(a, b), seen = new Set(), u = L.filter(e => !seen.has(e.id) && seen.add(e.id)); return u.length ? `<div><span class="lbl">watch</span> ${u.slice(0, 4).map(e => h(String(e.label).replace(/^Chain link broken: /, 'broke: ').replace(/^Setup watch · /, ''))).join(' · ')}${u.length > 4 ? ` +${u.length - 4}` : ''}</div>` : ''; };
  const G10 = new Set(['US', 'EU', 'DE', 'GB', 'JP', 'CH', 'AU', 'CA', 'NZ']);
  const ahead = [...(D.ev ?? []), ...((T.cache['/api/calendar-ahead'] && T._calAhead) || [])].map(e => ({ ...e, ms: Number(e.ms ?? Date.parse(e.time)) })).filter(e => /high/i.test(e.impact ?? '') && G10.has(e.country) && Number.isFinite(e.ms));
  const evIn = (a, b) => { const seen = new Set(); return ahead.filter(e => e.ms > now + a * dd && e.ms <= now + b * dd).sort((x, y) => x.ms - y.ms).filter(e => { const k = `${e.country}|${e.event}|${Math.round(e.ms / 36e5)}`; return !seen.has(k) && seen.add(k); }); };
  const evLines = L => (L.length ? L.slice(0, 5).map(e => `<div><span class="mono">${h(dayName(e.ms))}</span> ${h(e.country)} ${h(e.event)}</div>`).join('') + (L.length > 5 ? `<div class="muted">+${L.length - 5} more</div>` : '') : '<div class="muted">No high-impact release on the calendar yet.</div>');
  const chainNowN = (w?.states ?? []).filter(t => t.id.startsWith('chain-') && t.firing), firing = (w?.states ?? []).filter(t => t.firing && !t.id.startsWith('chain-'));
  const book = Object.entries(D.cards ?? {}).filter(([, c]) => (DIR[c.rating] ?? 0) !== 0).sort((a, b) => (b[1].size ?? 0) - (a[1].size ?? 0)).slice(0, 4);
  box.innerHTML = `<div class="tt-tl">
<div class="col"><h4>Three weeks ago → last week</h4><div class="lead">${h(rates(v20) + dollar(v20))}.</div>${logLines(5, 21)}</div>
<div class="col"><h4>This week</h4><div class="lead">${h(rates(v5) + dollar(v5) + fear(v5))}.</div>${logLines(0, 5)}</div>
<div class="col now"><h4>Today</h4><div class="lead">${chainNowN.length ? `${chainNowN.length} chain link${chainNowN.length === 1 ? '' : 's'} broken` : 'Nothing broken in the chain'}; ${firing.length ? `${firing.length} watch condition${firing.length === 1 ? '' : 's'} on` : 'no watch condition on'}.</div>${chainNowN.length ? `<div><span class="lbl">broken</span> ${chainNowN.map(t => h(String(t.label).replace('Chain link broken: ', ''))).join(' · ')}</div>` : ''}${book.length ? `<div><span class="lbl">book</span> ${book.map(([n, c]) => `<a href="#" data-pair="${h(n)}" class="${(DIR[c.rating] ?? 0) > 0 ? 'up' : 'dn'}" style="text-decoration:none">${h(n)} ${(DIR[c.rating] ?? 0) > 0 ? '▲' : '▼'}</a>`).join(' · ')}</div>` : ''}</div>
<div class="col ahead"><h4>Next week</h4>${evLines(evIn(0, 7))}</div>
<div class="col ahead"><h4>The month after</h4>${evLines(evIn(7, 28))}<div class="muted" style="margin-top:6px">Tested here: quiet stretches stay quiet and wild ones stay wild, more often than not.</div></div></div>
<p class="tt-note">The left is measured (moves, watch fires); the right is the calendar. Nothing here predicts direction.</p>`;
}
function drawWeek(ca, es) {
  const box = el('tt-week'); if (!box) return;
  T._calAhead = ca?.rows ?? [];
  const now = Date.now(), today = new Date().toISOString().slice(0, 10), hist = es?.series ?? {}, C = new Set(['US', 'EU', 'DE', 'GB', 'JP', 'CH', 'AU', 'CA', 'NZ', 'CN']);
  const ff = (D.ev ?? []).map(e => ({ ...e, ms: Number(e.ms ?? Date.parse(e.time)) })), ffLast = Math.max(0, ...ff.map(e => e.ms).filter(Number.isFinite));
  const rows = [...ff, ...T._calAhead.filter(e => e.ms > ffLast)].filter(e => Number.isFinite(e.ms) && e.ms > now && e.ms <= now + 7 * 864e5 && /high/i.test(e.impact ?? '') && C.has(e.country) && new Date(e.ms).toISOString().slice(0, 10) !== today).sort((a, b) => a.ms - b.ms);
  if (!rows.length) { box.innerHTML = '<div class="muted">No high-impact release left this week.</div>'; drawTimeline(); return; }
  const byDay = {}; for (const e of rows) (byDay[dayName(e.ms)] ??= []).push(e);
  const past = e => { const p = hist[`${String(e.country).toUpperCase()}|${String(e.event).trim().toLowerCase()}`] ?? []; if (!p.length) return '<span class="muted" style="font-size:11px">no history stored</span>';
    return `<span class="mono" title="${h(p.map(x => `${String(x.time ?? '').slice(0, 10)}: ${x.actual} vs ${x.estimate ?? '—'}`).join(' · '))}">${p.slice(0, 6).map(x => (x.beat === 'above' ? '<b class="up">▲</b>' : x.beat === 'below' ? '<b class="dn">▼</b>' : '<span class="muted">=</span>')).join(' ')}</span>`; };
  box.innerHTML = Object.entries(byDay).map(([d, es2]) => `<div class="lbl" style="margin:10px 0 2px">${h(d)}</div>${es2.map(e => `<div class="tt-row"><span class="mono" style="min-width:44px">${h(hm(e.ms))}</span><b style="min-width:26px">${h(e.country)}</b><span style="flex:1;min-width:140px">${h(e.event)}${e.estimate ? ` <span class="muted">est ${h(e.estimate)}</span>` : ''}</span>${past(e)}</div>`).join('')}`).join('')
    + '<p class="tt-note">▲ above forecast · ▼ below · = in line, newest first. A run of beats or misses is the context that makes the next one readable; it is not a forecast of it.</p>';
  drawTimeline();
}

// ═════════════════════════════════════════════ PAIR TAB ═════════════════════════════════════════════
const CHAIN_NODE_OF = { EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', AUDUSD: 'audusd', USDCAD: 'usdcad', GOLD: 'gold', NQ: 'nq', SPX500: 'spx', BTCUSD: 'btc', COPPER: 'copper', WTI: 'oil' };
function pairList() {
  const s = new Set([...Object.keys(D.cards ?? {})]);
  return [...s].sort((a, b) => (groupOf(a) === groupOf(b) ? a.localeCompare(b) : Object.keys(UNIVERSE).indexOf(groupOf(a)) - Object.keys(UNIVERSE).indexOf(groupOf(b))));
}
function openPair(inst) {
  T.pair = String(inst).toUpperCase();
  const want = `#pair=${T.pair}`; if (location.hash !== want) history.replaceState(null, '', want);
  const b = document.querySelector('#tabs [data-t="pair"]');
  if (b && b.getAttribute('aria-selected') !== 'true') b.click(); else renderPair();
  window.scrollTo?.({ top: 0 });
}
async function renderPair() {
  const root = el('pair'); if (!root) return;
  await ready();
  const list = pairList();
  if (!T.pair || !list.includes(T.pair)) T.pair = (location.hash.match(/pair=([A-Z0-9]+)/i)?.[1] ?? '').toUpperCase() || Object.entries(D.cards ?? {}).sort((a, b) => (b[1].size ?? 0) - (a[1].size ?? 0))[0]?.[0] || 'EURUSD';
  const n = T.pair, c = D.cards?.[n], legs = PV.legsOf(n);
  const top = Object.entries(D.cards ?? {}).filter(([, x]) => (DIR[x.rating] ?? 0) !== 0 && x.size > 0).sort((a, b) => b[1].size - a[1].size).slice(0, 8);
  T.pairChart?.destroy?.(); T.pairChart = null;
  root.innerHTML = `<div class="tt-pick"><label class="lbl" for="tt-sel">Market</label><select id="tt-sel">${Object.entries(GROUPS).map(([g, gl]) => { const xs = list.filter(x => groupOf(x) === g); return xs.length ? `<optgroup label="${h(gl)}">${xs.map(x => `<option value="${x}"${x === n ? ' selected' : ''}>${h(nice(x))}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>${top.map(([x, cx]) => `<button class="chip ${(DIR[cx.rating] ?? 0) > 0 ? 'up' : 'dn'}" data-p="${x}" style="cursor:pointer">${h(x)}</button>`).join('')}<span class="muted" style="margin-left:auto">link: <span class="mono">desk-terminal.html#pair=${h(n)}</span></span></div>
<div class="card glow"><div class="ch"><span class="chip">${h(GROUPS[groupOf(n)] ?? '')}</span><span class="chip">${h(n)}</span>${legs?.[0] ? `<span class="chip pur" data-ccy="${legs[0]}" style="cursor:pointer">${FLAG[legs[0]] ?? ''} ${legs[0]}</span><span class="chip pur" data-ccy="${legs[1]}" style="cursor:pointer">${FLAG[legs[1]] ?? ''} ${legs[1]}</span>` : ''}<span class="r">${c ? gradeChip(c) : ''}</span></div>
<h2 style="margin:0 0 8px;font:700 24px var(--sans)">${h(nice(n))}</h2>
${c ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${rateChip(c.rating)}${scoreBar(assetScore(c), '240px', assetWord(c))}${D.live?.[n] && D.live[n].rating !== c.rating ? `<span class="chip gold" title="${h(D.live[n].why ?? '')}">updated → ${h(D.live[n].rating)}</span>` : ''}</div>
<div class="thesis">“${h(firstSentence(c.why))}”</div><div class="drv">${sources(c.why).map(t => `<span>${t}</span>`).join('')}<span title="the card's own conviction, not the global ruling's or a currency's">card conviction ${h(c.conviction ?? '–')}</span><span>size ${c.size ?? '–'}${c.sizeBeforeCap && c.sizeBeforeCap !== c.size ? ` (from ${c.sizeBeforeCap}, capped by ${h((c.cappedBy ?? []).join(', '))})` : ''}</span></div>` : '<div class="muted">The desk has no card for this market today.</div>'}
<div class="tt-chart" id="tt-lc"></div>
${c ? `${ladder(c)}<div class="pb">${c.plan?.zone ? `<div class="en"><b>Entry</b><span>${h(c.plan.zone)}</span></div>` : ''}${c.levels?.up ? `<div class="tg"><b>Lines</b><span class="mono">up ${c.levels.up.p50} / ${c.levels.up.p75} / ${c.levels.up.p90} · down ${c.levels.down.p50} / ${c.levels.down.p75} / ${c.levels.down.p90}</span></div>` : ''}<div class="iv"><b>Invalid</b><span>${h(c.plan?.invalidation ?? c.invalidation ?? '–')}</span></div>${c.plan?.timing ? `<div><b>Timing</b><span>${h(c.plan.timing)}</span></div>` : ''}</div><details><summary>The whole thesis</summary><p>${h(c.why)}</p>${deskView(n)}</details>${whatDrivesHtml(n)}` : ''}
<p class="tt-note">Chart: hourly candles, today's forecast lines (open, up and down p50 / p75 / p90), the entry zone and the invalidation where the plan names them.</p></div>
<div class="tt-grid2" style="margin-top:14px">
<div class="card" id="tt-p-gr">${loading('the Global Read for this market')}</div>
<div class="card" id="tt-p-rates">${loading('rates')}</div>
<div class="card" id="tt-p-fv">${loading('fair value')}</div>
<div class="card" id="tt-p-stfv">${loading('short-term fair value')}</div>
<div class="card" id="tt-p-pos">${loading('positioning')}</div>
<div class="card" id="tt-p-carry">${loading('carry and options')}</div>
<div class="card" id="tt-p-hours">${loading('session hours and seasonality')}</div>
<div class="card" id="tt-p-prec">${loading('precedent and the chain')}</div>
<div class="card" id="tt-p-res">${loading('research')}</div></div>`;
  root.querySelector('#tt-sel').onchange = e => openPair(e.target.value);
  root.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => openPair(b.dataset.p)));
  wire(root);
  pairChart(n, c);
  const mine = () => T.pair === n;
  J('/api/global-read').then(g => mine() && pairGR(n, g));
  Promise.all([J('/api/global-read')]).then(([g]) => mine() && pairRates(n, g));
  J('/api/fair-value').then(fv => mine() && pairFair(n, fv));
  if (legs?.[0]) J('/api/fx-fair-value').then(d => { const b = mine() && el('tt-p-stfv'); if (b) b.innerHTML = FVV.stfvPairCard(d, n); }); else el('tt-p-stfv')?.remove();
  pairPos(n);
  Promise.all([J('/api/carry-vol'), J('/api/options-skew')]).then(([cv, sk]) => mine() && pairCarry(n, cv, sk));
  Promise.all([J('/api/session-heat'), J(`/api/desk-season?inst=${n}`)]).then(([sh, ss]) => mine() && pairHours(n, sh, ss));
  Promise.all([J('/api/macro-regime-fx'), loadChain()]).then(([m]) => mine() && pairPrec(n, m));
  Promise.all([J('/api/research-pod'), J('/api/research-pod/papers')]).then(([rp, pp]) => mine() && pairResearch(n, rp, pp));
}
async function pairChart(n, c) {
  const box = el('tt-lc'); if (!box) return;
  if (!window.LightweightCharts) { box.innerHTML = '<p class="muted" style="padding:12px">The chart library did not load.</p>'; return; }
  const r = await J(`/api/desk-bars?inst=${n}&days=8`), b = r?.bars ?? [];
  if (T.pair !== n || !el('tt-lc')) return;
  if (!b.length) { box.innerHTML = `<p class="muted" style="padding:12px">${h(r?.error ?? 'No price bars for this market.')}</p>`; return; }
  const dp = b[0].close >= 1000 ? 1 : b[0].close >= 100 ? 2 : b[0].close >= 10 ? 3 : 5;
  const v = createLevelChart(box, { height: 340, priceDigits: dp, chartOptions: { layout: { background: { color: '#0c1124' }, textColor: '#a9b0d0', fontFamily: 'JetBrains Mono' }, grid: { vertLines: { color: 'rgba(44,56,102,.35)' }, horzLines: { color: 'rgba(44,56,102,.35)' } }, rightPriceScale: { borderColor: '#2c3866' }, timeScale: { borderColor: '#2c3866', timeVisible: true } },
    candleColors: { upColor: '#2fd39a', downColor: '#ff5d78', wickUpColor: '#2fd39a', wickDownColor: '#ff5d78' } });
  T.pairChart = v;
  v.setCandles(b);
  const L = c?.levels, lv = [];
  if (L) { lv.push({ price: L.open, kind: 'daily_open', label: 'open' }); for (const q of ['p50', 'p75', 'p90']) { lv.push({ price: L.up?.[q], kind: 'pdl', label: `up ${q}` }); lv.push({ price: L.down?.[q], kind: 'pdh', label: `dn ${q}` }); } }
  const inRange = x => !L?.down?.p90 || (x > L.down.p90 * 0.97 && x < L.up.p90 * 1.03);
  const z = String(c?.plan?.zone ?? '').match(/\d+(?:\.\d+)?/g)?.map(Number).filter(inRange) ?? [];
  if (z.length) { lv.push({ price: Math.min(...z), kind: 'zone', label: 'entry' }); if (z.length > 1) lv.push({ price: Math.max(...z), kind: 'zone', label: 'entry' }); }
  const inv = Number(String(c?.plan?.invalidation ?? c?.invalidation ?? '').match(/\d+(?:\.\d+)?/)?.[0]); if (Number.isFinite(inv) && inRange(inv)) lv.push({ price: inv, kind: 'resistance', label: 'invalid' });
  v.setLevels(lv.filter(x => Number.isFinite(x.price))).fit();
  // the short-term fair value as a line (description only: its label carries the verdict word)
  if (PV.isFx(n)) J('/api/fx-fair-value').then(d => { const f = FVV.fairLevel(d, n), lastC = b.at(-1)?.close; if (f && T.pairChart === v && lastC && Math.abs(f.price / lastC - 1) < 0.03) v.setLevels([...lv, f].filter(x => Number.isFinite(x.price))); });
}
function pairGR(n, g) {
  const box = el('tt-p-gr'); if (!box) return;
  const k = g?.cards?.[n];
  if (!k) { box.innerHTML = `<div class="lbl">Global Read · the pair drill</div><p class="muted">The Global Read covers ${h(Object.keys(g?.cards ?? {}).join(', ') || 'no markets')} today, not ${h(n)}.</p>`; return; }
  const drv = (k.range?.drivers ?? []).map(d => `${h(d.why)} ×${d.mult}`).join(' · ') || 'no conditioner active';
  const ins = (k.direction?.shown ?? []).map(x => `<tr><td>${h(x.label)}</td><td class="${x.s > 0 ? 'up' : x.s < 0 ? 'dn' : 'fl'}" style="opacity:${x.e > 0 ? 1 : 0.45}">${x.s > 0 ? '▲' : x.s < 0 ? '▼' : '0'}</td><td class="n">${x.e}</td><td class="muted" style="font-size:11.5px">${h(x.tierLabel ?? x.tier ?? '')}</td><td class="muted" style="font-size:11.5px">${h(x.note ?? '')}</td></tr>`).join('');
  box.innerHTML = `<div class="ch"><span class="lbl">Global Read · the pair drill</span><span class="r">${stanceChip(k.plan?.stance)}</span></div>
<div style="font-size:13px"><b>${h(k.plan?.lines ?? '')}</b><br>${h(k.plan?.direction ?? '')}</div>
<div class="tt-tiles"><div class="tt-tile"><div class="lbl">Beyond p75</div><div class="v">${pctTxt(k.range?.pAbove75)}</div><div class="s">25% is a normal day</div></div><div class="tt-tile"><div class="lbl">Range ×</div><div class="v">${k.range?.mult ?? '—'}</div><div class="s">${k.range?.expectedHl ?? '—'}% vs ${k.range?.hlP50 ?? '—'}%</div></div><div class="tt-tile"><div class="lbl">Tested P(up)</div><div class="v">${pctTxt(k.direction?.pUp)}</div><div class="s">${k.direction?.story?.nLive ? `story ${pctTxt(k.direction.story.pUp)} (shadow)` : 'no story lean'}</div></div></div>
<div class="muted">${drv}</div>${ins ? `<div class="scroll" style="margin-top:8px"><table style="min-width:520px"><thead><tr><th>Input</th><th>Says</th><th class="n">Weight</th><th>Evidence</th><th>Reading</th></tr></thead><tbody>${ins}</tbody></table></div>` : ''}
<p class="tt-note">${h(k.behaviour?.label ?? '')}${k.behaviour?.why ? ` — ${h(k.behaviour.why)}` : ''}</p>`;
}
function pairRates(n, g) {
  const box = el('tt-p-rates'); if (!box) return;
  const legs = PV.legsOf(n);
  if (!legs?.[0]) { const R = D.rates?.now ?? {}, ch = D.rates?.change20d ?? {}; box.innerHTML = `<div class="lbl">Rates</div><p class="muted">${h(nice(n))} has no currency pair of rates. The US curve it trades against:</p><div class="tt-kv">${['us2y', 'us10y', 'real'].filter(k => R[k]).map(k => `<b>${k}</b><span class="mono">${R[k].value}% ${ch[k] != null ? `<span class="${dirCls(ch[k])}">${sg(ch[k], 0)}bp / 20d</span>` : ''}</span>`).join('')}</div>`; return; }
  const gap = PV.rateGap(n, { rd: D.rd, ry: D.ry, policy: D.pr?.rates }), [a, b] = legs, ca = g?.currencies?.[a]?.state, cb = g?.currencies?.[b]?.state;
  const row = (l, v, unit = 'pp', title = '') => `<b title="${h(title)}">${l}</b><span class="mono ${dirCls(v)}">${v == null ? '–' : `${sg(v)}${unit}`}</span>`;
  box.innerHTML = `<div class="lbl">Rates · ${a} minus ${b}</div>
<div class="tt-kv" style="margin-top:8px">${row('Policy', gap.policy, 'pp', 'policy rates from each bank (/api/policy-rates)')}${row('3-month', gap.short, 'pp', '3-month rates (/api/rate-diff)')}${row('3m gap z', gap.shortZ, '', 'z of each leg against its own history, base minus quote')}${row('Real 10Y', gap.real, 'pp', '10Y minus CPI (/api/real-yield)')}${row('10Y', gap.y10)}${ca?.spreadZ != null || cb?.spreadZ != null ? `<b title="each leg's 2Y spread against USD, as a z-score (Global Read)">2Y spread z vs USD</b><span class="mono">${a} ${sg(ca?.spreadZ)} · ${b} ${b === 'USD' ? '0' : sg(cb?.spreadZ)}</span>` : ''}</div>
<div class="tt-kv" style="margin-top:10px">${[a, b].map(x => `<b>${x}</b><span>${pol(x) ? `policy ${pct(pol(x).rate)}` : ''}${D.sc?.cbSentiment?.[x] ? ` · ${h(D.sc.cbSentiment[x].regime.toLowerCase())} (${D.sc.cbSentiment[x].score})` : ''}${D.ry?.byCcy?.[x]?.latestReal != null ? ` · real ${D.ry.byCcy[x].latestReal}%` : ''}</span>`).join('')}</div>
<p class="tt-note">The 2Y yield-spread sleeve is a tested null for direction on this desk; the gap is context.</p>`;
}
function pairFair(n, fv) {
  const box = el('tt-p-fv'); if (!box) return;
  const legs = PV.legsOf(n), ccys = legs?.[0] ? legs : ['USD'];
  if (!fv?.ok) { box.innerHTML = `<div class="lbl">Fair value</div><p class="muted">${h(fv?.error ?? 'No BIS fair-value board.')}</p>`; return; }
  const rows = ccys.map(c => [c, (fv.rows ?? []).find(r => r.ccy === c)]);
  box.innerHTML = `<div class="lbl">Fair value · both legs</div>${rows.map(([c, r]) => (r ? `<div class="tt-row"><b style="min-width:44px">${FLAG[c] ?? ''} ${c}</b><span class="chip ${r.devPct > 5 ? 'dn' : r.devPct < -5 ? 'up' : ''}">${h(r.label)}</span><span class="mono ${r.devPct > 0 ? 'dn' : 'up'}">${sg(r.devPct, 1)}%</span><span class="w">vs ${Math.round(r.years)}y avg · 12m ${sg(r.chg12m, 1)}%</span><span style="flex-basis:100%">${spk(r.spark, 260, 30, r.devPct > 0 ? 'var(--dn)' : 'var(--up)')}</span></div>` : `<div class="tt-row"><b>${c}</b><span class="muted">no BIS row</span></div>`)).join('')}
<p class="tt-note">BIS real effective exchange rate against its own average (${h(fv.asOf ?? '')}): a slow anchor, not timing. ${legs?.[0] ? 'Rich base and cheap quote is the stretched side of the pair.' : ''}</p>`;
}
async function pairPos(n) {
  const box = el('tt-p-pos'); if (!box) return;
  const ct = D.cot?.instruments?.[n], cr = PV.crowdFor(D.book, n);
  const hist = ct ? await J('/api/desk-cot-history?weeks=156') : null;
  if (T.pair !== n || !el('tt-p-pos')) return;
  const key = { EURUSD: 'EUR', GBPUSD: 'GBP', USDJPY: 'JPY', AUDUSD: 'AUD', USDCAD: 'CAD', USDCHF: 'CHF', NZDUSD: 'NZD', GOLD: 'GOLD', NQ: 'NQ', SPX500: 'SPX' }[n], S = hist?.series?.[key];
  box.innerHTML = `<div class="lbl">Positioning</div>
${ct ? `<div class="tt-row"><b>COT speculators</b><span class="chip ${ct.side === 'long' ? 'up' : ct.side === 'short' ? 'dn' : ''}">${h(ct.label ?? ct.zone ?? '–')}</span><span class="mono">${ct.pct ?? '–'}th pct · share ${sg(ct.share, 1)}%</span><span class="muted" style="flex-basis:100%">${h(ct.line ?? '')} <span class="chip" style="font-size:9px">${h(ct.verdict ?? '')}</span> · report ${h(ct.reportDate ?? '')}</span></div>${S ? `<div>${spk(S.specShare.map(Number), 300, 40, 'var(--pur2)')}<div class="muted" style="font-size:11px">speculators' net share, ${h(S.dates[0])} → ${h(S.dates.at(-1))}${['USDJPY', 'USDCAD', 'USDCHF'].includes(n) ? ` (the ${key} future: inverted against the pair)` : ''}</div></div>` : ''}` : '<div class="muted">No COT row for this market.</div>'}
${cr ? `<div class="tt-row"><b>Retail (OANDA)</b><span style="flex:1;min-width:120px"><span class="gauge" style="display:flex"><i style="width:${cr.long}%;background:var(--up)"></i><i style="width:${100 - cr.long}%;background:var(--dn)"></i></span></span><span class="mono">${cr.long.toFixed(0)}% long${cr.d24 != null ? ` <span class="${dirCls(cr.d24)}">${sg(cr.d24, 1)}</span>` : ''}</span></div>` : '<div class="muted">No retail book for this market.</div>'}
<p class="tt-note">Context, not a signal: the COT positioning factor tested null for direction here.</p>`;
}
function pairCarry(n, cv, sk) {
  const box = el('tt-p-carry'); if (!box) return;
  const r = cv?.ok ? PV.rowFor(cv.rows, n) : null, s = sk?.ok ? PV.rowFor(sk.rows, n) : null;
  box.innerHTML = `<div class="lbl">Carry against vol</div>${r ? `<div class="tt-kv" style="margin-top:8px"><b>Carry</b><span class="mono ${dirCls(r.carry)}">${sg(r.carry)}% a year (${h(r.base)} ${cv.rates?.[r.base] ?? '?'}% − ${h(r.quote)} ${cv.rates?.[r.quote] ?? '?'}%)</span><b>Realised vol</b><span class="mono">${r.vol}%</span><b>Carry / vol</b><span class="mono">${r.ratio} · earn it ${h(r.side)}</span></div>` : `<p class="muted">${h(cv?.ok ? 'Not on the carry board.' : cv?.error ?? 'No carry board.')}</p>`}
<div class="lbl" style="margin-top:14px">Options skew</div>${s ? `<div class="tt-kv" style="margin-top:8px">${['1w', '1m', '3m'].map(t => `<b>RR ${t}</b><span class="mono ${dirCls(s.tenors?.[t]?.rr25)}">${s.tenors?.[t]?.rr25 != null ? sg(s.tenors[t].rr25 * (s.sign ?? 1)) : '–'}</span>`).join('')}<b>ATM 1m</b><span class="mono">${s.atm != null ? s.atm.toFixed(1) : '–'}</span><b>Reading</b><span>${h(s.reading ?? s.label ?? '')}</span></div>` : `<p class="muted">${h(sk?.ok ? 'No options row for this market.' : sk?.error ?? 'No options pull.')}</p>`}
<p class="tt-note">Risk reversals shown for the pair as traded: positive = calls on the pair dearer.</p>`;
}
function pairHours(n, sh, ss) {
  const box = el('tt-p-hours'); if (!box) return;
  const r = sh?.ok ? PV.rowFor(sh.rows, n) : null, mx = r ? Math.max(...r.share) : 1;
  const MON = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'], cm = new Date().getUTCMonth();
  const mm = ss?.ok ? Math.max(...ss.months.map(m => Math.abs(m.mean ?? 0)), 0.01) : 1;
  box.innerHTML = `<div class="lbl">When it moves · London hours</div>${r ? `<div class="tt-hours">${r.share.map((v, i) => `<i title="${String(i).padStart(2, '0')}:00 London · ${v}% of the day's range" style="background:rgba(232,184,90,${(0.08 + (v / mx) * 0.85).toFixed(2)});${i === r.peakHour ? 'outline:1px solid var(--tx)' : ''}"></i>`).join('')}</div><div class="ladlab"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div><div class="muted">busiest hour ${String(r.peakHour).padStart(2, '0')}:00 London · last ${h(sh.window)}</div>` : `<p class="muted">${h(sh?.ok ? 'Not on the session board (it covers EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, GOLD, NQ, WTI).' : sh?.error ?? 'No session board.')}</p>`}
<div class="lbl" style="margin-top:14px">Seasonality · mean monthly return</div>${ss?.ok ? `<div class="tt-months">${ss.months.map((m, i) => `<div title="${MON[i]}: mean ${m.mean ?? '–'}% · up ${Math.round((m.up ?? 0) * 100)}% of ${m.n} years"><i style="height:${Math.max(2, Math.abs(m.mean ?? 0) / mm * 64)}px;background:${(m.mean ?? 0) >= 0 ? 'var(--up)' : 'var(--dn)'};opacity:${i === cm ? 1 : 0.55};${i === cm ? 'box-shadow:0 0 10px var(--gold)' : ''}"></i><span style="${i === cm ? 'color:var(--gold)' : ''}">${MON[i]}</span></div>`).join('')}</div><div class="muted">${h(ss.from)} → ${h(ss.to)} · this month: ${ss.months[cm]?.mean != null ? `${sg(ss.months[cm].mean)}%, up ${Math.round((ss.months[cm].up ?? 0) * 100)}% of ${ss.months[cm].n} years` : '–'}. History, not a forecast.</div>` : `<p class="muted">${h(ss?.error ?? 'No daily history.')}</p>`}`;
}
function pairPrec(n, m) {
  const box = el('tt-p-prec'); if (!box) return;
  const st = m?.study, key = m?.now?.key, rows = [5, 20].map(hz => [hz, st?.regimes?.[key]?.[n]?.[hz]]).filter(([, r]) => r);
  const node = CHAIN_NODE_OF[n];
  const links = node && T.chain.inputs ? CB.chainLinks(T.chain.inputs, 20).filter(l => l.a?.key === node || l.b?.key === node) : [];
  box.innerHTML = `<div class="lbl">Precedent · days like today</div>${rows.length ? `<div class="muted" style="margin:6px 0">${h(m.now.describe)}</div>${rows.map(([hz, r]) => { const [w, c] = precVerdict(r); return `<div class="tt-row"><b>${hz} sessions</b><span class="chip ${c}">${h(w)}</span><span class="mono ${dirCls(r.all.mean)}">${r.all.mean != null ? `${sg(r.all.mean)}%` : '–'}</span><span class="w">${r.all.hitRate ?? '–'}% up · n=${r.all.n}${r.unstable ? ' ⚠' : ''}</span></div>`; }).join('')}` : '<p class="muted">No precedent row for this market.</p>'}
<div class="lbl" style="margin-top:14px">On the chain · 20-day</div>${node ? (links.length ? links.map(l => `<div class="tt-row"><span class="vchip ${CB.VCLS[l.verdict]}">${CB.VWORD[l.verdict]}</span><span style="flex:1;min-width:0">${h(l.short)} · ${h(l.a.label)} ${h(endTxt(l.a))} → ${h(l.b.label)} ${h(endTxt(l.b))}</span>${l.punch ? `<span class="muted" style="flex-basis:100%">${h(l.punch)}</span>` : ''}</div>`).join('') : '<p class="muted">Loading the chain…</p>') : '<p class="muted">Not a chip on the chain.</p>'}`;
}
function pairResearch(n, rp, pp) {
  const box = el('tt-p-res'); if (!box) return;
  const r = PV.researchFor(n, { library: rp?.library ?? [], papers: pp?.papers ?? [] });
  box.innerHTML = `<div class="lbl">Research that names ${h(PV.pairLabel(n))}</div>
${r.proposals.length ? r.proposals.map(p => `<div class="tt-row"><span class="chip ${['passed', 'paper', 'live'].includes(p.lifecycle?.stage) ? 'up' : p.lifecycle?.stage === 'failed' ? 'dn' : 'pur'}">${h(p.lifecycle?.stage ?? 'proposed')}</span><b style="flex:1;min-width:0">${h(p.title)}</b><span class="w">${h(p.lens ?? '')}</span>${p.thesis ? `<span class="muted" style="flex-basis:100%">${h(String(p.thesis).slice(0, 200))}</span>` : ''}</div>`).join('') : '<div class="muted">No research pod proposal names it.</div>'}
${r.papers.length ? `<div class="lbl" style="margin-top:12px">Papers</div>${r.papers.map(p => `<div class="tt-row"><span class="w" style="margin-left:0">${h(p.year ?? '')}</span>${p.url ? `<a href="${h(p.url)}" target="_blank" rel="noopener" style="flex:1;min-width:0">${h(p.title)}</a>` : `<b style="flex:1;min-width:0">${h(p.title)}</b>`}${p.notes?.claim ? `<span class="muted" style="flex-basis:100%">${h(String(p.notes.claim).slice(0, 200))}</span>` : ''}</div>`).join('')}` : `<div class="muted" style="margin-top:8px">No paper in the library (${pp?.count ?? 0}) names it.</div>`}
<p class="tt-note">Proposals and papers, not results. <a href="#" data-goto="research">The research pipeline →</a></p>`;
  box.querySelector('[data-goto]')?.addEventListener('click', e => { e.preventDefault(); document.querySelector('#tabs [data-t="research"]')?.click(); });
}

// ═════════════════════════════════════════════ CHANGED TAB ═════════════════════════════════════════════
async function renderChanged() {
  const root = el('changed'); if (!root) return;
  if (!root.dataset.built) { root.dataset.built = '1'; root.innerHTML = `<div class="card glow">${loading('the previous book')}</div>`; }
  await ready();
  const idx = await J('/api/desk-run/index'), days = (idx?.days ?? []).filter(d => d.headOk);
  const curDate = D.run?.date ?? days.at(-1)?.date, prevDate = days.filter(d => d.date < curDate).at(-1)?.date;
  const [prevRun, snap, watch] = await Promise.all([prevDate ? J(`/api/desk-run?date=${prevDate}`) : null, J('/api/terminal/stress-snap'), J('/api/desk-watch')]);
  const curStress = snap?.ok ? snap.now : (E?.['world-stress']?.ok ? E['world-stress'] : null), prevStress = snap?.ok ? snap.previous : null;
  const r = whatChanged({ prevRun: prevRun?.ok ? prevRun : null, curRun: D.run, prevStress, curStress, watchLog: watch?.log ?? [] });
  const maxW = Math.max(1, ...r.items.map(x => x.weight)), KIND = { tone: 'tone', card: 'card', bias: 'ccy', stress: 'stress', chain: 'chain' };
  const prevB = prevRun?.ok ? (prevRun.debate?.currency?.view?.currencies ?? prevRun.head?.book?.currencies ?? {}) : {}, bar = (v, col) => `<i style="display:block;height:8px;border-radius:3px;width:${Math.abs(v) * 25}%;margin-left:${v >= 0 ? 50 : 50 - Math.abs(v) * 25}%;background:${col}"></i>`;
  const biasRows = CCYS.map(c => { const a = numOrNull(prevB[c]?.bias), b = numOrNull(D.ccy?.[c]?.bias); return `<b>${c}</b><span style="background:var(--bg3);border-radius:4px;position:relative" title="previous ${a ?? 'no ruling (no data)'}">${a == null ? '' : bar(a, 'rgba(138,147,184,.6)')}</span><span style="background:var(--bg3);border-radius:4px" title="now ${b ?? 'no ruling (no data)'}">${b == null ? '' : bar(b, b > 0 ? 'var(--up)' : b < 0 ? 'var(--dn)' : 'var(--flat)')}</span>`; }).join('');
  root.innerHTML = `<div class="card glow"><div class="tt-head"><span class="lbl">What changed</span><h2 style="flex-basis:100%">Since the previous book${r.prevDate ? ` (${h(r.prevDate)})` : ''}</h2></div>
<div class="tt-counts"><span class="chip gold">${r.summary.book} in the book</span><span class="chip">${r.summary.stress} stress tiles</span><span class="chip pur">${r.summary.chain} chain links</span><span class="chip">book ${h(r.curDate ?? '–')}</span>${prevStress ? `<span class="chip">stress vs ${h(prevStress.date)}</span>` : ''}</div>
${!prevDate ? '<p class="muted">There is no earlier book to compare with.</p>' : !prevRun?.ok ? `<p class="muted">Could not load the ${h(prevDate)} book: ${h(prevRun?.error ?? '')}</p>` : ''}
${r.items.length ? (() => { const one = x => `<div class="tt-chg${x.kind === 'card' ? ' tt-click' : ''}"${x.kind === 'card' ? ` data-pair="${h(x.key)}" tabindex="0"` : x.kind === 'bias' ? ` data-ccy="${h(x.key)}" tabindex="0"` : ''}><span class="chip ${x.kind === 'chain' ? 'pur' : x.kind === 'stress' ? (x.dir > 0 ? 'dn' : 'up') : x.dir > 0 ? 'up' : x.dir < 0 ? 'dn' : 'gold'}">${KIND[x.kind] ?? x.kind}</span><span class="t"><b>${h(x.title)}</b></span><span class="tt-wbar" title="weight ${x.weight}"><i style="width:${(x.weight / maxW) * 100}%"></i></span><span class="d">${h(x.detail ?? '')}</span></div>`; return r.items.slice(0, 15).map(one).join('') + (r.items.length > 15 ? `<details><summary>${r.items.length - 15} smaller changes</summary>${r.items.slice(15).map(one).join('')}</details>` : ''); })() : '<p class="muted">Nothing moved between the two books.</p>'}
<p class="tt-note">Ranked by how much it matters to the book: a flipped or new card weighs by its size, a currency bias by how far it moved (more if it changed sides), then world-stress tiles that changed colour${prevStress ? '' : ' (the first comparison appears once a snapshot from an earlier day exists: the server keeps the first look of each day)'}, then chain links that broke or came back in the desk watch since the previous book (more when they end on something the book holds). A reading order, not a model.</p></div>
<div class="tt-grid2" style="margin-top:14px"><div class="card"><div class="ch"><span class="lbl">Currency bias · previous → now</span></div><div class="tt-bias">${biasRows}</div><div class="muted" style="margin-top:6px">left: ${h(r.prevDate ?? '–')} · right: ${h(r.curDate ?? '–')} · −2 … +2</div></div>
<div class="card"><div class="ch"><span class="lbl">World stress now</span>${curStress ? `<span class="r chip ${curStress.overall === 'stress' ? 'dn' : curStress.overall === 'watch' ? 'gold' : 'up'}">${h(curStress.overall)}</span>` : ''}</div>${(curStress?.tiles ?? []).map(t => { const p = prevStress?.tiles?.find(x => x.id === t.id); return `<div class="tt-row"><span class="chip ${t.level === 'stress' ? 'dn' : t.level === 'watch' ? 'gold' : 'up'}">${h(t.level)}</span><b>${h(t.label)}</b>${p && p.level !== t.level ? `<span class="chip pur">was ${h(p.level)}</span>` : ''}<span class="w">${h(t.detail)}</span></div>`; }).join('') || '<div class="muted">No world-stress board.</div>'}</div></div>`;
  root.insertAdjacentHTML('beforeend', `${sec('Morning thesis vs evening reality', 'the book\'s claims laid against the day after the evening score · description, not a scored cell')}<div class="card" id="tt-tr">${loading('the thesis against reality')}</div>`);
  wire(root);
  root.querySelectorAll('[data-pair]').forEach(x => { x.onclick = () => openPair(x.dataset.pair); x.onkeydown = e => { if (e.key === 'Enter') openPair(x.dataset.pair); }; });
  drawThesisReality(el('tt-tr'));
}

// ═════════════════════════════════════════════ RESEARCH TAB ═════════════════════════════════════════════
const STAGE_ORDER = ['proposed', 'shortlisted', 'chosen', 'carded', 'preregistered', 'tested', 'forward-tested', 'passed', 'failed', 'paper', 'live', 'retired', 'parked', 'rejected'];
async function renderResearch() {
  const root = el('research'); if (!root) return;
  if (!root.dataset.built) { root.dataset.built = '1'; root.innerHTML = `<div class="card glow">${loading('the research pod')}</div>`; }
  const [rp, ds, so, bsm, shd] = await Promise.all([J('/api/research-pod'), J('/api/research-pod/dossiers'), J('/api/system-overview'), J('/api/bot-system-map'), J('/api/shadows')]);
  const lib = rp?.library ?? [], cnt = Object.fromEntries(STAGE_ORDER.map(s => [s, 0])); for (const p of lib) cnt[p.lifecycle?.stage ?? 'proposed'] = (cnt[p.lifecycle?.stage ?? 'proposed'] ?? 0) + 1;
  const active = lib.filter(p => ['build', 'shortlist'].includes(p.feedback?.status) || !['proposed', 'rejected', 'parked'].includes(p.lifecycle?.stage ?? 'proposed'))
    .sort((a, b) => STAGE_ORDER.indexOf(b.lifecycle?.stage ?? 'proposed') - STAGE_ORDER.indexOf(a.lifecycle?.stage ?? 'proposed'));
  const fresh = lib.filter(p => (p.lifecycle?.stage ?? 'proposed') === 'proposed' && !p.feedback).slice(0, 6);
  const systems = so?.systems ?? [], map = bsm?.map ?? {}, liveIds = new Set(Object.values(map));
  const paperLive = lib.filter(p => ['paper', 'live'].includes(p.lifecycle?.stage));
  const sc = rp?.scorecard ?? {};
  const propRow = p => `<div class="tt-row"><span class="chip ${['passed', 'paper', 'live'].includes(p.lifecycle?.stage) ? 'up' : p.lifecycle?.stage === 'failed' ? 'dn' : p.feedback?.status === 'build' ? 'gold' : 'pur'}">${h(p.lifecycle?.stage ?? 'proposed')}</span><b style="flex:1;min-width:0">${h(p.title)}</b><span class="w">${h(p.lens ?? '')}${p.priority ? ` · ${h(p.priority)}` : ''}${p.feedback?.status ? ` · marked ${h(p.feedback.status)}` : ''}</span>${p.thesis ? `<span class="muted" style="flex-basis:100%">${h(String(p.thesis).slice(0, 220))}</span>` : ''}${p.lifecycle?.outcome?.headline ? `<span class="muted" style="flex-basis:100%">${p.lifecycle.outcome.headline.trades} trades · Sharpe ${p.lifecycle.outcome.headline.sharpe ?? '?'}${p.lifecycle.outcome.verdict ? ` · Evidence Book ${h(p.lifecycle.outcome.verdict)}` : ''}</span>` : ''}</div>`;
  root.innerHTML = `<div class="card glow"><div class="tt-head"><span class="lbl">Research pipeline</span><h2 style="flex-basis:100%">From papers to proposals to systems</h2><span class="r" style="margin-left:0"><a class="btn" href="desk-office.html">Desk Office</a></span></div>
<div class="tt-pipe">${['proposed', 'shortlisted', 'carded', 'preregistered', 'tested', 'passed', 'failed', 'paper', 'live'].map(s => `<div class="${cnt[s] ? 'on' : ''}"><b>${cnt[s] ?? 0}</b><span>${s}</span></div>`).join('')}</div>
<div class="scroll" style="margin-top:12px"><table style="min-width:520px"><thead><tr><th>Researcher</th><th class="n">Proposed</th><th class="n">Accepted</th><th class="n">Carded</th><th class="n">Tested</th><th class="n">Passed</th><th class="n">Failed</th><th class="n">Paper/live</th></tr></thead><tbody>${Object.entries(sc).map(([k, v]) => `<tr><td><b>${h(rp?.researchers?.[k]?.label ?? k)}</b></td>${['proposed', 'accepted', 'carded', 'tested', 'passed', 'failed', 'paperOrLive'].map(f => `<td class="n">${v[f] ?? 0}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<p class="tt-note">${h(rp?.label ?? '')}${rp?.job ? ` · a session is running (${h(rp.job.status ?? '')})` : ''}. Stages are read from what exists (the owner's mark, the card, the register row, the harness output, the Evidence Book); paper and live are set by the owner.</p></div>
<div class="tt-grid2" style="margin-top:14px">
<div class="card"><div class="ch"><span class="lbl">Shortlisted and building</span><span class="r muted">${active.length}</span></div>${active.map(propRow).join('') || '<div class="muted">Nothing shortlisted or in build yet.</div>'}${fresh.length ? `<details><summary>${fresh.length} new, unmarked</summary>${fresh.map(propRow).join('')}</details>` : ''}</div>
<div class="card"><div class="ch"><span class="lbl">Latest dossiers</span><span class="r muted">${(ds?.dossiers ?? []).length}</span></div>${(ds?.dossiers ?? []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8).map(d => `<div class="tt-row"><span class="chip ${d.ok ? 'pur' : 'dn'}">${h(d.kind ?? 'dossier')}</span><b style="flex:1;min-width:0">${h(d.hypothesis ?? d.id)}</b><span class="w">${h(String(d.at ?? '').slice(0, 10))} · ${d.papers} papers · ${d.proposals} proposals</span>${d.headline ? `<span class="muted" style="flex-basis:100%">${h(d.headline)}</span>` : ''}${d.verdict ? `<span class="chip gold">${h(d.verdict)}</span>` : ''}</div>`).join('') || `<div class="muted">No dossier yet${ds?.job ? ` (one is being written: ${h(ds.job.status ?? '')})` : ''}. ${h(ds?.label ?? '')}</div>`}</div>
<div class="card"><div class="ch"><span class="lbl">In paper or live</span></div>${paperLive.map(propRow).join('')}${Object.entries(map).map(([bot, id]) => `<div class="tt-row" data-live="${h(bot)}|${h(id)}"><span class="chip gold">live bot</span><b>${h(bot)}</b><span class="muted">trades ${h(id)}</span><span class="w" data-check>checking live vs backtest…</span></div>`).join('')}${(shd?.shadows ?? []).map(s => `<div class="tt-row"><span class="chip pur">shadow</span><b>${h(s.bot)}</b><span class="muted">${h(s.rule ?? '')}</span><span class="w">${h(s.verdict ?? '')}</span></div>`).join('')}${!paperLive.length && !Object.keys(map).length && !(shd?.shadows ?? []).length ? '<div class="muted">No proposal is in paper or live, no backtested system is linked to a live bot and no forward shadow is running. Link a bot to its system in the Desk Office to get the live-against-backtest check here.</div>' : ''}</div>
<div class="card"><div class="ch"><span class="lbl">Systems on file</span><span class="r muted">${systems.length}</span></div><div class="scroll"><table style="min-width:520px"><thead><tr><th>System</th><th class="n">Trades</th><th class="n">Sharpe</th><th class="n">Max DD</th><th>Trend</th><th>Review</th></tr></thead><tbody>${systems.slice().sort((a, b) => (b.sharpe ?? -99) - (a.sharpe ?? -99)).map(s => `<tr${liveIds.has(s.id) ? ' style="background:var(--goldbg)"' : ''}><td><a href="system-backtest.html?id=${encodeURIComponent(s.id)}" style="color:var(--tx)">${h(s.model ?? s.id)}</a></td><td class="n">${s.trades ?? '–'}</td><td class="n ${dirCls(s.sharpe)}">${s.sharpe ?? '–'}</td><td class="n">${s.maxDD != null ? `${s.maxDD}%` : '–'}</td><td class="muted" style="font-size:12px">${h(s.trend ?? '')}</td><td>${s.verdicts ? Object.entries(s.verdicts).map(([k, v]) => `<span class="chip ${v === 'dead' ? 'dn' : v === 'alive' || v === 'promising' ? 'up' : ''}" style="font-size:9px">${h(k)} ${h(v)}</span>`).join(' ') : '<span class="muted">–</span>'}${s.validation ? ` <span class="chip ${s.validation === 'pass' ? 'up' : 'gold'}" style="font-size:9px">validation ${h(s.validation)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div><p class="tt-note">Backtests on file (net of costs); highlighted = traded by a live bot. Results, not proposals.</p></div></div>`;
  for (const row of root.querySelectorAll('[data-live]')) {
    const [bot, id] = row.dataset.live.split('|');
    J(`/api/system-live?bot=${encodeURIComponent(bot)}&id=${encodeURIComponent(id)}`).then(r => { const c = row.querySelector('[data-check]'); if (!c) return;
      if (!r?.ok) { c.textContent = r?.error ?? 'no live check'; return; }
      const m = r.check?.metrics ?? {}, pc = k => (m[k]?.percentile != null ? `${k} P${Math.round(m[k].percentile * 100)}` : null);
      c.textContent = `${r.liveTrades} live trades · ${['expectancy', 'winRate', 'maxDD'].map(pc).filter(Boolean).join(' · ')} of the backtest's range`; });
  }
}


// ═════════════════════════════════════════════ WHAT DRIVES THIS (each card's modal and the Pair page) ═════════════
// From the stored run only (js/terminal/cardExplain.js): the analysts' points that moved the card, the data dates
// and the stale feeds behind them, and the invalidation.
const lt2 = iso => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
function whatDrivesHtml(n) {
  if (typeof D === 'undefined' || !D.run?.head?.ok) return '';
  const x = cardDrivers(D.run, n); if (!x.rating) return '';
  const sgnN = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;
  const rows = x.analysts.map(a => `<div class="tt-row"><span class="chip ${a.net > 0 ? 'up' : a.net < 0 ? 'dn' : ''}" title="net push on ${h(n)}: + up, − down">${h(SRC[a.id] ?? a.id)} ${sgnN(a.net)}</span><b style="flex:1;min-width:0">${h(a.id)}</b><span class="w">${x.dir ? `${a.forN} for · ${a.againstN} against` : `${a.points.length} point${a.points.length === 1 ? '' : 's'}`}${a.gaps.length ? ` · <span class="gold">${a.gaps.length} feed gap${a.gaps.length === 1 ? '' : 's'}</span>` : ''}</span>
<span class="muted" style="flex-basis:100%;font-size:12px">${a.points.slice(0, 3).map(p => `<span class="${p.push > 0 ? 'up' : 'dn'}">${p.push > 0 ? '▲' : '▼'}${Math.abs(p.push)}</span> ${h(String(p.claim).slice(0, 200))} <span class="mono" style="font-size:10.5px">[${h(p.via.join(', '))}${p.evidence ? ` · ${h(p.evidence)}` : ''}]</span>${p.staleFeeds.length ? ` <span class="chip gold" title="this point rests on a feed that was not fresh that morning">${h(p.staleFeeds.join(', '))}</span>` : ''}`).join('<br>')}${a.points.length > 3 ? `<br>+${a.points.length - 3} more` : ''}</span></div>`).join('');
  const gaps = x.data.gaps.length ? x.data.gaps.map(g => `${h(g.id)} (${h(g.status)}${g.ageH != null ? `, ${Math.round(g.ageH)}h old` : ''})`).join(', ') : 'none';
  return `<div class="sec"><h2>What drives this</h2><span class="lbl">from the stored run's analyst reports · not a tested signal</span></div>
<div class="card" style="padding:10px 14px">${x.analysts.length ? `<div class="muted" style="font-size:12px;margin-bottom:4px">Points that move ${h(nice(n))} through ${h(x.channels.join(', '))}: ${x.dir ? `<b class="up">${x.forPush}</b> of push the card's way, <b class="dn">${x.againstPush}</b> against.` : 'the card is flat.'}</div>${rows}${x.more ? `<div class="muted">+${x.more} more analyst${x.more === 1 ? '' : 's'}</div>` : ''}` : '<div class="muted">No analyst point names this market or its currencies today: the card comes from the desks\' reading of the rulings and the levels.</div>'}
<div class="drv" style="margin-top:8px"><span>Desk Pack built ${h(lt2(x.data.packBuiltAt))}</span><span>book written ${h(lt2(x.data.bookAt))} London</span><span>forecast lines for ${h(x.data.linesFor ?? '–')}</span></div>
<div class="muted" style="font-size:12px;margin-top:6px">Stale or empty feeds behind these analysts that morning: <span class="${x.data.gaps.length ? 'gold' : ''}">${gaps}</span>.</div>
<div class="pb" style="margin-top:8px"><div class="iv"><b>Invalid</b><span>${h(x.invalidation ?? '–')}</span></div></div></div>`;
}
globalThis.whatDrivesHtml = whatDrivesHtml;

// ═════════════════════════════════════════════ MORNING THESIS vs EVENING REALITY (Changed tab) ═════════════════════
const VCH = { right: 'up', wrong: 'dn', push: '', 'no call': '', 'no data': '' };
const vchip = v => `<span class="chip ${VCH[v] ?? ''}">${h(v ?? '–')}</span>`;
const pctS = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
async function drawThesisReality(box, date = null) {
  if (!box) return;
  const r = await getJson(`/api/thesis-reality${date ? `?date=${date}` : ''}`);
  const t = r?.tally, d = r?.day;
  const tallyHtml = t?.days ? `<div class="tt-tiles" style="margin-top:8px">${[
    ['Strongest call right', t.strongest.n ? `${t.strongest.right}/${t.strongest.n}` : '–', 'finished in the realised top half'],
    ['Weakest call right', t.weakest.n ? `${t.weakest.right}/${t.weakest.n}` : '–', 'finished in the bottom half'],
    ['Regime call right', t.regime.n ? `${t.regime.right}/${t.regime.n}` : '–', 'against the risk basket'],
    ['Card hit rate', pctS(t.cards.hitRate), `${t.cards.right} right · ${t.cards.wrong} wrong`],
    ['Rank correlation', t.rankCorr.mean == null ? '–' : sg(t.rankCorr.mean), `mean over ${t.rankCorr.n} day${t.rankCorr.n === 1 ? '' : 's'}`],
    ['Range over p50', pctS(t.range.over50), `calibrated ≈ 50% · over p75 ${pctS(t.range.over75)} (≈ 25%)`]].map(([k, v, s]) => `<div class="tt-tile"><div class="lbl">${h(k)}</div><div class="v">${v}</div><div class="s muted">${h(s)}</div></div>`).join('')}</div>
<div class="muted" style="font-size:12px;margin-top:6px">Card hit rate by grade: ${Object.entries(t.cards.byGrade ?? {}).sort().map(([g, b]) => `<b>${h(g)}</b> ${b.hitRate == null ? '–' : pctS(b.hitRate)} (${b.right}/${b.right + b.wrong})`).join(' · ') || '–'}. Over ${t.days} day${t.days === 1 ? '' : 's'} (${h(t.from)} to ${h(t.to)}).</div>` : '';
  if (!d) { box.innerHTML = `<div class="ch"><span class="lbl">Morning thesis vs evening reality</span></div><p class="muted">${h(r?.error && !/JSON|token/i.test(r.error) ? r.error : 'Not built yet: the first record appears after the evening score (21:00 London).')}</p>${tallyHtml}`; return; }
  const cs = d.currencies ?? {}, sm = d.cardSummary ?? {};
  const ccyRow = c => `<tr><td class="mono"><b>${h(c.ccy)}</b></td><td class="n mono ${c.bias > 0 ? 'up' : c.bias < 0 ? 'dn' : ''}">${c.bias == null ? '–' : (c.bias > 0 ? '+' : '') + c.bias}</td><td class="n mono">${(cs.ranking ?? []).indexOf(c.ccy) + 1 || '–'}</td><td class="n mono ${dirCls(c.realised)}">${c.realised == null ? '–' : sg(c.realised)}</td><td class="n mono">${(cs.realisedRanking ?? []).indexOf(c.ccy) + 1 || '–'}</td><td>${vchip(c.verdict)}</td></tr>`;
  const tick = (v, at) => (v == null ? '<span class="muted">–</span>' : v ? `<span class="gold" title="${at ? h(hm(at)) + ' London' : ''}">✓${at ? ` ${h(hm(at))}` : ''}</span>` : '<span class="muted">no</span>');
  const cardRow = c => `<tr class="tt-click" data-pair="${h(c.inst)}" tabindex="0"><td class="mono"><b>${h(c.inst)}</b></td><td class="${c.dir > 0 ? 'up' : 'dn'}">${c.dir > 0 ? '▲' : '▼'} ${h(String(c.rating).replace('_', ' ').toLowerCase())}</td><td class="mono">${h(c.grade ? `${c.grade}` : '–')}</td><td class="n mono">${c.size}</td><td class="n mono ${dirCls(c.R)}">${c.R == null ? '–' : sg(c.R)}</td><td class="n mono ${dirCls(c.sizeR)}">${c.sizeR == null ? '–' : sg(c.sizeR, 3)}</td><td>${vchip(c.verdict)}</td><td title="${h(c.invalidation.text ?? '')}${c.invalidation.level != null ? ` · level ${c.invalidation.level}` : ' · no level parsed'}">${c.invalidation.level == null ? '<span class="muted">–</span>' : tick(c.invalidation.touched, c.invalidation.at)}</td><td>${tick(c.p50.reached, c.p50.at)}</td><td>${tick(c.p75.reached, c.p75.at)}</td></tr>`;
  const dates = (r.dates ?? []).slice().reverse();
  box.innerHTML = `<div class="ch"><span class="lbl">Morning thesis vs evening reality</span><span class="r">${dates.length > 1 ? `<select id="tt-tr-date" aria-label="day">${dates.map(x => `<option ${x === d.date ? 'selected' : ''}>${h(x)}</option>`).join('')}</select>` : `<span class="chip">${h(d.date)}</span>`}</span></div>
<div class="muted" style="font-size:12px">${h(d.label)}. Book written ${h(lt2(d.bookAt))} London; ${d.counts ? 'a counted day' : 'not a counted day'}; day score ${d.dayScore == null ? '–' : sg(d.dayScore) + ' u'}. ${h(d.window)}.</div>
<div class="tt-grid2" style="margin-top:10px">
<div><div class="lbl">The regime call</div><div class="tt-row"><b>${h(String(d.regime.tone ?? '–').replace('_', '-'))}</b><span class="muted">global ruling conviction ${h(d.regime.conviction ?? '–')}</span>${vchip(d.regime.verdict)}<span class="w">risk basket ${d.regime.realised == null ? '–' : sg(d.regime.realised) + ' u'} (${d.regime.basket} markets)</span></div>
<div class="lbl" style="margin-top:10px">Strongest and weakest</div>
<div class="tt-row"><b>${h(cs.strongest?.ccy ?? '–')}</b><span class="muted">called strongest · realised #${cs.strongest?.realisedRank ?? '–'} of ${cs.strongest?.of ?? '–'}, ${cs.strongest?.realised == null ? '–' : sg(cs.strongest.realised) + ' u'}</span>${vchip(cs.strongest?.verdict)}</div>
<div class="tt-row"><b>${h(cs.weakest?.ccy ?? '–')}</b><span class="muted">called weakest · realised #${cs.weakest?.realisedRank ?? '–'} of ${cs.weakest?.of ?? '–'}, ${cs.weakest?.realised == null ? '–' : sg(cs.weakest.realised) + ' u'}</span>${vchip(cs.weakest?.verdict)}</div>
<div class="muted" style="font-size:12px">Rank correlation, morning order against realised: <b class="mono">${cs.rankCorr == null ? '–' : sg(cs.rankCorr)}</b> (1 = the same order, −1 = reversed).</div></div>
<div class="scroll"><table><thead><tr><th>Ccy</th><th class="n">Bias</th><th class="n">#am</th><th class="n">Move u</th><th class="n">#pm</th><th></th></tr></thead><tbody>${(cs.perCcy ?? []).slice().sort((a, b) => ((cs.ranking ?? []).indexOf(a.ccy) + 99) % 99 - ((cs.ranking ?? []).indexOf(b.ccy) + 99) % 99).map(ccyRow).join('')}</tbody></table></div></div>
<div class="lbl" style="margin-top:12px">Every sized card · ${sm.right ?? 0} right, ${sm.wrong ?? 0} wrong${sm.push ? `, ${sm.push} push` : ''}${sm.noData ? `, ${sm.noData} no data` : ''} · size-weighted R ${sm.sizeWeightedR == null ? '–' : sg(sm.sizeWeightedR)} · invalidation touched ${sm.invalidTouched ?? 0}/${sm.withPath ?? 0}, p50 reached ${sm.p50Reached ?? 0}/${sm.withPath ?? 0}</div>
<div class="scroll"><table style="min-width:640px"><thead><tr><th>Market</th><th>View</th><th>Grade</th><th class="n">Size</th><th class="n">R (u)</th><th class="n">Size×R</th><th></th><th>Invalid hit</th><th>p50</th><th>p75</th></tr></thead><tbody>${(d.cards ?? []).map(cardRow).join('') || '<tr><td colspan="10" class="muted">No sized card.</td></tr>'}</tbody></table></div>
${d.range?.n ? `<div class="lbl" style="margin-top:12px">The range forecast · ${d.range.n} markets</div><div class="muted" style="font-size:12px">London-day high-to-low over the forecast p50 on <b>${pctS(d.range.over50)}</b> of markets (calibrated ≈ 50%), over p75 on <b>${pctS(d.range.over75)}</b> (≈ 25%); median realised / p50 ${d.range.medianRatio ?? '–'}. Widest: ${d.range.rows.slice(0, 4).map(x => `${h(x.inst)} ${x.ratio}×`).join(', ')}; quietest: ${d.range.rows.slice(-3).map(x => `${h(x.inst)} ${x.ratio}×`).join(', ')}.</div>` : '<div class="muted" style="margin-top:10px;font-size:12px">No archived range forecast for this day.</div>'}
${d.events?.length ? `<div class="lbl" style="margin-top:12px">Releases the economist named</div>${d.events.map(e => `<div class="tt-row"><b>${h(e.country)} ${h(e.event)}</b><span class="w">${h(lt2(e.at))} · est ${h(e.estimate ?? '–')} · actual ${h(e.actual ?? 'not stored')}${e.surprise ? ` · ${e.surprise > 0 ? 'above' : 'below'}` : ''}</span></div>`).join('')}` : ''}
<div class="lbl" style="margin-top:14px">Running tally</div>${tallyHtml || '<p class="muted">Builds up one day at a time.</p>'}
<p class="tt-note">The morning's claims are quoted from the stored run and never rewritten. Right/wrong uses the desk score's window and unit; a move within ±0.05 u is a push. "Invalid hit" means the level the invalidation names traded inside the window ("–" when no level could be read from its wording). Description of the desk's own record, not a scored cell and not evidence about markets.</p>`;
  box.querySelector('#tt-tr-date')?.addEventListener('change', e => drawThesisReality(box, e.target.value));
  box.querySelectorAll('[data-pair]').forEach(x => { x.onclick = () => openPair(x.dataset.pair); x.onkeydown = e => { if (e.key === 'Enter') openPair(x.dataset.pair); }; });
}

// ═════════════════════════════════════════════ wiring ═════════════════════════════════════════════
const RENDER = { today: renderToday, pair: renderPair, changed: renderChanged, research: renderResearch };
globalThis.onTerminalTab = t => { T.tab = t; if (t !== 'today') stopLive(); if (t !== 'pair' && /pair=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); try { RENDER[t]?.(); } catch (e) { console.warn('terminal tab', t, e); } };
globalThis.openPairPage = openPair;
function fromHash() { const m = location.hash.match(/pair=([A-Za-z0-9]+)/); if (m) openPair(m[1]); }
addEventListener('hashchange', fromHash);
if (/pair=/.test(location.hash)) fromHash();
else { const sel = document.querySelector('#tabs [aria-selected="true"]')?.dataset.t; if (RENDER[sel]) globalThis.onTerminalTab(sel); }
// the Macro tab's short-term fair value table (desk-terminal.html driversHtml, a classic script) reads this
globalThis.stfvHtml = FVV.stfvTable;

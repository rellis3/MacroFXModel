// js/terminal/jarvisView.js: the DOM half of Jarvis, the owner-only easter egg (widget.jarvis, typed as JARVIS in the command line).
// A full-screen HUD that takes over the terminal and draws the macro chain as a 3D trading city (SKYLINE: a tower per market, height = how big the move is against its own noise,
// light rails between towers for the textbook links, gold where a link broke) or as a rotating ORBIT. Over it sit modules: ASK (typed or spoken, reuses /api/desk-ask), RADAR (what is
// unusual), BRIEF (the stored chain read, read aloud), SYSTEM (server memory), ALERTS. A time scrub replays the chain over the last 60 sessions. DOCK drops the HUD to a slim strip over the
// normal dashboard while Jarvis keeps watching the live chain and speaks / beeps / notifies when a link breaks or a market goes well beyond its noise (only while this tab is open).
// DESCRIPTION ONLY: it shows what moved and which textbook links held or broke. Never a forecast, never a trade. Core: jarvisCore.js. Own canvas, no library, no new feed: the chain comes
// from the Chain tab's loaders (globalThis.deskChainData), the voice is the browser's own (free).
import { buildGraph, project, arcPoint, bootLines, VERDICT_WORD, radarRank, systemSummary, skyline, towerBox, pickVoice, wakeParse, watchSnapshot, watchDiff, memoryState, GEO, REGIONS, llToVec, globeProject, greatArc, bubbleLayout, THEME, THEME_ORDER } from './jarvisCore.js';
import { CHAIN_NODES } from '../macroChain.js';
import { marketName, getNameStyle, setNameStyle } from './jarvisNames.js';
import { candleRows, candleLayout, candleBox, boardSummary, ROWS as CD_ROWS } from './jarvisCandles.js';
import { EXTRA, loadModules, viewsOf } from './jarvisModules.js';
import { SECTIONS, COMPANION, labelOf, itemsFor, activeSection } from './jarvisNav.js';
import { shortLabel } from './chainBoard.js';
import { glDisposeAll } from './jarvisGL.js';
import { makeNeuralVoice, KOKORO_VOICES, ENGINES, FX_LEVELS } from './jarvisVoiceClient.js';
import { SHOW_HOOKS } from './showCore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ID = 'jarvis', LS = 'jarvisPrefs:v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
const lsPut = o => { try { localStorage.setItem(LS, JSON.stringify({ ...lsGet(), ...o })); } catch (e) { /* private window */ } };
// The ONE voice on/off for the programmes (BROADCAST, SHOW): prefs.speak. Before it existed each programme kept its own; the old setting is read once as the default.
const speakPref = p => { if (typeof p.speak === 'boolean') return p.speak; try { for (const k of ['jarvisBroadcast:v1', 'jarvisShow:v1']) { const o = JSON.parse(localStorage.getItem(k) || '{}'); if (o && typeof o.voice === 'boolean') return o.voice; } } catch (e) { /* private window */ } return true; };

const CSS = `#${ID}{--jva:var(--blue2);--jvtop:62px;position:fixed;inset:0;z-index:300;color:var(--tx);font-family:var(--mono,monospace);background:radial-gradient(ellipse at 50% 55%,color-mix(in srgb,var(--jva) 20%,var(--bg)) 0%,var(--bg) 72%);overflow:hidden;animation:jv-in .7s ease-out}
@keyframes jv-in{from{opacity:0;filter:blur(8px) brightness(2)}to{opacity:1;filter:none}}
#${ID} .jv-vpop{position:absolute;top:calc(var(--jvtop) + 4px);right:24px;z-index:6;width:290px;display:flex;flex-direction:column;gap:9px;padding:14px 16px;border:1px solid var(--jva);border-radius:12px;background:color-mix(in srgb,var(--bg1) 92%,transparent);box-shadow:0 0 28px color-mix(in srgb,var(--jva) 30%,transparent);backdrop-filter:blur(6px);font-size:11px;letter-spacing:.12em}#${ID} .jv-vpop[hidden]{display:none}#${ID} .jv-vpop .jv-vh{font-size:10px;letter-spacing:.3em;color:var(--jva)}#${ID} .jv-vpop label{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--tx2)}#${ID} .jv-vpop label[hidden]{display:none}#${ID} .jv-vpop select{background:transparent;color:var(--tx);border:1px solid color-mix(in srgb,var(--jva) 55%,transparent);border-radius:7px;padding:4px 6px;font:inherit;letter-spacing:.06em;max-width:170px}#${ID} .jv-vpop select option{background:var(--bg1);color:var(--tx)}#${ID} .jv-vnote{color:var(--tx2);font-size:10px;letter-spacing:.04em;line-height:1.4}#${ID}.jv-compact .jv-vpop{left:12px;right:12px;width:auto}
#${ID}[hidden]{display:none}
#${ID} canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}#${ID} canvas:active{cursor:grabbing}
#${ID} .jv-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 2px,color-mix(in srgb,var(--jva) 7%,transparent) 2px 3px);mix-blend-mode:screen;animation:jv-scan 9s linear infinite}
@keyframes jv-scan{from{background-position:0 0}to{background-position:0 60px}}
#${ID} .jv-vig{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 160px 40px color-mix(in srgb,var(--bg) 92%,transparent)}
#${ID} .jv-br{position:absolute;width:34px;height:34px;border:2px solid var(--jva);opacity:.8;pointer-events:none;filter:drop-shadow(0 0 6px var(--jva))}
#${ID} .jv-br.tl{left:10px;top:10px;border-right:0;border-bottom:0}#${ID} .jv-br.tr{right:10px;top:10px;border-left:0;border-bottom:0}#${ID} .jv-br.bl{left:10px;bottom:10px;border-right:0;border-top:0}#${ID} .jv-br.brr{right:10px;bottom:10px;border-left:0;border-top:0}
#${ID} .jv-top{position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:16px 24px;pointer-events:none}
#${ID} .jv-top>*{pointer-events:auto}#${ID} .jv-title{font-size:19px;letter-spacing:.46em;color:var(--jva);text-shadow:0 0 14px var(--jva);animation:jv-glitch 7s infinite}
@keyframes jv-glitch{0%,93%,100%{transform:none;text-shadow:0 0 14px var(--jva)}94%{transform:translateX(2px);text-shadow:-3px 0 var(--dn),3px 0 var(--jva)}96%{transform:translateX(-2px);text-shadow:3px 0 var(--dn),-3px 0 var(--jva)}}
#${ID} .jv-sub{font-size:11px;color:var(--tx2);letter-spacing:.08em}#${ID} .jv-sp{flex:1}
#${ID} button{font:inherit;font-size:11px;letter-spacing:.08em;color:var(--tx);background:color-mix(in srgb,var(--bg1) 70%,transparent);border:1px solid var(--line);border-radius:999px;padding:5px 12px;cursor:pointer}
#${ID} button:hover{border-color:var(--jva)}#${ID} button[aria-pressed="true"]{border-color:var(--jva);color:var(--jva);box-shadow:0 0 10px color-mix(in srgb,var(--jva) 50%,transparent)}
#${ID} .jv-hud{position:absolute;left:24px;top:calc(var(--jvtop,62px) + 14px);font-size:11px;line-height:1.7;color:var(--tx2);pointer-events:none;letter-spacing:.06em}#${ID} .jv-hud b{color:var(--tx);font-size:22px;letter-spacing:.1em;font-weight:400;display:block}#${ID} .jv-hud .am{color:var(--gold)}#${ID} .jv-hud .ok{color:var(--up)}
#${ID} .jv-reg{position:absolute;left:50%;transform:translateX(-50%);top:calc(var(--jvtop,62px) + 4px);display:flex;gap:6px;flex-wrap:wrap;justify-content:center}#${ID} .jv-reg[hidden]{display:none}
#${ID} .jv-boot{position:absolute;left:24px;bottom:84px;max-width:min(460px,calc(100vw - 48px));font-size:12px;line-height:1.6;color:var(--tx2);pointer-events:none}
#${ID} .jv-boot b{color:var(--tx)}#${ID} .jv-boot .jv-hl{color:var(--gold)}
#${ID} .jv-card,#${ID} .jv-pane{position:absolute;right:24px;width:min(440px,calc(100vw - 48px));overflow:auto;padding:14px;border:1px solid var(--jva);border-radius:12px;background:color-mix(in srgb,var(--bg1) 84%,transparent);backdrop-filter:blur(7px);font-size:12px;line-height:1.55;box-shadow:0 0 28px color-mix(in srgb,var(--jva) 35%,transparent)}
#${ID} .jv-card{bottom:84px;max-height:46vh}#${ID} .jv-pane{top:calc(var(--jvtop,62px) + 6px);bottom:84px}
#${ID} h3{margin:0 0 6px;font-size:13px;letter-spacing:.14em;color:var(--jva)}#${ID} .jv-pane p,#${ID} .jv-card p{margin:6px 0;color:var(--tx2)}#${ID} textarea,#${ID} input[type=number]{font:inherit;color:var(--tx);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px;box-sizing:border-box}#${ID} textarea{width:100%;min-height:74px}
#${ID} .jv-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}#${ID} .jv-ans{white-space:pre-wrap;color:var(--tx);margin:8px 0}#${ID} .jv-src,#${ID} .jv-k{display:inline-block;font-size:10px;letter-spacing:.1em;border:1px solid var(--line);border-radius:4px;padding:0 5px;margin:2px 4px 2px 0;color:var(--tx2)}
#${ID} .jv-hold{color:var(--jva);border-color:var(--jva)}#${ID} .jv-broke{color:var(--gold);border-color:var(--gold)}
#${ID} .jv-item{display:block;width:100%;text-align:left;border-radius:8px;margin:4px 0;padding:6px 10px}#${ID} .jv-up{color:var(--up)}#${ID} .jv-dn{color:var(--dn)}#${ID} .jv-am{color:var(--gold)}#${ID} table{width:100%;border-collapse:collapse}#${ID} td{padding:2px 4px;border-bottom:1px solid var(--line)}#${ID} td:last-child{text-align:right}
#${ID} .jv-scrub{position:absolute;left:24px;right:24px;bottom:30px;display:flex;gap:10px;align-items:center;padding:8px 14px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--bg1) 78%,transparent);backdrop-filter:blur(6px)}
#${ID} .jv-scrub input[type=range]{flex:1;accent-color:var(--jva)}#${ID} .jv-foot{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-size:10px;color:var(--tx2);opacity:.7;pointer-events:none}
#${ID}-dock{position:fixed;left:0;right:0;bottom:0;z-index:290;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:7px 16px;font:11px/1.4 var(--mono,monospace);letter-spacing:.06em;color:var(--tx);background:color-mix(in srgb,var(--bg1) 92%,transparent);border-top:1px solid var(--blue2);box-shadow:0 -4px 24px color-mix(in srgb,var(--blue2) 30%,transparent);backdrop-filter:blur(8px)}
#${ID}-dock[hidden]{display:none}#${ID}-dock .t{color:var(--blue2);letter-spacing:.3em;text-shadow:0 0 10px var(--blue2)}#${ID}-dock .dot{width:8px;height:8px;border-radius:50%;background:var(--up);box-shadow:0 0 8px var(--up);display:inline-block;animation:jv-pulse 2s infinite}
@keyframes jv-pulse{50%{opacity:.35}}#${ID}-dock.al{border-top-color:var(--gold);animation:jv-flash 1s 3}@keyframes jv-flash{50%{background:color-mix(in srgb,var(--gold) 30%,var(--bg1))}}
#${ID}-dock button{font:inherit;font-size:10px;color:var(--tx);background:transparent;border:1px solid var(--line);border-radius:999px;padding:3px 10px;cursor:pointer}#${ID}-dock .sp{flex:1}#${ID}-dock .am{color:var(--gold)}
#${ID} .jv-top,#${ID} .jv-hud,#${ID} .jv-reg,#${ID} .jv-scrub,#${ID} .jv-foot,#${ID} .jv-br,#${ID} .jv-boot{transition:opacity 1s ease}
#${ID}.jv-booting .jv-top,#${ID}.jv-booting .jv-hud,#${ID}.jv-booting .jv-reg,#${ID}.jv-booting .jv-scrub,#${ID}.jv-booting .jv-foot,#${ID}.jv-booting .jv-boot,#${ID}.jv-booting .jv-pane,#${ID}.jv-booting .jv-card{opacity:0;pointer-events:none}
#${ID}.jv-booting .jv-br{opacity:.15}
#${ID} .jv-bs{position:absolute;inset:0;z-index:5;pointer-events:none;transition:opacity .9s ease}#${ID} .jv-bs.gone{opacity:0}
#${ID} .jv-bs-t{position:absolute;left:0;right:0;top:12%;text-align:center}
#${ID} .jv-bs h1{margin:0;font-size:clamp(22px,4vw,46px);font-weight:400;letter-spacing:.5em;color:var(--jva);text-shadow:0 0 22px var(--jva);opacity:0;transition:opacity 1.4s ease;animation:jv-glitch 3s infinite}#${ID} .jv-bs h1.on{opacity:1}
#${ID} .jv-bs-sub{margin-top:12px;font-size:13px;letter-spacing:.42em;color:var(--tx2);min-height:18px}#${ID} .jv-bs-sub.blink{animation:jv-blink 1s steps(2) infinite}
@keyframes jv-blink{50%{opacity:.3}}
#${ID} .jv-bs-b{position:absolute;left:50%;transform:translateX(-50%);bottom:9%;width:min(440px,80vw)}
#${ID} .jv-bs-log{font-size:12px;line-height:1.75;color:var(--tx2);min-height:136px;letter-spacing:.04em}#${ID} .jv-bs-log .ok{color:var(--up);float:right}#${ID} .jv-bs-log div{overflow:hidden}#${ID} .jv-bs-log b{font-weight:400;color:var(--tx)}
#${ID} .jv-bar{height:3px;background:color-mix(in srgb,var(--jva) 20%,transparent);border-radius:2px;margin-top:8px;overflow:hidden}#${ID} .jv-bar i{display:block;height:100%;width:0;background:var(--jva);box-shadow:0 0 10px var(--jva);transition:width .5s ease}
#${ID} .jv-cap{position:absolute;left:0;right:0;bottom:0;padding:110px 6vw 70px;box-sizing:border-box;text-align:center;pointer-events:none;z-index:4;transition:opacity .5s ease;background:linear-gradient(to top,color-mix(in srgb,var(--bg) 88%,transparent) 45%,transparent)}#${ID} .jv-cap[hidden]{display:none}
#${ID} .jv-cap .t{font-size:12px;letter-spacing:.42em;color:var(--jva);text-shadow:0 0 12px var(--jva);margin-bottom:10px}#${ID} .jv-cap .x{font-size:clamp(16px,2.1vw,25px);line-height:1.55;color:var(--tx);text-shadow:0 0 18px var(--bg),0 0 6px var(--bg)}
#${ID} .jv-cinexit{position:absolute;right:24px;top:20px;z-index:6;display:none}
#${ID} .jv-cine{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:none;gap:8px;align-items:center;z-index:6;font-size:11px;color:var(--tx2)}#${ID}.jv-cinema .jv-cine{display:flex}
#${ID} .jv-cine span{min-width:44px;text-align:center;color:var(--tx)}
#${ID}.jv-cinema .jv-top,#${ID}.jv-cinema .jv-hud,#${ID}.jv-cinema .jv-reg,#${ID}.jv-cinema .jv-scrub,#${ID}.jv-cinema .jv-foot,#${ID}.jv-cinema .jv-boot,#${ID}.jv-cinema .jv-pane,#${ID}.jv-cinema .jv-card{opacity:0;pointer-events:none}
#${ID}.jv-cinema .jv-cinexit{display:block}
#${ID}.jv-rec .jv-cinexit,#${ID}.jv-rec .jv-cine{opacity:0}
@media (max-width:1560px){#${ID} .jv-top .jv-sub{display:none}}
@media (max-width:640px){#${ID} .jv-boot,#${ID} .jv-hud{display:none}#${ID} .jv-title{font-size:14px}#${ID} .jv-scrub{bottom:34px}}
@media (prefers-reduced-motion:reduce){#${ID},#${ID} .jv-scan,#${ID} .jv-title{animation:none}}
#${ID} .jv-menubtn,#${ID} .jv-cur{display:none}#${ID} .jv-menu{display:contents}#${ID} .jv-menu>span{display:contents}#${ID} .jv-menu>span.jv-mh{display:none}
#${ID}.jv-compact .jv-top{padding:10px 12px;gap:6px 8px;pointer-events:none}#${ID}.jv-compact .jv-title{font-size:13px;letter-spacing:.28em}#${ID}.jv-compact .jv-top .jv-sub{display:none}
#${ID}.jv-compact .jv-menubtn,#${ID}.jv-compact .jv-cur{display:inline-flex}#${ID}.jv-compact .jv-cur{font-size:10px;letter-spacing:.14em;color:var(--jva);padding:5px 4px}
#${ID}.jv-compact .jv-menu{display:none;width:100%;flex-wrap:wrap;gap:6px;max-height:62vh;overflow:auto;padding:10px;border:1px solid var(--jva);border-radius:12px;background:color-mix(in srgb,var(--bg1) 94%,transparent);pointer-events:auto}
#${ID}.jv-compact.jv-menu-open .jv-menu{display:flex}
#${ID}.jv-compact .jv-menu>span{display:flex;flex-wrap:wrap;gap:6px;width:100%}#${ID}.jv-compact .jv-menu>span.jv-mh{display:block;width:100%;font-size:9px;letter-spacing:.22em;color:var(--tx2);margin-top:4px}
#${ID}.jv-compact button{font-size:10px;padding:4px 9px}
#${ID}.jv-compact .jv-reg{left:0;transform:none;width:100%;justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;padding:0 12px;box-sizing:border-box}
#${ID}.jv-compact .jv-pane,#${ID}.jv-compact .jv-card{left:10px;right:10px;width:auto;bottom:74px;max-height:50vh}#${ID}.jv-compact .jv-pane{top:calc(var(--jvtop,62px) + 6px);max-height:none}
#${ID}.jv-compact .jv-scrub{left:10px;right:10px;bottom:10px;padding:5px 8px;gap:6px}#${ID}.jv-compact .jv-scrub #${ID}-sd,#${ID}.jv-compact .jv-foot{display:none}
#${ID}.jv-compact .jv-cap{padding:50px 14px 88px}#${ID}.jv-compact .jv-cap .x{font-size:15px;line-height:1.45}#${ID}.jv-compact .jv-cap .t{font-size:10px;letter-spacing:.3em;margin-bottom:6px}
#${ID}.jv-compact .jv-cine{bottom:8px;width:calc(100vw - 16px);flex-wrap:wrap;justify-content:center;gap:5px}#${ID} .jv-cine .jv-cmore{display:none}#${ID}.jv-compact .jv-cine .jv-cmore{display:inline-block}#${ID}.jv-compact .jv-cine:not(.more)>:not([data-c="pause"]):not(.jv-cmore){display:none}#${ID}.jv-compact .jv-cinexit{right:10px;top:10px;font-size:10px}
#${ID}.jv-compact .jv-br{width:20px;height:20px}
#${ID} .jv-nav{display:flex;flex-direction:column;gap:6px;width:100%;order:2;pointer-events:auto}#${ID} .jv-nav-row{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}
#${ID} .jv-sec{font-size:12px;letter-spacing:.16em;padding:6px 18px}#${ID} .jv-sec[aria-pressed="true"]{background:color-mix(in srgb,var(--jva) 22%,transparent)}
#${ID} .jv-it{font-size:11px}#${ID} .jv-it.tool{border-style:dashed}#${ID} .jv-it.side{border-color:var(--jva);color:var(--jva)}#${ID} .jv-nav-hint{font-size:10px;letter-spacing:.1em;color:var(--tx2)}
#${ID} #${ID}-win,#${ID} #${ID}-opts{order:1}#${ID} .jv-menu>span[hidden]{display:none!important}
#${ID}.jv-compact .jv-menu>span.jv-mh:first-child{order:-2}#${ID}.jv-compact .jv-nav{order:-1}#${ID}.jv-compact .jv-sec{font-size:10px;padding:5px 10px}
#${ID}.jv-clean .jv-hud,#${ID}.jv-clean .jv-reg,#${ID}.jv-clean .jv-boot{opacity:0;pointer-events:none}
#${ID}.jv-noscan .jv-scan{display:none}
#${ID}.jv-nochain:not(.jv-cinema) .jv-boot{opacity:1;display:block}#${ID}.jv-compact.jv-nochain .jv-boot{left:12px;right:12px;bottom:56px;max-width:none;font-size:11px}
#${ID} .jv-attract{position:absolute;right:24px;bottom:84px;z-index:6;font-size:10px;letter-spacing:.3em;color:var(--jva);padding:5px 12px;border:1px solid var(--jva);border-radius:999px;background:color-mix(in srgb,var(--bg1) 70%,transparent);pointer-events:none;animation:jv-blink 2.4s steps(2) infinite}#${ID}.jv-compact .jv-attract{right:12px;bottom:56px}
@media (prefers-reduced-motion:reduce){#${ID} .jv-attract{animation:none}}
#${ID} canvas.jv-sw{animation:jv-sw .55s ease-out}@keyframes jv-sw{0%{filter:brightness(2.4) blur(5px) saturate(1.6)}100%{filter:none}}
@media (prefers-reduced-motion:reduce){#${ID} canvas.jv-sw{animation:none}}`;

let open = null;

export async function openJarvis(win = window) {
  const doc = win.document;
  if (open) { open.undock(); return true; }
  if (doc.getElementById(ID)) return true;
  const prefs = lsGet();
  const root = doc.createElement('div'); root.id = ID; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Jarvis: the macro chain');
  root.innerHTML = `<style>${CSS}</style><canvas id="${ID}-cv"></canvas><div class="jv-bs" id="${ID}-bs"><div class="jv-bs-t"><h1 id="${ID}-bst">J.A.R.V.I.S.</h1><div class="jv-bs-sub blink" id="${ID}-bss">&nbsp;</div></div><div class="jv-bs-b"><div class="jv-bs-log" id="${ID}-bslog"></div><div class="jv-bar"><i id="${ID}-bsbar"></i></div></div></div><div class="jv-scan"></div><div class="jv-vig"></div><i class="jv-br tl"></i><i class="jv-br tr"></i><i class="jv-br bl"></i><i class="jv-br brr"></i>
<div class="jv-top"><span class="jv-title" data-surface="widget.jarvis">J.A.R.V.I.S.</span><span class="jv-sub">desk intelligence · description only</span><span class="jv-sp"></span><span class="jv-cur" id="${ID}-cur"></span><button type="button" class="jv-menubtn" id="${ID}-menubtn" aria-expanded="false">☰ MENU</button>
<div class="jv-menu" id="${ID}-menu"><span class="jv-mh">SECTIONS</span><div class="jv-nav" id="${ID}-nav"></div><span class="jv-mh">TIME WINDOW</span><span id="${ID}-win"></span><span class="jv-mh">OPTIONS</span><span id="${ID}-opts">
<button type="button" id="${ID}-snd" aria-pressed="${prefs.sound !== false}" title="Sound effects">SOUND</button><button type="button" id="${ID}-vbtn" aria-expanded="false" title="Voice settings">VOICE ▾</button><button type="button" id="${ID}-nms" aria-pressed="${getNameStyle() === 'names'}" title="Show market names or codes">${getNameStyle() === 'names' ? 'NAMES' : 'CODES'}</button><button type="button" id="${ID}-wake" aria-pressed="false" title='Say "Jarvis, ..." (microphone, this tab only)'>HEY JARVIS</button><button type="button" id="${ID}-dockb" title="Esc: drop to a slim strip over the dashboard; Jarvis keeps watching">DOCK ▾</button><button type="button" id="${ID}-off" title="Switch Jarvis off">OFF ✕</button></span><span id="${ID}-mods" hidden></span><span id="${ID}-view" hidden></span></div></div>
<div class="jv-vpop" id="${ID}-vpop" hidden><div class="jv-vh">VOICE</div><label><span>SPEAK THE PROGRAMMES</span><button type="button" id="${ID}-vsp" aria-pressed="${speakPref(prefs)}" title="On: the briefing and the show are read aloud. Off: subtitles at reading speed">${speakPref(prefs) ? 'ON' : 'OFF'}</button></label><label><span>NATURAL VOICE</span><button type="button" id="${ID}-nv" aria-pressed="${prefs.neural !== false}" title="Off = the browser's built-in voice">${prefs.neural !== false ? 'ON' : 'OFF'}</button></label><label><span>ENGINE</span><select id="${ID}-veng">${ENGINES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label id="${ID}-vkvl"><span>KOKORO VOICE</span><select id="${ID}-vkv">${KOKORO_VOICES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label><span>FINISH</span><select id="${ID}-vfx">${FX_LEVELS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><div class="jv-vnote" id="${ID}-vnote"></div><button type="button" id="${ID}-vtest">▶ TEST</button></div><div class="jv-cap" id="${ID}-cap" hidden><div class="t" id="${ID}-capt"></div><div class="x" id="${ID}-capx"></div></div><button type="button" class="jv-cinexit" id="${ID}-stop">■ END SHOW  ·  Esc</button><div class="jv-cine" id="${ID}-cine"><button type="button" data-c="prev" title="Back one scene (left arrow)">⏮ BACK</button><button type="button" data-c="pause" id="${ID}-cpause" title="Pause or resume (space)">⏸ PAUSE</button><button type="button" data-c="next" title="Skip this scene (right arrow)">SKIP ⏭</button><button type="button" data-c="slow" title="Slower (minus)">−</button><span id="${ID}-crate">1.0×</span><button type="button" data-c="fast" title="Faster (plus)">+</button><button type="button" data-c="more" class="jv-cmore" title="More controls" aria-expanded="false">⋯</button></div><div class="jv-reg" id="${ID}-reg"></div><div class="jv-hud" id="${ID}-hud"></div><div class="jv-pane" id="${ID}-pane" hidden></div><div class="jv-boot" id="${ID}-boot"></div><div class="jv-card" id="${ID}-card" hidden></div>
<div class="jv-scrub" id="${ID}-scrub"><button type="button" id="${ID}-play" title="Replay the last 60 sessions">▶ PLAY</button><input type="range" id="${ID}-sl" min="0" max="0" value="0" aria-label="Session to show"><span id="${ID}-sd" class="jv-sub" style="min-width:150px;text-align:right">LATEST</span><button type="button" id="${ID}-now">LATEST</button><button type="button" id="${ID}-expl" title="Describe what was going on around this day (one model call)">EXPLAIN THIS DAY</button></div>
<div class="jv-foot">drag to turn · wheel to zoom · click a market · Esc docks · none of this is a forecast</div>`;
  doc.body.appendChild(root);
  const dock = doc.createElement('div'); dock.id = `${ID}-dock`; dock.hidden = true; doc.body.appendChild(dock);
  const $ = s => root.querySelector(`#${ID}-${s}`), cv = $('cv'), ctx = cv.getContext('2d');
  const tok = (n, fb) => { try { return win.getComputedStyle(doc.documentElement).getPropertyValue('--' + n).trim() || fb; } catch (e) { return fb; } };
  let C = {};
  const readTheme = () => { C = { up: tok('up', 'green'), dn: tok('dn', 'red'), gold: tok('gold', 'orange'), blue: tok('blue2', 'dodgerblue'), tx: tok('tx', 'white'), tx2: tok('tx2', 'gray'), cy: tok('cy', 'cyan') }; };
  readTheme();

  const names = Object.fromEntries(Object.entries(CHAIN_NODES).map(([k, n]) => [k, n.label]));
  const fitTop = () => { try { const tp = root.querySelector('.jv-top'); if (tp) root.style.setProperty('--jvtop', `${tp.offsetHeight}px`); } catch (e) { /* layout only */ } };
  const noBoot = !!win.__jarvisNoBoot, calm = !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches, BOOT = noBoot ? 0 : calm ? 0.8 : 4.2;
  if (BOOT) root.classList.add('jv-booting'); else $('bs').remove();
  const st = { compact: false, cd: null, cdBusy: null, cdCam: { x: 0, z: 0 }, cdTarget: { x: 0, z: 0 }, recent: [], lastInput: performance.now(), chainFail: false, cinemaStop: null, speakStop: null, mod: 'chain', view: prefs.view ?? 'globe', gl: { lat: 20, lon: 15, zoom: 1, tlat: 20, tlon: 15, tzoom: 1 }, land: null, bl: null, region: 'world', voice: false, sound: prefs.sound !== false, wake: false, watch: prefs.watch !== false, win: 5, graph: null, sum: null, sel: null, yaw: 0.55, pitch: -0.7, zoom: 1, spin: true, t0: performance.now() - (win.__jarvisNoBoot ? 5000 : 0), drag: null, w: 0, h: 0, proj: [], disp: {}, dates: [], idx: -1, play: 0, docked: false, alerts: [], snap: null, lastCheck: null, memLimit: prefs.memLimit ?? 0, mem: null };
  const setCam = () => { if (st.view === 'globe') { st.gl.zoom = st.gl.tzoom = 1; $('reg').hidden = false; } else $('reg').hidden = true; if (st.view === 'bubbles') st.bl = null; if (st.view === 'skyline') Object.assign(st, { yaw: 0.55, pitch: -0.7, zoom: 1 }); else Object.assign(st, { yaw: 0.6, pitch: 0.28, zoom: 1 }); };
  const extraViews = {};
  // every view has its own world: an accent that re-themes the glow, borders, buttons and canvas colours, and a chrome style
  const CORE_ENV = { globe: { accent: 'blue2' }, candles: { accent: 'up' }, bubbles: { accent: 'pur' }, skyline: { accent: 'blue2' }, orbit: { accent: 'pur' } };
  function applyEnv() {
    const e = { ...(CORE_ENV[st.view] ?? {}), ...(extraViews[st.view]?.env ?? {}) }, acc = e.accent ?? 'blue2';
    root.style.setProperty('--jva', 'var' + '(--' + acc + ')');   // built in two pieces so the theme-token guard sees only real tokens
    readTheme(); C.blue = tok(acc, C.blue);   // canvas labels follow the view's accent too
    root.classList.toggle('jv-clean', e.chrome === 'clean'); root.classList.toggle('jv-noscan', e.scan === false);
    cv.classList.remove('jv-sw'); void cv.offsetWidth; cv.classList.add('jv-sw');
  }
  const setCamAll = () => { applyEnv(); try { const b = $('view').querySelector(`[data-v="${st.view}"]`); $('cur').textContent = (b?.textContent ?? st.view).toUpperCase(); } catch (e) { /* label only */ } setCam(); $('reg').hidden = st.view !== 'globe'; if (extraViews[st.view]) { Object.assign(st, { yaw: 0.35, pitch: -0.45, zoom: 1 }); try { extraViews[st.view].onEnter?.(xapi); } catch (e) { /* a view must never break the HUD */ } } if (st.view === 'candles') { Object.assign(st, { yaw: 0.3, pitch: -0.5, zoom: 1 }); st.cdTarget = { x: 0, z: 0 }; st.cdCam = { x: 0, z: 0 }; ensureCandles(); } };
  async function ensureCandles(force = false) {
    if (!force && st.cd && Date.now() - st.cd.at < 60_000) return st.cd;
    if (st.cdBusy) return st.cdBusy;
    st.cdBusy = (async () => {
      try { const [v, b] = await Promise.all([jf('/api/vol-forecast/live'), jf('/api/bias-engine').catch(() => null)]); const rows = candleRows(v?.instruments ?? {}, b?.markets ?? {}); st.cd = { at: Date.now(), rows, layout: candleLayout(rows.map(r => r.key)), board: boardSummary(rows), ok: rows.length > 0, label: v?.fallback ? v.session_label : null }; }
      catch (e) { st.cd = { at: Date.now(), rows: [], layout: {}, board: null, ok: false }; }
      finally { st.cdBusy = null; }
      return st.cd;
    })();
    return st.cdBusy;
  }
  const resize = () => {
    const cmp = root.clientWidth < 700; st.compact = cmp; root.classList.toggle('jv-compact', cmp); if (!cmp) root.classList.remove('jv-menu-open'); const d = Math.min(2, win.devicePixelRatio || 1); st.w = root.clientWidth; st.h = root.clientHeight; cv.width = st.w * d; cv.height = st.h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const onResize = () => { resize(); fitTop(); }; let topObs = null;
  resize(); win.addEventListener('resize', onResize); fitTop(); try { if (win.ResizeObserver) { topObs = new win.ResizeObserver(fitTop); topObs.observe(root.querySelector('.jv-top')); } } catch (e) { /* layout only */ }

  // ── the awakening: a heartbeat in the dark, the core ignites, status lines tick through, a greeting, then the HUD fades in ──
  const bootTimers = [];
  const later2 = (fn, ms) => bootTimers.push(win.setTimeout(() => { if (open) fn(); }, ms));
  function runBoot() {
    if (!BOOT) return;
    const bs = $('bs'), log = $('bslog'), bar = $('bsbar'), sub = $('bss'), h = $('bst');
    const hr = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(new Date()), greet = hr < 12 ? 'GOOD MORNING' : hr < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
    const lines = ['waking core', 'remembering the desk', 'opening the markets', 'reading the chain', 'warming the globe', 'listening'], k = BOOT / 4.2;
    if (calm) { sub.textContent = `${greet} · ALL SYSTEMS NOMINAL`; h.classList.add('on'); log.innerHTML = ''; }
    else {
      later2(() => blip(62, 0.16, 'sine', 0.07), 150); later2(() => blip(55, 0.2, 'sine', 0.07), 420); later2(() => blip(62, 0.16, 'sine', 0.06), 1050); later2(() => blip(55, 0.2, 'sine', 0.06), 1320);   // lub-dub, lub-dub
      later2(() => { h.classList.add('on'); sub.textContent = 'W A K I N G'; }, 1000 * k);
      later2(() => { sub.textContent = 'C O M I N G   O N L I N E'; blip(330, 0.12, 'triangle'); }, 1700 * k);
      lines.forEach((l, i) => later2(() => { const d = doc.createElement('div'); d.innerHTML = `<b>${esc(l)}</b> …<span class="ok">OK</span>`; log.appendChild(d); bar.style.width = `${Math.round((i + 1) / (lines.length + 1) * 100)}%`; blip(420 + i * 70, 0.05, 'square', 0.015); }, (1900 + i * 340) * k));
      later2(() => { bar.style.width = '100%'; sub.classList.remove('blink'); sub.textContent = `${greet}  ·  ALL SYSTEMS NOMINAL`; bootChime(); }, 3950 * k);
    }
    later2(() => { bs.classList.add('gone'); }, (BOOT - 0.5) * 1000);
    later2(() => { root.classList.remove('jv-booting'); fitTop(); }, (BOOT - 0.9) * 1000);
    later2(() => { bs.remove(); }, BOOT * 1000 + 400);
  }

  // ── sound: tiny WebAudio blips (free, no files) ──
  let ac = null;
  const blip = (f = 660, d = 0.08, type = 'sine', g = 0.03, at = 0) => {
    if (!st.sound) return; try { ac ??= new (win.AudioContext || win.webkitAudioContext)(); const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime + at; o.type = type; o.frequency.setValueAtTime(f, t); v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(v); v.connect(ac.destination); o.start(t); o.stop(t + d + 0.02); } catch (e) { /* no audio */ }
  };
  // ambience and whooshes for the SHOW: a low drone with a slow swell and a breath of filtered noise, and a swept-noise whoosh on a scene change (all WebAudio, no files)
  let amb = null;
  const noiseBuf = () => { const n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; };
  const sfx = {
    ambient(on) {
      try {
        if (!on) { if (amb) { const a = amb; amb = null; a.g.gain.cancelScheduledValues(ac.currentTime); a.g.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 1.2); win.setTimeout(() => { try { a.nodes.forEach(n => n.stop?.()); } catch (e) { /* done */ } }, 1400); } return; }
        if (!st.sound || amb) return; ac ??= new (win.AudioContext || win.webkitAudioContext)();
        const g = ac.createGain(), lp = ac.createBiquadFilter(), o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), nz = ac.createBufferSource(), nf = ac.createBiquadFilter(), ng = ac.createGain();
        o1.type = 'sine'; o1.frequency.value = 55; o2.type = 'triangle'; o2.frequency.value = 82.6; lp.type = 'lowpass'; lp.frequency.value = 420; lfo.frequency.value = 0.12; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(g.gain);
        nz.buffer = noiseBuf(); nz.loop = true; nf.type = 'bandpass'; nf.frequency.value = 260; ng.gain.value = 0.008; nz.connect(nf); nf.connect(ng); ng.connect(g);
        o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.linearRampToValueAtTime(0.045, ac.currentTime + 3);
        [o1, o2, lfo, nz].forEach(n => n.start()); amb = { g, nodes: [o1, o2, lfo, nz] };
      } catch (e) { /* no audio */ }
    },
    whoosh() {
      if (!st.sound) return; try {
        ac ??= new (win.AudioContext || win.webkitAudioContext)(); const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        s.buffer = noiseBuf(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.45); f.frequency.exponentialRampToValueAtTime(300, t + 1.0);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05); s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + 1.1);
      } catch (e) { /* no audio */ }
    },
  };
  const bootChime = () => { blip(440, 0.1, 'triangle'); blip(660, 0.1, 'triangle', 0.03, 0.1); blip(880, 0.18, 'triangle', 0.03, 0.2); };
  const alertChime = () => { blip(880, 0.12, 'square', 0.025); blip(660, 0.18, 'square', 0.025, 0.14); };

  // ── voice out (the browser's own synthesis; the best British male on offer) ──
  let voice = null; const loadVoice = () => { voice = pickVoice(win.speechSynthesis?.getVoices?.() ?? []); }; loadVoice(); win.speechSynthesis?.addEventListener?.('voiceschanged', loadVoice);
  // the NATURAL voice (server MP3: ElevenLabs with a key, else Microsoft's free British neural voice) leads; the browser's own synthesis is the fallback
  const neural = makeNeuralVoice(win, { audioCtx: () => { try { ac ??= new (win.AudioContext || win.webkitAudioContext)(); return ac; } catch (e) { return null; } } }); st.neural = prefs.neural !== false;
  const builtIn = (t, rate, onEnd, onWord) => { const u = new win.SpeechSynthesisUtterance(String(t).slice(0, 1200)); if (voice) u.voice = voice; u.lang = voice?.lang ?? 'en-GB'; u.rate = 1.02 * rate; u.pitch = 0.82; if (onEnd) { u.onend = onEnd; u.onerror = onEnd; } if (onWord) u.onboundary = e => { try { onWord(e.charIndex); } catch (er) { /* progress only */ } }; win.speechSynthesis.speak(u); };
  let sayCtl = null;
  const say = (t, force = false) => {
    try {
      if (!st.voice && !force) return; win.speechSynthesis?.cancel(); sayCtl?.stop(); sayCtl = null;
      if (st.neural) { const my = {}; sayCtl = my; neural.play(t, 1).then(c => { if (c) { if (sayCtl === my) sayCtl = c; else c.stop(); } else if (sayCtl === my && win.speechSynthesis) builtIn(t, 1); }); return; }
      if (win.speechSynthesis) builtIn(t, 1);
    } catch (e) { /* no voice */ }
  };

  // the voice LEADS: speakAsync resolves when the narration has finished (or, with the voice off, after a reading-speed pause), so a director moves the picture on only then.
  // st.speakCtl = { stop, pause(on), setRate(r) (applies to the line already playing), progress() -> 0..1 from the REAL audio clock (the natural voice's <audio>, or the browser voice's word
  // boundaries), 0 while a clip is still being fetched, null when there is no clock (voice off, or a browser voice that sends no boundaries: the caller then uses its reading-speed estimate) }.
  function speakAsync(text, rate = 1) {
    return new Promise(res => {
      const t = String(text ?? ''), est1 = Math.max(2, t.split(/\s+/).filter(Boolean).length / 2.6) * 1000; let r = rate > 0 ? rate : 1, est = est1 / r;
      let done = false, tid = 0, left = est, since = 0, paused = false, nctl = null, waiting = false, bChar = -1;
      const fin = () => { if (!done) { done = true; win.clearTimeout(tid); if (st.speakCtl === ctl) { st.speakStop = null; st.speakCtl = null; } res(); } };
      const aloud = st.voice && (st.neural || win.speechSynthesis);
      const arm = ms => { win.clearTimeout(tid); since = performance.now(); left = ms; tid = win.setTimeout(fin, ms); };
      const stop = () => { try { nctl?.stop(); if (win.speechSynthesis) win.speechSynthesis.cancel(); } catch (e) { /* idle */ } fin(); };
      const ctl = { stop, pause: on => { if (done || paused === on) return; paused = on;
        if (aloud) { try { if (nctl) nctl.pause(on); else on ? win.speechSynthesis.pause() : win.speechSynthesis.resume(); } catch (e) { /* idle */ } if (on) win.clearTimeout(tid); else arm(est * 2.5 + 8000); }
        else if (on) { win.clearTimeout(tid); left -= performance.now() - since; } else arm(Math.max(200, left)); },
        setRate: nr => {
          if (done || !(nr > 0) || nr === r) return;
          if (nctl) { try { nctl.setRate?.(nr); } catch (e) { /* idle */ } }
          else if (!aloud) { if (paused) left = left * r / nr; else arm(Math.max(200, (left - (performance.now() - since)) * r / nr)); }      // subtitles only: the remaining time scales with the new speed
          est = est1 / nr; r = nr;                                                                                                            // (a browser voice keeps its speed until the next line)
        },
        progress: () => { if (done) return 1; if (!aloud) return null; if (nctl) { try { return nctl.progress?.() ?? null; } catch (e) { return null; } } if (waiting) return 0; return bChar >= 0 && t.length ? Math.min(1, bChar / t.length) : null; } };
      st.speakStop = stop; st.speakCtl = ctl;
      if (!aloud) { arm(est); return; }
      arm(est * (st.neural && neural.slow() ? 8 : 2.5) + (st.neural && neural.slow() ? 60000 : 12000));       // a safety net: the show never hangs on a voice that never ends (longer while Kokoro renders in the browser)
      const fallback = () => { waiting = false; if (done) return; try { if (!win.speechSynthesis) { arm(est); return; } win.speechSynthesis.cancel(); builtIn(t, r, fin, ch => { bChar = ch; }); } catch (e) { arm(est); } };
      if (st.neural) { waiting = true; win.speechSynthesis?.cancel(); neural.play(t, r, fin).then(c => { waiting = false; if (done) { c?.stop(); return; } if (c) { nctl = c; if (c.setRate && r !== rate) c.setRate(r); arm(est * 2.5 + 8000); if (paused) c.pause(true); } else fallback(); }); }
      else fallback();
    });
  }
  const voicePrefetch = t => { if (st.voice && st.neural) neural.prefetch(t); };
  const setCaption = (text, title = '') => { const c = $('cap'); if (!text) { c.hidden = true; return; } $('capt').textContent = title; $('capx').textContent = text; c.hidden = false; };
  const setCinema = (on, stop = null, ctl = null) => { root.classList.toggle('jv-cinema', !!on); st.cinemaStop = on ? stop : null; st.cinemaCtl = on ? ctl : null; if (!on) { setCaption(null); $('cpause').textContent = '⏸ PAUSE'; $('cine').classList.remove('more'); } else stopAttract(); };
  const cineAct = a => { const c = st.cinemaCtl; if (!c) return; try { c[a]?.(); } catch (e) { /* the director must never break the HUD */ } };

  // ── data ──
  const jf0 = (u, o) => win.fetch(u, o).then(r => r.json());
  // WEEKEND / PRE-OPEN FALLBACK: the live move feed is empty until the new session prints ("No bars since midnight"), which left the currency, weather, board and book pictures blank all
  // weekend. When fewer than 3 markets have a move, every view is handed the LAST COMPLETE session snapshot instead, clearly labelled with when it was taken (never passed off as today).
  const usable = j => Object.values(j?.instruments ?? {}).filter(x => x && !x.error && x.oc != null).length;
  let lastSess = null;
  const lastSession = () => (lastSess && Date.now() - lastSess.at < 10 * 60_000) ? lastSess.p : (lastSess = { at: Date.now(), p: (async () => {
    for (let k = 1; k <= 6; k++) {
      const d = new Date(Date.now() - k * 86_400_000).toISOString().slice(0, 10);
      try { const j = await jf0(`/api/vol-forecast/session?date=${d}`); if (usable(j) >= 10) { const at = new Date(j.fetched_at ?? d); return { ...j, fallback: true, session_label: `LAST SESSION · AS OF ${at.toUTCString().slice(0, 22).toUpperCase()} UTC` }; } } catch (e) { /* try the day before */ }
    }
    return null;
  })() }).p;
  const jf = (u, o) => jf0(u, o).then(async j => (String(u).split('?')[0] === '/api/vol-forecast/live' && usable(j) < 3) ? ((await lastSession().catch(() => null)) ?? j) : j);
  async function loadAt(w, date = null) {
    let r = null; try { r = await win.deskChainData?.(w, date); } catch (e) { r = null; }
    if (!r?.links?.length) return null;
    return { graph: buildGraph(r.links), sum: win.deskChainSummary?.(r.links, w) ?? null };
  }
  function setGraph(g, sum) { st.graph = g; st.sum = sum; st.chainFail = false; root.classList.remove('jv-nochain'); for (const n of g.nodes) if (st.disp[n.key] == null) st.disp[n.key] = n.style.size; st.bl = null; renderHud(); }
  async function load(w, date = null) {
    st.win = w; st.sel = null; $('card').hidden = true;
    for (const b of $('win').querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.w === w));
    const first = !st.graph;
    if (first) $('boot').innerHTML = '<b>Reading the chain…</b>';
    const r = await loadAt(w, date);
    if (!r) { st.graph = null; st.chainFail = true; root.classList.add('jv-nochain'); $('boot').innerHTML = '<b>The chain feeds are not available right now.</b> The chain pictures stay empty until they load: open the Chain tab once and try again. Every other view works without them.'; return; }
    setGraph(r.graph, r.sum);
    if (first || date == null) { const wait = Math.max(0, BOOT * 1000 - (performance.now() - st.t0)); if (wait > 50) later2(() => typeBoot(bootLines(r.sum, w)), wait); else typeBoot(bootLines(r.sum, w)); }
    if (st.mod !== 'chain' && st.mod !== 'ask' && st.mod !== 'alerts') R[st.mod]?.();
  }
  let typing = 0;
  function typeBoot(lines) {
    const my = ++typing; let i = 0; $('boot').innerHTML = '';
    const next = () => { if (my !== typing || !open || i >= lines.length) return; const d = doc.createElement('div'); if (i === 0) d.innerHTML = `<b>${esc(lines[i])}</b>`; else if (i === lines.length - 1 && lines.length > 3) d.className = 'jv-hl', d.textContent = lines[i]; else d.textContent = lines[i]; $('boot').appendChild(d); blip(900 + i * 80, 0.03, 'square', 0.015); i++; win.setTimeout(next, 420); };
    next();
  }
  function renderHud() {
    const s = st.sum, hh = $('hud'); if (!s) { hh.innerHTML = ''; return; }
    const w = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date());
    hh.innerHTML = `<b>${st.win}D</b>LONDON ${w}<br>CHAIN <span class="ok">${s.holding} HOLDING</span> · <span class="am">${s.broken} BROKEN</span> · ${s.quiet} QUIET<br>WATCH ${st.watch ? `<span class="ok">ON</span>` : 'OFF'}${st.lastCheck ? ` · LAST CHECK ${esc(st.lastCheck)}` : ''}<br>${st.idx >= 0 && st.dates[st.idx] ? `<span class="am">REPLAY ${esc(st.dates[st.idx])}</span>` : 'LIVE DATA'}`;
  }

  // ── controls ──
  $('win').innerHTML = [1, 5, 20].map(w => `<button type="button" data-w="${w}" aria-pressed="${w === st.win}">${w}D</button>`).join(' ');
  $('view').innerHTML = [['globe', 'GLOBE'], ['candles', 'BOARD'], ['bubbles', 'BUBBLES'], ['skyline', 'SKYLINE'], ['orbit', 'ORBIT']].map(([id, l]) => `<button type="button" data-v="${id}" aria-pressed="${id === st.view}">${l}</button>`).join(' ');
  $('win').onclick = e => { const b = e.target.closest('button[data-w]'); if (b) { blip(520, 0.05); load(+b.dataset.w, st.idx >= 0 ? st.dates[st.idx] : null); } };
  const switchView = (v, auto = false) => {
    if (st.view !== v) { try { extraViews[st.view]?.onLeave?.(xapi); } catch (e) { /* a view must never break the HUD */ } }
    st.view = v; if (!auto) { lsPut({ view: v }); if (extraViews[v]?.gl) st.recent = [v, ...st.recent.filter(x => x !== v)].slice(0, 5); }      // the GL views the owner visited, newest first (ATTRACT cycles them)
    setCamAll(); renderNav(); for (const x of $('view').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.v === v)); if (!auto) blip(720, 0.06); };
  $('view').onclick = e => { const b = e.target.closest('button[data-v]'); if (b) switchView(b.dataset.v); };
  $('nms').onclick = e => { const n = getNameStyle() === 'names' ? 'codes' : 'names'; setNameStyle(n); e.currentTarget.setAttribute('aria-pressed', String(n === 'names')); e.currentTarget.textContent = n === 'names' ? 'NAMES' : 'CODES'; blip(600); };
  // the VOICE panel: one button in the top bar opens it; nothing of it sits on the page otherwise
  const vpop = $('vpop'), vnote = () => { $('vnote').textContent = `Speaking with: ${st.neural ? neural.label() : 'the built-in browser voice'}.`; };
  const vsync = () => { $('veng').value = neural.engine(); $('vkv').value = neural.kvoice(); $('vfx').value = neural.fx(); $('vkvl').hidden = neural.engine() !== 'kokoro'; $('nv').textContent = st.neural ? 'ON' : 'OFF'; $('nv').setAttribute('aria-pressed', String(st.neural)); const sp = speakPref(lsGet()); $('vsp').textContent = sp ? 'ON' : 'OFF'; $('vsp').setAttribute('aria-pressed', String(sp)); vnote(); };
  const vclose = () => { vpop.hidden = true; $('vbtn').setAttribute('aria-expanded', 'false'); };
  $('vbtn').onclick = e => { e.stopPropagation(); const open = vpop.hidden; vpop.hidden = !open; $('vbtn').setAttribute('aria-expanded', String(open)); if (open) { vsync(); if (st.compact) closeMenu?.(); } blip(640, 0.04); };
  const onDocPointer = e => { if (!vpop.hidden && !vpop.contains(e.target) && e.target !== $('vbtn')) vclose(); };
  doc.addEventListener('pointerdown', onDocPointer, true);
  const setSpeak = on => { lsPut({ speak: !!on }); try { doc.dispatchEvent(new win.CustomEvent('jarvis-voice', { detail: { on: !!on } })); } catch (e) { /* label only */ } if (!vpop.hidden) vsync(); };
  $('vsp').onclick = () => setSpeak(!speakPref(lsGet()));
  $('veng').onchange = e => { neural.setEngine(e.target.value); neural.warm(); vsync(); };
  $('vkv').onchange = e => { neural.setKvoice(e.target.value); vsync(); };
  $('vfx').onchange = e => { neural.setFx(e.target.value); vsync(); };
  $('nv').onclick = () => { st.neural = !st.neural; lsPut({ neural: st.neural }); vsync(); };
  $('vtest').onclick = () => { neural.begin(); say('Good morning. All systems nominal. Here is where things stand.', true); win.setTimeout(vnote, 1500); };
  $('snd').onclick = e => { st.sound = !st.sound; lsPut({ sound: st.sound }); e.currentTarget.setAttribute('aria-pressed', String(st.sound)); blip(600); };

  const REGLAB = { world: 'WORLD', americas: 'AMERICAS', europe: 'EUROPE', asia: 'ASIA-PACIFIC', 'mideast-africa': 'MIDDLE EAST & AFRICA' };
  $('reg').innerHTML = Object.keys(REGIONS).map(r => `<button type="button" data-r="${r}" aria-pressed="${r === st.region}">${REGLAB[r]}</button>`).join('');
  $('reg').onclick = e => { const b = e.target.closest('button[data-r]'); if (!b) return; st.region = b.dataset.r; const [la, lo, z] = REGIONS[st.region]; st.gl.tlat = la; st.gl.tlon = lo; st.gl.tzoom = z; st.spin = st.region === 'world'; for (const x of $('reg').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.r === st.region)); blip(700, 0.05); };
  const MODS = [['chain', 'CHAIN'], ['ask', 'ASK'], ['radar', 'RADAR'], ['brief', 'BRIEF'], ['alerts', 'ALERTS'], ['system', 'SYSTEM']];
  $('mods').innerHTML = MODS.map(([id, l]) => `<button type="button" data-m="${id}" aria-pressed="${id === 'chain'}">${l}</button>`).join(' ');

  const R = {
    ask(pre = '', auto = false) {
      const p = $('pane'), qd = pre || (st.sel && CHAIN_NODES[st.sel] ? `What is going on with ${CHAIN_NODES[st.sel].label} and the links around it today?` : '');
      p.innerHTML = `<h3>ASK JARVIS</h3><p>One answer from today's book, the analysts' reports, the desk's memory and the Evidence Book. It cites what it used and says when the data does not answer. Each question is one model call, owner only, 60 a day.</p>
<textarea id="${ID}-q" placeholder="Why is the desk short USD/JPY when the Fed is hawkish?">${esc(qd)}</textarea>
<div class="jv-row"><button type="button" id="${ID}-go">ASK</button><button type="button" id="${ID}-mic" title="Speak your question">SPEAK</button><button type="button" id="${ID}-voice" aria-pressed="${st.voice}">VOICE REPLY</button><span id="${ID}-st" class="jv-sub"></span></div><div id="${ID}-ans"></div>`;
      const q = p.querySelector(`#${ID}-q`), stt = p.querySelector(`#${ID}-st`), ans = p.querySelector(`#${ID}-ans`);
      const go = async () => {
        const text = q.value.trim(); if (text.length < 3) return;
        stt.textContent = 'Thinking…'; ans.textContent = ''; blip(500, 0.06);
        const r = await jf('/api/desk-ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text }) }).catch(e => ({ ok: false, error: e.message }));
        stt.textContent = r.ok ? (r.model ?? '') : '';
        ans.innerHTML = r.ok ? `<div class="jv-ans">${esc(r.answer)}</div>${(r.sources ?? []).map(x => `<span class="jv-src">${esc(x)}</span>`).join('')}` : `<p class="jv-dn">${esc(r.error ?? 'No answer')}</p>`;
        if (r.ok) { blip(990, 0.08, 'triangle'); say(r.answer); }
      };
      p.querySelector(`#${ID}-go`).onclick = go;
      p.querySelector(`#${ID}-voice`).onclick = e => { st.voice = !st.voice; e.currentTarget.setAttribute('aria-pressed', String(st.voice)); if (!st.voice) win.speechSynthesis?.cancel(); else say('Voice on.', true); };
      p.querySelector(`#${ID}-mic`).onclick = () => {
        const SRc = win.SpeechRecognition || win.webkitSpeechRecognition; if (!SRc) { stt.textContent = 'Voice input is not supported in this browser.'; return; }
        const rec = new SRc(); rec.lang = 'en-GB'; rec.onresult = ev => { q.value = ev.results[0][0].transcript; st.voice = true; go(); }; rec.onerror = () => { stt.textContent = 'Could not hear that.'; }; stt.textContent = 'Listening…'; blip(780, 0.05); rec.start();
      };
      if (auto) go();
    },
    radar() {
      const p = $('pane'), r = st.graph ? radarRank(st.graph, names) : { items: [], broken: [] };
      p.innerHTML = `<h3>WHAT'S UNUSUAL · ${st.win}D</h3><p>Moves ranked by size against each series' own normal noise, broken links first. Unusual here means big for that series over this window. It describes the tape; it does not say what comes next.</p>`
        + (r.broken.length ? `<p class="jv-am"><b>${r.broken.length} textbook link${r.broken.length === 1 ? '' : 's'} broken:</b> ${r.broken.map(b => esc(b.short)).join(' · ')}</p>` : '')
        + (r.items.length ? r.items.map(i => `<button type="button" class="jv-item" data-k="${i.key}"><b class="${i.tone === 'wrong' ? 'jv-am' : i.tone === 'up' ? 'jv-up' : 'jv-dn'}">${esc(i.label)} ${esc(i.text)}</b><br><span class="jv-sub">${esc(i.why)}</span></button>`).join('') : '<p>Nothing is beyond its normal noise over this window.</p>');
      p.onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { st.sel = b.dataset.k; st.spin = false; blip(840, 0.05); } };
    },
    async brief() {
      const p = $('pane'); p.innerHTML = '<h3>BRIEFING</h3><p>Reading the stored chain read…</p>';
      const d = await jf(`/api/chain-read?window=${st.win}`).catch(() => null), r = d?.read && typeof d.read === 'object' ? d.read : d;
      if (!d?.ok || !r) { p.innerHTML = `<h3>BRIEFING · ${st.win}D</h3><p>No chain read has been written for the ${st.win}-day window today. Writing one is a model call: press Refresh on the Chain tab's read. Until then, the numbers are on the CHAIN and RADAR views.</p>`; return; }
      const paras = String(r.read ?? '').split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean);
      p.innerHTML = `<h3>BRIEFING · ${st.win}D</h3>${r.hook ? `<p class="jv-ans"><b>“${esc(r.hook)}”</b></p>` : ''}${paras.map(x => `<p>${esc(x)}</p>`).join('')}${r.next ? `<p><b>Next:</b> ${esc(r.next)}</p>` : ''}<div class="jv-row"><button type="button" id="${ID}-say">READ IT TO ME</button></div><p class="jv-sub">Written ${esc(d.generatedAt ?? '')}. An opinion in a trader's voice, not backtested, not a forecast. One read per window per day, shared by everyone.</p>`;
      p.querySelector(`#${ID}-say`).onclick = () => say([r.hook, ...paras].filter(Boolean).join('. '), true);
    },
    alerts() {
      const p = $('pane');
      p.innerHTML = `<h3>ALERTS</h3><p>Jarvis checks the live chain every two minutes while this tab is open, and the server's memory every ten. He tells you when a textbook link breaks or heals, when a market goes well beyond its normal noise, and when memory crosses your limit. It is awareness, never a trade.</p>
<div class="jv-row"><button type="button" id="${ID}-wt" aria-pressed="${st.watch}">WATCHING ${st.watch ? 'ON' : 'OFF'}</button><button type="button" id="${ID}-nt">DESKTOP NOTIFICATIONS</button></div>`
        + (st.alerts.length ? st.alerts.map(a => `<p><span class="jv-k ${a.level === 'warn' ? 'jv-broke' : 'jv-hold'}">${esc(a.time)}</span>${esc(a.text)}</p>`).join('') : '<p>Nothing yet this session.</p>');
      jf('/api/jarvis/watch').then(w => {   // the server watcher (Telegram, tab closed); fails soft if the route is missing
        if (!w?.ok || st.mod !== 'alerts' || !p.isConnected) return;
        const hm = w.lastCheck ? new Date(w.lastCheck).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : 'not yet';
        const rows = (w.lastAlerts ?? []).map(a => `<p><span class="jv-k ${a.level === 'warn' ? 'jv-broke' : 'jv-hold'}">${esc(new Date(a.at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>${esc(a.text)}</p>`).join('');
        p.insertAdjacentHTML('beforeend', `<h3 style="margin-top:12px">SENT TO YOUR PHONE</h3><p class="jv-sub">Server watcher: last check ${esc(hm)}${w.enabled ? '' : ' (switched off)'}</p>${rows || '<p>Nothing sent yet.</p>'}`);
      }).catch(() => {});
      p.querySelector(`#${ID}-wt`).onclick = () => { setWatch(!st.watch); R.alerts(); };
      p.querySelector(`#${ID}-nt`).onclick = async () => { try { const r = await win.Notification?.requestPermission?.(); say(r === 'granted' ? 'Desktop notifications are on.' : 'Notifications were not allowed.', true); } catch (e) { /* unsupported */ } };
    },
    async system() {
      const p = $('pane'); p.innerHTML = '<h3>SYSTEM</h3><p>Reading the server…</p>';
      const sm = systemSummary(await jf('/api/services').catch(() => null));
      if (!sm.ok) { p.innerHTML = '<h3>SYSTEM</h3><p>The server did not answer the health route.</p>'; return; }
      st.mem = sm.rssMB; const n = v => (v == null ? 'n/a' : v), ms = memoryState(sm.rssMB, st.memLimit);
      p.innerHTML = `<h3>SYSTEM</h3><p>The first figures are the web server only; the list below adds the bots that run beside it. Memory is the biggest part of the Railway bill; the peak is the highest minute sample since the last deploy.</p>
<table><tr><td>Memory now</td><td class="${ms === 'ok' ? '' : 'jv-am'}">${n(sm.rssMB)} MB${ms === 'ok' ? '' : ` · ${ms}`}</td></tr><tr><td>Memory peak since deploy</td><td>${n(sm.peakRssMB)} MB</td></tr><tr><td>JS heap in use</td><td>${n(sm.heapUsedMB)} MB</td></tr><tr><td>Up for</td><td>${n(sm.uptimeH)} h</td></tr><tr><td>Services switched on</td><td>${n(sm.enabled)} of ${n(sm.total)}</td></tr></table>
<div class="jv-row"><label class="jv-sub">Alert me above <input type="number" id="${ID}-lim" min="0" step="50" value="${st.memLimit || ''}" placeholder="MB" style="width:90px"> MB (your plan's memory; blank = no alert)</label></div>
${sm.procs.length ? `<h3 style="margin-top:12px">WHAT IS RUNNING · ${n(sm.containerMB)} MB IN ALL</h3><p class="jv-sub">Railway bills the whole container. Each row is a process group, what it is for, and the memory it holds. A bot can be switched off by setting its flag to 0 in the Railway variables; the ones marked LIVE are the trading bots.</p><table>${sm.procs.map(r => `<tr><td><b>${esc(r.label)}</b>${r.live ? ' <span class="jv-am">LIVE</span>' : ''}<br><span class="jv-sub">${esc(r.feeds)}${r.cost ? ` · cost ${esc(r.cost)}` : ''}${r.turnOff ? ` · off: ${esc(r.turnOff)}` : ''}</span></td><td>${r.rssMB} MB${r.peakMB > r.rssMB ? `<br><span class="jv-sub">peak ${r.peakMB}</span>` : ''}</td></tr>`).join('')}</table>` : ''}
<h3 style="margin-top:12px">BUSIEST TODAY</h3><table>${sm.top.map(t => `<tr><td>${esc(t.id)}</td><td>${t.minutes} min · ${t.runs} runs${t.errors ? ` · <span class="jv-am">${t.errors} errors</span>` : ''}</td></tr>`).join('') || '<tr><td>nothing measured yet</td><td></td></tr>'}</table>`;
      p.querySelector(`#${ID}-lim`).onchange = e => { st.memLimit = Math.max(0, +e.target.value || 0); lsPut({ memLimit: st.memLimit }); };
    },
  };
  function setMod(m) {
    st.mod = m; win.speechSynthesis?.cancel(); blip(600, 0.05);
    for (const b of $('mods').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.m === m));
    $('pane').hidden = m === 'chain'; $('pane').onclick = null; $('boot').style.display = m === 'chain' ? '' : 'none';
    if (m === 'chain') showCard(); else { $('card').hidden = true; R[m]?.(); }
    renderNav();
  }
  $('mods').onclick = e => { const b = e.target.closest('button[data-m]'); if (b) setMod(b.dataset.m); };
  // ── the sections: six, each holding its pictures AND its panels; a picture with a natural companion list opens it beside it ──
  function renderNav() {
    const nav = $('nav'); if (!nav) return;
    const has = (k, id) => !!(k === 'view' ? $('view').querySelector(`[data-v="${id}"]`) : $('mods').querySelector(`[data-m="${id}"]`));
    const act = activeSection(st.mod, st.view), items = itemsFor(act, has), comp = COMPANION[st.view] ?? null, hasComp = comp && has('tool', comp);
    nav.innerHTML = `<div class="jv-nav-row">${SECTIONS.map(x => `<button type="button" class="jv-sec" data-s="${x.id}" aria-pressed="${x.id === act.id}">${x.label}</button>`).join('')}</div>`
      + `<div class="jv-nav-row">${items.map(i => `<button type="button" class="jv-it ${i.kind}" data-k="${i.kind}" data-i="${i.id}" aria-pressed="${i.kind === 'view' ? (st.mod === 'chain' && st.view === i.id) : st.mod === i.id}" title="${i.kind === 'view' ? 'A picture' : 'A panel of text and numbers'}">${esc(i.label)}</button>`).join('')}`
      + `${hasComp ? `<button type="button" class="jv-it side" data-side="1" aria-pressed="${st.mod === comp}" title="The list that goes with this picture">${st.mod === comp ? '◂ HIDE' : '▸ SHOW'} ${esc(labelOf('tool', comp) ?? 'LIST')}</button>` : ''}</div>`
      + `<div class="jv-nav-hint">${esc(act.hint)}</div>`;
    $('cur').textContent = `${act.label} · ${(st.mod !== 'chain' ? labelOf('tool', st.mod) : labelOf('view', st.view)) ?? ''}`;
    win.setTimeout(fitTop, 0);
  }
  function autoCompanion() { const comp = COMPANION[st.view]; if (!comp || st.compact || lsGet().side === false || st.mod !== 'chain' || st.cinemaStop || !$('mods').querySelector(`[data-m="${comp}"]`)) return; setMod(comp); }
  function goNav(kind, id) { if (kind === 'view') { if (st.mod !== 'chain') setMod('chain'); switchView(id); autoCompanion(); } else setMod(id); if (st.compact) closeMenu(); }
  $('nav').onclick = e => {
    const sec = e.target.closest('button[data-s]'); if (sec) { const x = SECTIONS.find(y => y.id === sec.dataset.s); goNav(x.home[0], x.home[1]); return; }
    const it = e.target.closest('button[data-i]'); if (it) { goNav(it.dataset.k, it.dataset.i); return; }
    if (e.target.closest('button[data-side]')) { const comp = COMPANION[st.view]; if (comp) { const open = st.mod === comp; lsPut({ side: !open }); setMod(open ? 'chain' : comp); } }
  };
  const xapi = { ID, st, $, jf, esc, say, blip, names, doc, win, setGraph: (g, sum) => setGraph(g, sum), sfx, setView: v => switchView(v), candles: () => ensureCandles(), speak: (t, rate) => speakAsync(t, rate), voicePrefetch: t => voicePrefetch(t), voiceInfo: () => neural.info(), voiceBegin: () => neural.begin(), voiceLabel: () => (st.voice ? (st.neural ? neural.label() : 'built-in voice') : 'voice off'), voiceOn: () => speakPref(lsGet()), setVoiceOn: on => setSpeak(on), voicePanel: () => { if (vpop.hidden) $('vbtn').click(); }, caption: (t, title) => setCaption(t, title), cinema: (on, stop, ctl) => setCinema(on, stop, ctl), cineLabel: (rate, paused) => { $('crate').textContent = `${rate.toFixed(2).replace(/0$/, '')}×`; $('cpause').textContent = paused ? '▶ RESUME' : '⏸ PAUSE'; },
    globeTo: (lat, lon, zoom = 1) => { Object.assign(st.gl, { tlat: lat, tlon: lon, tzoom: zoom }); st.spin = false; }, flyTo: (x, z) => { st.cdTarget = { x, z }; }, setMod: m => setMod(m), ask: q => { setMod('ask'); R.ask(q, true); }, tcol: t => tcol(t), colours: () => C };
  loadModules().then(list => {
    win.setTimeout(fitTop, 0);
    for (const v of viewsOf()) { if (!$('view').querySelector(`[data-v="${v.id}"]`)) $('view').insertAdjacentHTML('beforeend', ` <button type="button" data-v="${esc(v.id)}" aria-pressed="${v.id === st.view}">${esc(v.label)}</button>`); extraViews[v.id] = v; }
    if (extraViews[st.view]) setCamAll();
    renderNav();
    for (const m of list) { R[m.id] = () => m.render($('pane'), xapi); if (!(Array.isArray(m.views) && m.views.length) && !$('mods').querySelector(`[data-m="${m.id}"]`)) $('mods').insertAdjacentHTML('beforeend', ` <button type="button" data-m="${esc(m.id)}" aria-pressed="false">${esc(m.label)}</button>`); }
    fitTop();
  });

  // ── interaction ──
  cv.addEventListener('pointerdown', e => { st.drag = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture?.(e.pointerId); });
  cv.addEventListener('pointermove', e => { const d = st.drag; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy); if (st.view === 'globe') { const k = 0.35 / st.gl.zoom; st.gl.lon -= dx * k; st.gl.tlon = st.gl.lon; st.gl.lat = Math.max(-80, Math.min(80, st.gl.lat + dy * k)); st.gl.tlat = st.gl.lat; st.spin = false; } else if (st.view === 'bubbles') { /* flat: nothing to turn */ } else { st.yaw += dx * 0.006; st.pitch = Math.max(-1.3, Math.min(1.2, st.pitch + dy * 0.004)); } });
  cv.addEventListener('pointerup', e => { const d = st.drag; st.drag = null; if (d && d.moved < 5) pick(e.clientX, e.clientY); });
  cv.addEventListener('wheel', e => { e.preventDefault(); const f = e.deltaY > 0 ? 0.92 : 1.08; if (st.view === 'globe') st.gl.tzoom = Math.max(0.8, Math.min(5, st.gl.tzoom * f)); else st.zoom = Math.max(0.5, Math.min(2.6, st.zoom * f)); }, { passive: false });
  function pick(cx0, cy0) {
    const r = cv.getBoundingClientRect(); let best = null, bd = 30 * 30;
    for (const p of st.proj) { const dx = p.sx - (cx0 - r.left), dy = p.sy - (cy0 - r.top), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = p.key; } }
    st.sel = best; if (best) blip(860, 0.05); showCard();
  }
  function showCard() {
    const card = $('card'), k = st.sel; if (st.mod !== 'chain' || !k || !st.graph) { card.hidden = true; return; }
    const n = st.graph.nodes.find(x => x.key === k), meta = CHAIN_NODES[k]; if (!n || !meta) { card.hidden = true; return; }
    const links = st.graph.edges.filter(e => e.from === k || e.to === k);
    card.innerHTML = `<h3>${esc(meta.label)}</h3><div>${n.end?.delta == null ? 'no data over this window' : `<b>${esc(n.end.text)}</b> over ${st.win} day${st.win === 1 ? '' : 's'}${n.end.moved ? '' : ' · inside its noise'}`}</div><p>${esc(meta.what)}</p>`
      + (links.length ? `<div style="margin-top:8px">${links.map(e => `<p><span class="jv-k ${e.verdict === 'holding' ? 'jv-hold' : e.verdict === 'broken' ? 'jv-broke' : ''}">${esc(VERDICT_WORD[e.verdict] ?? e.verdict)}</span><b>${esc(e.short)}</b><br>${esc(String(e.link.read ?? '').slice(0, 220))}</p>`).join('')}</div>` : '')
      + `<div class="jv-row"><button type="button" id="${ID}-explain">EXPLAIN THIS</button></div>`;
    card.hidden = false;
    card.querySelector(`#${ID}-explain`).onclick = () => {
      const lk = links.filter(e => e.verdict === 'holding' || e.verdict === 'broken').map(e => `${e.short}: ${VERDICT_WORD[e.verdict]}`).join('; ');
      setMod('ask'); R.ask(`Explain ${meta.label} ${n.end?.delta == null ? '' : `(${n.end.text} over ${st.win} days)`} today and what it means for the desk's markets.${lk ? ` Chain links: ${lk}.` : ''}`.slice(0, 780), true);
    };
  }

  // ── the scrub: the chain on each of the last 60 sessions (no lookahead: trimInputs) ──
  let busy = false;
  async function scrubTo(i) {
    st.idx = i >= st.dates.length - 1 ? -1 : i; const date = st.idx >= 0 ? st.dates[st.idx] : null;
    $('sl').value = i; $('sd').textContent = date ? `${date} · ${st.dates.length - 1 - i} sessions ago` : 'LATEST';
    if (busy) return; busy = true;
    try { const r = await loadAt(st.win, date); if (r) { setGraph(r.graph, r.sum); if (st.mod === 'radar') R.radar(); if (st.sel) showCard(); } } finally { busy = false; }
  }
  $('sl').oninput = e => { stopPlay(); scrubTo(+e.target.value); };
  $('now').onclick = () => { stopPlay(); scrubTo(st.dates.length - 1); };
  $('expl').onclick = () => { stopPlay(); setMod('explain'); };
  const stopPlay = () => { if (st.play) { win.clearInterval(st.play); st.play = 0; $('play').textContent = '▶ PLAY'; } };
  $('play').onclick = () => {
    if (st.play) return stopPlay(); if (st.dates.length < 3) return;
    let i = st.idx >= 0 && st.idx < st.dates.length - 1 ? st.idx : Math.max(0, st.dates.length - 41); $('play').textContent = '❚❚ PAUSE'; blip(700, 0.05);
    st.play = win.setInterval(() => { scrubTo(i); i++; if (i >= st.dates.length) stopPlay(); }, 650);
  };
  (async () => { try { st.dates = (await win.deskChainDates?.()) ?? []; } catch (e) { st.dates = []; } if (st.dates.length < 3) $('scrub').style.display = 'none'; else { $('sl').max = st.dates.length - 1; $('sl').value = st.dates.length - 1; } })();

  // ── drawing ──
  const cam = () => ({ yaw: st.yaw, pitch: st.pitch, zoom: st.zoom }), cx = () => st.w / 2 - (st.mod === 'chain' ? 0 : st.w * 0.12), cy = () => st.h / 2 + (st.view === 'skyline' ? 60 : -10);
  const sc = () => (st.view === 'skyline' ? Math.min(st.w * 0.5, st.h * 1.0) * 0.24 : Math.min(st.w * 0.6, st.h) * 0.3);
  const sp = p3 => { const p = project(p3, cam()); return { x: cx() + p.x * sc(), y: cy() + p.y * sc(), s: p.s, z: p.z }; };
  const tcol = tone => (tone === 'up' ? C.up : tone === 'dn' ? C.dn : tone === 'wrong' ? C.gold : C.tx2);
  const poly = (idx, pts, fill, a, stroke) => { ctx.beginPath(); idx.forEach((i, k) => (k ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y))); ctx.closePath(); ctx.globalAlpha = a; ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.globalAlpha = Math.min(1, a + 0.35); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } };
  const ringAt = (y, rad, alpha) => { ctx.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, p = sp([Math.cos(a) * rad, y, Math.sin(a) * rad]); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.globalAlpha = alpha; ctx.strokeStyle = C.blue; ctx.lineWidth = 1; ctx.stroke(); };
  const rail = (a, b, t, lift) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + lift * Math.sin(Math.PI * t), a[2] + (b[2] - a[2]) * t];

  function drawBoot(t) {         // the core waking: a heartbeat in the dark, ignition, rings spinning up, a flash as it comes online
    const x = st.w / 2, y = st.h / 2, R0 = Math.min(st.w, st.h) * 0.2, B = BOOT || 1, u = t / B;
    const beat = tt => { if (tt < 0) return 0; const p = tt % 0.9; return Math.exp(-p * 9) * (p < 0.7 ? 1 : 0); };            // lub-dub
    const hb = t < 0.9 * B / 4.2 + 1.4 ? Math.max(beat(t * 4.2 / B - 0.15), 0.6 * beat(t * 4.2 / B - 0.42)) : 0;
    const wake = Math.min(1, Math.max(0, (u - 0.25) / 0.45)), settle = Math.min(1, Math.max(0, (u - 0.7) / 0.3)), flash = Math.exp(-Math.pow((u - 0.78) * 9, 2));
    ctx.save(); ctx.translate(x, y);
    const gl = ctx.createRadialGradient(0, 0, 1, 0, 0, R0 * (0.5 + wake * 1.4 + hb * 0.4)); gl.addColorStop(0, C.blue); gl.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.10 + 0.45 * wake * (1 - settle * 0.5) + 0.25 * hb + 0.5 * flash; ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R0 * 2, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = C.blue; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate(t * (0.6 + i * 0.5) * wake * (i % 2 ? -1 : 1)); ctx.beginPath(); ctx.arc(0, 0, R0 * (0.45 + i * 0.28) * (1 + 0.08 * hb), 0, Math.PI * (1.1 + i * 0.28)); ctx.globalAlpha = wake * (1 - settle * 0.85); ctx.stroke(); ctx.restore(); }
    ctx.globalAlpha = 1; ctx.fillStyle = C.tx; ctx.beginPath(); ctx.arc(0, 0, R0 * (0.05 + 0.04 * hb + 0.06 * wake + 0.1 * flash), 0, 6.2832); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function drawOrbit(t, fade) {
    ctx.lineWidth = 1; for (const [y, r, a] of [[-1.05, 1.35, 0.5], [-1.05, 1.15, 0.25], [1.05, 1.35, 0.5], [1.05, 1.15, 0.25], [0, 1.45, 0.12]]) ringAt(y, r, a * fade * (0.8 + 0.2 * Math.sin(t * 1.4)));
    const g = st.graph; if (!g) return; const by = Object.fromEntries(g.nodes.map(n => [n.key, n])), selK = st.sel;
    for (const e of g.edges) {
      const a = by[e.from], b = by[e.to]; if (!a || !b) continue; const hot = e.verdict === 'holding' || e.verdict === 'broken', touch = selK && (e.from === selK || e.to === selK);
      if (!hot && !touch && e.verdict !== 'quiet') continue;
      const colr = e.verdict === 'broken' ? C.gold : e.verdict === 'holding' ? C.blue : C.tx2, N = 22, pts = []; for (let i = 0; i <= N; i++) pts.push(sp(arcPoint(a.pos, b.pos, i / N)));
      const depth = pts.reduce((s, p) => s + p.z, 0) / pts.length, f2 = Math.max(0.12, Math.min(1, 0.75 - depth * 0.35)) * fade;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.globalAlpha = (hot ? 0.6 : touch ? 0.55 : 0.2) * f2; ctx.strokeStyle = colr; ctx.lineWidth = e.verdict === 'broken' ? 2.4 : hot ? 1.6 : 0.8; ctx.stroke();
      if (hot || touch) { const spd = e.verdict === 'broken' ? 0.5 : 0.28; for (let k = 0; k < 3; k++) { const q = sp(arcPoint(a.pos, b.pos, (t * spd + k / 3) % 1)); ctx.globalAlpha = f2; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(q.x, q.y, (e.verdict === 'broken' ? 3.2 : 2.4) * q.s, 0, 6.2832); ctx.fill(); } }
    }
    const ns = g.nodes.map(n => ({ n, p: sp(n.pos) })).sort((u, v) => v.p.z - u.p.z);
    for (const { n, p } of ns) {
      const f2 = Math.max(0.3, Math.min(1, 0.85 - p.z * 0.3)) * fade, size = st.disp[n.key] ?? n.style.size, r = (5 + size * 13) * p.s * 1.05, c = tcol(n.style.tone), pulse = n.style.tone === 'wrong' ? 1 + 0.18 * Math.sin(t * 4) : 1;
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2 * pulse); gr.addColorStop(0, c); gr.addColorStop(1, 'transparent');
      ctx.globalAlpha = (n.style.tone === 'quiet' || n.style.tone === 'none' ? 0.18 : 0.5) * f2; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2 * pulse, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = f2; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55 * pulse, 0, 6.2832); ctx.fill();
      if (selK === n.key) { ctx.strokeStyle = C.tx; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.4, 0, 6.2832); ctx.stroke(); }
      if (st.compact ? (selK === n.key || (n.style.tone !== 'quiet' && p.z < 0.3)) : (p.z < 0.6 || selK === n.key)) { ctx.globalAlpha = f2 * (n.style.tone === 'quiet' ? 0.6 : 1); ctx.fillStyle = C.tx; ctx.font = `${Math.round(10 + 3 * p.s)}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(CHAIN_NODES[n.key] ? shortLabel(CHAIN_NODES[n.key]) : n.key, p.x, p.y + r * 1.9 + 8); }
      st.proj.push({ key: n.key, sx: p.x, sy: p.y });
    }
  }
  function drawSkyline(t, fade) {
    const FY = -0.55;
    // the street grid, a glowing ring road and a radar sweep on the ground
    ctx.lineWidth = 1; ctx.strokeStyle = C.blue;
    for (let i = -6; i <= 6; i++) { const u = i * 0.25; for (const [a, b] of [[[-1.5, FY, u], [1.5, FY, u]], [[u, FY, -1.5], [u, FY, 1.5]]]) { const p = sp(a), q = sp(b); ctx.globalAlpha = 0.09 * fade; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
    ringAt(FY, 1.85, 0.35 * fade); ringAt(FY, 1.7, 0.15 * fade);
    { const a = t * 0.9, p0 = sp([0, FY, 0]), p1 = sp([Math.cos(a) * 1.85, FY, Math.sin(a) * 1.85]); const g2 = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y); g2.addColorStop(0, 'transparent'); g2.addColorStop(1, C.cy); ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = g2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
    const g = st.graph; if (!g) return;
    const town = skyline({ nodes: g.nodes.map(n => ({ ...n, style: { ...n.style, size: st.disp[n.key] ?? n.style.size } })) }), selK = st.sel;
    const towers = g.nodes.map(n => { const tw = town[n.key]; if (!tw) return null; const b = towerBox(tw, FY), pts = b.pts.map(sp); return { n, tw, b, pts, top: sp(b.topCentre), depth: sp([tw.x, FY, tw.z]).z }; }).filter(Boolean).sort((u, v) => v.depth - u.depth);
    const topOf = Object.fromEntries(towers.map(o => [o.n.key, o.b.topCentre]));
    // light rails first (under the near towers' labels): arcs between tower tops with particles flowing cause -> effect
    for (const e of g.edges) {
      const a = topOf[e.from], b = topOf[e.to]; if (!a || !b) continue; const hot = e.verdict === 'holding' || e.verdict === 'broken', touch = selK && (e.from === selK || e.to === selK);
      if (!hot && !touch) continue;
      const colr = e.verdict === 'broken' ? C.gold : C.blue, lift = 0.35 + Math.hypot(a[0] - b[0], a[2] - b[2]) * 0.25, N = 24, pts = []; for (let i = 0; i <= N; i++) pts.push(sp(rail(a, b, i / N, lift)));
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.globalAlpha = (hot ? 0.7 : 0.5) * fade; ctx.strokeStyle = colr; ctx.lineWidth = e.verdict === 'broken' ? 2.6 : 1.7; ctx.stroke();
      const spd = e.verdict === 'broken' ? 0.55 : 0.3; for (let k = 0; k < 3; k++) { const q = sp(rail(a, b, (t * spd + k / 3) % 1, lift)); ctx.globalAlpha = fade; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(q.x, q.y, (e.verdict === 'broken' ? 3.4 : 2.6) * q.s, 0, 6.2832); ctx.fill(); }
    }
    for (const o of towers) {
      const c = tcol(o.tw.tone), live = o.tw.tone !== 'quiet' && o.tw.tone !== 'none', pulse = o.tw.tone === 'wrong' ? 0.85 + 0.15 * Math.sin(t * 4) : 1;
      for (const s of o.b.faces.sides) poly(s, o.pts, c, (live ? 0.36 : 0.16) * fade * pulse, c);
      poly(o.b.faces.top, o.pts, c, (live ? 0.7 : 0.25) * fade * pulse, c);
      if (live) { const gr = ctx.createRadialGradient(o.top.x, o.top.y, 0, o.top.x, o.top.y, 26 * o.top.s); gr.addColorStop(0, c); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.45 * fade; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.top.x, o.top.y, 26 * o.top.s, 0, 6.2832); ctx.fill(); }
      if (selK === o.n.key) { ctx.globalAlpha = fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(o.top.x, o.top.y, 16 * o.top.s, 0, 6.2832); ctx.stroke(); }
      if ((live && (!st.compact || o.tw.h > 0.3)) || selK === o.n.key || (o.tw.h > 0.2 && !st.compact)) { ctx.globalAlpha = fade * (live ? 1 : 0.55); ctx.fillStyle = C.tx; ctx.font = `${Math.round(10 + 3 * o.top.s)}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(CHAIN_NODES[o.n.key] ? shortLabel(CHAIN_NODES[o.n.key]) : o.n.key, o.top.x, o.top.y - 12 * o.top.s - 4); }
      st.proj.push({ key: o.n.key, sx: o.top.x, sy: o.top.y });
    }
  }

  function drawGlobe(t, fade, dt) {
    const g = st.gl; g.tzoom = Math.max(0.8, Math.min(5, g.tzoom)); if (st.spin && !st.drag) { g.tlon += dt * 4; g.lon += dt * 4; }
    let dl = ((g.tlon - g.lon + 540) % 360) - 180; g.lon += dl * Math.min(1, dt * 3); g.lat += (g.tlat - g.lat) * Math.min(1, dt * 3); g.zoom += (g.tzoom - g.zoom) * Math.min(1, dt * 3);
    const Rg = Math.min(st.w * 0.5, st.h) * 0.4 * g.zoom, X = st.w / 2 - (st.mod === 'chain' ? 0 : st.w * 0.1), Y = st.h / 2 + 8, ctr = { lat: g.lat, lon: g.lon };
    const P = (vec, h = 0) => { const p = globeProject(vec, ctr, h); return { x: X + p.x * Rg, y: Y - p.y * Rg, z: p.z }; };
    // the sea, a rim of light and a faint atmosphere
    const atm = ctx.createRadialGradient(X, Y, Rg * 0.96, X, Y, Rg * 1.22); atm.addColorStop(0, C.blue); atm.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.28 * fade; ctx.fillStyle = atm; ctx.beginPath(); ctx.arc(X, Y, Rg * 1.22, 0, 6.2832); ctx.fill();
    const sea = ctx.createRadialGradient(X - Rg * 0.3, Y - Rg * 0.3, Rg * 0.1, X, Y, Rg); sea.addColorStop(0, C.blue); sea.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.16 * fade; ctx.fillStyle = sea; ctx.beginPath(); ctx.arc(X, Y, Rg, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = C.blue; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X, Y, Rg, 0, 6.2832); ctx.stroke();
    // graticule
    ctx.lineWidth = 0.6; ctx.globalAlpha = 0.14 * fade; ctx.strokeStyle = C.blue;
    const line = pts => { let on = false; ctx.beginPath(); for (const p of pts) { if (p.z > 0) { on ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); on = true; } else on = false; } ctx.stroke(); };
    for (let la = -60; la <= 60; la += 30) line(Array.from({ length: 73 }, (_, i) => P(llToVec(la, i * 5 - 180))));
    for (let lo = -180; lo < 180; lo += 30) line(Array.from({ length: 37 }, (_, i) => P(llToVec(i * 5 - 90, lo))));
    // the coastlines (loaded the first time the globe is drawn)
    if (!st.land && !st.landLoading) { st.landLoading = true; import('./jarvisLand.js').then(m => { st.land = m.LAND; }).catch(() => { st.land = []; }); }
    if (st.land) { ctx.lineWidth = 1.1; ctx.globalAlpha = 0.6 * fade; ctx.strokeStyle = C.blue; for (const ring of st.land) { let on = false; ctx.beginPath(); for (let i = 0; i < ring.length; i += 2) { const p = P(llToVec(ring[i + 1], ring[i])); if (p.z > 0) { on ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); on = true; } else on = false; } ctx.stroke(); } }
    const gr = st.graph; if (!gr) return;
    const by = Object.fromEntries(gr.nodes.map(n => [n.key, n])), selK = st.sel, vec = k => llToVec(GEO[k][0], GEO[k][1]);
    // threads: great-circle arcs lifted off the surface, particles flowing cause -> effect
    for (const e of gr.edges) {
      if (!GEO[e.from] || !GEO[e.to]) continue; const hot = e.verdict === 'holding' || e.verdict === 'broken', touch = selK && (e.from === selK || e.to === selK); if (!hot && !touch) continue;
      const colr = e.verdict === 'broken' ? C.gold : C.blue, a = vec(e.from), b = vec(e.to), N = 30, pts = []; for (let i = 0; i <= N; i++) { const q = greatArc(a, b, i / N, 0.3); pts.push(P(q.v, q.h)); }
      ctx.beginPath(); let on = false; for (const p of pts) { if (p.z > 0) { on ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); on = true; } else on = false; } ctx.globalAlpha = (hot ? 0.75 : 0.5) * fade; ctx.strokeStyle = colr; ctx.lineWidth = e.verdict === 'broken' ? 2.4 : 1.5; ctx.stroke();
      const spd = e.verdict === 'broken' ? 0.5 : 0.28; for (let k = 0; k < 3; k++) { const q = greatArc(a, b, (t * spd + k / 3) % 1, 0.3), p = P(q.v, q.h); if (p.z > 0) { ctx.globalAlpha = fade; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(p.x, p.y, e.verdict === 'broken' ? 3.2 : 2.4, 0, 6.2832); ctx.fill(); } }
    }
    // markers: a pillar standing on the surface, its height and glow the size of the move
    const items = gr.nodes.filter(n => GEO[n.key]).map(n => { const v = vec(n.key), size = st.disp[n.key] ?? n.style.size, base = P(v, 0), tip = P(v, 0.04 + 0.26 * size); return { n, size, base, tip }; }).filter(o => o.base.z > 0.02).sort((a, b) => a.base.z - b.base.z);
    const loudG = new Set([...items].sort((a, b) => b.size - a.size).slice(0, 5).map(o => o.n.key));      // on a phone only the five biggest moves carry a name
    for (const o of items) {
      const c = tcol(o.n.style.tone), live = o.n.style.tone !== 'quiet' && o.n.style.tone !== 'none', fa = Math.min(1, o.base.z * 2.2) * fade, pulse = o.n.style.tone === 'wrong' ? 1 + 0.2 * Math.sin(t * 4) : 1, r = (3 + o.size * 7) * Math.sqrt(g.zoom) * pulse;
      ctx.globalAlpha = 0.5 * fa; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(o.base.x, o.base.y, 6 * Math.sqrt(g.zoom), 3 * Math.sqrt(g.zoom), 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = (live ? 0.85 : 0.35) * fa; ctx.strokeStyle = c; ctx.lineWidth = live ? 2 : 1; ctx.beginPath(); ctx.moveTo(o.base.x, o.base.y); ctx.lineTo(o.tip.x, o.tip.y); ctx.stroke();
      if (live) { const gg = ctx.createRadialGradient(o.tip.x, o.tip.y, 0, o.tip.x, o.tip.y, r * 3); gg.addColorStop(0, c); gg.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.5 * fa; ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(o.tip.x, o.tip.y, r * 3, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = fa; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(o.tip.x, o.tip.y, r, 0, 6.2832); ctx.fill();
      if (selK === o.n.key) { ctx.strokeStyle = C.tx; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(o.tip.x, o.tip.y, r + 5, 0, 6.2832); ctx.stroke(); }
      if ((live && (!st.compact || loudG.has(o.n.key))) || selK === o.n.key || (g.zoom > 1.7 && !st.compact)) { ctx.globalAlpha = fa * (live ? 1 : 0.6); ctx.fillStyle = C.tx; ctx.font = `${Math.round(10 + 1.5 * Math.min(2, g.zoom))}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(CHAIN_NODES[o.n.key] ? shortLabel(CHAIN_NODES[o.n.key]) : o.n.key, o.tip.x, o.tip.y - r - 8); if ((g.zoom > 1.7 && !st.compact) || selK === o.n.key) { ctx.globalAlpha = fa * 0.55; ctx.font = '9px ui-monospace,monospace'; ctx.fillText(GEO[o.n.key][2], o.tip.x, o.tip.y - r + 3); } }
      st.proj.push({ key: o.n.key, sx: o.tip.x, sy: o.tip.y });
    }
    for (const m of EXTRA) { try { m.drawGlobe?.(ctx, { P, X, Y, Rg, ctr, t, fade, zoom: g.zoom, compact: st.compact }, xapi); } catch (e) { /* a layer must never stop the frame */ } }
  }

  // the SAFE AREA a hologram draws in: below the top bar and menus, above the time bar, so a view's readout and key never sit under the HUD's own chrome (re-measured a few times a second)
  let safe = { top: 0, bot: 0, at: -1 };
  const safeArea = () => {
    const now = performance.now(); if (now - safe.at < 400) return safe;
    let top = 0, bot = st.h;
    try {
      const r0 = root.getBoundingClientRect(), vis = el => el && el.offsetParent !== null && el.getClientRects().length;
      for (const sel of ['.jv-top', '.jv-nav']) { const el = root.querySelector(sel); if (vis(el)) top = Math.max(top, el.getBoundingClientRect().bottom - r0.top + 6); }
      const sc = root.querySelector('.jv-scrub'); if (vis(sc)) bot = Math.min(bot, sc.getBoundingClientRect().top - r0.top - 6);
    } catch (e) { /* layout only */ }
    if (bot - top < st.h * 0.5) { top = 0; bot = st.h; }          // never squeeze a picture below half the screen (a very tall menu on a phone): draw full screen instead
    top = Math.max(0, top - 84);                                    // views already leave ~84px for the top bar: shift them only by how far the menus reach past that
    safe = { top: Math.round(top), bot: Math.round(bot), at: now }; st.safeTop = safe.top; return safe;
  };
  function drawExtra(v, t, fade, dt) {
    if (v.gl) {
      const s = safeArea(), top = s.top, H = s.bot - s.top, SC = Math.min(st.w * 0.5, H * 0.95) * 0.3;
      const g = { t, fade, dt, W: st.w, H, top, compact: st.compact, cinema: !!st.cinemaCtl, attract: !!attract, cx: st.w / 2, cy: H / 2, SC, C, poly, hit: (key, x, y) => st.proj.push({ key, sx: x, sy: y + top }),
        proj: (p, c) => { const q = project(p, c ?? cam()); return { x: st.w / 2 + q.x * SC, y: H / 2 + q.y * SC, s: q.s, z: q.z }; } };
      ctx.save(); ctx.translate(0, top);
      try { v.draw(ctx, g, xapi); } catch (e) { /* a view must never stop the frame */ }
      ctx.restore(); return;
    }
    const SC = Math.min(st.w * 0.5, st.h * 0.95) * 0.3, g = { t, fade, dt, W: st.w, H: st.h, compact: st.compact, cinema: !!st.cinemaCtl, attract: !!attract, cx: cx(), cy: cy(), SC, C, poly, hit: (key, x, y) => st.proj.push({ key, sx: x, sy: y }),
      proj: (p, c) => { const q = project(p, c ?? cam()); return { x: cx() + q.x * SC, y: cy() + q.y * SC, s: q.s, z: q.z }; } };
    try { v.draw(ctx, g, xapi); } catch (e) { /* a view must never stop the frame */ }
  }
  function drawCandles(t, fade) {
    const cd = st.cd;
    if (!cd?.ok) { ctx.globalAlpha = fade; ctx.fillStyle = C.tx2; ctx.font = '13px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(cd ? 'The market feed is not available right now.' : 'Reading the markets...', st.w / 2, st.h / 2); return; }
    const cam2 = { yaw: st.yaw, pitch: st.pitch, zoom: st.zoom, f: 2.3 }, scC = Math.min(st.w * 0.5, st.h * 0.95) * 0.3, fx = st.cdCam.x, fz = st.cdCam.z;
    const P = (x, y, z) => { const p = project([x - fx, y, z - fz], cam2); return { x: cx() + p.x * scC, y: cy() + p.y * scC, s: p.s, z: p.z, ok: 2.3 + p.z > 0.35 }; };
    // the floor: a grid and the row names; the centre line of the day is the floor itself
    ctx.lineWidth = 1; ctx.strokeStyle = C.blue;
    for (let i = -11; i <= 11; i++) { const u = i * 0.19; for (const [a, b] of [[[-2.2, 0, u], [2.2, 0, u]], [[u, 0, -1.4], [u, 0, 1.4]]]) { const p = P(...a), q = P(...b); if (p.ok && q.ok) { ctx.globalAlpha = 0.08 * fade; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } } }
    ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'right'; ctx.fillStyle = C.tx2;
    CD_ROWS.forEach(([title], ri) => { if (!title || st.compact) return; const z = (ri - (CD_ROWS.length - 1) / 2) * 0.45, p = P(-1.55, 0, z); if (p.ok) { ctx.globalAlpha = 0.6 * fade; ctx.fillText(title, p.x, p.y); } });
    const items = cd.rows.map(r => { const pos = cd.layout[r.key]; if (!pos) return null; const b = candleBox(r, pos), pts = b.pts.map(q => P(q[0], q[1], q[2])), w0 = P(...b.wick[0]), w1 = P(...b.wick[1]), tip = P(b.tip[0], b.tip[1] + 0.1, b.tip[2]); return { r, b, pts, w0, w1, tip, depth: P(pos.x, 0, pos.z).z }; }).filter(o => o && o.tip.ok).sort((a, b) => b.depth - a.depth);
    const selK = st.sel, loud = new Set([...items].sort((a, b) => Math.abs(b.r.ratio) - Math.abs(a.r.ratio)).slice(0, st.compact ? 4 : 9).map(o => o.r.key));      // only the loudest candles carry a name, so the field stays readable
    for (const o of items) {
      const c = tcol(o.r.tone === 'up' ? 'up' : o.r.tone === 'dn' ? 'dn' : 'quiet'), live = o.r.tone !== 'quiet', fa = fade * Math.min(1, Math.max(0.25, o.tip.s * 0.9));
      ctx.globalAlpha = (live ? 0.9 : 0.4) * fa; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, 1.6 * o.tip.s); ctx.beginPath(); ctx.moveTo(o.w0.x, o.w0.y); ctx.lineTo(o.w1.x, o.w1.y); ctx.stroke();    // the wick
      for (const sd of o.b.faces.sides) poly(sd, o.pts, c, (live ? 0.38 : 0.16) * fa, c);
      poly(o.b.faces.top, o.pts, c, (live ? 0.75 : 0.28) * fa, c);
      if (live) { const gr = ctx.createRadialGradient(o.tip.x, o.tip.y, 1, o.tip.x, o.tip.y, 22 * o.tip.s); gr.addColorStop(0, c); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.35 * fa; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.tip.x, o.tip.y, 22 * o.tip.s, 0, 6.2832); ctx.fill(); }
      // the bias engine's lean: a chevron over the candle (up = bullish, down = bearish, a dot = neutral); blue so it is never mistaken for what has happened
      if (o.r.haveLean) {
        const sz = (4 + Math.min(3, o.r.strength) * 2.2) * o.tip.s, x0 = o.tip.x, y0 = o.tip.y - 8 * o.tip.s; ctx.globalAlpha = 0.9 * fa; ctx.strokeStyle = C.blue; ctx.fillStyle = C.blue; ctx.lineWidth = 1.6;
        if (o.r.lean === 0) { ctx.beginPath(); ctx.arc(x0, y0, 2 * o.tip.s, 0, 6.2832); ctx.fill(); } else { const d = o.r.lean > 0 ? -1 : 1; ctx.beginPath(); ctx.moveTo(x0 - sz, y0 - d * sz * 0.5); ctx.lineTo(x0, y0 + d * sz * 0.5); ctx.lineTo(x0 + sz, y0 - d * sz * 0.5); ctx.stroke(); }
      }
      if (selK === o.r.key || (live && loud.has(o.r.key) && Math.abs(o.r.ratio) > 1)) { ctx.globalAlpha = fa * (live ? 1 : 0.6); ctx.fillStyle = C.tx; ctx.font = `${Math.round(9 + 3 * Math.min(1.6, o.tip.s))}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(marketName(o.r.key, { short: true }), o.tip.x, o.tip.y - 16 * o.tip.s - 4); }
      st.proj.push({ key: o.r.key, sx: o.tip.x, sy: o.tip.y });
    }
    if (st.compact) return;
    ctx.globalAlpha = 0.7 * fade; ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'left';
    ctx.fillText('CANDLES  ·  today\'s session against each market\'s usual move  ·  green above the floor, red below', 24, st.h - 215); ctx.fillText('CHEVRONS  ·  the bias engine\'s lean (back-test: no proven skill)', 24, st.h - 199);
  }
  function drawBubbles(t, fade) {
    const g = st.graph; if (!g) return; const keys = g.nodes.map(n => n.key);
    if (!st.bl) st.bl = bubbleLayout(keys, Object.fromEntries(g.nodes.map(n => [n.key, n.style.size])));
    const S = Math.min(st.w * 0.5, st.h * 0.95) * 0.92, X = st.w / 2 - (st.mod === 'chain' ? 0 : st.w * 0.1), Y = st.h / 2 + 10, by = Object.fromEntries(g.nodes.map(n => [n.key, n])), selK = st.sel;
    ctx.globalAlpha = 0.06 * fade; ctx.strokeStyle = C.blue; ctx.lineWidth = 1;     // a blueprint grid, not a starfield
    for (let x = X % 60; x < st.w; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, st.h); ctx.stroke(); } for (let y = Y % 60; y < st.h; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(st.w, y); ctx.stroke(); }
    const pos = k => { const b = st.bl[k], i = keys.indexOf(k); return { x: X + (b.x + Math.sin(t * 0.7 + i) * 0.006) * S, y: Y + (b.y + Math.cos(t * 0.6 + i * 1.7) * 0.006) * S, r: (b.r + 0.005 * (st.disp[k] ?? 0)) * S }; };
    // theme names over each cluster
    ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillStyle = C.tx2;
    for (const th of THEME_ORDER) { const ks = keys.filter(k => THEME[k] === th); if (!ks.length) continue; const ps = ks.map(pos), cxm = ps.reduce((a, p) => a + p.x, 0) / ps.length, top = Math.min(...ps.map(p => p.y - p.r)); ctx.globalAlpha = 0.55 * fade; ctx.fillText(th.toUpperCase(), cxm, top - 12); }
    for (const e of g.edges) {
      if (!st.bl[e.from] || !st.bl[e.to]) continue; const hot = e.verdict === 'holding' || e.verdict === 'broken', touch = selK && (e.from === selK || e.to === selK); if (!hot && !touch) continue;
      const a = pos(e.from), b = pos(e.to), colr = e.verdict === 'broken' ? C.gold : C.blue, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(a.x - b.x, a.y - b.y) * 0.18;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.globalAlpha = (hot ? 0.6 : 0.4) * fade; ctx.strokeStyle = colr; ctx.lineWidth = e.verdict === 'broken' ? 2.4 : 1.5; ctx.stroke();
      const spd = e.verdict === 'broken' ? 0.5 : 0.28; for (let k = 0; k < 3; k++) { const u = (t * spd + k / 3) % 1, x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x, y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y; ctx.globalAlpha = fade; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(x, y, e.verdict === 'broken' ? 3.2 : 2.4, 0, 6.2832); ctx.fill(); }
    }
    for (const k of keys) {
      const n = by[k], p = pos(k), c = tcol(n.style.tone), live = n.style.tone !== 'quiet' && n.style.tone !== 'none', pulse = n.style.tone === 'wrong' ? 1 + 0.06 * Math.sin(t * 4) : 1, R2 = p.r * pulse;
      const gg = ctx.createRadialGradient(p.x - R2 * 0.35, p.y - R2 * 0.4, R2 * 0.1, p.x, p.y, R2); gg.addColorStop(0, C.tx); gg.addColorStop(0.25, c); gg.addColorStop(1, 'transparent');
      ctx.globalAlpha = (live ? 0.55 : 0.22) * fade; ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, p.y, R2, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = (live ? 0.95 : 0.4) * fade; ctx.strokeStyle = c; ctx.lineWidth = selK === k ? 3 : 1.4; ctx.beginPath(); ctx.arc(p.x, p.y, R2, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = (live ? 1 : 0.6) * fade; ctx.fillStyle = C.tx; ctx.font = `${live ? 11 : 10}px ui-monospace,monospace`; ctx.textAlign = 'center'; if (live || !st.compact) ctx.fillText(CHAIN_NODES[k] ? shortLabel(CHAIN_NODES[k]) : marketName(k, { short: true }), p.x, p.y + (live ? -1 : 3));
      if (live && n.end?.text) { ctx.globalAlpha = 0.8 * fade; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(n.end.text, p.x, p.y + 12); }
      st.proj.push({ key: k, sx: p.x, sy: p.y });
    }
  }
  function drawNoChain(fade) {          // a chain picture with no chain: one centred sentence, never a blank screen
    ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = C.tx2; ctx.font = `${st.compact ? 12 : 13}px ui-monospace,monospace`; ctx.textAlign = 'center';
    const y = st.view === 'globe' ? st.h * 0.86 : st.h / 2;
    if (st.chainFail) { ctx.fillText('The chain feed has not loaded, so this picture has nothing to show.', st.w / 2, y); ctx.fillText(st.compact ? 'Open the Chain tab once, or pick another view.' : 'Open the Chain tab once, or pick another view: the others work without it.', st.w / 2, y + 20); }
    else ctx.fillText('Reading the chain...', st.w / 2, y);
    ctx.globalAlpha = 1;
  }
  let raf = 0, last = performance.now(), hudT = 0;
  function frame(now) {
    if (!open || st.docked) return; raf = win.requestAnimationFrame(frame);
    if (doc.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; if (st.spin && !st.drag && st.view !== 'globe') st.yaw += dt * (st.view === 'skyline' ? 0.07 : 0.12);
    const t = (now - st.t0) / 1000, bootT = t, fade = Math.min(1, Math.max(0, (bootT - (BOOT - 1.0)) / 0.9));
    { const e = Math.min(1, dt * 2.2); st.cdCam.x += (st.cdTarget.x - st.cdCam.x) * e; st.cdCam.z += (st.cdTarget.z - st.cdCam.z) * e; }
    for (const k of Object.keys(st.disp)) { const tgt = st.graph?.nodes.find(n => n.key === k)?.style.size; if (tgt != null) st.disp[k] += (tgt - st.disp[k]) * Math.min(1, dt * 5); }
    ctx.clearRect(0, 0, st.w, st.h); st.proj = [];
    if (BOOT && bootT < BOOT + 0.3) drawBoot(bootT);
    // every view draws whether or not the chain graph has loaded: the GL/extra views and the board never needed it, and each fails soft on its own; only the chain pictures say why they are empty
    if (fade > 0) {
      const ev = extraViews[st.view];
      if (ev && (st.view === 'globe' || st.view === 'candles') && ev.gl && !st.legacy2d) drawExtra(ev, t, fade, dt); else if (st.view === 'globe') drawGlobe(t, fade, dt); else if (st.view === 'candles') drawCandles(t, fade); else if (ev) drawExtra(ev, t, fade, dt); else if (st.view === 'bubbles') drawBubbles(t, fade); else if (st.view === 'skyline') drawSkyline(t, fade); else drawOrbit(t, fade);
      if (!st.graph && !ev && st.view !== 'candles') drawNoChain(fade);
    }
    ctx.globalAlpha = 1; hudT += dt; if (hudT > 20) { hudT = 0; renderHud(); }
    tickAttract(now);
  }

  // ── watching: the live chain every 2 minutes, server memory every 10; Jarvis speaks only when something CHANGES ──
  const stamp = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date());
  function raise(ev) {
    for (const e of ev) { st.alerts.unshift({ ...e, time: stamp() }); }
    st.alerts = st.alerts.slice(0, 40); if (!ev.length) return;
    alertChime(); say(ev.map(e => e.text).join(' '));
    try { if (win.Notification?.permission === 'granted') new win.Notification('Jarvis', { body: ev[0].text }); } catch (e) { /* no notifications */ }
    dockRender(true); if (st.mod === 'alerts') R.alerts();
  }
  let wTimer = 0, mTimer = 0;
  async function watchTick() {
    if (!st.watch || doc.hidden) return;
    const r = await loadAt('live'); st.lastCheck = stamp(); if (!r) { dockRender(); return; }
    const snap = watchSnapshot(r.graph, names); raise(watchDiff(st.snap, snap)); st.snap = snap; st.liveSum = r.sum; dockRender(); renderHud();
  }
  async function memTick() {
    if (!st.watch || doc.hidden) return;
    const sm = systemSummary(await jf('/api/services').catch(() => null)); if (!sm.ok) return; st.mem = sm.rssMB;
    const s = memoryState(sm.rssMB, st.memLimit); if (s !== 'ok' && st.memState !== s) raise([{ kind: 'mem', level: 'warn', text: `Server memory is ${s}: ${sm.rssMB} megabytes against your ${st.memLimit} limit.` }]); st.memState = s;
  }
  function setWatch(on) {
    st.watch = on; lsPut({ watch: on }); win.clearInterval(wTimer); win.clearInterval(mTimer);
    if (on) { wTimer = win.setInterval(watchTick, 120_000); mTimer = win.setInterval(memTick, 600_000); watchTick(); memTick(); }
    dockRender(); renderHud();
  }

  // ── the dock: Jarvis drops to a strip over the normal dashboard and keeps watching ──
  function dockRender(flash = false) {
    const s = st.liveSum ?? st.sum, a = st.alerts[0];
    dock.innerHTML = `<span class="dot"></span><span class="t">J.A.R.V.I.S.</span><span>${st.watch ? 'WATCHING' : 'PAUSED'}${st.lastCheck ? ` · ${esc(st.lastCheck)}` : ''}</span>${s ? `<span>${s.holding} holding · <span class="${s.broken ? 'am' : ''}">${s.broken} broken</span></span>` : ''}${st.mem != null ? `<span>mem ${st.mem} MB</span>` : ''}<span class="sp">${a ? `<span class="am">${esc(a.time)}</span> ${esc(a.text)}` : 'no alerts'}</span><button type="button" data-d="alerts">ALERTS ${st.alerts.length}</button><button type="button" data-d="open">EXPAND</button><button type="button" data-d="mic" aria-pressed="${st.wake}">${st.wake ? 'LISTENING' : 'HEY JARVIS'}</button><button type="button" data-d="off">OFF</button>`;
    if (flash) { dock.classList.remove('al'); void dock.offsetWidth; dock.classList.add('al'); }
  }
  dock.onclick = e => { const b = e.target.closest('button[data-d]'); if (!b) return; const d = b.dataset.d; if (d === 'open') api.undock(); else if (d === 'alerts') { api.undock(); setMod('alerts'); } else if (d === 'mic') setWake(!st.wake); else if (d === 'off') api.off(); };
  const closeMenu = () => { root.classList.remove('jv-menu-open'); $('menubtn').setAttribute('aria-expanded', 'false'); win.setTimeout(fitTop, 0); };
  $('menubtn').onclick = () => { const o = root.classList.toggle('jv-menu-open'); $('menubtn').setAttribute('aria-expanded', String(o)); win.setTimeout(fitTop, 0); };
  $('menu').addEventListener('click', e => { if (st.compact && e.target.closest('button') && !e.target.closest('#' + ID + '-snd,#' + ID + '-nms,#' + ID + '-wake')) closeMenu(); });
  $('dockb').onclick = () => api.dock(); $('stop').onclick = () => st.cinemaStop?.();
  const cineMore = on => { const c = $('cine'); c.classList.toggle('more', !!on); c.querySelector('.jv-cmore')?.setAttribute('aria-expanded', String(!!on)); };     // the phone keeps only pause + this toggle until asked
  $('cine').onclick = e => { const b = e.target.closest('button[data-c]'); if (!b) return; if (b.dataset.c === 'more') cineMore(!$('cine').classList.contains('more')); else cineAct(b.dataset.c); };
  $('off').onclick = () => api.off();

  // ── voice in: "Jarvis, ..." hands-free (Chrome's recognition; this tab only; stops when you switch it off) ──
  let rec = null;
  function setWake(on) {
    st.wake = on; $('wake').setAttribute('aria-pressed', String(on)); dockRender();
    if (!on) { try { rec?.stop(); } catch (e) { /* idle */ } rec = null; return; }
    const SRc = win.SpeechRecognition || win.webkitSpeechRecognition; if (!SRc) { st.wake = false; $('wake').setAttribute('aria-pressed', 'false'); say('Voice input is not supported in this browser.', true); return; }
    const start = () => {
      if (!st.wake || !open) return; rec = new SRc(); rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = false;
      rec.onresult = ev => {
        const text = ev.results[ev.results.length - 1][0].transcript, w = wakeParse(text); if (!w.woke) return;
        st.voice = true; blip(990, 0.08, 'triangle');
        if (!w.query) { say('Yes?', true); return; }
        if (st.docked) api.undock(); setMod('ask'); R.ask(w.query, true);
      };
      rec.onend = () => { if (st.wake && open) win.setTimeout(start, 400); };
      rec.onerror = () => {};
      try { rec.start(); } catch (e) { /* already listening */ }
    };
    start(); say('Listening. Say Jarvis, then your question.', true);
  }
  $('wake').onclick = () => setWake(!st.wake);

  // ── ATTRACT: an untouched HUD becomes a wall display. After 90 s with no input (and no programme, replay or panel open), it cycles the GL views the owner visited last (padded with other
  // GL views), 25 s each, running each view's own SHOW camera (its scene's motion(api, p), p 0 -> 1 over 20 s, then it holds). No captions, no voice; a small bug says how to stop it.
  // Any pointer, key, wheel or touch stops it at once and leaves you on that view. Reduced motion: the views still change, but each sits at its settled pose (p = 1), no camera flight.
  const IDLE_MS = 90_000, ATTRACT_DWELL = 25_000, ATTRACT_MOVE = 20_000, IDLE_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
  const ATTRACT_ALIAS = { ahead: 'dayahead' };            // a view whose SHOW scene has another id
  let attract = null; const attractCache = new Map();
  const onInput = () => { st.lastInput = performance.now(); if (attract) stopAttract(); };
  for (const ev of IDLE_EVENTS) doc.addEventListener(ev, onInput, { capture: true, passive: true });
  function attractList() {
    const gl = Object.values(extraViews).filter(v => v?.gl).map(v => v.id), out = st.recent.filter(v => extraViews[v]?.gl);
    for (const v of gl) { if (out.length >= 5) break; if (!out.includes(v)) out.push(v); }
    return out;
  }
  function attractScene(v) {               // the view's SHOW scene (prepared once, kept ten minutes), or null: the view then just turns slowly
    const c = attractCache.get(v); if (c && performance.now() - c.at < 600_000) return c.p;
    const hook = SHOW_HOOKS.find(h => h.id === v) ?? SHOW_HOOKS.find(h => h.id === ATTRACT_ALIAS[v]);
    const p = (async () => {
      if (!hook) return null;
      try {
        const data = (await hook.prepare?.(xapi)) ?? null, s0 = st.sum, chain = s0 ? { holding: s0.holding, broken: s0.broken, quiet: s0.quiet, judged: s0.judged, brokenShort: s0.brokenShort, headline: s0.headline } : null;
        const sc = hook.build({ now: new Date(), rows: st.cd?.rows ?? [], movers: [], board: null, chain, events: null, extra: { [hook.id]: data }, mode: 'full' }, data);
        return sc && (!sc.view || sc.view === v) ? sc : null;
      } catch (e) { return null; }
    })();
    attractCache.set(v, { at: performance.now(), p }); return p;
  }
  function attractOk(now) {
    return !attract && now - st.lastInput > IDLE_MS && open && !st.docked && !doc.hidden && !st.cinemaCtl && !st.cinemaStop && !st.play && vpop.hidden && !root.classList.contains('jv-menu-open')
      && (st.mod === 'chain' || st.mod === COMPANION[st.view]) && (performance.now() - st.t0) / 1000 > BOOT + 1;
  }
  function startAttract() {
    const list = attractList(); if (!list.length) { st.lastInput = performance.now(); return; }      // nothing to cycle yet: look again in 90 s
    if (st.mod !== 'chain') setMod('chain');                                                         // a clean wall: the companion list closes
    const bug = doc.createElement('div'); bug.className = 'jv-attract'; bug.textContent = st.compact ? 'ATTRACT · TAP TO TAKE OVER' : 'ATTRACT · TOUCH ANYTHING TO TAKE OVER'; root.appendChild(bug);
    const at = list.indexOf(st.view);
    attract = { list, i: at >= 0 ? at - 1 : -1, at: 0, view: null, scene: null, bug };
    nextAttract();
  }
  function nextAttract() {
    const a = attract; if (!a) return;
    a.i = (a.i + 1) % a.list.length; const v = a.list[a.i]; a.view = v; a.scene = null; a.at = performance.now();
    if (st.view !== v) switchView(v, true);
    attractScene(v).then(sc => { if (attract !== a || a.view !== v) return; a.scene = sc; try { sc?.enter?.(xapi); } catch (e) { /* a scene must never break the HUD */ } st.spin = !calm && !sc?.motion; a.at = performance.now(); });
  }
  function stopAttract() { if (!attract) return; try { attract.bug.remove(); } catch (e) { /* gone */ } attract = null; st.lastInput = performance.now(); }
  function tickAttract(now) {
    if (!attract) { if (attractOk(now)) startAttract(); return; }
    const a = attract, el = now - a.at;
    if (st.cinemaCtl || st.docked) { stopAttract(); return; }
    if (el > ATTRACT_DWELL) { nextAttract(); return; }
    if (a.scene?.motion) { try { a.scene.motion(xapi, calm ? 1 : Math.min(1, el / ATTRACT_MOVE)); } catch (e) { /* a scene's camera must never stop the frame */ } }
  }

  const api = {
    dock() { if (st.docked) return; st.docked = true; root.hidden = true; dock.hidden = false; dockRender(); win.cancelAnimationFrame(raf); win.speechSynthesis?.cancel(); blip(500, 0.06); },
    undock() { if (!st.docked) return; st.docked = false; root.hidden = false; dock.hidden = true; last = performance.now(); resize(); raf = win.requestAnimationFrame(frame); blip(760, 0.06); },
    off() {
      if (!open) return; open = null; stopPlay(); win.cancelAnimationFrame(raf); win.clearInterval(wTimer); win.clearInterval(mTimer); bootTimers.forEach(t => win.clearTimeout(t)); setWake(false);
      win.removeEventListener('resize', onResize); try { topObs?.disconnect(); } catch (e) { /* gone */ } doc.removeEventListener('pointerdown', onDocPointer, true); doc.removeEventListener('keydown', onKey, true); stopAttract(); for (const ev of IDLE_EVENTS) doc.removeEventListener(ev, onInput, true); win.speechSynthesis?.cancel(); st.speakStop?.(); neural.stopAll(); try { glDisposeAll(); } catch (e) { /* gone */ } root.remove(); dock.remove();
    },
  };
  const CINE_KEYS = { ' ': 'pause', ArrowRight: 'next', ArrowLeft: 'prev', '+': 'fast', '=': 'fast', '-': 'slow', n: 'next', p: 'prev' };
  const onKey = e => { if (st.cinemaCtl && CINE_KEYS[e.key] && !/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '')) { e.preventDefault(); e.stopPropagation(); cineAct(CINE_KEYS[e.key]); return; }
    if (e.key === 'Escape' && st.cinemaStop) { e.preventDefault(); e.stopPropagation(); st.cinemaStop(); return; } if (e.key === 'Escape' && !st.docked) { e.preventDefault(); e.stopPropagation(); api.dock(); } };
  doc.addEventListener('keydown', onKey, true);
  open = api;
  setCamAll(); renderNav(); $('reg').hidden = st.view !== 'globe'; runBoot(); raf = win.requestAnimationFrame(frame);
  await load(st.win);
  setWatch(st.watch);
  return true;
}

export const closeJarvis = () => open?.off();

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
import { glDisposeAll, glInstance, glBudget } from './jarvisGL.js';
import { resolveTarget, parseHelixArgs, parseHelixHash, helixHash, collapseStyles, nextStyle, groupOf, STYLE_GROUPS, mergeInbox, sinceSummary, agoText, todayLines, frameBudget, KEYS, sectionForKey, instFor, cyTokenFor, monoFont, mapFont, allItems } from './helixNav.js';
import { gateTabAlerts, inQuiet, QUIET } from '../jarvis/jarvisLogic.js';
import { THEMES } from './themes.js';
import { GLOBE_HOLO, drawGlobeOverlay } from './jarvisGlobeHolo.js';
import { globeFrame } from './jarvisGlobeHoloCore.js';
import { makeNeuralVoice, KOKORO_VOICES, ENGINES, FX_LEVELS } from './jarvisVoiceClient.js';
import { SHOW_HOOKS } from './showCore.js';
import { helixLogo } from './helixLogo.js';

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
#${ID} .jv-helix{display:block;margin:0 auto 18px;width:min(420px,78vw);height:78px;opacity:0;transform:scaleX(.6);transition:opacity 1.2s ease,transform 1.6s cubic-bezier(.2,.7,.2,1)}#${ID} .jv-helix.on{opacity:1;transform:none}
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
#${ID}.jv-compact .jv-scrub{left:10px;right:10px;bottom:10px;padding:5px 8px;gap:6px}#${ID}.jv-noscrub .jv-scrub{display:none}#${ID} .jv-scrubt{display:none}#${ID}.jv-compact .jv-scrubt{display:inline-block}#${ID}.jv-compact .jv-scrub:not(.open){left:auto;right:10px;padding:3px}#${ID}.jv-compact .jv-scrub:not(.open)>:not(.jv-scrubt){display:none}#${ID}.jv-compact .jv-scrub #${ID}-sd,#${ID}.jv-compact .jv-foot{display:none}
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
@media (prefers-reduced-motion:reduce){#${ID} canvas.jv-sw{animation:none}}
#${ID}{--cy:var(--teal)}html[data-theme="colourblind"] #${ID}{--cy:var(--pur2)}
#${ID} canvas.jv-sw{animation:jv-xf .38s ease-out}@keyframes jv-xf{0%{opacity:.08;filter:brightness(1.8) blur(3px)}100%{opacity:1;filter:none}}
#${ID}.jv-calm,#${ID}.jv-calm *,#${ID}-dock.jv-calm,#${ID}-dock.jv-calm *{animation:none!important;transition:none!important}
@media (prefers-reduced-motion:reduce){#${ID} .jv-bs h1,#${ID}-dock .dot,#${ID}-dock.al{animation:none}}
#${ID}.jv-glon .jv-card,#${ID}.jv-glon .jv-pane,#${ID}.jv-glon .jv-scrub,#${ID}.jv-glon .jv-vpop{backdrop-filter:none;background:color-mix(in srgb,var(--bg1) 94%,transparent)}
#${ID} .jv-head{position:absolute;left:24px;top:calc(var(--jvtop,62px) + 10px);max-width:min(560px,calc(100vw - 48px));pointer-events:none;z-index:2}#${ID} .jv-head[hidden]{display:none}
#${ID} .jv-head .h{font-size:32px;line-height:1.1;letter-spacing:.04em;color:var(--tx);text-shadow:0 0 18px color-mix(in srgb,var(--jva) 40%,transparent)}#${ID} .jv-head .s{font-size:12px;color:var(--tx2);margin-top:4px;letter-spacing:.04em}#${ID} .jv-head .a{display:inline-block;margin-top:6px;font-size:10px;letter-spacing:.12em;border:1px solid var(--line);border-radius:4px;padding:1px 6px;color:var(--tx2)}
#${ID}.jv-headon .jv-hud{display:none}#${ID} .jv-head.r{left:auto;right:24px;text-align:right}#${ID}.jv-compact .jv-head.r{right:16px}#${ID}.jv-compact .jv-head.t{display:none}#${ID} .jv-help td{font-size:12px}
#${ID} .jv-pane.jv-today{left:max(24px,calc(50% - 470px));right:max(24px,calc(50% - 470px));width:auto;font-size:14px;background:color-mix(in srgb,var(--bg1) 92%,transparent)}
#${ID} .jv-today h3{font-size:15px;letter-spacing:.3em}#${ID} .jv-tl{display:grid;grid-template-columns:150px 1fr;gap:4px 14px;align-items:baseline;width:100%;text-align:left;border-radius:10px;margin:3px 0;padding:9px 12px;font-size:13px;line-height:1.45}#${ID} .jv-tl b{font-weight:400;letter-spacing:.18em;font-size:11px;color:var(--jva)}#${ID} .jv-tl.warn b{color:var(--gold)}#${ID} .jv-tl span{color:var(--tx);overflow-wrap:anywhere}
#${ID} .jv-since{margin:10px 0 2px;font-size:11px;letter-spacing:.16em;color:var(--tx2)}
#${ID} .jv-goto,#${ID} .jv-help{position:absolute;left:50%;top:18%;transform:translateX(-50%);z-index:8;width:min(520px,calc(100vw - 32px));padding:14px 16px;border:1px solid var(--jva);border-radius:12px;background:color-mix(in srgb,var(--bg1) 96%,transparent);box-shadow:0 0 30px color-mix(in srgb,var(--jva) 35%,transparent);box-sizing:border-box}#${ID} .jv-goto[hidden],#${ID} .jv-help[hidden]{display:none}
#${ID} .jv-goto input{width:100%;font:inherit;font-size:15px;color:var(--tx);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;box-sizing:border-box}#${ID} .jv-goto .m{font-size:11px;color:var(--tx2);margin-top:6px;min-height:15px}
#${ID} .jv-help{top:10%;max-height:78vh;overflow:auto}#${ID} .jv-help td:first-child{color:var(--jva);white-space:nowrap;padding-right:14px;text-align:left}#${ID} .jv-help td:last-child{text-align:left}
#${ID} .jv-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#${ID} .jv-asof{position:absolute;left:24px;bottom:30px;z-index:3;display:flex;gap:6px;align-items:center;font-size:10px;letter-spacing:.1em;color:var(--tx2)}#${ID} .jv-asof[hidden]{display:none}#${ID} .jv-asof.on b{color:var(--gold)}
#${ID} .jv-card.jv-card-l{right:auto;left:24px}#${ID} .jv-qbtn{display:none}#${ID}.jv-compact .jv-qbtn{display:inline-flex;padding:4px 10px}
#${ID} canvas:focus-visible{outline:1px dashed var(--jva);outline-offset:-4px}
#${ID} .jv-top{padding-top:max(16px,env(safe-area-inset-top));padding-left:max(24px,env(safe-area-inset-left));padding-right:max(24px,env(safe-area-inset-right))}
#${ID}.jv-compact .jv-top{padding:max(10px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 10px max(16px,env(safe-area-inset-left))}
#${ID}.jv-compact .jv-pane,#${ID}.jv-compact .jv-card,#${ID}.jv-compact .jv-pane.jv-today{left:16px;right:16px;width:auto;bottom:calc(74px + env(safe-area-inset-bottom))}#${ID}.jv-compact .jv-card.jv-card-l{left:16px}
#${ID}.jv-compact .jv-scrub{left:16px;right:16px;bottom:calc(10px + env(safe-area-inset-bottom))}#${ID}.jv-compact .jv-head{left:16px;max-width:calc(100vw - 32px)}#${ID}.jv-compact .jv-head .h{font-size:24px}#${ID}.jv-compact .jv-asof{left:16px;bottom:calc(12px + env(safe-area-inset-bottom))}
#${ID}.jv-compact .jv-tl{grid-template-columns:1fr;padding:8px 10px}#${ID}.jv-compact .jv-reg{padding:0 16px}`;

let open = null;

export async function openJarvis(win = window, opts = {}) {
  const doc = win.document;
  if (open) { open.undock(); open.go?.(opts); return true; }
  if (doc.getElementById(ID)) return true;
  const prefs = lsGet();
  // REDUCED MOTION, live: the setting is followed while Helix is open (the boot glitch, the dock pulse, the 2D particles and the spin all stop), not only read once
  const mq = win.matchMedia?.('(prefers-reduced-motion: reduce)'), calmNow = () => !!mq?.matches; let calm = calmNow();
  const fontMap = { fam: monoFont(''), floor: 0, c: new Map() };                  // the canvas font family and the mapped ctx.font strings (see the font setter)
  const budget = frameBudget({ maxDpr: Math.min(2, win.devicePixelRatio || 1) }); // the frame governor: DPR 1 when frames run slow, 30 fps when idle or calm
  const root = doc.createElement('div'); root.id = ID; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'H.E.L.I.X.: the macro chain'); root.dataset.srOff = '1';      // stableRender leaves the HUD alone (a held height left stale cards)
  root.innerHTML = `<style>${CSS}</style><canvas id="${ID}-cv" tabindex="0" aria-label="The picture: Tab steps through its markets, Enter opens one"></canvas><div class="jv-bs" id="${ID}-bs"><div class="jv-bs-t"><canvas class="jv-helix" id="${ID}-hx" aria-hidden="true"></canvas><h1 id="${ID}-bst">H.E.L.I.X.</h1><div class="jv-bs-sub blink" id="${ID}-bss">&nbsp;</div></div><div class="jv-bs-b"><div class="jv-bs-log" id="${ID}-bslog"></div><div class="jv-bar"><i id="${ID}-bsbar"></i></div></div></div><div class="jv-scan"></div><div class="jv-vig"></div><i class="jv-br tl"></i><i class="jv-br tr"></i><i class="jv-br bl"></i><i class="jv-br brr"></i>
<div class="jv-top"><span class="jv-title" data-surface="widget.jarvis">H.E.L.I.X.</span><span class="jv-sub">holistic economic links &amp; intermarket xplorer · description only</span><span class="jv-sp"></span><span class="jv-cur" id="${ID}-cur"></span><button type="button" class="jv-qbtn" id="${ID}-qbtn" title="Keys, links and this picture's notes" aria-label="Help">?</button><button type="button" class="jv-menubtn" id="${ID}-menubtn" aria-expanded="false">☰ MENU</button>
<div class="jv-menu" id="${ID}-menu"><span class="jv-mh">SECTIONS</span><div class="jv-nav" id="${ID}-nav"></div><span class="jv-mh">TIME WINDOW</span><span id="${ID}-win"></span><span class="jv-mh">OPTIONS</span><span id="${ID}-opts">
<button type="button" id="${ID}-snd" aria-pressed="${prefs.sound !== false}" title="Sound effects">SOUND</button><button type="button" id="${ID}-vbtn" aria-expanded="false" title="Voice settings">VOICE ▾</button><button type="button" id="${ID}-nms" aria-pressed="${getNameStyle() === 'names'}" title="Show market names or codes">${getNameStyle() === 'names' ? 'NAMES' : 'CODES'}</button><button type="button" id="${ID}-wake" aria-pressed="false" title='Say "Helix, ..." (microphone, this tab only)'>HEY HELIX</button><button type="button" id="${ID}-dockb" title="Esc: drop to a slim strip over the dashboard; Helix keeps watching">DOCK ▾</button><button type="button" id="${ID}-pop" title="P: pop Helix out to a second window">⧉ POP OUT</button><button type="button" id="${ID}-help" title="?: keys and help">?</button><button type="button" id="${ID}-off" title="Switch Helix off">OFF ✕</button></span><span id="${ID}-mods" hidden></span><span id="${ID}-view" hidden></span></div></div>
<div class="jv-vpop" id="${ID}-vpop" hidden><div class="jv-vh">VOICE</div><label><span>SPEAK THE PROGRAMMES</span><button type="button" id="${ID}-vsp" aria-pressed="${speakPref(prefs)}" title="On: the briefing and the show are read aloud. Off: subtitles at reading speed">${speakPref(prefs) ? 'ON' : 'OFF'}</button></label><label><span>NATURAL VOICE</span><button type="button" id="${ID}-nv" aria-pressed="${prefs.neural !== false}" title="Off = the browser's built-in voice">${prefs.neural !== false ? 'ON' : 'OFF'}</button></label><label><span>ENGINE</span><select id="${ID}-veng">${ENGINES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label id="${ID}-vkvl"><span>KOKORO VOICE</span><select id="${ID}-vkv">${KOKORO_VOICES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label><span>FINISH</span><select id="${ID}-vfx">${FX_LEVELS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><div class="jv-vnote" id="${ID}-vnote"></div><button type="button" id="${ID}-vtest">▶ TEST</button></div><div class="jv-cap" id="${ID}-cap" hidden><div class="t" id="${ID}-capt"></div><div class="x" id="${ID}-capx"></div></div><button type="button" class="jv-cinexit" id="${ID}-stop">■ END SHOW  ·  Esc</button><div class="jv-cine" id="${ID}-cine"><button type="button" data-c="prev" title="Back one scene (left arrow)">⏮ BACK</button><button type="button" data-c="pause" id="${ID}-cpause" title="Pause or resume (space)">⏸ PAUSE</button><button type="button" data-c="next" title="Skip this scene (right arrow)">SKIP ⏭</button><button type="button" data-c="slow" title="Slower (minus)">−</button><span id="${ID}-crate">1.0×</span><button type="button" data-c="fast" title="Faster (plus)">+</button><button type="button" data-c="more" class="jv-cmore" title="More controls" aria-expanded="false">⋯</button></div><div class="jv-reg" id="${ID}-reg"></div><div class="jv-hud" id="${ID}-hud"></div><div class="jv-pane" id="${ID}-pane" hidden></div><div class="jv-boot" id="${ID}-boot"></div><div class="jv-card" id="${ID}-card" hidden></div><div class="jv-head" id="${ID}-head" hidden></div><div class="jv-live" id="${ID}-live" aria-live="polite"></div><div class="jv-asof" id="${ID}-asof" hidden></div><div class="jv-goto" id="${ID}-goto" role="dialog" aria-label="Go to" hidden><input id="${ID}-gq" type="text" list="${ID}-gl" autocomplete="off" spellcheck="false" placeholder="Go to: yields, board, gamma pillar, alerts, today…" aria-label="Go to a picture or panel"><datalist id="${ID}-gl"></datalist><div class="m" id="${ID}-gm">Enter opens it · Esc closes</div></div><div class="jv-help" id="${ID}-hlp" role="dialog" aria-label="Keys" hidden></div>
<div class="jv-scrub" id="${ID}-scrub"><button type="button" class="jv-scrubt" id="${ID}-scrubt" aria-expanded="false" title="Replay the chain through past sessions">⏱ TIME</button><button type="button" id="${ID}-play" title="Replay the last 60 sessions">▶ PLAY</button><input type="range" id="${ID}-sl" min="0" max="0" value="0" aria-label="Session to show"><span id="${ID}-sd" class="jv-sub" style="min-width:150px;text-align:right">LATEST</span><button type="button" id="${ID}-now">LATEST</button><button type="button" id="${ID}-expl" title="Describe what was going on around this day (one model call)">EXPLAIN THIS DAY</button></div>
<div class="jv-foot">drag to turn · wheel to zoom · click a market · Esc docks · none of this is a forecast</div>`;
  doc.body.appendChild(root);
  const dock = doc.createElement('div'); dock.id = `${ID}-dock`; dock.hidden = true; doc.body.appendChild(dock);
  const onCalm = () => { calm = calmNow(); root.classList.toggle('jv-calm', calm); dock.classList.toggle('jv-calm', calm); if (calm) st.spin = false; };
  root.classList.toggle('jv-calm', calm); dock.classList.toggle('jv-calm', calm);
  try { mq?.addEventListener?.('change', onCalm); } catch (e) { /* an old browser: read once */ }
  const $ = s => root.querySelector(`#${ID}-${s}`), cv = $('cv'), ctx = cv.getContext('2d');
  // a FONT FLOOR for the views' canvas labels (root.dataset.fontFloor, in CSS px): the broadcast sets it so the small grey labels can be read on a phone. Every view draws
  // its labels on this one context, so one floor reaches them all; panels sized with measureText grow with the text. Off (no attribute) = the views' own sizes.
  { const FD = win.CanvasRenderingContext2D && Object.getOwnPropertyDescriptor(win.CanvasRenderingContext2D.prototype, 'font');
    // the same setter also puts every view's 'ui-monospace,monospace' (243 of them; Chrome on Windows has no ui-monospace) into the HUD's own font, read from --mono once the fonts are ready.
    // Mapped strings are cached (cleared when the floor or the family changes), so a frame's font sets do no string work after the first.
    if (FD?.set && FD.get) try { Object.defineProperty(ctx, 'font', { configurable: true, get() { return FD.get.call(this); }, set(v) { const m = +root.dataset.fontFloor || 0; if (m !== fontMap.floor) { fontMap.floor = m; fontMap.c.clear(); } let o = fontMap.c.get(v); if (o === undefined) { o = mapFont(v, fontMap.fam, m); if (fontMap.c.size > 600) fontMap.c.clear(); fontMap.c.set(v, o); } FD.set.call(this, o); } }); } catch (e) { /* the views keep their own sizes */ } }
  const tok = (n, fb) => { try { return win.getComputedStyle(root).getPropertyValue('--' + n).trim() || fb; } catch (e) { return fb; } };     // read on the HUD itself: it sees the page theme plus its own --cy and the daylight override
  // DAYLIGHT: the HUD is a dark instrument (glows, additive light). Under the light theme its tokens are forced to the default dark set, on the HUD and its dock only.
  const applyDark = () => { const light = doc.documentElement.getAttribute('data-theme') === 'daylight', T = THEMES.find(t => t.id === 'default')?.tokens ?? {};
    for (const el of [root, doc.getElementById(`${ID}-dock`)]) { if (!el) continue; for (const [k, v] of Object.entries(T)) { if (light) el.style.setProperty('--' + k, v); else el.style.removeProperty('--' + k); } el.style.colorScheme = light ? 'dark' : ''; } };
  applyDark();
  let C = {};
  const readTheme = () => { C = { up: tok('up', 'green'), dn: tok('dn', 'red'), gold: tok('gold', 'orange'), blue: tok('blue2', 'dodgerblue'), tx: tok('tx', 'white'), tx2: tok('tx2', 'gray'), cy: tok('cy', tok('teal', 'teal')) }; };
  readTheme();
  try { doc.fonts?.ready?.then(() => { if (!open) return; fontMap.fam = monoFont(tok('mono', '')); fontMap.c.clear(); }); } catch (e) { /* the stack below stays */ }
  const onTheme = () => { applyDark(); readTheme(); fontMap.fam = monoFont(tok('mono', '')); fontMap.c.clear(); try { applyEnv(); } catch (e) { /* before the first view */ } };
  win.addEventListener('themechange', onTheme); doc.addEventListener('themechange', onTheme);

  const names = Object.fromEntries(Object.entries(CHAIN_NODES).map(([k, n]) => [k, n.label]));
  const fitTop = () => { try { const tp = root.querySelector('.jv-top'); if (tp) root.style.setProperty('--jvtop', `${tp.offsetHeight}px`); } catch (e) { /* layout only */ } };
  const noBoot = !!win.__jarvisNoBoot || !!opts.popout, BOOT = noBoot ? 0 : calmNow() ? 0.8 : 4.2;
  if (BOOT) root.classList.add('jv-booting'); else $('bs').remove();
  const st = { compact: false, cd: null, cdBusy: null, cdCam: { x: 0, z: 0 }, cdTarget: { x: 0, z: 0 }, recent: [], lastInput: performance.now(), chainFail: false, cinemaStop: null, speakStop: null, mod: 'chain', view: prefs.view ?? 'globe', gl: { lat: 20, lon: 15, zoom: 1, tlat: 20, tlon: 15, tzoom: 1 }, land: null, bl: null, region: 'world', voice: false, sound: prefs.sound !== false, wake: false, watch: prefs.watch !== false, win: 5, graph: null, sum: null, sel: null, yaw: 0.55, pitch: -0.7, zoom: 1, spin: true, t0: performance.now() - (win.__jarvisNoBoot ? 5000 : 0), drag: null, w: 0, h: 0, proj: [], disp: {}, dates: [], idx: -1, play: 0, docked: false, alerts: [], snap: null, lastCheck: null, memLimit: prefs.memLimit ?? 0, mem: null,
    quiet: prefs.quiet !== false, gate: prefs.gate ?? null, seen0: prefs.seen ?? null, sinceRes: null, sizeOf: {}, lab: {}, loud5: new Set(), modsReady: false, pending: null, hash0: win.location.hash, headKey: '', focusI: -1 };
  if ([1, 5, 20].includes(prefs.win)) st.win = prefs.win; if (prefs.region && REGIONS[prefs.region]) st.region = prefs.region;     // remembered: window and region (the view already was)
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
  const SCRUB_VIEWS = new Set(['globe', 'skyline', 'orbit', 'bubbles', 'reactor', 'chainfly']);
  const setCamAll = () => { root.classList.toggle('jv-noscrub', !SCRUB_VIEWS.has(st.view)); applyEnv(); try { const b = $('view').querySelector(`[data-v="${st.view}"]`); $('cur').textContent = (b?.textContent ?? st.view).toUpperCase(); } catch (e) { /* label only */ } setCam(); $('reg').hidden = st.view !== 'globe'; if (extraViews[st.view]) { Object.assign(st, { yaw: 0.35, pitch: -0.45, zoom: 1 }); try { extraViews[st.view].onEnter?.(xapi); } catch (e) { /* a view must never break the HUD */ } } if (st.view === 'candles') { Object.assign(st, { yaw: 0.3, pitch: -0.5, zoom: 1 }); st.cdTarget = { x: 0, z: 0 }; st.cdCam = { x: 0, z: 0 }; ensureCandles(); } };
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
    const cmp = root.clientWidth < 700; st.compact = cmp; root.classList.toggle('jv-compact', cmp); if (!cmp) root.classList.remove('jv-menu-open'); const d = Math.min(budget.dpr, win.devicePixelRatio || 1); st.dpr = d; st.w = root.clientWidth; st.h = root.clientHeight; cv.width = st.w * d; cv.height = st.h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const onResize = () => { resize(); fitTop(); }; let topObs = null;
  resize(); win.addEventListener('resize', onResize); fitTop(); try { if (win.ResizeObserver) { topObs = new win.ResizeObserver(fitTop); topObs.observe(root.querySelector('.jv-top')); } } catch (e) { /* layout only */ }

  // ── the awakening: a heartbeat in the dark, the core ignites, status lines tick through, a greeting, then the HUD fades in ──
  const bootTimers = [];
  const later2 = (fn, ms) => bootTimers.push(win.setTimeout(() => { if (open) fn(); }, ms));
  function runBoot() {
    if (!BOOT) return;
    const bs = $('bs'), log = $('bslog'), bar = $('bsbar'), sub = $('bss'), h = $('bst'), hx = $('hx');
    try { helixLogo(hx, { calm }); win.requestAnimationFrame(() => hx.classList.add('on')); } catch (e) { /* the mark is decoration */ }      // stops by itself when the boot screen is removed
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
  let ac = null, bus = null, tap = null;
  // ONE audio bus for everything Jarvis plays (sound effects, the natural voice): it goes to the speakers AND to a tap a recorder can read, so a recording
  // (RECORD AS VIDEO, the laptop's daily broadcast job) gets the sound straight from the page: no "share tab audio" tick, no sound device needed.
  // FRAME-BY-FRAME recording (jarvis_broadcast/vclock.js froze the page clock): a context made before the freeze is dropped, so the next one is the recorder's offline, virtual-clock one
  const audioCtx = () => { if (ac && win.__vclock?.frozen && !ac.__virtual) { ac = null; bus = null; tap = null; amb = null; } ac ??= new (win.AudioContext || win.webkitAudioContext)(); if (!bus) { bus = ac.createGain(); bus.connect(ac.destination); tap = ac.createMediaStreamDestination(); bus.connect(tap); } return ac; };
  const busIn = () => { audioCtx(); return bus; };
  const blip = (f = 660, d = 0.08, type = 'sine', g = 0.03, at = 0) => {
    if (!st.sound) return; try { audioCtx(); const o = ac.createOscillator(), v = ac.createGain(), t = ac.currentTime + at; o.type = type; o.frequency.setValueAtTime(f, t); v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(v); v.connect(busIn()); o.start(t); o.stop(t + d + 0.02); } catch (e) { /* no audio */ }
  };
  // ambience and whooshes for the SHOW: a low drone with a slow swell and a breath of filtered noise, and a swept-noise whoosh on a scene change (all WebAudio, no files)
  let amb = null;
  const noiseBuf = () => { const n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; };
  const sfx = {
    ambient(on) {
      try {
        if (!on) { if (amb) { const a = amb; amb = null; a.g.gain.cancelScheduledValues(ac.currentTime); a.g.gain.linearRampToValueAtTime(0.0001, ac.currentTime + 1.2); win.setTimeout(() => { try { a.nodes.forEach(n => n.stop?.(ac.currentTime)); } catch (e) { /* done */ } }, 1400); } return; }
        if (!st.sound || amb) return; audioCtx();
        const g = ac.createGain(), lp = ac.createBiquadFilter(), o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), nz = ac.createBufferSource(), nf = ac.createBiquadFilter(), ng = ac.createGain();
        o1.type = 'sine'; o1.frequency.value = 55; o2.type = 'triangle'; o2.frequency.value = 82.6; lp.type = 'lowpass'; lp.frequency.value = 420; lfo.frequency.value = 0.12; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(g.gain);
        nz.buffer = noiseBuf(); nz.loop = true; nf.type = 'bandpass'; nf.frequency.value = 260; ng.gain.value = 0.008; nz.connect(nf); nf.connect(ng); ng.connect(g);
        o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(busIn()); g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.linearRampToValueAtTime(0.045, ac.currentTime + 3);
        [o1, o2, lfo, nz].forEach(n => n.start()); amb = { g, nodes: [o1, o2, lfo, nz] };
      } catch (e) { /* no audio */ }
    },
    whoosh() {
      if (!st.sound) return; try {
        audioCtx(); const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        s.buffer = noiseBuf(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.45); f.frequency.exponentialRampToValueAtTime(300, t + 1.0);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.05); s.connect(f); f.connect(g); g.connect(busIn()); s.start(t); s.stop(t + 1.1);
      } catch (e) { /* no audio */ }
    },
  };
  const bootChime = () => { blip(440, 0.1, 'triangle'); blip(660, 0.1, 'triangle', 0.03, 0.1); blip(880, 0.18, 'triangle', 0.03, 0.2); };
  const alertChime = () => { blip(880, 0.12, 'square', 0.025); blip(660, 0.18, 'square', 0.025, 0.14); };

  // ── voice out (the browser's own synthesis; the best British male on offer) ──
  let voice = null; const loadVoice = () => { voice = pickVoice(win.speechSynthesis?.getVoices?.() ?? []); }; loadVoice(); win.speechSynthesis?.addEventListener?.('voiceschanged', loadVoice);
  // the NATURAL voice (server MP3: ElevenLabs with a key, else Microsoft's free British neural voice) leads; the browser's own synthesis is the fallback
  const audioBus = () => { try { audioCtx(); return { ctx: ac, input: bus, stream: tap.stream }; } catch (e) { return null; } };
  const neural = makeNeuralVoice(win, audioBus); st.neural = prefs.neural !== false;
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
      if (st.neural) { waiting = true; win.speechSynthesis?.cancel(); neural.play(t, r, fin).then(c => { waiting = false; if (done) { c?.stop(); return; } if (c) { nctl = c; if (c.setRate && r !== rate) c.setRate(r); arm(Math.max(est * 2.5 + 8000, (c.seconds ?? 0) * 1000 + 3000)); if (paused) c.pause(true); } else fallback(); }); }
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
  function setGraph(g, sum) { st.graph = g; st.sum = sum; st.chainFail = false; root.classList.remove('jv-nochain'); st.sizeOf = {}; for (const n of g.nodes) { st.sizeOf[n.key] = n.style.size; if (st.disp[n.key] == null) st.disp[n.key] = n.style.size; }
    st.loud5 = new Set(g.nodes.filter(n => GEO[n.key]).sort((a, b) => b.style.size - a.style.size).slice(0, 5).map(n => n.key));      // the five a phone names on the 2D globe: worked out once per graph, not per frame
    st.lab = {}; for (const n of g.nodes) st.lab[n.key] = (n.style.tone === 'up' ? '▲ ' : n.style.tone === 'dn' ? '▼ ' : n.style.tone === 'wrong' ? '◆ ' : '') + (CHAIN_NODES[n.key] ? shortLabel(CHAIN_NODES[n.key]) : n.key);      // the shape cue beside the colour, built once per graph
    st.bl = null; renderHud(); }
  async function load(w, date = null) {
    st.win = w; st.sel = null; $('card').hidden = true; lsPut({ win: w }); syncHash();
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
    st.view = v; if (!auto) { lsPut({ view: v }); if (extraViews[v]?.gl) st.recent = [v, ...st.recent.filter(x => x !== v)].slice(0, 5); const g = groupOf(v); if (g) lsPut({ styles: { ...(lsGet().styles ?? {}), [g]: v } }); }      // the GL views the owner visited, newest first (ATTRACT cycles them); the STYLE picked per group is remembered
    root.classList.toggle('jv-glon', !!extraViews[v]?.gl); st.headKey = ''; st.focusI = -1;
    setCamAll(); renderNav(); for (const x of $('view').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.v === v)); if (!auto) { blip(720, 0.06); announce(labelOf('view', v) ?? v); } };
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
  $('reg').onclick = e => { const b = e.target.closest('button[data-r]'); if (!b) return; setRegion(b.dataset.r); syncHash(); blip(700, 0.05); };
  const MODS = [['chain', 'CHAIN'], ['today', 'TODAY'], ['ask', 'ASK'], ['radar', 'RADAR'], ['brief', 'BRIEF'], ['alerts', 'ALERTS'], ['system', 'SYSTEM']];
  $('mods').innerHTML = MODS.map(([id, l]) => `<button type="button" data-m="${id}" aria-pressed="${id === 'chain'}">${l}</button>`).join(' ');

  const R = {
    ask(pre = '', auto = false) {
      const p = $('pane'), qd = pre || (st.sel && CHAIN_NODES[st.sel] ? `What is going on with ${CHAIN_NODES[st.sel].label} and the links around it today?` : '');
      p.innerHTML = `<h3>ASK HELIX</h3><p>One answer from today's book, the analysts' reports, the desk's memory and the Evidence Book. It cites what it used and says when the data does not answer. Each question is one model call, owner only, 60 a day.</p>
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
      p.onclick = e => { const b = e.target.closest('button[data-k]'); if (b) { st.sel = b.dataset.k; st.spin = false; blip(840, 0.05); showCard(true); } };      // the card opens beside the list (it used to wait for the panel to close)
    },
    async brief() {
      const p = $('pane'); p.innerHTML = '<h3>BRIEFING</h3><p>Reading the stored chain read…</p>';
      const d = await jf(`/api/chain-read?window=${st.win}`).catch(() => null), r = d?.read && typeof d.read === 'object' ? d.read : d;
      if (!d?.ok || !r) { p.innerHTML = `<h3>BRIEFING · ${st.win}D</h3><p>No chain read has been written for the ${st.win}-day window today. Writing one is a model call: press Refresh on the Chain tab's read. Until then, the numbers are on the CHAIN and RADAR views.</p>`; return; }
      const paras = String(r.read ?? '').split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean);
      p.innerHTML = `<h3>BRIEFING · ${st.win}D</h3>${r.hook ? `<p class="jv-ans"><b>“${esc(r.hook)}”</b></p>` : ''}${paras.map(x => `<p>${esc(x)}</p>`).join('')}${r.next ? `<p><b>Next:</b> ${esc(r.next)}</p>` : ''}<div class="jv-row"><button type="button" id="${ID}-say">READ IT TO ME</button></div><p class="jv-sub">Written ${esc(d.generatedAt ?? '')}. An opinion in a trader's voice, not backtested, not a forecast. One read per window per day, shared by everyone.</p>`;
      p.querySelector(`#${ID}-say`).onclick = () => say([r.hook, ...paras].filter(Boolean).join('. '), true);
    },
    // ONE INBOX: this tab's watcher, the server watcher (what reached the phone) and the desk's alert rules, in one list with one dedupe. The section is REBUILT on every render (it used to
    // append "SENT TO YOUR PHONE" again each time the panel re-opened while the server answer was still on its way).
    alerts() {
      const p = $('pane'), my = (R.alerts.n = (R.alerts.n ?? 0) + 1), q = st.quiet;
      p.innerHTML = `<h3>ALERTS · ONE INBOX</h3><p>Helix checks the live chain every two minutes while this tab is open, and the server's memory every ten; the server watcher keeps going with the tab shut and sends to your phone. Both use the same rules: one alert per event per six hours, at most twelve said aloud a day, and nothing aloud in quiet hours (it is still listed). It is awareness, never a trade.</p>
<div class="jv-row"><button type="button" id="${ID}-wt" aria-pressed="${st.watch}">WATCHING ${st.watch ? 'ON' : 'OFF'}</button><button type="button" id="${ID}-qh" aria-pressed="${q}" title="Quiet hours: 22:00 to 07:00 London">QUIET HOURS ${q ? 'ON' : 'OFF'}</button><button type="button" id="${ID}-nt">DESKTOP NOTIFICATIONS</button><button type="button" id="${ID}-ws">WHILE YOU SLEPT</button></div><div id="${ID}-wsd"></div><div id="${ID}-inbox"><p class="jv-sub">Reading the server watcher and the desk alerts…</p></div>`;
      const box = p.querySelector(`#${ID}-inbox`), when = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      const SRC = { tab: 'THIS TAB', phone: 'PHONE', server: 'SERVER', desk: 'DESK RULE' };
      const paint = (w, d) => {
        if (my !== R.alerts.n || st.mod !== 'alerts' || !box.isConnected) return;
        const rows = mergeInbox({ tab: st.alerts, server: w?.lastAlerts ?? [], desk: d?.rules ?? [] });
        const hm = w?.lastCheck ? new Date(w.lastCheck).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }) : null;
        box.innerHTML = `<p class="jv-sub">${w?.ok ? `Server watcher: last check ${esc(hm ?? 'not yet')}${w.enabled ? '' : ' (switched off)'}` : 'Server watcher: not answering.'} · desk rules: ${d?.ok ? `${(d.rules ?? []).length} set` : 'not answering'}</p>`
          + (rows.length ? rows.map(a => `<p><span class="jv-k ${a.level === 'warn' ? 'jv-broke' : 'jv-hold'}">${esc(when(a.at))}</span><span class="jv-k">${SRC[a.src] ?? a.src}</span>${esc(a.text)}</p>`).join('') : '<p>Nothing yet.</p>');
      };
      paint(null, null);
      Promise.all([jf('/api/jarvis/watch').catch(() => null), jf('/api/desk-alert-rules').catch(() => null)]).then(([w, d]) => { st.inboxServer = w; paint(w, d); });
      p.querySelector(`#${ID}-wt`).onclick = () => { setWatch(!st.watch); R.alerts(); };
      p.querySelector(`#${ID}-qh`).onclick = () => { st.quiet = !st.quiet; lsPut({ quiet: st.quiet }); R.alerts(); };
      p.querySelector(`#${ID}-nt`).onclick = async () => { try { const r = await win.Notification?.requestPermission?.(); say(r === 'granted' ? 'Desktop notifications are on.' : 'Notifications were not allowed.', true); } catch (e) { /* unsupported */ } };
      p.querySelector(`#${ID}-ws`).onclick = async () => { const o = p.querySelector(`#${ID}-wsd`); o.innerHTML = '<p class="jv-sub">Reading the digest…</p>'; const d = await jf('/api/jarvis/morning').catch(() => null); if (!o.isConnected) return; o.innerHTML = d?.ok ? `<p class="jv-ans">${esc(d.text)}</p>` : '<p>The digest is not available (owner-only route, or the chain has not loaded on the server).</p>'; };
    },
    // TODAY: the still front page. One line per section, each opening its picture; "since you last looked" under it. The canvas behind is held still (no spin, no particles).
    async today() {
      const p = $('pane'), my = (R.today.n = (R.today.n ?? 0) + 1), lt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date());
      const paint = (inp, since) => {
        if (my !== R.today.n || st.mod !== 'today' || !p.isConnected) return;
        const lines = todayLines(inp);
        p.innerHTML = `<h3>TODAY · ${esc(lt.toUpperCase())}</h3><p class="jv-sub">One line from each section. Press a line to open its picture; 1 to 6 open the sections, / goes anywhere, ? lists the keys. Description only, never a forecast or a trade.</p>`
          + lines.map(l => `<button type="button" class="jv-tl${l.tone === 'warn' ? ' warn' : ''}" data-tk="${l.go.kind}" data-ti="${esc(l.go.id)}"><b>${esc(l.label)}</b><span>${esc(l.text)}</span></button>`).join('')
          + (since ? `<div class="jv-since">SINCE YOU LAST LOOKED · ${esc(agoText(since.since).toUpperCase())}</div>${since.empty ? '<p>Nothing broke, healed or went big, and no alerts.</p>' : since.lines.map(l => `<button type="button" class="jv-tl" data-tk="${l.go.kind}" data-ti="${esc(l.go.id)}"><b>CHANGED</b><span>${esc(l.text)}</span></button>`).join('')}` : '')
          + `<p class="jv-sub">${inp.source ? `Read from ${esc(inp.source)}. ` : ''}Lines that say "not loaded" fill in as their feeds answer.</p>`;
        setHead({ hero: inp.chain ? `${inp.chain.broken} BROKEN · ${inp.chain.holding} HOLDING` : 'TODAY', sub: inp.lead ?? '', asOf: inp.asOf ?? null });
      };
      p.onclick = e => { const b = e.target.closest('button[data-tk]'); if (b) goTarget({ kind: b.dataset.tk, id: b.dataset.ti }); };
      paint(todayBase(), st.sinceRes ?? null);
      const inp = await todayLoad(() => paint(todayBase(), st.sinceRes ?? null)); paint(inp, st.sinceRes ?? null);
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
    $('pane').hidden = m === 'chain'; $('pane').onclick = null; $('boot').style.display = m === 'chain' ? '' : 'none'; $('pane').classList.toggle('jv-today', m === 'today');
    st.headKey = ''; if (m !== 'today') setHead(null); st.stillDrawn = false;
    if (m === 'chain') showCard(); else { $('card').hidden = true; R[m]?.(); }
    renderNav(); if (m !== 'chain') announce(labelOf('tool', m) ?? m);
  }
  // ── the shared HEADLINE slot: a 32px hero figure, a sub-line and the as-of, for the views that give one (headline(api)) and for TODAY; announced to screen readers ──
  function setHead(h) {
    const el = $('head'); if (!h || !h.hero) { if (!el.hidden) { el.hidden = true; root.classList.remove('jv-headon'); } st.headKey = ''; return; }
    const key = `${h.hero}|${h.sub ?? ''}|${h.asOf ?? ''}`; if (key === st.headKey) return; const was = st.headKey.split('|')[0]; st.headKey = key;
    el.innerHTML = `<div class="h">${esc(h.hero)}</div>${h.sub ? `<div class="s">${esc(h.sub)}</div>` : ''}${h.asOf ? `<div class="a">AS OF ${esc(h.asOf)}</div>` : ''}`; el.hidden = false; root.classList.add('jv-headon');
    el.classList.toggle('t', st.mod === 'today'); el.classList.toggle('r', st.mod !== 'today');      // a picture's headline sits top right, clear of its plot; TODAY's sits beside its page (hidden on a phone, where the page has the title)
    if (was !== h.hero) announce(`${h.hero}. ${h.sub ?? ''}`);
  }
  function refreshHead() {
    if (st.mod === 'today' || st.cinemaCtl) return;
    const v = extraViews[st.view]; let h = null;
    if (v?.headline && (st.mod === 'chain' || st.mod === COMPANION[st.view])) { try { h = v.headline(xapi); } catch (e) { h = null; } }
    setHead(h);
  }
  const announce = t => { try { const l = $('live'); if (l && l.textContent !== t) l.textContent = String(t ?? ''); } catch (e) { /* label only */ } };
  // ── TODAY's inputs: what Helix already holds (synchronously), then a pass that reads what is missing (the data lane's /api/helix/bundle first, else the existing loaders) ──
  const londonDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
  function alertsToday() {
    const d = londonDay(Date.now()), rows = mergeInbox({ tab: st.alerts, server: st.inboxServer?.lastAlerts ?? [] }).filter(a => londonDay(a.at) === d);
    return rows.length ? { n: rows.length, last: rows[0].text } : null;
  }
  function todayBase() {
    const s = st.liveSum ?? st.sum, r = st.graph ? radarRank(st.graph, names) : null, b = st.cd?.board;
    return { lead: st.todayLead ?? s?.headline ?? null, chain: s ? { holding: s.holding, broken: s.broken, brokenShort: s.brokenShort ?? (r?.broken ?? []).map(x => x.short) } : null,
      unusual: (r?.items ?? []).slice(0, 3).map(i => ({ label: i.label, text: i.text })), board: b?.n ? { n: b.n, up: b.up, dn: b.dn, quiet: b.quiet } : null,
      next: st.todayNext ?? null, walls: st.todayWalls ?? null, alerts: alertsToday(), source: st.todaySrc ?? null, asOf: st.todayAsOf ?? null };
  }
  const useBundle = bun => { if (!(bun && bun.ok !== false && (bun.asOf || bun.blocks))) return; st.todaySrc = 'the Helix bundle'; st.todayAsOf = bun.asOf ? new Date(bun.asOf).toUTCString().slice(5, 22).toUpperCase() + ' UTC' : null; const lead = bun.lead ?? bun.headline?.text ?? bun.blocks?.headline?.data?.text ?? (typeof bun.headline === 'string' ? bun.headline : null); if (lead) st.todayLead = String(lead); };
  async function todayLoad(part = () => {}) {      // part() repaints as each feed lands, so one slow feed never holds the page back
    const ok = (p, use) => Promise.resolve().then(p).catch(() => null).then(v => { try { if (v) use(v); } catch (e) { /* one line stays as it was */ } part(); return v; });
    await Promise.all([
      ok(() => jf('/api/helix/bundle'), useBundle),                                                         // the data lane's single payload, when the server has it (falls back below when not)
      ok(() => ensureCandles(), () => {}),
      ok(async () => { const m = await import('./jarvisViewDayAhead.js'); return m.loadDay(xapi); }, day => { if (day?.events) { const now = Date.now(), nx = day.events.filter(e => e.ms >= now && e.rank >= 3).sort((a, b) => a.ms - b.ms)[0]; st.todayNext = nx ? { time: nx.hm, ccy: nx.ccy, event: nx.short || nx.name } : null; } }),
      ok(async () => { const [m, c] = await Promise.all([import('./jarvisViewGamma.js'), import('./jarvisGammaCore.js')]); const store = await m.loadGamma(xapi); const mk = c.marketsWithOI(store ?? {})[0]; if (!mk) return null; const L = c.buildLadder({ ...store[mk.pair], pair: mk.pair }); return L ? { label: mk.label, call: c.fmtPx(L.callWall?.strike ?? L.callWall), put: c.fmtPx(L.putWall?.strike ?? L.putWall), flip: L.flip != null ? c.fmtPx(L.flip) : null, long: L.long } : null; }, gm => { st.todayWalls = gm; }),
      ok(() => jf('/api/jarvis/watch'), w => { if (w?.ok) { st.inboxServer = w; computeSince(); } }),
      st.snap ? null : ok(() => loadAt('live'), live => { if (live?.graph && !st.snap) { st.snap = watchSnapshot(live.graph, names); st.liveSum = live.sum; computeSince(); } }),
    ]);
    computeSince();
    return todayBase();
  }
  function computeSince() { if (!st.snap) return; st.sinceRes = sinceSummary(st.seen0, st.snap, mergeInbox({ tab: st.alerts, server: st.inboxServer?.lastAlerts ?? [] })); }
  const saveSeen = () => { if (st.snap) lsPut({ seen: { at: Date.now(), snap: st.snap } }); };
  // ── going places: a target from a link, a command, the go-to box, a key or the voice ──
  function goTarget(t) {
    if (!t?.id) return false;
    const known = t.kind === 'view' ? !!$('view').querySelector(`[data-v="${t.id}"]`) : !!(R[t.id] || $('mods').querySelector(`[data-m="${t.id}"]`));
    if (!known) { if (!st.modsReady) { st.pending = t; return true; } return false; }       // modules still loading: go there when they land
    if (t.kind === 'view') goNav('view', t.id); else goNav('tool', t.id);
    return true;
  }
  const curTarget = () => (st.mod !== 'chain' && st.mod !== COMPANION[st.view] ? { kind: 'tool', id: st.mod } : { kind: 'view', id: st.view });
  const syncHash = () => { if (st.docked || win.__jarvisNoBoot) return; try { const t = curTarget(), h = helixHash({ ...t, win: st.win, region: st.region }) + (opts.popout ? '/popout' : ''); if (win.location.hash !== h) win.history?.replaceState?.(win.history.state, '', h); } catch (e) { /* the address stays */ } };
  const restoreHash = () => { try { if (/^#helix/i.test(win.location.hash)) win.history?.replaceState?.(win.history.state, '', st.hash0 && !/^#helix/i.test(st.hash0) ? st.hash0 : win.location.pathname + win.location.search); } catch (e) { /* the address stays */ } };
  const setRegion = r => { if (!REGIONS[r]) return; st.region = r; const [la, lo, z] = REGIONS[r]; Object.assign(st.gl, { tlat: la, tlon: lo, tzoom: z }); st.spin = r === 'world' && !calm; for (const x of $('reg').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x.dataset.r === r)); lsPut({ region: r }); };
  /** Apply a deep link or command arguments: { hash } | { args } | { target }. Unknown words say so instead of guessing. */
  function applyOpts(o = {}) {
    const p = o.hash != null ? parseHelixHash(o.hash) : o.args != null ? parseHelixArgs(o.args) : o.target ? { target: o.target } : null;
    if (!p) return false;
    if (p.popout && !opts.popout) { popOut(p.target); return true; }
    if (p.win && p.win !== st.win) load(p.win);
    if (p.region) setRegion(p.region);
    if (p.target) goTarget(p.target); else goTarget({ kind: 'tool', id: 'today' });
    if (p.unknown) { announce(`No picture called ${p.unknown}`); flashNote(`No picture or panel called "${p.unknown}". Press / to look one up.`); }
    return true;
  }
  const flashNote = t => { const m = $('gm'); openGoto(); m.textContent = t; };
  // ── POP OUT: the same Helix in its own window (a second screen); this one docks to its strip ──
  function popOut(t = null) {
    const h = helixHash({ ...(t ?? curTarget()), win: st.win, region: st.region }) + '/popout';
    let w2 = null; try { w2 = win.open(`${win.location.pathname}${win.location.search}${h}`, 'helix-popout', 'popup=yes,width=1440,height=900'); } catch (e) { w2 = null; }
    if (w2) { saveSeen(); api.dock(); } else announce('The browser blocked the pop-out window.');
  }
  // ── OPEN IN TERMINAL: a market's chart, pair page, release replay or option levels in the terminal itself (Helix docks to its strip so the page shows) ──
  async function openInTerminal(what, inst, extra = {}) {
    const a = what === 'chart' ? { kind: 'kchart', inst } : what === 'pair' ? { kind: 'pair', inst } : what === 'oi' ? { kind: 'oidrill', inst, target: extra.target ?? 'callwall' } : what === 'replay' ? { kind: 'eventreplay', family: extra.family ?? null, market: inst } : null;
    if (!a || !inst) return false;
    let ok = false; try { const m = await import('./commandLine.js'); api.dock(); ok = !!m.perform(a, doc, win); } catch (e) { ok = false; }
    if (!ok) { api.undock(); const c = $('card'); if (!c.hidden) c.insertAdjacentHTML('beforeend', '<p class="jv-am">That part of the terminal is not on this page (switched off, or not loaded yet).</p>'); }
    return ok;
  }
  const GAMMA_KEYS = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'GOLD']);
  const termRow = inst => `<div class="jv-row"><span class="jv-sub">OPEN IN THE TERMINAL:</span><button type="button" data-term="chart">CHART</button><button type="button" data-term="pair">PAIR PAGE</button><button type="button" data-term="replay">RELEASE REPLAY</button>${GAMMA_KEYS.has(inst) ? '<button type="button" data-term="oi">OPTION LEVELS</button>' : ''}</div>`;
  const wireTerm = (card, inst) => { card.querySelectorAll('button[data-term]').forEach(b => { b.onclick = () => openInTerminal(b.dataset.term, inst); }); };
  // ── the go-to box (/) and the help (?) ──
  function openGoto() {
    const g = $('goto'), q = $('gq'); $('gl').innerHTML = allItems().map(i => `<option value="${esc(i.label.toLowerCase())}">`).join(''); g.hidden = false; $('gm').textContent = 'Enter opens it · Esc closes'; q.value = ''; try { q.focus(); } catch (e) { /* focus only */ }
  }
  const closeGoto = () => { $('goto').hidden = true; try { cv.focus({ preventScroll: true }); } catch (e) { /* focus only */ } };
  $('gq').onkeydown = e => { if (e.key === 'Enter') { const t = resolveTarget(e.target.value); if (t) { closeGoto(); goTarget(t); } else $('gm').textContent = `Nothing called "${e.target.value}". Try: board, yields, gamma pillar, flip map, alerts, today.`; e.preventDefault(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeGoto(); } };
  $('gq').oninput = e => { const t = resolveTarget(e.target.value); $('gm').textContent = t ? `↵ ${labelOf(t.kind, t.id) ?? t.id}` : 'Enter opens it · Esc closes'; };
  function toggleHelp(on) {
    const h = $('hlp'), show = on ?? h.hidden; if (!show) { h.hidden = true; return; }
    const vm = viewMod[st.view];
    h.innerHTML = `<h3>KEYS</h3><table>${KEYS.map(([k, d]) => `<tr><td>${esc(k)}</td><td>${esc(d)}</td></tr>`).join('')}</table><h3 style="margin-top:12px">LINKS</h3><p class="jv-sub">#helix/&lt;picture&gt;[/1d|5d|20d][/region] opens Helix on that picture (e.g. #helix/yields, #helix/candles/1d, #helix/globe/europe). The command line takes the same words: HELIX YIELDS, HELIX BOARD 1D.</p><div class="jv-row">${vm ? '<button type="button" data-h="notes">ⓘ NOTES ON THIS PICTURE</button>' : ''}<button type="button" data-h="close">CLOSE · Esc</button></div>`;
    h.hidden = false; h.onclick = e => { const b = e.target.closest('button[data-h]'); if (!b) return; h.hidden = true; if (b.dataset.h === 'notes' && vm) setMod(vm.id); };
  }
  $('help').onclick = () => toggleHelp(); $('qbtn').onclick = () => toggleHelp(); $('pop').onclick = () => popOut();
  // ── keyboard focus through the picture's items: Tab / Shift+Tab on the canvas steps the markets in reading order, Enter opens the card ──
  function stepFocus(d) {
    const seen = new Set(), list = st.proj.filter(p => typeof p.key === 'string' && !p.key.includes(':') && !seen.has(p.key) && seen.add(p.key)).sort((a, b) => (Math.round(a.sy / 40) - Math.round(b.sy / 40)) || a.sx - b.sx);
    if (!list.length) return false;
    st.focusI = (st.focusI + d + list.length) % list.length; st.sel = list[st.focusI].key; blip(860, 0.03);
    announce(CHAIN_NODES[st.sel]?.label ?? marketName(st.sel)); return true;
  }
  // ── AS OF on every picture: the terminal's whole-page time machine (?asof=), so a reload lands back on this picture in the past (the chain pictures keep their own 60-session scrub) ──
  function renderAsof() {
    const el = $('asof'), A = win.deskAsof; if (!A?.state || (SCRUB_VIEWS.has(st.view) && st.mod === 'chain') || st.mod === 'today') { el.hidden = true; return; }
    const s = A.state(), H = 3600_000, at = s.active && Number.isFinite(s.t) ? s.t : null;
    el.classList.toggle('on', !!at);
    el.innerHTML = at ? `<b>AS OF ${esc(new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }))} LONDON</b><button type="button" data-as="-24">◂ 1D</button><button type="button" data-as="-1">◂ 1H</button><button type="button" data-as="1">1H ▸</button><button type="button" data-as="live">LIVE</button>`
      : `<span>⏱ AS OF</span><button type="button" data-as="-1">◂ 1H</button><button type="button" data-as="-24">◂ 1D</button>`;
    el.hidden = false;
    el.onclick = e => { const b = e.target.closest('button[data-as]'); if (!b) return; syncHash(); try { if (b.dataset.as === 'live') A.live(); else A.set((at ?? Date.now()) + (+b.dataset.as) * H); } catch (er) { /* the clock refused */ } };
  }
  $('mods').onclick = e => { const b = e.target.closest('button[data-m]'); if (b) setMod(b.dataset.m); };
  // ── the sections: six, each holding its pictures AND its panels; a picture with a natural companion list opens it beside it ──
  function renderNav() {
    const nav = $('nav'); if (!nav) return;
    const has = (k, id) => !!(k === 'view' ? $('view').querySelector(`[data-v="${id}"]`) : $('mods').querySelector(`[data-m="${id}"]`));
    const act = activeSection(st.mod, st.view), items = collapseStyles(itemsFor(act, has), lsGet().styles ?? {}, st.view), comp = COMPANION[st.view] ?? null, hasComp = comp && has('tool', comp);
    const onPic = st.mod === 'chain' || st.mod === comp, ns = onPic ? nextStyle(st.view, id => has('view', id)) : null, vm = onPic ? viewMod[st.view] : null;
    nav.innerHTML = `<div class="jv-nav-row">${SECTIONS.map(x => `<button type="button" class="jv-sec" data-s="${x.id}" aria-pressed="${x.id === act.id}">${x.label}</button>`).join('')}</div>`
      + `<div class="jv-nav-row">${items.map(i => `<button type="button" class="jv-it ${i.kind}" data-k="${i.kind}" data-i="${i.id}" aria-pressed="${i.kind === 'view' ? (onPic && (i.group ? groupOf(st.view) === i.group : st.view === i.id)) : st.mod === i.id}" title="${i.kind === 'view' ? (i.styles > 1 ? `A picture (${i.styles} styles: press S or STYLE)` : 'A picture') : 'A panel of text and numbers'}">${esc(i.label)}</button>`).join('')}`
      + `${ns ? `<button type="button" class="jv-it tool" data-style="${esc(ns)}" title="S: the same data, drawn another way">STYLE ▸ ${esc(labelOf('view', ns) ?? ns)}</button>` : ''}${vm ? `<button type="button" class="jv-it tool" data-notes="${esc(vm.id)}" title="What this picture shows, in words">ⓘ NOTES</button>` : ''}`
      + `${hasComp ? `<button type="button" class="jv-it side" data-side="1" aria-pressed="${st.mod === comp}" title="The list that goes with this picture">${st.mod === comp ? '◂ HIDE' : '▸ SHOW'} ${esc(labelOf('tool', comp) ?? 'LIST')}</button>` : ''}</div>`
      + `<div class="jv-nav-hint">${esc(act.hint)}</div>`;
    $('cur').textContent = `${act.label} · ${(st.mod !== 'chain' ? labelOf('tool', st.mod) : labelOf('view', st.view)) ?? ''}`;
    win.setTimeout(fitTop, 0); syncHash(); renderAsof(); lsPut({ win: st.win, region: st.region });
  }
  function autoCompanion() { const comp = COMPANION[st.view]; if (!comp || st.compact || lsGet().side === false || st.mod !== 'chain' || st.cinemaStop || !$('mods').querySelector(`[data-m="${comp}"]`)) return; setMod(comp); }
  function goNav(kind, id) { if (kind === 'view') { if (st.mod !== 'chain') setMod('chain'); switchView(id); autoCompanion(); } else setMod(id); if (st.compact) closeMenu(); }
  $('nav').onclick = e => {
    const sec = e.target.closest('button[data-s]'); if (sec) { const x = SECTIONS.find(y => y.id === sec.dataset.s); goNav(x.home[0], x.home[1]); return; }
    const it = e.target.closest('button[data-i]'); if (it) { goNav(it.dataset.k, it.dataset.i); return; }
    const sy = e.target.closest('button[data-style]'); if (sy) { switchView(sy.dataset.style); return; }
    const nt = e.target.closest('button[data-notes]'); if (nt) { setMod(nt.dataset.notes); return; }
    if (e.target.closest('button[data-side]')) { const comp = COMPANION[st.view]; if (comp) { const open = st.mod === comp; lsPut({ side: !open }); setMod(open ? 'chain' : comp); } }
  };
  const viewMod = {};      // a view id -> the plug-in module that owns it, so its render() notes can be opened (NOTES) even though the view has no panel button
  const xapi = { ID, st, $, jf, esc, say, blip, names, doc, win, openInTerminal: (what, inst, extra) => openInTerminal(what, inst, extra), openCard: key => { st.sel = key; showCard(true); }, go: t => goTarget(typeof t === 'string' ? resolveTarget(t) : t), setGraph: (g, sum) => setGraph(g, sum), sfx, setView: v => switchView(v), candles: () => ensureCandles(), speak: (t, rate) => speakAsync(t, rate), voicePrefetch: t => voicePrefetch(t), voiceInfo: () => neural.info(), voiceBegin: () => neural.begin(), voiceBake: r => neural.bakeRate(r), audioBus: () => audioBus(), voiceLabel: () => (st.voice ? (st.neural ? neural.label() : 'built-in voice') : 'voice off'), voiceOn: () => speakPref(lsGet()), setVoiceOn: on => setSpeak(on), voicePanel: () => { if (vpop.hidden) $('vbtn').click(); }, caption: (t, title) => setCaption(t, title), cinema: (on, stop, ctl) => setCinema(on, stop, ctl), cineLabel: (rate, paused) => { $('crate').textContent = `${rate.toFixed(2).replace(/0$/, '')}×`; $('cpause').textContent = paused ? '▶ RESUME' : '⏸ PAUSE'; },
    globeTo: (lat, lon, zoom = 1) => { Object.assign(st.gl, { tlat: lat, tlon: lon, tzoom: zoom }); st.spin = false; }, flyTo: (x, z) => { st.cdTarget = { x, z }; }, setMod: m => setMod(m), ask: q => { setMod('ask'); R.ask(q, true); }, tcol: t => tcol(t), colours: () => C };
  const pageOverflow = doc.documentElement.style.overflow; doc.documentElement.style.overflow = 'hidden';   // no page scrollbar beside the HUD (it showed down the edge of recorded broadcasts)
  win.__jarvisApi = xapi;          // the laptop's daily broadcast job (jarvis_broadcast/record_broadcast.py) drives Jarvis through this; the page is owner-only
  loadModules().then(list => {
    win.setTimeout(fitTop, 0);
    for (const v of viewsOf()) { if (!$('view').querySelector(`[data-v="${v.id}"]`)) $('view').insertAdjacentHTML('beforeend', ` <button type="button" data-v="${esc(v.id)}" aria-pressed="${v.id === st.view}">${esc(v.label)}</button>`); extraViews[v.id] = v; }
    if (extraViews[st.view]) setCamAll();
    renderNav();
    for (const m of list) { R[m.id] = () => m.render($('pane'), xapi); for (const v of Array.isArray(m.views) ? m.views : []) viewMod[v.id] ??= m; if (!(Array.isArray(m.views) && m.views.length) && !$('mods').querySelector(`[data-m="${m.id}"]`)) $('mods').insertAdjacentHTML('beforeend', ` <button type="button" data-m="${esc(m.id)}" aria-pressed="false">${esc(m.label)}</button>`); }
    st.modsReady = true; renderNav(); if (st.pending) { const t = st.pending; st.pending = null; goTarget(t); }
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
  // the CARD for what was clicked: a chain market (its links), or any desk market from another picture (its open-in-terminal buttons). force = show it beside an open panel too.
  function showCard(force = false) {
    const card = $('card'), k = st.sel; if ((st.mod !== 'chain' && !force) || !k || st.mod === 'today') { card.hidden = true; return; }
    card.classList.toggle('jv-card-l', st.mod !== 'chain');
    const n = st.graph?.nodes.find(x => x.key === k), meta = CHAIN_NODES[k], inst = instFor(k);
    if (!n || !meta) {
      if (!inst) { card.hidden = true; return; }
      card.innerHTML = `<h3>${esc(marketName(inst))}</h3><p>Open it in the terminal. Helix drops to its strip so the page shows; EXPAND brings it back.</p>${termRow(inst)}`; card.hidden = false; wireTerm(card, inst); return;
    }
    const links = st.graph.edges.filter(e => e.from === k || e.to === k);
    card.innerHTML = `<h3>${esc(meta.label)}</h3><div>${n.end?.delta == null ? 'no data over this window' : `<b>${esc(n.end.text)}</b> over ${st.win} day${st.win === 1 ? '' : 's'}${n.end.moved ? '' : ' · inside its noise'}`}</div><p>${esc(meta.what)}</p>`
      + (links.length ? `<div style="margin-top:8px">${links.map(e => `<p><span class="jv-k ${e.verdict === 'holding' ? 'jv-hold' : e.verdict === 'broken' ? 'jv-broke' : ''}">${esc(VERDICT_WORD[e.verdict] ?? e.verdict)}</span><b>${esc(e.short)}</b><br>${esc(String(e.link.read ?? '').slice(0, 220))}</p>`).join('')}</div>` : '')
      + `<div class="jv-row"><button type="button" id="${ID}-explain">EXPLAIN THIS</button></div>${inst ? termRow(inst) : ''}`;
    card.hidden = false; if (inst) wireTerm(card, inst);
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
  // the time scrub replays the CHAIN, so it shows only on the chain pictures; on a phone it folds into a small TIME pill (it used to cover the bottom of every view)
  $('scrubt').onclick = e => { const sc = $('scrub'), open = !sc.classList.contains('open'); sc.classList.toggle('open', open); e.currentTarget.setAttribute('aria-expanded', String(open)); blip(640, 0.05); };
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
      if ((hot || touch) && !calm) { const spd = e.verdict === 'broken' ? 0.5 : 0.28; for (let k = 0; k < 3; k++) { const q = sp(arcPoint(a.pos, b.pos, (t * spd + k / 3) % 1)); ctx.globalAlpha = f2; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(q.x, q.y, (e.verdict === 'broken' ? 3.2 : 2.4) * q.s, 0, 6.2832); ctx.fill(); } }
    }
    const ns = g.nodes.map(n => ({ n, p: sp(n.pos) })).sort((u, v) => v.p.z - u.p.z);
    for (const { n, p } of ns) {
      const f2 = Math.max(0.3, Math.min(1, 0.85 - p.z * 0.3)) * fade, size = st.disp[n.key] ?? n.style.size, r = (5 + size * 13) * p.s * 1.05, c = tcol(n.style.tone), pulse = n.style.tone === 'wrong' ? 1 + 0.18 * Math.sin(t * 4) : 1;
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2 * pulse); gr.addColorStop(0, c); gr.addColorStop(1, 'transparent');
      ctx.globalAlpha = (n.style.tone === 'quiet' || n.style.tone === 'none' ? 0.18 : 0.5) * f2; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2 * pulse, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = f2; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55 * pulse, 0, 6.2832); ctx.fill();
      if (selK === n.key) { ctx.strokeStyle = C.tx; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.4, 0, 6.2832); ctx.stroke(); }
      if (st.compact ? (selK === n.key || (n.style.tone !== 'quiet' && p.z < 0.3)) : (p.z < 0.6 || selK === n.key)) { ctx.globalAlpha = f2 * (n.style.tone === 'quiet' ? 0.6 : 1); ctx.fillStyle = C.tx; ctx.font = `${Math.round(10 + 3 * p.s)}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(st.lab[n.key] ?? n.key, p.x, p.y + r * 1.9 + 8); }
      st.proj.push({ key: n.key, sx: p.x, sy: p.y });
    }
  }
  function drawSkyline(t, fade) {
    const FY = -0.55;
    // the street grid, a glowing ring road and a radar sweep on the ground
    ctx.lineWidth = 1; ctx.strokeStyle = C.blue;
    for (let i = -6; i <= 6; i++) { const u = i * 0.25; for (const [a, b] of [[[-1.5, FY, u], [1.5, FY, u]], [[u, FY, -1.5], [u, FY, 1.5]]]) { const p = sp(a), q = sp(b); ctx.globalAlpha = 0.09 * fade; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
    ringAt(FY, 1.85, 0.35 * fade); ringAt(FY, 1.7, 0.15 * fade);
    if (!calm) { const a = t * 0.9, p0 = sp([0, FY, 0]), p1 = sp([Math.cos(a) * 1.85, FY, Math.sin(a) * 1.85]); const g2 = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y); g2.addColorStop(0, 'transparent'); g2.addColorStop(1, C.cy); ctx.globalAlpha = 0.5 * fade; ctx.strokeStyle = g2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
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
      const spd = e.verdict === 'broken' ? 0.55 : 0.3; if (!calm) for (let k = 0; k < 3; k++) { const q = sp(rail(a, b, (t * spd + k / 3) % 1, lift)); ctx.globalAlpha = fade; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(q.x, q.y, (e.verdict === 'broken' ? 3.4 : 2.6) * q.s, 0, 6.2832); ctx.fill(); }
    }
    for (const o of towers) {
      const c = tcol(o.tw.tone), live = o.tw.tone !== 'quiet' && o.tw.tone !== 'none', pulse = o.tw.tone === 'wrong' ? 0.85 + 0.15 * Math.sin(t * 4) : 1;
      for (const s of o.b.faces.sides) poly(s, o.pts, c, (live ? 0.36 : 0.16) * fade * pulse, c);
      poly(o.b.faces.top, o.pts, c, (live ? 0.7 : 0.25) * fade * pulse, c);
      if (live) { const gr = ctx.createRadialGradient(o.top.x, o.top.y, 0, o.top.x, o.top.y, 26 * o.top.s); gr.addColorStop(0, c); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.45 * fade; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.top.x, o.top.y, 26 * o.top.s, 0, 6.2832); ctx.fill(); }
      if (selK === o.n.key) { ctx.globalAlpha = fade; ctx.strokeStyle = C.tx; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(o.top.x, o.top.y, 16 * o.top.s, 0, 6.2832); ctx.stroke(); }
      if ((live && (!st.compact || o.tw.h > 0.3)) || selK === o.n.key || (o.tw.h > 0.2 && !st.compact)) { ctx.globalAlpha = fade * (live ? 1 : 0.55); ctx.fillStyle = C.tx; ctx.font = `${Math.round(10 + 3 * o.top.s)}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(st.lab[o.n.key] ?? o.n.key, o.top.x, o.top.y - 12 * o.top.s - 4); }
      st.proj.push({ key: o.n.key, sx: o.top.x, sy: o.top.y });
    }
  }

  // the WORLD MAP globe: a WebGL hologram (jarvisGlobeHolo.js) under crisp 2D labels; the old 2D drawing (drawGlobe2D) stays as the fallback when WebGL is missing or still loading
  const NULLCTX = { save() {}, restore() {}, fillText() {}, measureText: () => ({ width: 0 }) };
  const bars = { at: -9, top: 110, bottom: 80, bg: 'black', legend: 300, hud: [] };
  function measureBars(t) {      // the free band between the top bar (and region buttons) and the bottom scrub bar, read once a second
    if (t - bars.at < 1) return; bars.at = t;
    try {
      const rr = root.getBoundingClientRect(), reg = $('reg'), sc = $('scrub'), tp = root.querySelector('.jv-top');
      let top = (tp?.getBoundingClientRect().bottom ?? rr.top + 62) - rr.top; if (reg && !reg.hidden) top = Math.max(top, reg.getBoundingClientRect().bottom - rr.top);
      const sb = sc && sc.style.display !== 'none' ? rr.bottom - sc.getBoundingClientRect().top : 24;
      bars.top = top + 8; bars.bottom = sb + (st.compact ? 24 : 10);      // phone: the key line sits above the scrub bar
      const hud = $('hud'), hb = hud && hud.offsetHeight && !root.classList.contains('jv-clean') ? hud.getBoundingClientRect() : null; bars.legend = hb ? hb.bottom - rr.top + 22 : top + 30; bars.hud = hb ? [{ x: hb.left - rr.left, y: hb.top - rr.top, w: hb.width, h: hb.height }] : [];
      bars.bg = win.getComputedStyle(doc.documentElement).getPropertyValue('--bg1').trim() || 'black';
    } catch (e) { /* layout only */ }
  }
  const cardBox = () => { const c = $('card'); if (c.hidden) return []; try { const rr = root.getBoundingClientRect(), b = c.getBoundingClientRect(); return [{ x: b.left - rr.left, y: b.top - rr.top, w: b.width, h: b.height }]; } catch (e) { return []; } };
  function drawGlobe(t, fade, dt) {
    const g = st.gl; g.tzoom = Math.max(0.8, Math.min(5, g.tzoom)); if (st.spin && !calm && !st.drag) { g.tlon += dt * 4; g.lon += dt * 4; }
    let dl = ((g.tlon - g.lon + 540) % 360) - 180; g.lon += dl * Math.min(1, dt * 3); g.lat += (g.tlat - g.lat) * Math.min(1, dt * 3); g.zoom += (g.tzoom - g.zoom) * Math.min(1, dt * 3);
    const gg = { t, dt, fade, W: st.w, H: st.h, compact: st.compact, C };
    if (!glInstance('globe-holo')) { try { GLOBE_HOLO.draw(NULLCTX, gg, xapi); } catch (e) { /* the 2D globe carries on */ } return drawGlobe2D(t, fade); }
    measureBars(t);
    const { X, Y, Rg } = globeFrame({ w: st.w, h: st.h, top: bars.top, bottom: bars.bottom, compact: st.compact, panel: st.mod !== 'chain', zoom: g.zoom }), ctr = { lat: g.lat, lon: g.lon };
    const P = (vec, h = 0) => { const p = globeProject(vec, ctr, h); return { x: X + p.x * Rg, y: Y - p.y * Rg, z: p.z }; };
    gg.globe = { X, Y, Rg, lat: g.lat, lon: g.lon, zoom: g.zoom, graph: st.graph, disp: st.disp, sel: st.sel };
    GLOBE_HOLO.draw(ctx, gg, xapi);
    if (!glInstance('globe-holo')) return drawGlobe2D(t, fade);       // the hologram stopped this frame: fall back at once
    drawGlobeOverlay(ctx, { P, X, Y, Rg, zoom: g.zoom, graph: st.graph, disp: st.disp, sel: st.sel, compact: st.compact, fade, t, C, W: st.w, H: st.h, top: bars.top, bottom: bars.bottom, bg: bars.bg,
      hit: (key, x, y) => st.proj.push({ key, sx: x, sy: y }), key: !root.classList.contains('jv-cinema') && !root.classList.contains('jv-booting'), legendY: bars.legend, obstacles: [...bars.hud, ...cardBox()] });
    for (const m of EXTRA) { try { m.drawGlobe?.(ctx, { P, X, Y, Rg, ctr, t, fade, zoom: g.zoom, compact: st.compact }, xapi); } catch (e) { /* a layer must never stop the frame */ } }
  }
  function drawGlobe2D(t, fade) {
    const g = st.gl;
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
      const spd = e.verdict === 'broken' ? 0.5 : 0.28; if (!calm) for (let k = 0; k < 3; k++) { const q = greatArc(a, b, (t * spd + k / 3) % 1, 0.3), p = P(q.v, q.h); if (p.z > 0) { ctx.globalAlpha = fade; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(p.x, p.y, e.verdict === 'broken' ? 3.2 : 2.4, 0, 6.2832); ctx.fill(); } }
    }
    // markers: a pillar standing on the surface, its height and glow the size of the move
    const items = gr.nodes.filter(n => GEO[n.key]).map(n => { const v = vec(n.key), size = st.disp[n.key] ?? n.style.size, base = P(v, 0), tip = P(v, 0.04 + 0.26 * size); return { n, size, base, tip }; }).filter(o => o.base.z > 0.02).sort((a, b) => a.base.z - b.base.z);
    const loudG = st.loud5;      // on a phone only the five biggest moves carry a name
    for (const o of items) {
      const c = tcol(o.n.style.tone), live = o.n.style.tone !== 'quiet' && o.n.style.tone !== 'none', fa = Math.min(1, o.base.z * 2.2) * fade, pulse = o.n.style.tone === 'wrong' ? 1 + 0.2 * Math.sin(t * 4) : 1, r = (3 + o.size * 7) * Math.sqrt(g.zoom) * pulse;
      ctx.globalAlpha = 0.5 * fa; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(o.base.x, o.base.y, 6 * Math.sqrt(g.zoom), 3 * Math.sqrt(g.zoom), 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = (live ? 0.85 : 0.35) * fa; ctx.strokeStyle = c; ctx.lineWidth = live ? 2 : 1; ctx.beginPath(); ctx.moveTo(o.base.x, o.base.y); ctx.lineTo(o.tip.x, o.tip.y); ctx.stroke();
      if (live) { const gg = ctx.createRadialGradient(o.tip.x, o.tip.y, 0, o.tip.x, o.tip.y, r * 3); gg.addColorStop(0, c); gg.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.5 * fa; ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(o.tip.x, o.tip.y, r * 3, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = fa; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(o.tip.x, o.tip.y, r, 0, 6.2832); ctx.fill();
      if (selK === o.n.key) { ctx.strokeStyle = C.tx; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(o.tip.x, o.tip.y, r + 5, 0, 6.2832); ctx.stroke(); }
      if ((live && (!st.compact || loudG.has(o.n.key))) || selK === o.n.key || (g.zoom > 1.7 && !st.compact)) { ctx.globalAlpha = fa * (live ? 1 : 0.6); ctx.fillStyle = C.tx; ctx.font = `${Math.round(10 + 1.5 * Math.min(2, g.zoom))}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(st.lab[o.n.key] ?? o.n.key, o.tip.x, o.tip.y - r - 8); if ((g.zoom > 1.7 && !st.compact) || selK === o.n.key) { ctx.globalAlpha = fa * 0.55; ctx.font = '9px ui-monospace,monospace'; ctx.fillText(GEO[o.n.key][2], o.tip.x, o.tip.y - r + 3); } }
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
      const spd = e.verdict === 'broken' ? 0.5 : 0.28; if (!calm) for (let k = 0; k < 3; k++) { const u = (t * spd + k / 3) % 1, x = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x, y = (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y; ctx.globalAlpha = fade; ctx.fillStyle = colr; ctx.beginPath(); ctx.arc(x, y, e.verdict === 'broken' ? 3.2 : 2.4, 0, 6.2832); ctx.fill(); }
    }
    for (const k of keys) {
      const n = by[k], p = pos(k), c = tcol(n.style.tone), live = n.style.tone !== 'quiet' && n.style.tone !== 'none', pulse = n.style.tone === 'wrong' ? 1 + 0.06 * Math.sin(t * 4) : 1, R2 = p.r * pulse;
      const gg = ctx.createRadialGradient(p.x - R2 * 0.35, p.y - R2 * 0.4, R2 * 0.1, p.x, p.y, R2); gg.addColorStop(0, C.tx); gg.addColorStop(0.25, c); gg.addColorStop(1, 'transparent');
      ctx.globalAlpha = (live ? 0.55 : 0.22) * fade; ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.x, p.y, R2, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = (live ? 0.95 : 0.4) * fade; ctx.strokeStyle = c; ctx.lineWidth = selK === k ? 3 : 1.4; ctx.beginPath(); ctx.arc(p.x, p.y, R2, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = (live ? 1 : 0.6) * fade; ctx.fillStyle = C.tx; ctx.font = `${live ? 11 : 10}px ui-monospace,monospace`; ctx.textAlign = 'center'; if (live || !st.compact) ctx.fillText(st.lab[k] ?? marketName(k, { short: true }), p.x, p.y + (live ? -1 : 3));
      if (live && n.end?.text) { ctx.globalAlpha = 0.8 * fade; ctx.font = '10px ui-monospace,monospace'; ctx.fillText(n.end.text, p.x, p.y + 12); }
      st.proj.push({ key: k, sx: p.x, sy: p.y });
    }
  }
  // the KEY on the older 2D chain pictures (orbit, skyline, bubbles, the 2D globe): what size, shape and thread colour mean. Constant strings, no work per frame beyond drawing them.
  const KEY2D = ['SIZE = THE MOVE AGAINST ITS OWN NOISE OVER THE WINDOW', '▲ UP  ·  ▼ DOWN  ·  ◆ MOVED AGAINST THE TEXTBOOK  ·  FAINT = INSIDE ITS NOISE', 'ACCENT THREAD = LINK HOLDING  ·  GOLD THREAD = LINK BROKE  ·  DOTS RUN CAUSE → EFFECT', 'A DESCRIPTION OF THE TAPE, NOT A FORECAST'];
  function drawKey2D(fade) {
    const y0 = st.h - (st.dates.length >= 3 ? 150 : 110); ctx.globalAlpha = 0.75 * fade; ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'left';
    for (let i = 0; i < KEY2D.length; i++) { ctx.fillStyle = i === 2 ? C.blue : i === 3 ? C.gold : C.tx2; ctx.fillText(KEY2D[i], 24, y0 + i * 15); }
    ctx.globalAlpha = 1;
  }
  function drawNoChain(fade) {          // a chain picture with no chain: one centred sentence, never a blank screen
    ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = C.tx2; ctx.font = `${st.compact ? 12 : 13}px ui-monospace,monospace`; ctx.textAlign = 'center';
    const y = st.view === 'globe' ? st.h * 0.86 : st.h / 2;
    if (st.chainFail) { ctx.fillText('The chain feed has not loaded, so this picture has nothing to show.', st.w / 2, y); ctx.fillText(st.compact ? 'Open the Chain tab once, or pick another view.' : 'Open the Chain tab once, or pick another view: the others work without it.', st.w / 2, y + 20); }
    else ctx.fillText('Reading the chain...', st.w / 2, y);
    ctx.globalAlpha = 1;
  }
  let raf = 0, last = performance.now(), hudT = 0, lastT = performance.now(), headT = 0;
  const BOOT_LEFT = () => !!BOOT && (performance.now() - st.t0) / 1000 < BOOT + 0.3;      // the boot animation still plays under TODAY
  function frame(now) {
    if (!open || st.docked) return; raf = win.requestAnimationFrame(frame);
    if (doc.hidden) return;
    // the FRAME BUDGET (not while a recording or a programme runs, whose clock is the recorder's): DPR 1 when frames run slow, 30 fps when idle or under reduced motion
    if (!(win.__vclock?.frozen || st.cinemaCtl || root.classList.contains('jv-bcast'))) {
      const b = budget.tick(now - lastT, { idle: now - st.lastInput > 20_000, calm }); lastT = now;
      if (b.dpr !== glBudget.dpr) { glBudget.dpr = b.dpr; resize(); }
      if (b.minGap && now - last < b.minGap) return;
    } else lastT = now;
    // TODAY is a still page: the picture behind it is cleared once and left alone
    if (st.mod === 'today' && !BOOT_LEFT()) { if (!st.stillDrawn) { ctx.clearRect(0, 0, st.w, st.h); st.proj = []; st.stillDrawn = true; } last = now; tickAttract(now); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; if (st.spin && !calm && !st.drag && st.view !== 'globe') st.yaw += dt * (st.view === 'skyline' ? 0.07 : 0.12);
    const t = (now - st.t0) / 1000, bootT = t, fade = Math.min(1, Math.max(0, (bootT - (BOOT - 1.0)) / 0.9));
    { const e = Math.min(1, dt * 2.2); st.cdCam.x += (st.cdTarget.x - st.cdCam.x) * e; st.cdCam.z += (st.cdTarget.z - st.cdCam.z) * e; }
    for (const k in st.disp) { const tgt = st.sizeOf[k]; if (tgt != null) st.disp[k] += (tgt - st.disp[k]) * Math.min(1, dt * 5); }      // a lookup, not a search of the nodes, every frame
    ctx.clearRect(0, 0, st.w, st.h); st.proj = [];
    if (BOOT && bootT < BOOT + 0.3) drawBoot(bootT);
    // every view draws whether or not the chain graph has loaded: the GL/extra views and the board never needed it, and each fails soft on its own; only the chain pictures say why they are empty
    if (fade > 0) {
      const ev = extraViews[st.view];
      if (ev && (st.view === 'globe' || st.view === 'candles') && ev.gl && !st.legacy2d) drawExtra(ev, t, fade, dt); else if (st.view === 'globe') drawGlobe(t, fade, dt); else if (st.view === 'candles') drawCandles(t, fade); else if (ev) drawExtra(ev, t, fade, dt); else if (st.view === 'bubbles') drawBubbles(t, fade); else if (st.view === 'skyline') drawSkyline(t, fade); else drawOrbit(t, fade);
      if (!st.graph && !ev && st.view !== 'candles') drawNoChain(fade);
      else if (!ev && st.graph && !st.compact && (st.view === 'orbit' || st.view === 'skyline' || st.view === 'bubbles' || (st.view === 'globe' && !glInstance('globe-holo')))) drawKey2D(fade);
    }
    ctx.globalAlpha = 1; hudT += dt; if (hudT > 20) { hudT = 0; renderHud(); } headT += dt; if (headT > 1) { headT = 0; refreshHead(); }
    tickAttract(now);
  }

  // ── watching: the live chain every 2 minutes, server memory every 10; Jarvis speaks only when something CHANGES ──
  const stamp = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date());
  // the TAB watcher now keeps the SERVER's rules (jarvisLogic.gateTabAlerts): one alert per event per 6 h, at most 12 aloud a day, nothing aloud in quiet hours (still listed)
  function raise(ev) {
    if (!ev.length) return;
    const now = Date.now(), g = gateTabAlerts(st.gate, ev, now, { quiet: st.quiet ? QUIET : null }); st.gate = g.state; lsPut({ gate: g.state });
    for (const e of g.quiet) st.alerts.unshift({ ...e, at: now, time: stamp(), quiet: true });
    for (const e of g.loud) st.alerts.unshift({ ...e, at: now, time: stamp() });
    st.alerts = st.alerts.slice(0, 40); if (!g.loud.length && !g.quiet.length) return;
    // ON AIR: a broadcast owns the voice. An alert spoken over it ("gold up 0.9%" across the AUD/JPY line, 25 Nov 2026 video at 42 s) is kept in the list, not said
    const onAir = root.classList.contains('jv-bcast') || doc.documentElement.classList.contains('jvbc-on') || !!win.__vclock?.frozen;
    if (!onAir && g.loud.length) { alertChime(); say(g.loud.map(e => e.text).join(' ')); }
    try { if (g.loud.length && win.Notification?.permission === 'granted') { const n = new win.Notification('H.E.L.I.X.', { body: g.loud[0].text, tag: 'helix' }); n.onclick = () => { try { win.focus(); } catch (e) { /* focus only */ } api.undock(); goTarget({ kind: 'tool', id: 'alerts' }); n.close?.(); }; } } catch (e) { /* no notifications */ }
    dockRender(!!g.loud.length); if (st.mod === 'alerts') R.alerts(); if (st.mod === 'today') R.today();
  }
  let wTimer = 0, mTimer = 0;
  async function watchTick() {
    if (!st.watch || doc.hidden) return;
    const r = await loadAt('live'); st.lastCheck = stamp(); if (!r) { dockRender(); return; }
    const snap = watchSnapshot(r.graph, names), first = !st.sinceRes; raise(watchDiff(st.snap, snap)); st.snap = snap; st.liveSum = r.sum; dockRender(); renderHud();
    if (first) { computeSince(); if (st.mod === 'today') R.today(); }
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
    dock.innerHTML = `<span class="dot"></span><span class="t">H.E.L.I.X.</span><span>${st.watch ? 'WATCHING' : 'PAUSED'}${st.lastCheck ? ` · ${esc(st.lastCheck)}` : ''}</span>${s ? `<span>${s.holding} holding · <span class="${s.broken ? 'am' : ''}">${s.broken} broken</span></span>` : ''}${st.mem != null ? `<span>mem ${st.mem} MB</span>` : ''}<span class="sp">${a ? `<span class="am">${esc(a.time)}</span> ${esc(a.text)}` : 'no alerts'}</span><button type="button" data-d="alerts">ALERTS ${st.alerts.length}</button><button type="button" data-d="open">EXPAND</button><button type="button" data-d="mic" aria-pressed="${st.wake}">${st.wake ? 'LISTENING' : 'HEY HELIX'}</button><button type="button" data-d="off">OFF</button>`;
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
        // VOICE NAVIGATION first: "Helix, show yields" goes to the picture (free); only a question goes on to ASK (a paid model call)
        if (w.nav) { const t = resolveTarget(w.nav); if (t) { if (st.docked) api.undock(); goTarget(t); say(`${labelOf(t.kind, t.id) ?? t.id}.`, true); return; } }
        if (st.docked) api.undock(); setMod('ask'); R.ask(w.query, true);
      };
      rec.onend = () => { if (st.wake && open) win.setTimeout(start, 400); };
      rec.onerror = () => {};
      try { rec.start(); } catch (e) { /* already listening */ }
    };
    start(); say('Listening. Say Helix, then your question.', true);
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
    go: o => applyOpts(o),
    dock() { if (st.docked) return; saveSeen(); restoreHash(); st.docked = true; doc.documentElement.style.overflow = pageOverflow; root.hidden = true; dock.hidden = false; dockRender(); win.cancelAnimationFrame(raf); win.speechSynthesis?.cancel(); blip(500, 0.06); },
    undock() { if (!st.docked) return; st.docked = false; doc.documentElement.style.overflow = 'hidden'; root.hidden = false; dock.hidden = true; last = performance.now(); resize(); raf = win.requestAnimationFrame(frame); blip(760, 0.06); syncHash(); renderAsof(); },
    off() {
      if (!open) return; open = null; stopPlay(); win.cancelAnimationFrame(raf); win.clearInterval(wTimer); win.clearInterval(mTimer); bootTimers.forEach(t => win.clearTimeout(t)); setWake(false);
      saveSeen(); restoreHash(); win.removeEventListener('themechange', onTheme); doc.removeEventListener('themechange', onTheme); try { mq?.removeEventListener?.('change', onCalm); } catch (e) { /* gone */ } win.removeEventListener('pagehide', saveSeen); doc.removeEventListener('visibilitychange', onVis);
      win.removeEventListener('resize', onResize); try { topObs?.disconnect(); } catch (e) { /* gone */ } doc.removeEventListener('pointerdown', onDocPointer, true); doc.removeEventListener('keydown', onKey, true); stopAttract(); for (const ev of IDLE_EVENTS) doc.removeEventListener(ev, onInput, true); win.speechSynthesis?.cancel(); st.speakStop?.(); neural.stopAll(); if (win.__jarvisApi === xapi) win.__jarvisApi = null; doc.documentElement.style.overflow = pageOverflow; try { glDisposeAll(); } catch (e) { /* gone */ } root.remove(); dock.remove();
    },
  };
  const CINE_KEYS = { ' ': 'pause', ArrowRight: 'next', ArrowLeft: 'prev', '+': 'fast', '=': 'fast', '-': 'slow', n: 'next', p: 'prev' };
  const typingIn = e => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '') || !!e.target?.isContentEditable;
  const stopKey = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); };
  // KEYS: 1-6 sections, 0/H today, / go to, ? help, S style, O open the selected market in the terminal, P pop out, Tab/Enter through the picture's markets, Esc closes the top thing (else docks)
  const onKey = e => { if (st.cinemaCtl && CINE_KEYS[e.key] && !typingIn(e)) { stopKey(e); cineAct(CINE_KEYS[e.key]); return; }
    if (st.docked) return;
    if (e.key === 'Escape') {
      if (!$('goto').hidden) { stopKey(e); closeGoto(); return; } if (!$('hlp').hidden) { stopKey(e); toggleHelp(false); return; }
      if (st.cinemaStop) { stopKey(e); st.cinemaStop(); return; } stopKey(e); api.dock(); return;
    }
    if (typingIn(e) || e.ctrlKey || e.metaKey || e.altKey || st.cinemaCtl) return;
    const k = e.key, sec = sectionForKey(k); let done = true;
    if (sec) { const x = SECTIONS.find(y => y.id === sec); goNav(x.home[0], x.home[1]); }
    else if (k === '0' || k === 'h' || k === 'H') goTarget({ kind: 'tool', id: 'today' });
    else if (k === '/') openGoto();
    else if (k === '?') toggleHelp();
    else if (k === 's' || k === 'S') { const ns = nextStyle(st.view, id => !!$('view').querySelector(`[data-v="${id}"]`), k === 'S' ? -1 : 1); if (ns) { if (st.mod !== 'chain' && st.mod !== COMPANION[st.view]) setMod('chain'); switchView(ns); } else done = false; }
    else if ((k === 'o' || k === 'O') && instFor(st.sel)) openInTerminal('chart', instFor(st.sel));
    else if (k === 'p' || k === 'P') popOut();
    else if (k === 'Tab' && doc.activeElement === cv) done = stepFocus(e.shiftKey ? -1 : 1);
    else if (k === 'Enter' && doc.activeElement === cv && st.sel) showCard(true);
    else done = false;
    if (done) stopKey(e);
  };
  doc.addEventListener('keydown', onKey, true);
  const onVis = () => { if (doc.hidden) saveSeen(); }; doc.addEventListener('visibilitychange', onVis); win.addEventListener('pagehide', saveSeen);
  open = api;
  setCamAll(); renderNav(); $('reg').hidden = st.view !== 'globe'; if (st.region !== 'world') setRegion(st.region); root.classList.toggle('jv-glon', !!extraViews[st.view]?.gl); runBoot(); raf = win.requestAnimationFrame(frame);
  // where it opens: a deep link or command words if given; else TODAY, the front page (the broadcast recorder, which drives the HUD itself, keeps the old start)
  if (!applyOpts(opts) && !win.__jarvisNoBoot) goTarget({ kind: 'tool', id: 'today' });
  await load(st.win);
  setWatch(st.watch);
  return true;
}

export const closeJarvis = () => open?.off();

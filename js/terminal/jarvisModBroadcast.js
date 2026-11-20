// js/terminal/jarvisModBroadcast.js: MORNING BROADCAST, the morning review played as a TV-news package over the hologram views, in Jarvis's natural voice.
// The programme: a cold open (a hologram title sequence), THE LEAD (the top three things that matter this morning, each on a full-screen card with its number), then numbered segments with a
// bumper card each (Markets, The Chain, Rates, Currencies, Volatility, Positioning, The Day Ahead; each plays the first view that exists, a segment with nothing is skipped), and a sign-off card.
// Broadcast graphics throughout, drawn as DOM inside the HUD root so RECORD AS VIDEO (tab capture) gets them: a lower-third (segment and the line's key number), a ticker crawl of the desk's
// markets with their move against their usual move, a corner bug, and broadcast subtitles of the spoken line (the HUD's own caption is hidden while it runs).
// The voice LEADS, as in the SHOW: the picture moves on only when the line has been spoken (or skipped). Back / skip / pause / speed / Esc work as in the SHOW, and the SHOW's recorder is reused.
// Words, lead, segment plan, ticker and subtitles: broadcastCore.js (templates over numbers, no model call). DESCRIPTION ONLY: nothing in it is a forecast, a signal or a trade.
import { registerJarvisModule, viewsOf } from './jarvisModules.js';
import { SHOW_HOOKS } from './showCore.js';
import { planBroadcast, wantedSceneIds, subtitleChunks, chunkAt, itemSeconds, durText, tickerText, dateWords } from './broadcastCore.js';
import { boardSummary, topMovers } from './jarvisCandles.js';
import { enterScene, sceneMotion, makeRecorder } from './jarvisModShow.js';

const LS = 'jarvisBroadcast:v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } };
const lsPut = o => { try { localStorage.setItem(LS, JSON.stringify({ ...lsGet(), ...o })); } catch (e) { /* private window */ } };
const CORE_VIEWS = ['globe', 'candles', 'skyline', 'bubbles', 'orbit'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The broadcast graphics. Colours are the theme tokens; the accent (--jva) follows the view on screen, so the graphics take each segment's colour.
const css = R => `
#${R}.jv-bcast .jv-cap{display:none!important}
#${R}.jv-bcast .jv-cine{top:20px;bottom:auto;left:auto;right:200px;transform:none}#${R}.jv-bcast.jv-compact .jv-cine{top:44px;bottom:auto;left:8px;right:8px;width:auto}
#${R} .bc{position:absolute;inset:0;z-index:5;pointer-events:none;--bcs:"Inter","Segoe UI","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;--bca:var(--jva,var(--blue2));--tc:var(--tx);--dur:60s;color:var(--tx);font-family:var(--bcs)}
#${R} .bc *{box-sizing:border-box}
#${R} .bc .mono{font-family:var(--mono,ui-monospace,monospace)}
/* corner bug */
#${R} .bc-bug{position:absolute;left:22px;top:18px;display:flex;align-items:center;gap:10px;font:600 11px/1 var(--mono,monospace);letter-spacing:.2em;color:var(--tx);padding:7px 12px 7px 10px;border-left:2px solid var(--bca);background:linear-gradient(90deg,color-mix(in srgb,var(--bg) 78%,transparent),transparent);opacity:0;transition:opacity .8s ease}
#${R} .bc.on .bc-bug{opacity:.92}#${R} .bc-bug i{width:7px;height:7px;border-radius:50%;background:var(--dn);box-shadow:0 0 8px var(--dn);animation:bc-pulse 1.6s infinite}
#${R} .bc-bug .clk{color:var(--tx2);font-weight:400}#${R} .bc-bug .d{color:var(--bca)}
@keyframes bc-pulse{50%{opacity:.25}}
/* veil for cross-fades and the wipe flash */
#${R} .bc-veil{position:absolute;inset:0;background:var(--bg);opacity:0;transition:opacity .32s ease}#${R} .bc-veil.on{opacity:.9}
#${R} .bc-wipe{position:absolute;top:0;bottom:0;left:-30%;width:26%;opacity:0;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--bca) 26%,transparent) 45%,color-mix(in srgb,white 40%,var(--bca)) 50%,color-mix(in srgb,var(--bca) 26%,transparent) 55%,transparent);filter:blur(2px)}
#${R} .bc-wipe.go{animation:bc-wipe .7s cubic-bezier(.5,0,.3,1)}@keyframes bc-wipe{0%{left:-30%;opacity:0}15%{opacity:1}100%{left:105%;opacity:0}}
/* full-screen cards */
#${R} .bc-card{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .55s ease,visibility 0s .55s}
#${R} .bc-card.on{opacity:1;visibility:visible;transition:opacity .55s ease}
#${R} .bc-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 2px,color-mix(in srgb,var(--bca) 6%,transparent) 2px 3px);pointer-events:none}
/* cold open + sign-off */
#${R} .bc-open,#${R} .bc-close{background:radial-gradient(ellipse at 50% 50%,color-mix(in srgb,var(--bg) 55%,transparent) 0%,color-mix(in srgb,var(--bg) 92%,transparent) 70%)}
#${R} .bc-tc{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1100px,92vw);text-align:center}
#${R} .bc-ring{position:absolute;left:50%;top:50%;width:min(620px,86vw);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;border:1px solid color-mix(in srgb,var(--bca) 30%,transparent);box-shadow:0 0 60px color-mix(in srgb,var(--bca) 12%,transparent),inset 0 0 60px color-mix(in srgb,var(--bca) 10%,transparent)}
#${R} .bc-ring::before,#${R} .bc-ring::after{content:"";position:absolute;inset:7%;border-radius:50%;border:1px dashed color-mix(in srgb,var(--bca) 35%,transparent);animation:bc-spin 40s linear infinite}
#${R} .bc-ring::after{inset:-6%;border:2px solid transparent;border-top-color:color-mix(in srgb,var(--bca) 70%,transparent);border-bottom-color:color-mix(in srgb,var(--bca) 25%,transparent);animation-duration:9s;animation-direction:reverse}
@keyframes bc-spin{to{transform:rotate(360deg)}}
#${R} .bc-kick{font:500 13px/1 var(--mono,monospace);letter-spacing:.9em;padding-left:.9em;color:var(--bca);text-shadow:0 0 14px var(--bca)}
#${R} .bc-h1{margin:22px 0 0;font-weight:200;font-size:clamp(30px,6vw,84px);line-height:1.02;letter-spacing:.12em;padding-left:.12em;color:var(--tx);text-shadow:0 0 28px color-mix(in srgb,var(--bca) 70%,transparent),0 0 2px white}
#${R} .bc-h1 b{font-weight:600;color:color-mix(in srgb,white 70%,var(--bca))}
#${R} .bc-date{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:26px;font:500 14px/1 var(--mono,monospace);letter-spacing:.42em;color:var(--tx2)}
#${R} .bc-date::before,#${R} .bc-date::after{content:"";height:1px;width:min(120px,14vw);background:linear-gradient(90deg,transparent,var(--bca))}#${R} .bc-date::after{transform:scaleX(-1)}
#${R} .bc-line{position:absolute;left:0;right:0;height:2px;top:0;background:color-mix(in srgb,white 60%,var(--bca));box-shadow:0 0 18px 4px var(--bca);opacity:0}
#${R} .bc-open.on .bc-line{animation:bc-scanline 1.5s cubic-bezier(.6,0,.4,1) .1s both}@keyframes bc-scanline{0%{top:0;opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}
#${R} .bc-open.on .bc-reveal{animation:bc-reveal 1.5s cubic-bezier(.6,0,.4,1) .1s both}@keyframes bc-reveal{from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}}
#${R} .bc-open.on .bc-kick{animation:bc-track 2.4s cubic-bezier(.2,.7,.2,1) .2s both}@keyframes bc-track{from{letter-spacing:2.4em;opacity:0;filter:blur(6px)}to{letter-spacing:.9em;opacity:1;filter:none}}
#${R} .bc-open.on .bc-h1{animation:bc-h1 2.2s cubic-bezier(.2,.7,.2,1) .45s both}@keyframes bc-h1{0%{letter-spacing:.6em;opacity:0;filter:blur(10px) brightness(2)}60%{opacity:1}100%{letter-spacing:.12em;filter:none}}
#${R} .bc-open.on .bc-date{animation:bc-up 1s ease 1.5s both}@keyframes bc-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
#${R} .bc-close .bc-h1{font-size:clamp(28px,4.6vw,64px);letter-spacing:.04em;padding:0}
#${R} .bc-close .bc-not{margin-top:16px;font-weight:300;font-size:clamp(18px,2.4vw,30px);letter-spacing:.08em;color:var(--bca);text-shadow:0 0 16px color-mix(in srgb,var(--bca) 60%,transparent)}
#${R} .bc-close.on .bc-h1{animation:bc-up 1s ease .2s both}#${R} .bc-close.on .bc-not{animation:bc-up 1s ease .9s both}#${R} .bc-close.on .bc-date{animation:bc-up 1s ease 1.5s both}
#${R} .bc-sig{margin-top:34px;font:500 11px/1 var(--mono,monospace);letter-spacing:.6em;color:var(--tx2);opacity:.8}
/* the lead */
#${R} .bc-lead{background:linear-gradient(90deg,color-mix(in srgb,var(--bg) 94%,transparent) 0%,color-mix(in srgb,var(--bg) 82%,transparent) 48%,color-mix(in srgb,var(--bg) 20%,transparent) 100%)}
#${R} .bc-lw{position:absolute;left:clamp(22px,7vw,110px);top:50%;transform:translateY(-52%);width:min(760px,86vw)}
#${R} .bc-tag{display:flex;align-items:center;gap:14px;font:600 12px/1 var(--mono,monospace);letter-spacing:.34em;color:var(--bca)}#${R} .bc-tag::before{content:"";width:34px;height:3px;background:var(--bca);box-shadow:0 0 10px var(--bca)}
#${R} .bc-tag span{color:var(--tx2);font-weight:400}
#${R} .bc-fig{margin-top:22px;font-weight:200;font-size:clamp(64px,11vw,156px);line-height:.92;letter-spacing:-.02em;color:var(--tc,var(--tx));text-shadow:0 0 36px color-mix(in srgb,var(--tc,var(--bca)) 55%,transparent)}
#${R} .bc-figl{margin-top:10px;font:500 12px/1 var(--mono,monospace);letter-spacing:.3em;color:var(--tc,var(--tx2));opacity:.85;text-transform:uppercase}
#${R} .bc-hl{margin-top:26px;font-weight:600;font-size:clamp(24px,3.4vw,46px);line-height:1.12;color:var(--tx)}
#${R} .bc-hs{margin-top:12px;font-weight:400;font-size:clamp(14px,1.5vw,19px);line-height:1.45;color:var(--tx2);max-width:640px}
#${R} .bc-pips{display:flex;gap:8px;margin-top:30px}#${R} .bc-pips i{width:38px;height:4px;border-radius:2px;background:color-mix(in srgb,var(--tx2) 30%,transparent)}#${R} .bc-pips i.on{background:var(--bca);box-shadow:0 0 10px var(--bca)}#${R} .bc-pips i.done{background:color-mix(in srgb,var(--bca) 55%,transparent)}
#${R} .bc-ghost{position:absolute;right:4vw;bottom:-4vh;font-weight:800;font-size:min(46vw,64vh);line-height:1;color:transparent;-webkit-text-stroke:1px color-mix(in srgb,var(--bca) 22%,transparent);letter-spacing:-.04em}
#${R} .bc-lead.on .bc-lw>*{animation:bc-in .7s cubic-bezier(.2,.7,.2,1) both}#${R} .bc-lead.on .bc-lw>:nth-child(2){animation-delay:.1s}#${R} .bc-lead.on .bc-lw>:nth-child(3){animation-delay:.18s}#${R} .bc-lead.on .bc-lw>:nth-child(4){animation-delay:.28s}#${R} .bc-lead.on .bc-lw>:nth-child(5){animation-delay:.36s}
@keyframes bc-in{from{opacity:0;transform:translateX(-26px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
/* bumper */
#${R} .bc-bump{background:radial-gradient(ellipse at 50% 50%,color-mix(in srgb,var(--bg) 70%,transparent),color-mix(in srgb,var(--bg) 90%,transparent) 75%)}
#${R} .bc-bn{font:500 15px/1 var(--mono,monospace);letter-spacing:.5em;padding-left:.5em;color:var(--bca);text-shadow:0 0 12px var(--bca)}#${R} .bc-bn span{color:var(--tx2)}
#${R} .bc-bname{margin-top:18px;font-weight:300;font-size:clamp(34px,6.4vw,92px);letter-spacing:.16em;padding-left:.16em;text-transform:uppercase;text-shadow:0 0 30px color-mix(in srgb,var(--bca) 60%,transparent)}
#${R} .bc-bar{margin:22px auto 0;height:2px;width:0;background:linear-gradient(90deg,transparent,var(--bca),transparent);box-shadow:0 0 12px var(--bca)}
#${R} .bc-bump.on .bc-bar{animation:bc-bar 1.2s cubic-bezier(.2,.7,.2,1) both}@keyframes bc-bar{to{width:min(560px,80vw)}}
#${R} .bc-bump.on .bc-bname{animation:bc-h1 1.3s cubic-bezier(.2,.7,.2,1) both}#${R} .bc-bump.on .bc-bn{animation:bc-up .6s ease .15s both}
/* lower third (a scrim under it quietens the view's own legend) */
#${R} .bc-scrim{position:absolute;left:0;right:0;bottom:0;height:230px;background:linear-gradient(to top,color-mix(in srgb,var(--bg) 94%,transparent) 0,color-mix(in srgb,var(--bg) 80%,transparent) 45%,transparent);opacity:0;transition:opacity .6s ease}#${R} .bc.l3on .bc-scrim{opacity:1}
#${R} .bc-l3{position:absolute;left:clamp(16px,3.4vw,48px);bottom:54px;display:flex;align-items:stretch;max-width:calc(100% - 32px);opacity:0;transform:translateX(-30px);clip-path:inset(0 100% 0 0);transition:opacity .4s ease,transform .6s cubic-bezier(.2,.7,.2,1),clip-path .7s cubic-bezier(.2,.7,.2,1)}
#${R} .bc-l3.on{opacity:1;transform:none;clip-path:inset(0 0 0 0)}
#${R} .bc-l3 .n{display:flex;align-items:center;padding:0 14px;font:700 15px/1 var(--mono,monospace);letter-spacing:.06em;color:var(--bg);background:var(--bca);box-shadow:0 0 18px color-mix(in srgb,var(--bca) 60%,transparent)}
#${R} .bc-l3 .m{padding:10px 18px 11px;background:linear-gradient(90deg,color-mix(in srgb,var(--bg) 90%,transparent),color-mix(in srgb,var(--bg) 78%,transparent));border-top:1px solid color-mix(in srgb,var(--bca) 45%,transparent);min-width:0}
#${R} .bc-l3 .s{font-weight:700;font-size:22px;line-height:1.1;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}
#${R} .bc-l3 .t{margin-top:4px;font:400 12px/1.2 var(--mono,monospace);letter-spacing:.14em;color:var(--tx2);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${R} .bc-l3 .f{display:flex;flex-direction:column;justify-content:center;padding:6px 18px;background:color-mix(in srgb,var(--bca) 16%,color-mix(in srgb,var(--bg) 86%,transparent));border-top:1px solid var(--bca);border-left:1px solid color-mix(in srgb,var(--bca) 35%,transparent)}
#${R} .bc-l3 .f b{font-weight:600;font-size:26px;line-height:1;color:color-mix(in srgb,white 75%,var(--bca));text-shadow:0 0 14px color-mix(in srgb,var(--bca) 60%,transparent);white-space:nowrap}#${R} .bc-l3 .f small{margin-top:4px;font:400 10px/1 var(--mono,monospace);letter-spacing:.16em;color:var(--tx2);text-transform:uppercase;white-space:nowrap}
#${R} .bc-l3 .f[hidden]{display:none}
/* subtitles */
#${R} .bc-sub{position:absolute;left:50%;transform:translateX(-50%);bottom:136px;width:min(980px,84vw);text-align:center;transition:opacity .25s ease}
#${R} .bc-sub span{display:inline;font-weight:500;font-size:clamp(17px,1.75vw,24px);line-height:1.62;color:white;background:rgba(0,0,0,.62);padding:3px 12px;-webkit-box-decoration-break:clone;box-decoration-break:clone;text-shadow:0 1px 2px black}
#${R} .bc-sub.full{bottom:64px}#${R} .bc-sub:empty,#${R} .bc-sub.off{opacity:0}
/* ticker */
#${R} .bc-tick{position:absolute;left:0;right:0;bottom:0;height:36px;display:flex;align-items:stretch;background:color-mix(in srgb,var(--bg) 90%,transparent);border-top:1px solid color-mix(in srgb,var(--bca) 55%,transparent);box-shadow:0 -6px 26px color-mix(in srgb,var(--bca) 14%,transparent);transform:translateY(100%);transition:transform .7s cubic-bezier(.2,.7,.2,1)}
#${R} .bc.tk .bc-tick{transform:none}
#${R} .bc-tick .lb{flex:none;display:flex;align-items:center;gap:8px;padding:0 14px;font:700 11px/1 var(--mono,monospace);letter-spacing:.2em;color:var(--bg);background:var(--bca)}#${R} .bc-tick .lb small{font-weight:500;letter-spacing:.12em;opacity:.8}
#${R} .bc-tick .cw{position:relative;flex:1;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,black 3%,black 97%,transparent);mask-image:linear-gradient(90deg,transparent,black 3%,black 97%,transparent)}
#${R} .bc-tick .tr{position:absolute;top:0;bottom:0;left:0;display:flex;align-items:center;white-space:nowrap;animation:bc-crawl var(--dur,60s) linear infinite;will-change:transform}
@keyframes bc-crawl{from{transform:translateX(0)}to{transform:translateX(-50%)}}
#${R} .bc-tick .it{display:inline-flex;align-items:baseline;gap:7px;padding:0 20px;font:500 13px/1 var(--mono,monospace);letter-spacing:.04em;color:var(--tx);border-right:1px solid color-mix(in srgb,var(--tx2) 22%,transparent)}
#${R} .bc-tick .it .a{font-size:11px}#${R} .bc-tick .up{color:var(--up)}#${R} .bc-tick .dn{color:var(--dn)}#${R} .bc-tick .quiet{color:var(--tx2)}#${R} .bc-tick .x{color:var(--tx2);font-size:12px}
/* countdown for the phone's own screen recorder */
#${R} .bc-count{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:14px;background:color-mix(in srgb,var(--bg) 85%,transparent)}#${R} .bc-count.on{display:flex}
#${R} .bc-count b{font-weight:200;font-size:min(30vw,180px);line-height:1;color:var(--bca);text-shadow:0 0 40px var(--bca)}#${R} .bc-count small{font:500 12px/1 var(--mono,monospace);letter-spacing:.4em;color:var(--tx2)}
/* phone */
#${R}.jv-compact .bc-bug{left:12px;top:82px;font-size:9px;letter-spacing:.14em;padding:5px 8px}#${R}.jv-compact .bc-bug .clk{display:none}
#${R}.jv-compact .bc-l3{left:10px;right:10px;bottom:46px;max-width:none}#${R}.jv-compact .bc-l3 .m{flex:1;padding:8px 12px}#${R}.jv-compact .bc-l3 .s{font-size:16px;letter-spacing:.08em}#${R}.jv-compact .bc-l3 .t{font-size:10px;letter-spacing:.08em}
#${R}.jv-compact .bc-l3 .n{padding:0 9px;font-size:12px}#${R}.jv-compact .bc-l3 .f{padding:6px 10px}#${R}.jv-compact .bc-l3 .f b{font-size:19px}#${R}.jv-compact .bc-l3 .f small{font-size:9px;letter-spacing:.08em}
#${R}.jv-compact .bc-sub{bottom:124px;width:calc(100% - 24px)}#${R}.jv-compact .bc-sub span{font-size:16px;line-height:1.55;padding:2px 8px}#${R}.jv-compact .bc-sub.full{bottom:52px}
#${R}.jv-compact .bc-tick{height:32px}#${R}.jv-compact .bc-tick .lb{padding:0 9px;font-size:9px}#${R}.jv-compact .bc-tick .lb small{display:none}#${R}.jv-compact .bc-tick .it{font-size:12px;padding:0 14px}
#${R}.jv-compact .bc-lw{left:20px;right:20px;width:auto;top:46%}#${R}.jv-compact .bc-ghost{font-size:62vw;right:-4vw;bottom:2vh}#${R}.jv-compact .bc-lead{background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 70%,transparent),color-mix(in srgb,var(--bg) 92%,transparent) 40%,color-mix(in srgb,var(--bg) 92%,transparent))}
#${R}.jv-compact .bc-kick{font-size:11px;letter-spacing:.5em;padding-left:.5em}#${R}.jv-compact .bc-h1{letter-spacing:.06em;padding-left:.06em}#${R}.jv-compact .bc-date{font-size:11px;letter-spacing:.24em;gap:10px}
#${R}.jv-compact .bc-sig{font-size:9px;letter-spacing:.24em}#${R}.jv-compact.jv-rec .bc-bug{top:12px}
#${R}.jv-compact .bc-bname{letter-spacing:.08em;padding-left:.08em}
@media (prefers-reduced-motion:reduce){#${R} .bc *,#${R} .bc *::before,#${R} .bc *::after{animation:none!important;transition:none!important}#${R} .bc-tick .tr{position:static}}
`;

const ESC = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TONE = { up: 'var(--up)', dn: 'var(--dn)', gold: 'var(--gold)', tx: 'var(--tx)' };
const pad2 = n => String(n).padStart(2, '0');

/** The overlay: built once per broadcast inside the HUD root, removed at the end. Returns small setters the director calls. */
function makeOverlay(api) {
  const doc = api.doc, root = doc.getElementById(api.ID); if (!root) return null;
  doc.getElementById(`${api.ID}-bc`)?.remove();
  const el = doc.createElement('div'); el.className = 'bc'; el.id = `${api.ID}-bc`; el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<style>${css(api.ID)}</style><div class="bc-veil"></div>
<div class="bc-card bc-open"><div class="bc-scan"></div><div class="bc-ring"></div><div class="bc-line"></div><div class="bc-tc bc-reveal"><div class="bc-kick">J.A.R.V.I.S.</div><h1 class="bc-h1">THE <b>MORNING</b> BRIEFING</h1><div class="bc-date" data-b="odate"></div></div></div>
<div class="bc-card bc-lead"><div class="bc-ghost" data-b="ghost"></div><div class="bc-lw"><div class="bc-tag">THE LEAD <span data-b="lnum"></span></div><div class="bc-fig" data-b="fig"></div><div class="bc-figl" data-b="figl"></div><div class="bc-hl" data-b="hl"></div><div class="bc-hs" data-b="hs"></div><div class="bc-pips" data-b="pips"></div></div></div>
<div class="bc-card bc-bump"><div class="bc-scan"></div><div class="bc-tc"><div class="bc-bn" data-b="bn"></div><div class="bc-bname" data-b="bname"></div><div class="bc-bar"></div></div></div>
<div class="bc-card bc-close"><div class="bc-scan"></div><div class="bc-ring"></div><div class="bc-tc"><div class="bc-h1">That is the briefing.</div><div class="bc-not">Description, not advice.</div><div class="bc-date" data-b="cdate"></div><div class="bc-sig">J.A.R.V.I.S. · THE MORNING BRIEFING</div></div></div>
<div class="bc-scrim"></div><div class="bc-l3"><div class="n" data-b="l3n"></div><div class="m"><div class="s" data-b="l3s"></div><div class="t" data-b="l3t"></div></div><div class="f" data-b="l3f"><b data-b="l3v"></b><small data-b="l3l"></small></div></div>
<div class="bc-sub off" data-b="sub"></div>
<div class="bc-tick"><div class="lb">MARKETS <small>MOVE · ×USUAL</small></div><div class="cw"><div class="tr" data-b="tr"></div></div></div>
<div class="bc-wipe"></div>
<div class="bc-bug"><i></i><span>JARVIS · LIVE DATA · <span class="d">DESCRIPTION ONLY</span></span><span class="clk" data-b="clk"></span></div>
<div class="bc-count" data-b="count"><small>RECORDING STARTS</small><b></b></div>`;
  root.appendChild(el); root.classList.add('jv-bcast');
  const $ = k => el.querySelector(`[data-b="${k}"]`), card = c => el.querySelector(`.bc-${c}`);
  let clockId = 0;
  const clock = () => { try { $('clk').textContent = `LDN ${dateWords(new Date()).hm}`; } catch (e) { /* label only */ } };
  const O = {
    el,
    on() { clock(); clockId = api.win.setInterval(clock, 15000); requestAnimationFrame(() => el.classList.add('on')); },
    cards(which) { for (const c of ['open', 'lead', 'bump', 'close']) card(c).classList.toggle('on', c === which); },
    veil(on) { el.querySelector('.bc-veil').classList.toggle('on', !!on); },
    wipe() { const w = el.querySelector('.bc-wipe'); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); },
    open(date) { $('odate').textContent = date.card; $('cdate').textContent = date.card; },
    lead(x, i, n) {
      $('lnum').textContent = `· ${i + 1} OF ${n}`; $('ghost').textContent = String(i + 1);
      const fig = $('fig'); fig.textContent = x.figure; fig.parentElement.style.setProperty('--tc', TONE[x.tone] ?? TONE.tx);
      $('figl').textContent = x.figLabel ?? ''; $('hl').textContent = x.headline; $('hs').textContent = x.sub ?? '';
      $('pips').innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('');
      [...card('lead').querySelector('.bc-lw').children].forEach(c => { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; });
    },
    bump(seg) { $('bn').innerHTML = `${pad2(seg.num)} <span>/ ${pad2(seg.total)}</span>`; $('bname').textContent = seg.name; },
    l3(seg, title, fig) {
      if (!seg) { el.classList.remove('l3on'); el.querySelector('.bc-l3').classList.remove('on'); el.querySelector('.bc-sub').classList.add('full'); return; }
      $('l3n').textContent = pad2(seg.num); $('l3s').textContent = seg.name; $('l3t').textContent = title ?? '';
      const f = $('l3f'); f.hidden = !fig?.value; if (fig?.value) { $('l3v').textContent = fig.value; $('l3l').textContent = fig.label || 'key number'; }
      el.classList.add('l3on'); el.querySelector('.bc-l3').classList.add('on'); el.querySelector('.bc-sub').classList.remove('full');
    },
    sub(t) { const s = $('sub'); if (!t) { s.classList.add('off'); return; } if (s.dataset.t === t) return; s.dataset.t = t; s.innerHTML = `<span>${ESC(t)}</span>`; s.classList.remove('off'); },
    ticker(items) {
      if (!items.length) { el.classList.remove('tk'); return; }
      const one = items.map(i => `<span class="it"><span>${ESC(i.label)}</span><span class="a ${i.tone}">${i.arrow}</span><span class="${i.tone}">${ESC(i.pct)}</span><span class="x">${ESC(i.x)}</span></span>`).join('');
      const tr = $('tr'); tr.innerHTML = one + one; tr.style.setProperty('--dur', `${Math.max(30, items.length * 4.2)}s`); tr.setAttribute('aria-label', tickerText(items));
      el.classList.add('tk');
    },
    count(n) { const c = $('count'); c.classList.toggle('on', n > 0); c.querySelector('b').textContent = n > 0 ? String(n) : ''; },
    remove() { api.win.clearInterval(clockId); el.remove(); root.classList.remove('jv-bcast'); },
  };
  return O;
}

const sting = api => { try { api.blip(392, 0.5, 'sine', 0.025); api.blip(587, 0.5, 'sine', 0.022, 0.16); api.blip(784, 0.9, 'triangle', 0.02, 0.32); api.blip(1175, 1.2, 'sine', 0.012, 0.5); } catch (e) { /* no audio */ } };
const tick = api => { try { api.blip(1320, 0.05, 'square', 0.012); api.blip(990, 0.12, 'sine', 0.016, 0.06); } catch (e) { /* no audio */ } };

registerJarvisModule({
  id: 'broadcast', label: 'MORNING BROADCAST',
  render(pane, api) {
    const { st } = api, prefs = lsGet();
    let token = 0, cache = null, ov = null, stopMotion = () => {};
    const ctl = { paused: false, rate: 1, jump: null };
    pane.innerHTML = `<h3>THE MORNING BROADCAST</h3><p>Your morning review as a TV-news package, read by Jarvis: a title sequence, the three things that matter this morning, then Markets, The Chain, Rates, Currencies, Volatility, Positioning and The Day Ahead over the hologram views, with a ticker, lower-thirds and subtitles. The voice leads; the picture follows. Esc ends it.</p>
<div class="jv-row"><button type="button" data-b="go">▶ PLAY TODAY'S BROADCAST</button><button type="button" data-b="rec" title="Records this browser tab, picture and sound, and gives you a video file to share">⏺ RECORD AS VIDEO</button><button type="button" data-b="voice" aria-pressed="${prefs.voice !== false}">VOICE ${prefs.voice !== false ? 'ON' : 'OFF'}</button></div>
<div class="jv-row"><label class="jv-sub">length <select data-b="len"><option value="quick">QUICK (about 2 min)</option><option value="full">FULL (every view)</option></select></label><label class="jv-sub">speed <select data-b="rate"><option value="0.9">calm</option><option value="1">normal</option><option value="1.15">brisk</option><option value="1.3">fast</option></select></label></div>
<p class="jv-sub" data-b="status">Ready. With the voice off it plays as subtitles at reading speed.</p>
<div data-b="rundown"></div>
<p class="jv-sub">RECORD AS VIDEO: the browser asks what to share. Choose <b>This tab</b> and tick <b>Also share tab audio</b>; the broadcast plays and a video file downloads at the end (MP4 where the browser can, else WebM). On a phone it gets the broadcast ready for the phone's own screen recorder. Keep VOICE ON so the voice is in the video.</p>
<p class="jv-sub">Description only: what has moved and where things sit. Nothing in it is a forecast or a trade.</p>`;
    const q = s => pane.querySelector(`[data-b="${s}"]`), status = (t, bad = false) => { const e = q('status'); if (e) { e.textContent = t; e.style.color = bad ? 'var(--gold)' : ''; } };
    q('rate').value = String(prefs.rate ?? 1); q('len').value = prefs.len ?? 'quick';
    q('len').onchange = e => { lsPut({ len: e.target.value }); rundown(); };
    q('rate').onchange = e => { lsPut({ rate: +e.target.value }); rundown(); };
    q('voice').onclick = e => { const on = !(lsGet().voice !== false); lsPut({ voice: on }); e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.textContent = `VOICE ${on ? 'ON' : 'OFF'}`; };

    // the morning's data, gathered once (two minutes' cache): candles, the chain summary, the calendar, and the prepared data of every scene the programme may use
    async function gather(force = false) {
      if (!force && cache && Date.now() - cache.at < 120_000) return cache;
      const cd = await api.candles().catch(() => null), rows = cd?.rows ?? [];
      let events = null; try { const m = await api.jf('/api/jarvis/morning'); if (m?.ok && Array.isArray(m.events)) events = m.events; } catch (e) { /* the digest is optional */ }
      const want = new Set(wantedSceneIds()), extra = {};
      await Promise.all(SHOW_HOOKS.filter(h => want.has(h.id)).map(async h => { try { extra[h.id] = (await h.prepare?.(api)) ?? null; } catch (e) { extra[h.id] = null; } }));
      const s = st.sum, chain = s ? { holding: s.holding, broken: s.broken, quiet: s.quiet, judged: s.judged, brokenShort: s.brokenShort, headline: s.headline } : null;
      cache = { at: Date.now(), inp: { now: new Date(), rows, movers: topMovers(rows, 6), board: rows.length ? boardSummary(rows) : null, chain, events, extra } };
      return cache;
    }
    const plan = (inp, mode) => planBroadcast({ ...inp, now: new Date(), mode }, { hooks: SHOW_HOOKS, have: new Set([...CORE_VIEWS, ...viewsOf().map(v => v.id)]), mode });
    async function rundown() {
      const box = q('rundown'); if (!box) return;
      try {
        const c = await gather(), P = plan(c.inp, q('len').value), rate = +q('rate').value || 1, tot = P.items.reduce((a, x) => a + itemSeconds(x, rate), 0);
        box.innerHTML = `<p class="jv-sub" style="margin-top:10px;letter-spacing:.12em">TODAY'S RUNDOWN · about ${durText(tot)}</p><table>${P.lead.length ? `<tr><td>THE LEAD</td><td>${P.lead.map(l => api.esc(l.headline)).join(' · ')}</td></tr>` : ''}${P.segments.map(s => `<tr><td>${pad2(s.num)} ${api.esc(s.name.toUpperCase())}</td><td>${api.esc(s.scenes.join(', '))}</td></tr>`).join('')}<tr><td>${pad2(P.items[P.items.length - 1].seg.num)} SIGN-OFF</td><td></td></tr></table>`;
      } catch (e) { box.innerHTML = ''; }
    }
    rundown();

    function stop() {
      token++; stopMotion(); api.sfx.ambient(false); api.st.speakStop?.(); api.caption(null); api.cinema(false); api.st.spin = true;
      ov?.remove(); ov = null;
    }
    // a pause-aware hold: waits ms (at the current speed), freezes while paused, ends early on skip / back / stop
    async function hold(ms, my) {
      let left = ms; while (left > 0 && my === token && ctl.jump == null) { await sleep(100); if (!ctl.paused) left -= 100 * ctl.rate; }
    }

    async function run() {
      const my = ++token; status('Gathering the morning...');
      const c = await gather(true); if (my !== token) return;
      const P = plan(c.inp, q('len').value), items = P.items; api.win.__jarvisBroadcastPlan = P;     // for the lab harness and the console
      ctl.rate = +q('rate').value || 1; ctl.paused = false; ctl.jump = null; st.voice = lsGet().voice !== false;
      const sync = () => api.cineLabel(ctl.rate, ctl.paused), steps = [0.75, 1, 1.25, 1.5, 1.75, 2];
      api.cinema(true, () => { stop(); status('Ended.'); }, {
        next: () => { ctl.jump = 1; api.st.speakCtl?.stop(); },
        prev: () => { ctl.jump = -1; api.st.speakCtl?.stop(); },
        pause: () => { ctl.paused = !ctl.paused; api.st.speakCtl?.pause(ctl.paused); sync(); },
        fast: () => { ctl.rate = steps.find(x => x > ctl.rate + 1e-6) ?? 2; sync(); },
        slow: () => { ctl.rate = [...steps].reverse().find(x => x < ctl.rate - 1e-6) ?? 0.75; sync(); },
      }); sync(); api.caption(null);
      ov?.remove(); ov = makeOverlay(api); if (!ov) { status('The HUD is not open.', true); return; }
      ov.open(P.date); ov.ticker(P.ticker); ov.on(); api.sfx.ambient(true);
      status(`On air: ${P.segments.length} segments, about ${durText(items.reduce((a, x) => a + itemSeconds(x, ctl.rate), 0))}.`);
      api.voicePrefetch?.(items[0]?.text);
      let i = Math.max(0, Math.min(items.length - 1, +(api.win.__jarvisBroadcastFrom ?? 0) || 0)), prevKind = null, prevView = null;
      while (i < items.length && my === token) {
        const it = items[i];
        // the transition: a whoosh and a light wipe; the view changes behind a quick veil so the cut never shows
        const cut = it.view && it.view !== st.view;
        if (prevKind) { api.sfx.whoosh(); ov.wipe(); }
        if (it.kind === 'bumper') tick(api);
        if (cut || it.kind === 'scene' || it.cam || prevView == null) {
          if (cut) { ov.veil(true); await sleep(300); }
          if (my !== token) break;
          enterScene(api, it.kind === 'scene' ? it.scene : { view: it.view, cam: it.cam });
          if (cut) api.win.setTimeout(() => ov?.veil(false), 120);
        }
        prevView = it.view;
        // the graphics for this item
        ov.cards(it.kind === 'open' ? 'open' : it.kind === 'lead' ? 'lead' : it.kind === 'bumper' ? 'bump' : it.kind === 'close' ? 'close' : null);
        if (it.kind === 'lead') ov.lead(it.lead, it.idx, it.n);
        if (it.kind === 'bumper') ov.bump(it.seg);
        if (it.kind === 'scene') ov.l3(it.seg, it.title, it.figure); else ov.l3(null);
        ov.sub(null);
        if (it.kind === 'open') { sting(api); await hold(1500, my); }
        // the line: subtitles follow the voice's progress (estimated from reading time at this speed); the scene's own camera moves with it
        api.voicePrefetch?.(items[i + 1]?.text);
        if (it.text) {
          const chunks = subtitleChunks(it.text, st.compact ? 10 : 14), dur = itemSeconds({ text: it.text }, ctl.rate);
          stopMotion(); stopMotion = sceneMotion(api, it.kind === 'scene' ? it.scene : { cam: null }, dur, () => my === token, ctl, p => ov?.sub(chunkAt(chunks, p)?.text));
          await api.speak(it.text, ctl.rate);       // the voice leads: nothing moves on until he has finished the line, or you skip it
          stopMotion(); stopMotion = () => {};
        }
        if (my !== token) break;
        if (ctl.jump == null) await hold((it.hold ?? 0.6) * 1000, my);
        if (ctl.jump != null) {
          const back = ctl.jump < 0; ctl.jump = null;
          if (back) { let j = Math.max(0, i - 1); while (j > 0 && items[j].kind === 'bumper') j--; i = j; } else i++;
          prevKind = it.kind; continue;
        }
        while (ctl.paused && my === token) await sleep(120);
        prevKind = it.kind; i++;
      }
      if (my === token) {
        ov?.cards('close'); ov?.sub(null); await sleep(900);
        if (my === token) { stop(); api.setView('globe'); status('Finished. Press PLAY to watch again.'); }
      }
    }
    q('go').onclick = () => { stop(); run(); };
    q('rec').onclick = makeRecorder(api, { run, stop, status, btn: q('rec'), file: 'jarvis-morning-broadcast', label: '⏺ RECORD AS VIDEO', bump: () => ++token, alive: my => my === token,
      countdown: n => { if (n > 0 && !ov) { ov = makeOverlay(api); ov?.on(); } ov?.count(n); } });
  },
});

// js/terminal/jarvisNav.js: how Jarvis is organised. Before this, the top bar held two unrelated rows (PANELS and VIEWS: ~30 buttons) and nothing said which panel went with which picture. Now there are SIX
// SECTIONS, each holding the pictures (views) AND the tools (panels) that belong to it, in the order a person would reach for them. Opening a section lands on its best picture; a picture that has a
// natural companion list opens it beside it (Market board -> the ranked list; the chain pictures -> the chain read). Pure data and helpers; jarvisView.js draws it. Item ids are the HUD's own view ids
// (data-v) and panel ids (data-m); the words here are the ones people see.
export const SECTIONS = [
  // ONE morning programme: the BROADCAST (it names itself morning / afternoon / evening by the clock). The old SHOW director is an engine only (ENGINE_TOOLS), kept for the NEWSLETTER's own scenes.
  { id: 'watch', label: 'WATCH', hint: 'Sit back and let Helix talk you through it', home: ['tool', 'broadcast'], items: [
    ['tool', 'broadcast', 'MORNING SHOW'], ['tool', 'news', 'NEWSLETTER'], ['tool', 'film', 'REPLAY'] ] },
  { id: 'markets', label: 'MARKETS', hint: 'What every market is doing today', home: ['view', 'candles'], items: [
    ['view', 'candles', 'MARKET BOARD'], ['view', 'session', 'CHART'], ['view', 'wx', 'WEATHER'], ['view', 'globe', 'WORLD MAP'], ['view', 'ahead', 'DAY AHEAD'], ['view', 'net', 'LINKS'], ['view', 'bubbles', 'BUBBLES'],
    ['tool', 'radar', 'UNUSUAL MOVES'], ['tool', 'markets', 'RANKED LIST'] ] },
  { id: 'macro', label: 'MACRO', hint: 'How the big pieces connect', home: ['view', 'reactor'], items: [
    ['view', 'reactor', 'CHAIN REACTOR'], ['view', 'chainfly', 'CHAIN FLY'], ['view', 'orbit', 'CHAIN ORBIT'], ['view', 'yields', 'YIELD CURVE'], ['view', 'g10', 'G10 RATES'], ['view', 'moneyglobe', 'MONEY GLOBE'], ['view', 'cycle', 'WORLD CYCLE'], ['view', 'surprise', 'DATA SURPRISES'], ['view', 'shockwave', 'RELEASE SHOCKWAVE'], ['view', 'cbpaths', 'RATE PATHS'], ['view', 'ccy', 'CURRENCIES'], ['view', 'fxgrid', 'FX MATRIX'], ['view', 'vol', 'VOLATILITY'], ['view', 'ivsurf', 'VOL SURFACE'], ['view', 'skyline', 'CHAIN CITY'],
    ['tool', 'brief', 'CHAIN READ'] ] },
  { id: 'pos', label: 'POSITIONING', hint: 'Who holds what, and what the desk thinks', home: ['view', 'gpillar'], items: [
    ['view', 'gpillar', 'GAMMA PILLAR'], ['view', 'gterrain', 'GAMMA TERRAIN'], ['view', 'cot', 'POSITIONING TERRAIN'], ['view', 'gamma', 'GAMMA FLY'], ['view', 'book', 'DESK CALLS'], ['tool', 'precedent', 'PAST RELEASES'] ] },
  { id: 'ask', label: 'ASK', hint: 'Questions and research', home: ['tool', 'ask'], items: [
    ['tool', 'ask', 'ASK HELIX'], ['tool', 'explain', 'EXPLAIN A DAY'], ['tool', 'papers', 'PAPERS'] ] },
  { id: 'sys', label: 'SYSTEM', hint: 'Alerts and the server', home: ['tool', 'alerts'], items: [
    ['tool', 'alerts', 'ALERTS'], ['tool', 'system', 'SERVER'] ] },
];

/** Panels that have no button of their own but are opened by code (a panel id -> the section that owns it): SHOW plays the NEWSLETTER's scenes. */
export const ENGINE_TOOLS = { show: 'watch' };

/** The panel that sits beside a picture by default (a view id -> a panel id). Only on a wide screen; a phone gets a button instead. */
export const COMPANION = { candles: 'markets', globe: 'markets', session: null, chainfly: 'brief', reactor: 'brief', skyline: 'brief', orbit: 'brief', bubbles: 'brief' };

/** The words for one item, or null. */
export const labelOf = (kind, id) => { for (const s of SECTIONS) { const x = s.items.find(i => i[0] === kind && i[1] === id); if (x) return x[2]; } return null; };
/** The section that holds an item. When the HUD shows a picture with no panel open, pass the view; with a panel open, pass the panel. */
export const sectionOf = (kind, id) => SECTIONS.find(s => s.items.some(i => i[0] === kind && i[1] === id)) ?? null;
/** The section's items that exist right now (modules load late; a view that is not registered is left out). has(kind, id) -> boolean. */
export const itemsFor = (section, has) => (section?.items ?? []).filter(([k, id]) => has(k, id)).map(([kind, id, label]) => ({ kind, id, label }));
/** Which section is active for the HUD's state: the open panel's section, else the current picture's. */
export const activeSection = (mod, view) => (mod && mod !== 'chain' ? sectionOf('tool', mod) ?? SECTIONS.find(s => s.id === ENGINE_TOOLS[mod]) : null) ?? sectionOf('view', view) ?? SECTIONS[1];

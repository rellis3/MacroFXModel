// js/terminal/featureStatus.js: what the PREVIEW features are doing on this page, in words, so nobody has to open a console to find out.
//
// terminalFeel.js records one entry per feature in globalThis.__deskFeel as it starts them ({ requested, loaded, error }) and fires a 'deskfeel'
// event when it has finished. The Preview features panel (previewSwitches.js) and the command line read it through the pure helpers below.
// Pure: no DOM, no fetch. Text only: the places named here are the ones in the code (ids and card headings), checked by featureStatus.test.mjs.

/** key = the key terminalFeel.js records; surface = the registry id; where = lines a person can follow to find it on the page. */
export const FEATURES = {
  cmdline:         { surface: 'widget.cmdline', name: 'Command line', where: ['The "Command /" box at the top left of the top bar, or press / or the backtick key anywhere.'] },
  linked:          { surface: 'widget.linked', name: 'Linked selection', where: ['The chip in the top bar reads "Linked: ..." or "Link off"; the small ? beside it explains how it works.'] },
  alerts:          { surface: 'widget.alerts', name: 'Alerts', where: ['The ALERTS button in the top bar.'] },
  workspace:       { surface: 'tab.workspace', name: 'Workspace', where: ['The Workspace tab (Tools group of the tab strip).'] },
  chart:           { surface: 'tab.kchart', name: 'Chart', where: ['The Chart tab.'] },
  monitor:         { surface: 'tab.monitor', name: 'Monitor', where: ['The Monitor tab, beside Assets.'] },
  asof: { surface: 'widget.asof', name: 'Time machine', where: ['A LIVE / PAST chip and a "Time machine" button in the top bar (the button shows or hides the bar).', 'A slim time bar docked at the bottom of the page: a green LIVE pill (a big amber "Back to live" button in a past view), step buttons, play with speeds, and a track that shows what is recorded; drag it to go back or forward. Fold it to a small tab with the arrow. Keys on the track: arrows step, Home is the first record, End is back to live, Space plays.', 'In a past view a purple banner under the top bar says "Viewing ..., not live" with a Back to live button. Or type ASOF 12 nov 14:30 (or ASOF live) in the command line.'] },
  insight:         { surface: 'tab.insight', name: 'Insight', where: ['The Insight tab (pills: Unusual now, Cross-asset, Sector rotation, Currency matrix, Gold, Level reach, Risk flags, Economies).'] },
  newsSearches:    { surface: 'panel.news.saved', name: 'News saved searches', where: ['News tab: the saved-searches bar above the headlines.'] },
  calendarDrills:  { surface: 'panel.cal.drills', name: 'Calendar drills', where: ['Calendar tab: two cards above the table (earnings, scorecards) and a small ▸ button at the end of every release row.'] },
  exporter: {
    surface: 'widget.export', name: 'Export (CSV and PNG)',
    where: [
      'A small "EXPORT  CSV  PNG" bar on any card that holds a table or a chart, on four tabs only: Monitor, Insight, Calendar and Currencies.',
      'It sits at the top right of the card (in the card heading when the card has one).',
      'It is not on Overview, Assets, Pair, Macro or the other tabs. Anywhere else, type EXPORT in the command line for the biggest table on the open tab.',
    ],
  },
  eventReplay: {
    surface: 'widget.eventreplay', name: 'Event replay',
    where: [
      'Calendar tab: an "▶ Event replay" button at the very top of the tab, above the calendar table.',
      'Or type EVENTREPLAY CPI NQ, EVENTREPLAY ECB EURUSD or EVENTREPLAY NFP in the command line.',
      'It replays a past release minute by minute against the last five of its kind; the window says how many releases are held and from when.',
    ],
  },
  sinceLast: {
    surface: 'panel.changed.since', name: 'Since you last looked',
    where: [
      'Changed tab: a card at the very top, "Since you last looked", with pills for your last visit, the last hour, 4 hours and 24 hours.',
      'Or type SINCE LAST, SINCE 4H or SINCE 24H in the command line.',
      'It compares saved snapshots of the terminal, so it only goes back to 14 Nov 2026; it says which two snapshots it compared.',
    ],
  },
  riskStrip: {
    surface: 'panel.risk.strip', name: 'Risk flags over time',
    where: [
      'Overview tab: a slim card at the very top with six thin ribbons, one per stress light.',
      'Insight tab > Risk flags: "The lights over time" under the flag cards, with how often each was on and its Evidence Book verdict.',
      'Or type FLAGHISTORY in the command line.',
      'It goes back only as far as the saved snapshots (14 Nov 2026); a hatched block means the flag could not be read.',
    ],
  },
  oiDrill: {
    surface: 'widget.oidrill', name: 'OI drills',
    where: [
      'Options tab > the OI terrain card: a "Drill a level" button in the card heading, beside the market name and the other OI buttons.',
      'Or type OIDRILL CALLWALL NQ, OIDRILL MAXPAIN GOLD or OIDRILL GAMMAFLIP EURUSD in the command line.',
      'It follows one level back through the stored option-OI captures (from 20 Aug 2026); the window says how many it holds.',
    ],
  },
  oiTime: {
    surface: 'widget.oitime', name: 'OI over time',
    where: [
      'Options tab > the OI terrain card: three buttons in the card heading, "OI over time" (the strike profile day by day or within a day), "Level walk" (one level followed as its expiry nears) and "OI gauge" (the calls-against-puts dial through time).',
      'Options tab > the Path card ("The path · GOLD"): a "Path replay" button in its heading plays the Path through time from the nightly per-expiry records.',
      'Or type OITIME terrain NQ, OITIME walk GOLD, OITIME path GOLD or OITIME gauge EURUSD in the command line.',
      'It only goes back as far as the option-OI capture; the window says from which date.',
    ],
  },
  ghostWalk: {
    surface: 'widget.ghostwalk', name: 'Ghost walk',
    where: [
      'Options tab > the OI terrain card: a "▶ Ghost walk" button in the card heading, beside the market name (it opens that market).',
      'Or type GHOST NQ, GHOST GOLD or GHOST EURUSD 12 NOV in the command line.',
      'It only goes back as far as the option-OI capture; the window says from which date.',
    ],
  },
  replayViz: {
    surface: 'widget.replayviz', name: 'Replay on a visualisation',
    where: [
      'A "▶ Replay" button at the top right of the card heading, on six boards:',
      'Overview > the currency strength board (the card headed "1H window", "4H window" and so on).',
      'Macro > Rates & curve > "The curve through time", and "Atlanta Fed window odds" (it appears once Macro > Rates & curve has opened).',
      'Macro > Markets & FX > "Growth × inflation".',
      'Insight > Cross-asset > the "How markets have been moving together" heading.',
      'Assets > the Vol clock bar ("Vol clock").',
      'A button only appears after its board has drawn. Or type PLAY curve, PLAY strength, PLAY fedpath, PLAY corr, PLAY regime or PLAY range.',
    ],
  },
};

/** The registry id each recorded key belongs to (for the panel's rows). */
export const KEY_OF_SURFACE = Object.fromEntries(Object.entries(FEATURES).map(([k, f]) => [f.surface, k]));

/** One feature's state from the recorded status: { state: 'loaded' | 'failed' | 'not-requested' | 'waiting', reason }. */
export function statusOf(feel, key) {
  if (!feel || typeof feel !== 'object') return { state: 'waiting', reason: 'the page has not finished starting the preview features yet' };
  const f = feel.features?.[key];
  if (!f) return feel.done ? { state: 'not-requested', reason: 'this page did not ask for it (it is switched off for this login)' } : { state: 'waiting', reason: 'still starting' };
  if (!f.requested) return { state: 'not-requested', reason: 'switched off for this login' };
  if (f.loaded) return { state: 'loaded', reason: '' };
  if (f.waiting) return { state: 'waiting', reason: 'installed; it attaches when its tab is first opened' };
  if (f.error) return { state: 'failed', reason: String(f.error).slice(0, 160) };
  return feel.done ? { state: 'failed', reason: 'it started but did not attach to the page (nothing to attach to, or it was already attached)' } : { state: 'waiting', reason: 'still starting' };
}

/** The panel's one-line status text. */
export function statusLine(feel, key) {
  const s = statusOf(feel, key);
  return s.state === 'loaded' ? 'loaded' : s.state === 'failed' ? `failed: ${s.reason}` : s.state === 'not-requested' ? `not requested: ${s.reason}` : `waiting: ${s.reason}`;
}

const KIND_KEY = { asof: 'asof', 'replay-viz': 'replayViz', export: 'exporter', link: 'linked', workspace: 'workspace', monitor: 'monitor', kchart: 'chart', 'news-search': 'newsSearches' };

/** Why a command that depends on a feature did nothing, in words (the command line shows this instead of staying silent). */
export function whyNot(kind, win = globalThis) {
  const key = KIND_KEY[kind];
  if (!key) return 'That did nothing here (the part of the page it needs is not open or not available to this login).';
  const f = FEATURES[key], s = statusOf(win.__deskFeel, key);
  const loc = f.where[0];
  if (s.state === 'loaded') {
    if (key === 'replayViz') return 'No replay button is on screen yet: its board has not drawn. Open the tab that holds it (for example Macro > Rates & curve) and try again.';
    if (key === 'exporter') return 'There is nothing to export on this tab: Export covers tables and charts on Monitor, Insight, Calendar and Currencies. Open one of those and try again.';
    return `${f.name} is loaded but could not act just now. ${loc}`;
  }
  if (s.state === 'failed') return `${f.name} did not start: ${s.reason}. The Info map tab > Preview features panel shows the same.`;
  if (s.state === 'not-requested') return `${f.name} is switched off for this login (Info map tab > Preview features).`;
  return `${f.name} is still starting; try again in a few seconds.`;
}

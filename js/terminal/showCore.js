// js/terminal/showCore.js: the pure half of Jarvis's SHOW: a narrated, directed tour of the morning. It turns today's data into a list of scenes; each scene says which view to show, where the camera goes
// and what Jarvis says. The director (jarvisModShow.js) moves on when the narration FINISHES, never on a timer, so the voice always leads the picture. No model call: the words are templates over numbers.
// DESCRIPTION ONLY. The bias lean is said with its caveat every time: the engine's back-test found no proven direction skill.
const NAMES = { NQ: 'Nasdaq', SPX500: 'the S and P', US30: 'the Dow', US2000: 'the Russell', DE30: 'the DAX', UK100: 'the FTSE', GOLD: 'gold', SILVER: 'silver', COPPER: 'copper', PLATINUM: 'platinum', PALLADIUM: 'palladium', WTI: 'W T I crude', BRENT: 'Brent', NATGAS: 'natural gas', SOYBEAN: 'soybeans', WHEAT: 'wheat', CORN: 'corn', SUGAR: 'sugar', BTCUSD: 'Bitcoin' };
/** A market in spoken words: Nasdaq, gold, euro dollar. */
export const spoken = k => NAMES[k] ?? (k.length === 6 ? `${k.slice(0, 3)} ${k.slice(3)}` : k);
const pct = v => `${Math.abs(v) < 10 ? Math.abs(v).toFixed(1) : Math.round(Math.abs(v))} percent`;
const dayWord = d => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const greeting = d => { const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(d); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

// Extra scenes: a module registers { id, after, prepare?(api) -> data, build(inp, data) -> scene | null }. `after` is the id of the scene it follows ('candles', 'lean', 'chain' ...). The scene may carry
// enter?(api) and motion?(api, p) (p runs 0..1 over the line's estimated length) so it can steer its own view. buildScenes() never throws because of a hook.
export const SHOW_HOOKS = [];
export const registerShowScene = h => { if (h?.id && typeof h.build === 'function' && !SHOW_HOOKS.some(x => x.id === h.id)) SHOW_HOOKS.push(h); return h; };

/** Reading time in seconds for a line when nobody is speaking it (about 2.6 words a second, never under 2 seconds). */
export const readSeconds = text => Math.max(2, String(text ?? '').split(/\s+/).filter(Boolean).length / 2.6);

/**
 * The scenes. in = { now: Date, movers: candleRows[] (biggest first), board: boardSummary, chain: { holding, broken, quiet, headline } | null, radar: radarRank items | null,
 *                    events: [string] | null, memory: number | null }.
 * Each scene: { id, title, view: 'globe'|'candles'|'skyline'|'bubbles', cam: { ... } | null, text }.
 */
export function buildScenes(inp = {}) {
  const now = inp.now ?? new Date(), mv = inp.movers ?? [], bd = inp.board ?? null, ch = inp.chain ?? null, ev = inp.events ?? [], sc = [];
  sc.push({ id: 'wake', title: 'Good morning', view: 'globe', cam: { region: 'world' }, text: `${greeting(now)}. It is ${dayWord(now)}. Let me show you where the world stands.` });
  if (mv.length) {
    const top = mv.slice(0, 3).map(m => `${spoken(m.key)} ${m.ratio > 0 ? 'up' : 'down'} ${pct(m.oc)}`);
    sc.push({ id: 'movers', title: 'The biggest moves', view: 'globe', cam: { focus: mv[0].key }, text: `The biggest moves against their own normal are ${list(top)}. Each one is measured against how far that market usually travels, so a big move in a sleepy market counts for more.` });
    sc.push({ id: 'candles', title: 'Today as candles', view: 'candles', cam: { fly: true }, text: `Here is the whole board as candles. Green stands above the floor, red hangs below it, and the height is how far each market has moved against its usual move. ${bd ? `${bd.up} markets are up, ${bd.dn} are down, and ${bd.quiet} are barely moving.` : ''}` });
  }
  if (bd && bd.haveLean) {
    sc.push({ id: 'lean', title: 'The lean', view: 'candles', cam: { fly: true, lean: true }, text: `The chevrons are the bias engine's lean. It reads ${bd.bull} markets bullish, ${bd.bear} bearish and ${bd.flat} neutral. Treat that as context only: its back-test found no proven skill at calling direction.` });
  }
  if (ch) {
    const head = ch.headline ? ch.headline.replace(/\s+/g, ' ') : `${ch.holding} links are holding and ${ch.broken} are broken.`;
    sc.push({ id: 'chain', title: 'The chain', view: 'skyline', cam: { drift: true }, text: `Now the chain, the story of how one market feeds the next. ${head}` });
  }
  if (ev.length) sc.push({ id: 'ahead', title: 'The day ahead', view: 'globe', cam: { region: 'world' }, text: `Looking ahead today: ${list(ev.slice(0, 4))}.` });
  for (const h of SHOW_HOOKS) {
    try {
      const x = h.build(inp, inp.extra?.[h.id] ?? null); if (!x || !x.text) continue;
      let at = sc.findIndex(y => y.id === h.after); at = at < 0 ? sc.length : at + 1; sc.splice(at, 0, { id: h.id, title: x.title ?? h.id, view: x.view ?? 'globe', cam: x.cam ?? null, text: x.text, enter: x.enter, motion: x.motion });
    } catch (e) { /* a scene must never stop the show */ }
  }
  sc.push({ id: 'close', title: 'Standing by', view: 'globe', cam: { region: 'world' }, text: 'That is the picture. This is description, not advice, and none of it is a forecast. I am watching, and I will tell you if anything breaks.' });
  return sc;
}

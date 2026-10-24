/**
 * "The idea of the day": one macro story worked through the eight questions a macro trader asks (education/podcast_transcripts/HOW_THEY_THINK.md),
 * built ONLY from what the desk already measures. It is a way of reading the day, not a trade.
 *
 * WHAT IS COMPUTED, NOT WRITTEN. The story is the chain-of-impact link whose two ends moved furthest past their noise floors over the last 20
 * calendar days (a broken link first, because that is where the textbook is not working and the story is). It is extended one step each way along
 * neighbouring judged links to form a short chain. The weakest link, the data check, the positioning read, the price reaction, the calendar, the
 * markets it touches and what would end it all come from the evaluated chain, the range-pressure gauge, the fear gauge and the release calendar.
 *
 * WHAT IS NOT CLAIMED. No entry, stop or target, and no direction forecast: this desk's tests found direction calls null, and range and size better
 * evidenced. Where the desk holds no data for a question (there is no positioning feed such as COT) the idea says so instead of filling the gap.
 *
 * Pure: no fetch, no clock (the caller passes nowMs). Tested in js/macroIdea.test.mjs.
 */
import { CHAIN_NODES, CHAIN_WINDOW_DAYS } from './macroChain.js';

const num = x => Number.isFinite(x);
const floorOf = (key, nodes) => nodes[key]?.floor ?? null;
/** How decisively both ends moved: each end's move as a multiple of its noise floor, the smaller of the two (a chain is only as strong as its quieter end). */
function strength(l, nodes) {
  const fa = floorOf(l.a?.key, nodes), fb = floorOf(l.b?.key, nodes);
  if (!num(l.a?.delta) || !num(l.b?.delta) || !(fa > 0) || !(fb > 0)) return 0;
  return Math.min(Math.abs(l.a.delta) / fa, Math.abs(l.b.delta) / fb);
}
const dirWord = d => (d === 'up' ? 'rose' : d === 'down' ? 'fell' : 'did not move');

export function buildIdea({ links = [], events = [], rangePressure = null, fear = null, nowMs = null, nodes = CHAIN_NODES } = {}) {
  const judged = links.filter(l => l.verdict === 'holding' || l.verdict === 'broken');
  if (!judged.length) return null;
  const score = new Map(judged.map(l => [l.id, strength(l, nodes)]));
  const best = arr => arr.slice().sort((x, y) => score.get(y.id) - score.get(x.id))[0];
  const broken = judged.filter(l => l.verdict === 'broken');
  const story = best(broken.length ? broken : judged);
  if (!story || !(score.get(story.id) > 0)) return null;

  // Extend the story one step cause-ward and one step effect-ward, never revisiting a market.
  const used = new Set([story.a.key, story.b.key]), chain = [story];
  const up = best(judged.filter(l => l.id !== story.id && l.b.key === story.a.key && !used.has(l.a.key)));
  if (up) { chain.unshift(up); used.add(up.a.key); }
  const down = best(judged.filter(l => l.id !== story.id && l.a.key === story.b.key && !used.has(l.b.key)));
  if (down) { chain.push(down); used.add(down.b.key); }

  const steps = [{ key: chain[0].a.key, label: chain[0].a.label, text: chain[0].a.text }];
  for (const l of chain) steps.push({ key: l.b.key, label: l.b.label, text: l.b.text, via: l.verdict });

  // Weakest link: a broken one; else one with no tested support behind it; else the one the data decides least.
  const noSupport = chain.filter(l => !(l.evidence ?? []).length);
  const brokenInChain = chain.find(l => l.verdict === 'broken');
  const weak = brokenInChain ?? best(noSupport.length ? noSupport : chain);
  const weakest = brokenInChain ? 'broken' : noSupport.includes(weak) ? 'untested' : 'thin';
  const weakWhy = weakest === 'broken' ? `${weak.a.label} moved ${weak.a.text} but ${weak.b.label} went ${weak.b.text}, so the market is not passing it on the textbook way.`
    : weakest === 'untested' ? `The desk has no tested evidence behind this link, only the textbook: ${weak.textbook.toLowerCase()}.`
    : 'This link holds but with the smallest move over its noise floor, so it is the easiest to undo.';

  const holding = judged.filter(l => l.verdict === 'holding').length;
  const rp = rangePressure?.n ? rangePressure : null, fv = fear && (fear.a || fear.b) ? fear : null;
  const posn = [];
  if (rp) posn.push(`${rp.on} of ${rp.n} validated bigger-day signals are on, which speaks to size, not direction.`);
  if (fv) posn.push(fv.on ? 'Fear has run ahead of the Nasdaq, a level the VIX has tended to give back from.' : 'Fear against the Nasdaq is not at its extreme.');
  posn.push('The desk holds no positioning feed such as COT, so what the crowd already owns is not measured here.');

  const expectDir = story.expected === 'up' ? 'rise' : story.expected === 'down' ? 'fall' : null;
  const cal = (events ?? []).filter(e => e.impact === 'high' && (!num(nowMs) || e.ms >= nowMs)).slice(0, 2);
  const touched = [...new Set(chain.flatMap(l => [l.a.label, l.b.label]))];
  const floorTxt = story.a.floorText ?? '';

  const q = [
    { n: 1, g: 'view', t: "What's the story?", body: `${steps.map(s => `${s.label} ${s.text}`).join(', then ')}. Each step is what that market did over ${CHAIN_WINDOW_DAYS} days; where a link is broken the next step did not follow the textbook.` },
    { n: 2, g: 'view', t: 'What is it resting on?', body: `The weakest link is ${weak.a.label} to ${weak.b.label}. ${weakWhy}` },
    { n: 3, g: 'view', t: 'Is the data agreeing?', body: `${holding} of ${judged.length} testable links across the whole chain are holding over ${CHAIN_WINDOW_DAYS} days. ${broken.length ? `The ones that are not: ${broken.map(l => `${l.a.label} to ${l.b.label}`).join(', ')}.` : 'None are broken.'}` },
    { n: 4, g: 'timing', t: 'What does the market already believe?', body: posn.join(' ') },
    { n: 5, g: 'timing', t: 'How is price reacting?', body: story.verdict === 'broken' ? `Price is the referee here. ${story.a.label} ${dirWord(story.a.dir)} ${story.a.text} and ${story.b.label} was meant to ${expectDir ?? 'follow'} but went ${story.b.text}.` : `Price is following the cause: ${story.a.label} ${story.a.text}, then ${story.b.label} ${story.b.text}, the textbook way.` },
    { n: 6, g: 'timing', t: "What's on the calendar?", body: cal.length ? cal.map(e => `${e.ccy ? e.ccy + ' ' : ''}${e.event}`).join(' and ') + ' can force the issue.' : 'No high-impact release is lined up to force the issue soon.' },
    { n: 7, g: 'trade', t: 'Which markets does it touch, over what horizon?', body: `${touched.join(', ')}. It is judged over ${CHAIN_WINDOW_DAYS} calendar days, so read it as a weeks view, not an intraday one.` },
    { n: 8, g: 'trade', t: 'What would prove it wrong?', body: story.verdict === 'broken' ? `If ${story.a.label} drifts back inside its noise band (${floorTxt}) the story is over. If ${story.b.label} starts to ${expectDir ?? 'follow'}, the link has repaired itself.` : `If ${story.a.label} drifts back inside its noise band (${floorTxt}) the story is over. If ${story.b.label} stops moving with it, the link has broken.` },
  ];
  const pattern = story.verdict === 'broken' ? 'The cause moved but price did not follow' : null;
  // Question 0, the horizon filter: does this move markets on a weeks timeframe, or is it background? Judged on the size of the move against the noise floor.
  const str = score.get(story.id), real = str >= 2;
  const q0 = { n: 0, g: 'filter', t: 'Does it matter on your timeframe?', body: `${real ? 'Both ends moved at least twice their noise band over' : 'The ends only just cleared their noise band over'} ${CHAIN_WINDOW_DAYS} calendar days, so ${real ? 'this is a real weeks story' : 'treat this as background, not a driver'}. Slow structural stories, such as a government deficit that has built for decades, are not measured here and are context rather than a call.` };
  // At least three scenarios, always including "nothing happens". Conditions to watch, never probabilities: this desk's tests found direction not forecastable.
  const scenarios = [
    { name: 'The story carries on', what: `${story.a.label} keeps moving the way it has${story.verdict === 'broken' ? ` and ${story.b.label} keeps going the other way` : ` and ${story.b.label} keeps moving with it`}.` },
    { name: 'The story fades', what: `${story.a.label} drifts back inside its noise band (${floorTxt}) and the link has nothing left to judge.` },
    { name: 'Nothing happens, steady state', what: 'Neither end moves past its noise band. The usual ranges hold and this idea simply goes quiet.' },
    ...(story.verdict === 'broken' ? [{ name: 'The link repairs', what: `${story.b.label} starts to ${expectDir ?? 'follow'}, catching up with what ${story.a.label} did.` }] : []),
  ];
  // Patterns the desk can name from its own measurements. Each carries the numbers that triggered it; none is forced.
  const patterns = [];
  if (pattern) patterns.push({ name: 'The cause moved but price did not follow', why: `${story.a.label} ${story.a.text}, ${story.b.label} ${story.b.text}. When the news says one thing and price another, price is usually the better guide to what the market believes.` });
  if (rp && rp.on >= 1) patterns.push({ name: 'How loaded is the spring', why: `${rp.on} of ${rp.n} validated bigger-day signals are on, so a small push can do more than usual. Starting conditions matter more than the size of the news. This speaks to size, not direction.` });
  return { q0, scenarios, patterns, headline: `${steps[0].label} ${steps[0].text} to ${steps.at(-1).label} ${steps.at(-1).text}`, steps, broken: story.verdict === 'broken', pattern, weakest, q, storyId: story.id, strength: Math.round(score.get(story.id) * 10) / 10 };
}

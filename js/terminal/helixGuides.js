// js/terminal/helixGuides.js: EXPLAIN THIS VIEW. A written, plain-English guide for every Helix picture (view) and panel (tool): what it shows, how to read it (axes, colours,
// shapes), what counts as unusual on it, what it does NOT tell you (with the Evidence Book verdict ids from js/deskEvidence.js where one applies) and a related Theory Lab
// lesson (theory-lab/lessons/<file>). Pure data plus small text helpers, no fetch and no model call: the HUD's EXPLAIN button and the ? help show it, and the existing voice can read it.
// DESCRIPTION ONLY: nothing here is a forecast or a trade. Tested in helixGuides.test.mjs (every registered view and every nav item has a guide; every evidence id and lesson exists).
import { ownerLink } from './links.js';        // a viewer never sees a link to the main site (links.test.mjs guard)
export const HELIX_GUIDES = [
  {
    id: 'candles', kind: 'view', title: 'MARKET BOARD',
    shows: 'Every desk market\'s candle so far today, standing on a glowing floor in streets by group: FX majors at the front, then crosses, indices, metals, and energy, farm and crypto at the back.',
    read: [
      'Height is today\'s open-to-now move divided by the market\'s usual open-to-close move. One faint guide step is one usual move; it is capped at 3.',
      'Green rising above the floor is up; red hanging below it is down; grey is under half a usual move.',
      'The wick is the session high and low so far, in the same units.',
      'The blue chevron is the bias engine\'s lean (up, down, or a dot for neutral). Blue so it is never read as what has happened.',
      'Only the loudest movers carry a name and throw sparks.'
    ],
    unusual: 'A candle at or near the 3-usual-move cap, or a whole street leaning one way.',
    notTell: 'It describes today so far. The chevron is not a forecast: the bias engine\'s back-test found no proven direction skill.',
    evidence: ['bias-engine-backtest-5d', 'bias-engine-backtest-sameday'],
    lesson: null
  },
  {
    id: 'session', kind: 'view', title: 'CHART',
    shows: 'One market as a candlestick chart (5m, 15m, 1h or daily), with earlier days stacked behind as fading sheets the camera can fly back through.',
    read: [
      'Each bar runs open to close, wick low to high, on one linear price scale on the right.',
      'Up bars are filled blocks in the up colour; down bars are hollow outlines in the down colour, so direction has a shape cue as well as a colour.',
      'EMA 20 is the cyan tube and EMA 50 the gold tube: averages of past closes only.',
      'The glass slab is the market\'s usual high and low reach from today\'s open (the vol forecaster\'s median), with the open as a gold line.',
      'Older sheets behind are earlier days, fainter with age.'
    ],
    unusual: 'Price outside the glass slab: today has already reached further than a usual day.',
    notTell: 'Every element is past price. The slab is a typical size, not a target. Reaching the median band early does raise the odds of reaching the 75th, but says nothing about direction.',
    evidence: ['band-reach-from-here', 'intraday-range'],
    lesson: 'trend-cycle-filters.html'
  },
  {
    id: 'wx', kind: 'view', title: 'WEATHER',
    shows: 'Two rows of glass panels, one per asset class and one per currency, each with a small weather scene driven by that group\'s average move today against its members\' usual moves.',
    read: [
      'Clear sky: little happening (average move size under 0.6 usual moves).',
      'Warm sun from +0.5, hot from +1.5; rain below -0.5, storm below -1.5; cloud in between.',
      'Wind streaks: big moves (size 0.9 or more) that cancel out, both ways at once.',
      'The big number is the group average, with up/down arrow and green/red (grey under 0.15).',
      'The dots under each panel are its members on a -3 to +3 line, coloured by direction; the gold tick is the average.'
    ],
    unusual: 'A storm or hot panel, or wind: members moving hard in opposite directions.',
    notTell: 'It is the weather so far today, never an outlook. A sunny panel says the group has risen, not that it will keep rising.',
    evidence: [],
    lesson: null
  },
  {
    id: 'globe', kind: 'view', title: 'WORLD MAP',
    shows: 'The macro chain on a hologram Earth: a pillar on each market\'s home and the textbook links as arcs between them.',
    read: [
      'Pillar height is the move against that market\'s own normal noise over the window.',
      'Pillar colour: up or down colour by direction, gold for the wrong-way end of a broken textbook link, grey inside its noise. A chevron on the tip points with the move.',
      'Arcs are the chain links, with particles running cause to effect: blue holding, pulsing gold broken, faint grey quiet.',
      'Region buttons turn the globe to a part of the world.'
    ],
    unusual: 'Gold pillars and gold arcs: a link that moved against the textbook.',
    notTell: 'A broken link is a description of the window, not a signal that one leg will catch up. The desk test found no edge in which leg gives way.',
    evidence: ['broken-link-resolution'],
    lesson: 'domino-chain-cross-asset.html'
  },
  {
    id: 'ahead', kind: 'view', title: 'DAY AHEAD',
    shows: 'Today\'s release schedule as a 24-hour London clock lying on the table, with the Asia, London and New York sessions as arcs and a sweeping now hand.',
    read: [
      'Angle is London clock time, a full turn per day; the part of the day already gone is dimmer.',
      'Each pylon is a release: height by impact rank (low a third, medium two thirds, high full).',
      'Pylon colour is the currency\'s region: gold Americas, cyan Europe, green Asia-Pacific, grey other. The currency code is on the label too.',
      'The inner ridge is the typical share of the day\'s high-low range traded in each London hour.',
      'The next high-impact release still to come has a countdown over the centre.'
    ],
    unusual: 'Several tall pylons close together, or a big release landing on an hour the ridge says is usually quiet.',
    notTell: 'A timetable and a typical-activity profile only. It says nothing about what a release will print or which way anything goes. Releases set a typical size of move, and most move little.',
    evidence: ['event-impact-map', 'first-hour-fraction', 'calendar-range-profile'],
    lesson: 'event-trading-playbook.html'
  },
  {
    id: 'dayso', kind: 'view', title: 'THE DAY SO FAR',
    shows: 'One market\'s London day, 00:00 to 24:00, as 96 quarter-hour bars, with the day\'s releases standing over it as pylons.',
    read: [
      'Each bar is that 15-minute candle\'s close minus open, in % of the day\'s first open.',
      'Up bars are filled (up colour) above the centre line; down bars are hollow outlines (down colour) below it.',
      'Pylons are scheduled releases; taller means more important.',
      'Faint ticks mark the Asia, London and New York opens; the white line is now.',
      'The market is your selection, else the biggest mover against its usual move.'
    ],
    unusual: 'A run of tall bars right after a release pylon, or a big bar with no release near it.',
    notTell: 'What the day has done so far. A tall bar after a release shows the reaction, not why it happened or whether it lasts.',
    evidence: ['surprise-size', 'event-impact-map'],
    lesson: null
  },
  {
    id: 'rangeused', kind: 'view', title: 'RANGE USED',
    shows: 'A scatter of every desk market: across is the usual high-low range for today, up is the high-low range traded so far, both in % of price on one shared scale.',
    read: [
      'The diagonal means "has traded its whole usual day".',
      'Points above the diagonal are filled diamonds: already past a usual day. Points below are hollow circles.',
      'The dashed line marks a 75th-percentile day, where the forecaster gives one.',
      'The loudest points carry their names.'
    ],
    unusual: 'A point above the dashed line: wider than three days in four, already.',
    notTell: 'How much of a usual day has been traded, never how much is left or which way. "Room left" below the line is a usual-size idea only.',
    evidence: ['band-reach-from-here', 'extreme-in-probability'],
    lesson: 'garch-volatility.html'
  },
  {
    id: 'net', kind: 'view', title: 'LINKS',
    shows: 'The markets as a 3D network: each market a glowing node, placed so that markets that moved together sit close and opposed ones sit apart.',
    read: [
      'Node size is the day\'s move against its usual, capped at 3 (a capped node wears a ring). Colour is direction, green up, red down, grey inside half its usual, with a chevron as well.',
      'A link appears only where the 60-day correlation is above 0.5 in size: green moved together, red moved opposite; brighter and thicker as it gets stronger.',
      'Nebulae are soft glows round named groups (indices, dollar majors, crosses, metals, energy).',
      'The time scrub moves the window\'s end date back in weekly steps, using only data up to that date.'
    ],
    unusual: 'Two linked markets moving opposite ways today. At this strength the signs disagree on many days by chance, so one split alone is common.',
    notTell: 'A correlation describes the past window. It is not a relationship that persists or a forecast; position is only a picture of the matrix.',
    evidence: ['residual-reversion-fx', 'price-vs-spread-divergence'],
    lesson: 'correlation-networks-mst.html'
  },
  {
    id: 'bubbles', kind: 'view', title: 'BUBBLES',
    shows: 'The macro chain\'s markets as bubbles, clustered by theme (rates, dollar, equities and so on) round the screen.',
    read: [
      'Bubble size is the move against that market\'s own noise over the window.',
      'Up or down colour with a triangle for direction; a diamond marks a market that moved against the textbook; faint means inside its noise.',
      'Threads are the chain links: accent colour holding, gold broken, with dots running cause to effect.',
      'Bubbles of one theme are kept together; position within a cluster has no meaning.'
    ],
    unusual: 'A big diamond: a large move the wrong way for its link.',
    notTell: 'A description of the tape over the window, not a forecast. A broken link does not tell you which leg will move next.',
    evidence: ['broken-link-resolution'],
    lesson: 'domino-chain-cross-asset.html'
  },
  {
    id: 'today', kind: 'tool', title: 'TODAY',
    shows: 'The home screen: one line from each section, each opening its own picture.',
    read: [
      'THE LEAD is the broadcast\'s headline; LINKS counts broken and holding textbook links.',
      'UNUSUAL lists the top three moves beyond their normal noise; THE BOARD counts up, down and quiet markets.',
      'NEXT RELEASE is the next high-impact release today; GAMMA gives the call and put walls and flip.',
      'ALERTS says how many went out today and the latest. Click any line to open its picture.'
    ],
    unusual: 'Several broken links, or a long UNUSUAL line.',
    notTell: 'A summary of the other views. It inherits their limits: everything is what has happened or is scheduled, not what will happen.',
    evidence: [],
    lesson: null
  },
  {
    id: 'broadcast', kind: 'tool', title: 'MORNING SHOW',
    shows: 'The briefing played as a TV-news package over the hologram views: a title, the lead, numbered segments with bumpers, and a sign-off, read aloud.',
    read: [
      'The lead is the top three things that matter this morning, one card each.',
      'Segments run Markets, The Chain, Rates, Currencies, Volatility, Positioning, The Day Ahead; one with nothing to show is skipped.',
      'The lower third gives the segment and the line\'s key number; the ticker shows each market\'s move against its usual.',
      'Back, skip, pause and speed work as in the SHOW. The voice leads: the picture moves on when the line is spoken.'
    ],
    unusual: 'Whatever the lead names first is the largest against its usual size.',
    notTell: 'The words are templates over the numbers, with no model call. Nothing in it is a forecast, a signal or a trade.',
    evidence: [],
    lesson: null
  },
  {
    id: 'news', kind: 'tool', title: 'NEWSLETTER',
    shows: 'Pick an issue from the newsletter archive and Helix plays it as a narrated show: an intro, one scene per section over a fitting 3D view, and a close.',
    read: [
      'Each scene reads the opening of that section\'s text aloud.',
      'The view behind it is chosen to fit the section (rates over the yield curve, and so on).',
      'Back, skip, pause and speed work as in the SHOW.'
    ],
    unusual: 'Nothing is scored here; it is a reading.',
    notTell: 'It reads what the issue already says and adds nothing. The issue\'s own words are what they are; nothing here is a forecast.',
    evidence: [],
    lesson: null
  },
  {
    id: 'film', kind: 'tool', title: 'REPLAY',
    shows: '"While you slept": a sped-up replay of the last few sessions of the chain over the main view, with plain captions for what it finds.',
    read: [
      'Each frame is one past session\'s chain, from the HUD\'s own daily scrub.',
      'Captions name the links that broke or healed and the biggest moves.',
      'With NARRATE on, the next frame waits until the caption has been spoken.'
    ],
    unusual: 'A link that breaks and stays broken across several frames.',
    notTell: 'A replay of past sessions. It does not show how long a break will last or what happens next.',
    evidence: ['broken-link-resolution'],
    lesson: null
  },
  {
    id: 'radar', kind: 'tool', title: 'UNUSUAL MOVES',
    shows: 'A list of the chain\'s markets ranked by the size of their move against each one\'s own normal noise, broken links first.',
    read: [
      'A market is listed only if it moved beyond its noise floor over the window, or is the wrong-way end of a broken link.',
      'Each row says how many times its normal noise it moved, for example 2.3x.',
      'The broken links are listed below with their textbook read.',
      'The window (1D, 5D, 20D) sets how far back the move is measured.'
    ],
    unusual: 'By construction everything listed is unusual for that series; the top rows are the largest.',
    notTell: 'Unusual means big for that series over the window. Twice the usual move happens on a fair share of days, so one row is not rare. It does not say what comes next.',
    evidence: ['broken-link-resolution'],
    lesson: 'action-base-rates.html'
  },
  {
    id: 'markets', kind: 'tool', title: 'RANKED LIST',
    shows: 'The desk\'s other markets ranked by today\'s move from the open against each one\'s usual open-to-close move, with an optional layer of rings on the globe.',
    read: [
      'Size is today\'s move from the open divided by the usual open-to-close move.',
      'Green up, red down, grey quiet.',
      'LAYER ON draws each market as a ring and dot on the globe, sized the same way.',
      'Click a row to turn the globe to that market.'
    ],
    unusual: 'Rows at the top of the list, beyond about one usual move.',
    notTell: 'A description of today so far, not a forecast and not a ranking of what to trade.',
    evidence: [],
    lesson: null
  },
  { id: 'reactor', kind: 'view', title: 'CHAIN REACTOR',
    shows: 'The macro chain as one glowing ring cut into seven theme sectors. Each market is a light bar at its slot, and each textbook link is an arc over the centre.',
    read: ['Bar height is the move against its own noise, linear up to 3 times (faint rulers at 1x and 3x). Above 3x the bar stops and wears a notched crown marked >3x.',
      'Bar colour: green up, red down, with a chevron as the second cue. Gold marks the wrong-way end of a broken link. A dim stub is inside its noise; a faint dot has no data.',
      'A thin blue thread is a link holding. A thick, pulsing gold arc is a link broken, with particles running cause to effect. Quiet links are hidden (ALL LINKS shows them).',
      'The core beats faster the more links are broken. Click a market to light its links; click a sector name to move in.'],
    unusual: 'Gold arcs (broken links) and crowned bars (more than 3 times the usual move).',
    notTell: 'It shows which textbook links held or broke over the window. A broken link says nothing about how or when it resolves: the Evidence Book has that as context only. Not a forecast.',
    evidence: ['broken-link-resolution'], lesson: 'domino-chain-cross-asset.html' },
  { id: 'chainfly', kind: 'view', title: 'CHAIN FLY',
    shows: 'A flight through the macro chain, cause to effect. Each market is a glass orb on a pylon; each textbook link is a tube of light the camera follows.',
    read: ['Orb size grows with how far the market moved against its own noise.',
      'Orb colour: green up, red down when the move is beyond noise; gold is the effect end of a broken link; grey is inside its noise.',
      'A steady blue tube is a link holding. A thick, flickering gold tube is a link broken. A faint thread is quiet. Comets run from cause to effect.',
      'The strip along the bottom lists the stops (gold broken, blue holding). Speed lines show the camera slowing at broken links.'],
    unusual: 'Gold tubes: links that broke over the window.',
    notTell: 'A description of which links held or broke. It is not a validated forward signal, and a broken link has no tested resolution path. Not a forecast.',
    evidence: ['broken-link-resolution'], lesson: 'domino-chain-cross-asset.html' },
  { id: 'orbit', kind: 'view', title: 'CHAIN ORBIT',
    shows: 'The macro chain drawn as a rotating orbit: every market a glowing dot, every textbook link a curved thread between them.',
    read: ['Dot size is the move against its own noise over the window, capped at 3 times.',
      'Dot colour: up, down, gold (moved against the textbook, and it pulses) or faint (inside its noise).',
      'Accent blue thread = link holding. Thicker gold thread = link broke. Dots run cause to effect along the active threads.',
      'The key at the bottom left repeats these rules. Drag to turn, click a market for its card.'],
    unusual: 'Pulsing gold dots and gold threads: markets that went the wrong way for a textbook link.',
    notTell: 'A description of the tape over the window, not a forecast. How broken links resolve is context only in the Evidence Book.',
    evidence: ['broken-link-resolution'], lesson: 'domino-chain-cross-asset.html' },
  { id: 'skyline', kind: 'view', title: 'CHAIN CITY',
    shows: 'The macro chain as a city: one tower per market on a street grid laid out like the Chain tab, with light rails between towers for the textbook links.',
    read: ['Tower height follows the move against its own noise (capped at 3 times). A quiet market is a low, faint block.',
      'Tower colour: up, down, or gold for the wrong-way end of a broken link (it pulses).',
      'Blue rail between tower tops = link holding. Thicker gold rail = link broke. Dots run cause to effect.',
      'The cyan sweep on the ground is decoration only.'],
    unusual: 'Tall towers and gold rails.',
    notTell: 'It shows what moved and which links held or broke. Nothing about what comes next; broken-link resolution is context only.',
    evidence: ['broken-link-resolution'], lesson: 'domino-chain-cross-asset.html' },
  { id: 'yields', kind: 'view', title: 'YIELD CURVE',
    shows: 'The US Treasury curve as a 3D terrain over the last 120 sessions. The bright front edge, with a dot per maturity, is today\'s curve.',
    read: ['Left to right: maturity, 3 months to 30 years, on a log scale.',
      'Depth: time. Older sessions sit further back and fainter.',
      'Height: the yield, linear from the window\'s low; the back wall carries the percent lines.',
      'Surface colour is that session\'s 2s10s slope: cool at 40bp or more, gold when flat, red when inverted (10 year below 2 year, fully red at -40bp).',
      'Optional ribbons beyond the 30 year: the real 10 year, the Bund and the gilt.'],
    unusual: 'A slope within 10bp of zero reads as flat; any session with the 10 year below the 2 year is inverted.',
    notTell: 'The shape of the curve, not a forecast. Inversion tested null as a signal in the Evidence Book, and yield moves tested null for FX direction.',
    evidence: ['curve-inversion', 'yields-to-fx-direction'], lesson: 'yield-curve-growth-expectations.html' },
  { id: 'g10', kind: 'view', title: 'G10 RATES',
    shows: 'A two-half board. G10 RATES: each currency\'s short and long government yield and its short-end gap to the US 2 year. FUNDING: the US money-market plumbing.',
    read: ['Each rates row: short and long yield, the gap to the US 2 year in bp, and its 20-session change with an up or down triangle.',
      'The bar is that change as a z-score against the previous year\'s 20-session changes: grey inside 2 sigma, gold beyond.',
      'Funding: SOFR p99 minus IORB, SOFR minus IORB, SOFR minus TGCR (with where today sits in 250 sessions), reverse repo, reserves, the TGA and the last auctions with bid-to-cover percentile.',
      'A currency with no captured curve keeps its row and says why.'],
    unusual: 'A gold bar: a 20-session change beyond 2 sigma of the past year. Month-end and settlement dates are noted, since funding spreads jump then.',
    notTell: 'The gap to the US is context only. Its direction and range tests are null, and funding readings tested null as stress signals.',
    evidence: ['nonus-yield-gap-label', 'nonus-yield-gap-direction', 'nonus-yield-gap-range', 'funding-stress'], lesson: 'fed-corridor-iorb-srf-discount-window.html' },
  { id: 'moneyglobe', kind: 'view', title: 'MONEY GLOBE',
    shows: 'A hologram Earth with three layers: central-bank policy rates (default), BIS cross-border bank credit, and the rate gaps between currencies.',
    read: ['RATES: pillar height is the policy rate on one scale, 0 to 20% (above 20% is capped with a crown). Colour: hiked (up colour, chevron up), cut (down colour, chevron down) or unchanged (grey) over 3 months.',
      'The base ring\'s area is the 12-month change: solid ring rose, dashed ring fell. Dim pillars are stale.',
      'BANK CREDIT: arcs go from lender nations up to a global dollar pool, and down to borrowers; width is the size. BIS publishes totals, not lender-to-borrower pairs.',
      'RATE GAPS: gold arcs from low-rate to high-rate currencies, width the gap in pp.'],
    unusual: 'A tall pillar, a recent hike or cut, or a wide gold gap arc.',
    notTell: 'Levels and changes as published, and BIS data is about four months late. The rate-gap arcs are an incentive, not a measured flow. Not a forecast.',
    evidence: [], lesson: 'interest-rate-parity.html' },
  { id: 'cycle', kind: 'view', title: 'WORLD CYCLE',
    shows: 'The business-cycle clock: each economy\'s OECD leading indicator plotted by level and momentum, with the last two years rising as a trail and the latest month as a flagged orb on top.',
    read: ['Across: the indicator against trend. Right of the centre line is above 100 (above trend).',
      'Depth: momentum, the 3-month change. Far side rising, near side falling.',
      'Quadrants are named on the plane: Expansion (above, rising), Slowdown (above, falling), Contraction (below, falling), Recovery (below, rising).',
      'Trail colour is the region: gold Americas, cyan Europe, the accent Asia-Pacific. Up is time, one step per month.',
      'REAL FX halo (optional): area is the real exchange rate\'s gap from its 20-year average; solid dearer, dashed cheaper.'],
    unusual: 'An economy crossing into a new quadrant, or a reading clamped at the plane\'s edge (its card says capped).',
    notTell: 'Phases are definitions applied to published indicators, which arrive a month or two late. Not a forecast of any economy.',
    evidence: [], lesson: 'trend-cycle-filters.html' },
  { id: 'surprise', kind: 'view', title: 'DATA SURPRISES',
    shows: 'An 8 by 8 block: rows are the eight currencies, columns the eight indicator families. Each cell holds up to six slices, one per recent release.',
    read: ['A beat rises above the cell\'s mid-plane in the up colour; a miss hangs below in the down colour.',
      'Slice length is the surprise in that release\'s own usual surprise size (z), linear up to 3; beyond 3 it stops with a bright tip labelled >3.',
      'Oldest slice left, newest right and brightest. A grey sliver has no usable z; an empty cell is a faint dot.',
      'The row-end plate is the currency\'s engine score, a signed bar to plus or minus 1.'],
    unusual: 'Slices past 3 usual surprises, and the labelled biggest beat and miss of the last two weeks.',
    notTell: 'A record of prints against consensus. Plus means stronger than expected; outside the known inverted list, higher is read as stronger by assumption. Surprise size goes with a bigger range (validated), not a direction.',
    evidence: ['surprise-size', 'priced-in-direction'], lesson: 'event-trading-playbook.html' },
  { id: 'shockwave', kind: 'view', title: 'RELEASE SHOCKWAVE',
    shows: 'How one market reacted, minute by minute, to every past release of one kind (payrolls, CPI, the Fed and others), stacked by date, with the typical path in front.',
    read: ['Across: minutes from the release, -30 to +240. Depth: release date, oldest far, newest near.',
      'Height: the move since the release divided by the market\'s usual 30-minute reaction to that release; 1 is ordinary, capped at plus or minus 4.',
      'Line colour: the direction of that release\'s 30-minute move (up or down colour) and its side of zero.',
      'Gold line and ribbon: the median path and the 25-75% range. ALL MARKETS fans the newest release\'s markets out as spokes, flare area the 30-minute size.'],
    unusual: 'Labelled lines: the three biggest 30-minute reactions, and anything capped at 4 usual moves.',
    notTell: 'History of past reactions. The direction of a reaction is not predictable from the release alone; the Evidence Book maps reaction size, not direction.',
    evidence: ['event-impact-map', 'news-asymmetry'], lesson: 'event-trading-playbook.html' },
  { id: 'cbpaths', kind: 'view', title: 'RATE PATHS',
    shows: 'The market-implied policy-rate path of each central bank as a lane running away from you, today at your feet and about 13 months out at the far end.',
    read: ['The glowing rail along each lane floor is the bank\'s policy rate today.',
      'The staircase steps at each meeting by the move priced for it. Height above or below the rail is the cumulative change priced, in bp, on one scale for every lane (capped at 200bp).',
      'Colour: up colour for hikes, down colour for cuts, neutral under 2bp; the riser direction is the second cue.',
      'The faint dashed ghost is the same path from about a month ago. Lanes run from most easing priced (left) to most tightening (right).'],
    unusual: 'A big gap between the staircase and its ghost: pricing that has moved a lot in a month.',
    notTell: 'Market pricing at each meeting, never a forecast of what a bank will do. Central-bank tone tested null for direction in the Evidence Book.',
    evidence: ['cb-tone-direction', 'fed-two-moves'], lesson: 'central-bank-policy.html' },
  { id: 'brief', kind: 'tool', title: 'CHAIN READ',
    shows: 'The stored written read of the chain for the chosen window (1, 5 or 20 days): a hook line, a few paragraphs and a next line.',
    read: ['It is one read per window per day, shared by everyone, with the time it was written.',
      'READ IT TO ME speaks it in the current voice.',
      'If none exists yet, the panel says so. Writing one is a model call, made from the Chain tab.'],
    unusual: 'Nothing is flagged here; the numbers behind it are on the chain pictures and UNUSUAL MOVES.',
    notTell: 'An opinion in a trader\'s voice. It is not backtested and not a forecast.',
    evidence: [], lesson: 'domino-chain-cross-asset.html' },
  {
    id: 'ccy', kind: 'view', title: 'CURRENCIES',
    shows: 'The eight major currencies as spheres on rings, ranked by how far each has travelled so far today. A currency\'s strength is the average of its pair moves, each divided by that pair\'s usual open-to-close move.',
    read: [
      'Ring = rank: the strongest currency sits on the inner ring, the weakest on the outermost.',
      'Sphere size = the size of the move whatever its direction (area in proportion, 3 usual moves = full size; a small floor keeps a still currency visible).',
      'Colour = direction: green up, red down, grey barely moved. A cone above (up) or below (down) and the triangle in each label are the second cue.',
      'Gold tubes = the eight pairs that moved most today; thicker = a bigger move against its usual size (capped at 3 times). Particles run from the weaker side to the stronger.',
      'The orbiting is decoration only: every sphere turns at the same slow rate.'
    ],
    unusual: 'A currency is counted as barely moved under 0.12 usual moves. A strength near 1 or more means its pairs have, on average, already done a whole usual day\'s move.',
    notTell: 'How far each currency has travelled so far today, nothing more. It says nothing about where any currency goes next, and a strong currency this morning is not a forecast.',
    evidence: [],
    lesson: null,
  },
  {
    id: 'fxgrid', kind: 'view', title: 'FX MATRIX',
    shows: 'An 8 by 8 grid of the major currencies, rows and columns sorted strongest first, showing how far each row currency has out-run each column currency over the chosen window.',
    read: [
      'Column height = the gap in sigma (units of a usual move), on one linear scale for every window. A gap past 5 sigma is drawn at the cap with a gold top and a "capped" tag.',
      'A bright green column rising above the glass = the row currency out-ran the column one. The same gap seen from the other side hangs below as a dim red mirror, so nothing is counted twice.',
      'The plates round the edge are the currencies (rows on the left, columns at the front), labelled with rank and sigma score; plate colour = the sign of the score.',
      'The gold beam marks the biggest gap on the grid: strongest over weakest.',
      'The 1H / 4H / 1D / 1W buttons morph the grid to that window.'
    ],
    unusual: 'Tall columns gather in one corner (strongest row against weakest column). A gap at the 5 sigma cap is a very large move for that window.',
    notTell: 'What has already happened over each window. It is not a signal, a forecast or a trade, and a big gap says nothing about whether it widens or closes.',
    evidence: [],
    lesson: null,
  },
  {
    id: 'vol', kind: 'view', title: 'VOLATILITY',
    shows: 'A terrain of "range used": for each market and each of the last ~60 completed sessions, that day\'s high-low range against the market\'s own normal (the median of its previous 20 sessions).',
    read: [
      'Across = markets, grouped by asset class with a low ravine between classes. Along = time: oldest at the back, the newest session at the front edge.',
      'Height and colour = how stretched the day was. 1.0 is a normal day (marked by a white contour); height is clipped at 3 times, and clipped days carry a white tip.',
      'Colour is a regime ramp: cool below normal, grey at normal, gold when stretched, white-hot at 3 times. It never uses green or red, which mean price up or down.',
      'The gold sweep line travels along time and names its session; the tallest ridges carry a flare and a label.'
    ],
    unusual: 'A market at 1.5 times its normal range or more on the newest session is listed as stretched. A ridge running across many markets on one date is a wide, market-wide day.',
    notTell: 'How wide past days were, not which way prices went or will go. The Evidence Book found an inverted VIX curve goes with wider index ranges (range, not direction), that implied vol far above realised has meant wider indices, not calmer ones, and that implied-vol forecasts of range are calibrated. None of that is a direction call.',
    evidence: ['vix-inversion', 'iv-over-rv-wider', 'iv-forecast'],
    lesson: 'garch-volatility.html',
  },
  {
    id: 'ivsurf', kind: 'view', title: 'VOL SURFACE',
    shows: 'One market\'s implied-volatility surface: what its options are pricing across strikes and expiries.',
    read: [
      'Across = strike distance from spot in percent (puts left, calls right, a bright floor line at spot). Depth = expiry, nearest at the front, labelled in days. Height = implied vol from zero, on one fixed scale per market.',
      'Surface colour = the same vol, from the view accent (low) to gold (high); white tips are above the scale top (capped).',
      'Bright wire lines = each expiry\'s smile; the white spine at the money = the term structure.',
      'Two ribbons at the 25-delta strikes: red on the put side (left), green on the call side (right). The put-call skew is in the readout.',
      'Where history exists the surface morphs from the earliest snapshot to today, with a faint grey ghost of the earliest one.'
    ],
    unusual: 'A front that sits above the back (the spine falling away from you) means near options cost more than far ones. A steep put wing means downside protection is dear.',
    notTell: 'What options are pricing now, not where price goes. The Evidence Book found skew does not help choose fades at the lines (skew-fade null). Implied vol is a range read, not a direction read.',
    evidence: ['skew-fade', 'iv-forecast'],
    lesson: 'vega-volatility-surface.html',
  },
  {
    id: 'gpillar', kind: 'view', title: 'GAMMA PILLAR',
    shows: 'Today\'s option book for one market as a glass column read like a price chart: where open interest sits by strike, and the net dealer gamma it implies.',
    read: [
      'Height = strike price, ticks on the left. Call open interest glows out to the right, put open interest to the left, on one shared linear scale in contracts.',
      'The ribbon up the middle = net dealer gamma: it leans right and glows cyan where positive, leans left and glows gold where negative.',
      'The glass is split at the gamma flip (a bright gold ring with its price): cyan glass where the data puts dealers net long gamma (the damping zone), gold glass where they are net short (the amplifying zone).',
      'Spot is the white laser plane; the biggest call and put strikes (walls) are labelled; max pain is a small diamond.',
      'Beside the column, the last 20 captures\' spot (dots) and that day\'s walls (dashes).'
    ],
    unusual: 'Spot sitting close to the flip, or on the gold side of it, is the reading people look for. The data is the nightly CME capture, not live.',
    notTell: 'Our studies found no proven direction from these levels. The long-quiet / short-wider range pattern held on ES (validated) but is underpowered on NQ and gold, and FX does not carry it (gamma-real-iv null). Walls behave like ordinary levels (wall-placebo null) and max pain is not a magnet (oi-max-pain null).',
    evidence: ['gex-range', 'gex-range-es', 'gex-range-gold', 'gamma-real-iv', 'wall-placebo', 'oi-max-pain'],
    lesson: 'gamma-exposure-dealer-hedging.html',
  },
  {
    id: 'gterrain', kind: 'view', title: 'GAMMA TERRAIN',
    shows: 'Net dealer gamma by strike over the last weeks as a landscape, so you can see where positioning sat day by day.',
    read: [
      'Across = strike price (absolute, so a wall that stays put is a ridge running front to back). Depth = date: oldest at the back, today at the front edge (a bright white line).',
      'Height = net dealer gamma: positive rises as cyan hills above the glass, negative sinks as gold valleys below it. Gold, not red, because short gamma is a regime, not a down move.',
      'Heights are linear, scaled to the 97th percentile of the window; taller cells are clipped with a white tip.',
      'The white line riding the terrain is spot; the gold line on the glass is the gamma flip; green dots are each day\'s biggest call strike, red dots the biggest put strike.',
      'If no day\'s ladder can be rebuilt, heights fall back to calls (up, green) and puts (down, red) open interest, and the screen says so.'
    ],
    unusual: 'Spot crossing the gold flip line, or a ridge that moves sharply between days. Fewer than 5 days means the archive is still building.',
    notTell: 'A record of where positioning sat, not a forecast, signal or target. The range pattern is validated on ES only (underpowered on NQ and gold, absent in FX), and walls behave like ordinary levels.',
    evidence: ['gex-range', 'gex-range-es', 'gex-range-gold', 'gamma-real-iv', 'wall-placebo'],
    lesson: 'gamma-exposure-dealer-hedging.html',
  },
  {
    id: 'cot', kind: 'view', title: 'POSITIONING TERRAIN',
    shows: 'Three years of CFTC Commitments of Traders positioning for every market the desk follows: where speculators sit, week by week, and which are stretched against their own history.',
    read: [
      'Across = one ridge per market, grouped by asset class. Depth = report week, oldest at the back, the latest report at the front (its Tuesday as-of and Friday release are labelled).',
      'Height = speculators\' net position as a share of open interest (leveraged funds for financial contracts, managed money for commodities): net long rises above the glass, net short sinks below. One shared scale; clipped cells carry a white tip.',
      'Colour = direction (green net long, red net short), blending into gold as the week nears either end of that market\'s own range (90th percentile or above, 10th or below = full gold).',
      'A gold beacon at the front marks a market at the 90th percentile or above, or the 10th or below, of its own history (52 weeks minimum). JPY, CAD and CHF are in USD-pair terms.'
    ],
    unusual: 'A gold beacon: positioning at an extreme of its own past.',
    notTell: 'Who holds what, not which way the market goes. The registered test found crowded positioning does not predict returns (cot-positioning-factor null). One release-day result passed (price drifted slightly against a crowded book) but waits for held-out confirmation.',
    evidence: ['cot-positioning-factor', 'positioning-into-release-direction'],
    lesson: null,
  },
  {
    id: 'gamma', kind: 'view', title: 'GAMMA FLY',
    shows: 'A fly-through of one market\'s strike ladder: call and put open interest at each strike, and the net gamma they imply.',
    read: [
      'The corridor runs from the lowest strike (near you) to the highest (far away). The camera flies along it; drag or zoom to take over, PAUSE holds it.',
      'At each strike: call open interest rises in green on the right, put open interest hangs in red on the left, on one shared scale.',
      'The glowing ribbon traces net gamma strike by strike: cyan above the gamma flip, gold below it. The flip is a bright ring.',
      'The call wall and put wall carry tall labelled pylons; spot is a bright plane across the corridor; max pain is a small floor marker. The IV smile inset shows implied vol by strike.'
    ],
    unusual: 'Spot below the flip (on the gold side): dealers are modelled net short gamma there, the zone the desk calls amplified. The capture is nightly, not live.',
    notTell: 'Where open interest sits and the gamma it implies, never a forecast or target. The range pattern is validated on ES, underpowered on NQ and gold, and FX does not carry it. Walls act as ordinary levels and max pain is not a magnet.',
    evidence: ['gex-range', 'gex-range-es', 'gex-range-gold', 'gamma-real-iv', 'wall-placebo', 'oi-max-pain'],
    lesson: 'open-interest-walls-max-pain.html',
  },
  {
    id: 'flipmap', kind: 'view', title: 'FLIP MAP',
    shows: 'Every market with an option book, one bar each, showing how far spot sits from its gamma flip.',
    read: [
      'The gold centre line is the flip.',
      'A cyan bar to the right ending in a filled up-triangle = spot above the flip: dealers modelled net long gamma (moves damped).',
      'A red bar to the left ending in a hollow down-triangle = spot below the flip: short gamma (moves amplified).',
      'Length = distance in percent of spot, one shared scale. The figure on the right adds that distance in units of the market\'s usual day\'s range where the vol forecaster has one.',
      'The OI capture date sits in the corner; markets with no flip near spot are listed.'
    ],
    unusual: 'A market below the flip, or within a small fraction of its usual range of it. The headline counts how many sit above.',
    notTell: 'Where open interest sits against spot, not a forecast. The range pattern is validated on ES only (underpowered on NQ and gold), and FX does not carry it. No direction has been found from these levels.',
    evidence: ['gex-range', 'gex-range-es', 'gex-range-gold', 'gamma-real-iv'],
    lesson: 'gamma-exposure-dealer-hedging.html',
  },
  {
    id: 'book', kind: 'view', title: 'DESK CALLS',
    shows: 'The desk\'s written morning calls as glass towers on the same street grid as the market board, with what each market actually did today beside them.',
    read: [
      'A long call rises above the floor in green, a short call hangs below in red, with a triangle on the label. Every call stands the same height: height says nothing about strength.',
      'Conviction is the tower\'s width (thin low, middle medium, thick high), its brightness and the rings at its foot (1, 2 or 3). A hollow tower with "n/a" = no conviction in the feed.',
      'A flat card is a low plinth: solid outline = "Neutral - reviewed", dashed = "Not reviewed".',
      'The cyan bar beside each tower is the only measured height: today\'s open-to-close move against its usual move, a notch per usual move, clipped at 3 times with a gold cap. There is no shared scale with the towers.'
    ],
    unusual: 'A high-conviction call next to a large cyan bar, or a market that moved a lot with no call on it.',
    notTell: 'These are the desk\'s own written calls, not a forecast of ours, and the cyan bar is not a score. A higher conviction score has not been shown to mean a better trade (conviction-vote null). The bias engine\'s lean is deliberately not drawn here.',
    evidence: ['conviction-vote'],
    lesson: 'process-vs-outcome-decision-journals.html',
  },
  {
    id: 'precedent', kind: 'tool', title: 'PAST RELEASES',
    shows: 'Pick a release family and a market: how that market moved in the 30 minutes after past releases of that kind, in units of its typical 30-minute reaction.',
    read: [
      'The histogram counts past reactions by size and sign; the zero line sits between the bins either side of 0.',
      'The sparklines are single past release paths; the faint vertical line is the release minute.',
      'Units are the market\'s own typical 30-minute reaction, so 2 means twice the usual move.'
    ],
    unusual: 'A release family whose past reactions are mostly well beyond 1 unit moves that market a lot; one bunched near zero barely moves it.',
    notTell: 'History, not a forecast. The Evidence Book found each release moves each pair by a characteristic size and most move nothing (event-impact-map), and a bigger surprise brings a bigger range (surprise-size), but the direction after news is a coin flip.',
    evidence: ['event-impact-map', 'surprise-size'],
    lesson: 'event-trading-playbook.html',
  },
  {
    id: 'ask', kind: 'tool', title: 'ASK HELIX',
    shows: 'Type or speak a question; one answer drawn from today\'s book, the analysts\' reports, the desk\'s memory and the Evidence Book.',
    read: [
      'The answer cites what it used and says when the data does not answer.',
      'Each question is one model call, owner only, capped at 60 a day.',
      'Saying "show yields" or "go to the board" moves the picture instead; that is not a paid call.'
    ],
    unusual: 'An answer that says the data does not cover the question: that is the honest outcome, not an error.',
    notTell: 'A written description from the desk\'s own material, never a forecast or a trade. It is only as good as the sources it cites; check them.',
    evidence: [],
    lesson: null,
  },
  {
    id: 'explain', kind: 'tool', title: 'EXPLAIN A DAY',
    shows: 'Point at a day (by default the HUD\'s scrub date), pick a window and press EXPLAIN: one model call describes what surrounded that stretch from the news, releases, desk book and chain read.',
    read: [
      'One model call per press, owner only, 40 a day, cached per day.',
      'The answer describes what happened around the moves and links that broke; it is written after the fact.'
    ],
    unusual: 'A day with big moves but no release or news nearby: the answer will say it found nothing to tie them to.',
    notTell: 'Context after the fact, not cause and not a forecast. A story that fits a day is not evidence that the same story will matter next time.',
    evidence: [],
    lesson: null,
  },
  {
    id: 'papers', kind: 'tool', title: 'PAPERS',
    shows: 'Library papers that touch today\'s themes (markets that moved beyond noise, links that broke), plus what the repo\'s own Evidence Book says on them.',
    read: [
      'The query is built from the HUD; you can type a topic instead.',
      'Each paper is listed with the Evidence Book\'s own result beside it where one exists.'
    ],
    unusual: 'When nothing has moved beyond noise the panel says so and waits for a typed topic.',
    notTell: 'Papers describe other markets and eras. Our own tests are the check, and a paper is not a signal.',
    evidence: [],
    lesson: 'research-pipeline-hypothesis-to-backtest.html',
  },
  {
    id: 'alerts', kind: 'tool', title: 'ALERTS',
    shows: 'One inbox for every alert: this tab\'s watcher, the server watcher (which keeps going with the tab shut and sends to your phone) and the desk\'s own alert rules.',
    read: [
      'Each row is tagged THIS TAB, PHONE, SERVER or DESK RULE. The same sentence from the tab and the phone within 15 minutes is one row.',
      'The tab checks the live chain every two minutes; the server checks its memory every ten.',
      'One alert per event per six hours, at most twelve said aloud a day, and nothing aloud in quiet hours (22:00 to 07:00 London); it is still listed.',
      'WATCHING, QUIET HOURS, DESKTOP NOTIFICATIONS and WHILE YOU SLEPT are switches and a digest.'
    ],
    unusual: 'A burst of rows in a short time, or a server watcher that is not answering.',
    notTell: 'Awareness only: an alert says something moved or a link broke, never what to do about it.',
    evidence: [],
    lesson: null,
  },
  {
    id: 'system', kind: 'tool', title: 'SERVER',
    shows: 'The desk server\'s health: memory now and its peak since the last deploy, heap, uptime, how many services are on, and what is running in the container.',
    read: [
      'The first figures are the web server only; the list below adds the bots that run beside it, each with what it is for and the memory it holds.',
      'Rows marked LIVE are the trading bots. BUSIEST TODAY lists the jobs that took the most minutes, with any errors.',
      'Set "Alert me above" to your plan\'s memory to be warned when the server goes over it.'
    ],
    unusual: 'Memory near or above the limit you set (shown in amber), or a job with errors.',
    notTell: 'How the server is running, nothing about markets.',
    evidence: [],
    lesson: null,
  },
  {
    id: 'show', kind: 'tool', title: 'SHOW',
    shows: 'The narrated tour the newsletter uses: Helix speaks and the picture follows, scene by scene (the world, today\'s candles, the chain, the day ahead).',
    read: [
      'Each scene changes only when its narration has finished, never on a timer; the camera moves while it talks.',
      'With the voice off the same words appear as subtitles at reading speed. Esc ends it.',
      'The words come from fixed templates over the day\'s numbers; there is no model call.'
    ],
    unusual: 'A scene that says its data is missing: that view had nothing to draw today.',
    notTell: 'Description only: nothing in the tour is a forecast or a trade.',
    evidence: [],
    lesson: null,
  },
];

const BY_ID = new Map(HELIX_GUIDES.map(g => [g.id, g]));
/** The guide for a view or panel id, or null. */
export const guideFor = id => BY_ID.get(id) ?? null;
/** The ids that have a guide. */
export const guideIds = () => [...BY_ID.keys()];
/** The link for a guide's Theory Lab lesson, or null. */
export const lessonHref = g => (g?.lesson ? '/theory-lab/lessons/' + g.lesson : null);
/** The guide as plain text, for the voice (or a copy): title, what it shows, how to read it, what is unusual, what it does not tell you. */
export function guideText(g) {
  if (!g) return '';
  return [g.title + '.', g.shows, 'How to read it. ' + (g.read || []).join(' '), g.unusual ? 'What is unusual. ' + g.unusual : '', g.notTell ? 'What it does not tell you. ' + g.notTell : '']
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
/** The guide as HTML for a HUD card. esc escapes text; evidenceWord(id) -> a short label for an Evidence Book id (optional). */
export function guideHtml(g, esc, evidenceWord = id => id) {
  if (!g) return '<p>No guide has been written for this picture yet.</p>';
  const li = (g.read || []).map(x => '<li>' + esc(x) + '</li>').join('');
  const ev = (g.evidence || []).length ? '<p class="jv-sub">EVIDENCE BOOK: ' + g.evidence.map(id => ownerLink('/evidence.html#ev-' + id, esc(evidenceWord(id)), { target: '_blank' })).join(' · ') + '</p>' : '';
  const ls = g.lesson ? '<p class="jv-sub">THEORY LAB: <a href="' + esc(lessonHref(g)) + '" target="_blank" rel="noopener">' + esc(g.lesson.replace(/\.html$/, '').replace(/-/g, ' ')) + '</a></p>' : '';
  return '<h3>EXPLAIN · ' + esc(g.title) + '</h3><p>' + esc(g.shows) + '</p><h3>HOW TO READ IT</h3><ul>' + li + '</ul>'
    + (g.unusual ? '<h3>WHAT IS UNUSUAL</h3><p>' + esc(g.unusual) + '</p>' : '')
    + (g.notTell ? '<h3>WHAT IT DOES NOT TELL YOU</h3><p>' + esc(g.notTell) + '</p>' : '') + ev + ls;
}

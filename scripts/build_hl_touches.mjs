// Persists the dynamic-HL early-reaction touches (analysis/hl_early_reaction_tradeable_study.mjs's
// `processPair`, 2026-09-08) as a real, servable per-pair file -- {pair}-hltouches.json,
// same directory and same "pickFresher(R2, local)" pattern js/levelAtlasRoutes.js
// already uses for {pair}-votetrades.json.
//
// Each file's `touches` are RAW (unpriced) -- {rung, side, date, outcome, contTarget,
// revTarget, pip, checks:{5:{frac,ckTime,ckPrice}, 15:{...}, 30:{...}, 60:{...}}} plus
// splitDate for the IS/OOS cut. The live backtest route
// (js/levelAtlasRoutes.js's /api/level-atlas/hl-vote-portfolio) prices these on
// request via js/hlSignalCore.js's priceTradeFromTouch, for whatever
// checkpoint/band combination the page's config asks for -- pricing is cheap,
// the expensive part (the M1 walk itself) only needs doing ONCE per pair here,
// not on every page load. Same division of labour build_p90_votetrades.mjs
// already established for the p90 rung.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processPair, ALL_PAIRS } from '../analysis/hl_early_reaction_tradeable_study.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'analysis', 'output', 'level-atlas-vote-trades');
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ALL_PAIRS;

let builtCount = 0;
for (const pair of PAIRS) {
  console.log(`${pair.toUpperCase()}:`);
  const result = await processPair(pair);
  if (!result) { console.log('  skipped (see reason above)'); continue; }
  const out = {
    instrument: result.pair, splitDate: result.splitDate, coverage: result.coverage,
    generatedAt: new Date().toISOString(), touches: result.records,
  };
  fs.writeFileSync(path.join(DIR, `${pair}-hltouches.json`), JSON.stringify(out));
  console.log(`  wrote ${result.records.length} touches (split ${result.splitDate})`);
  builtCount++;
}
console.log(`\nBuilt ${builtCount}/${PAIRS.length} pairs' HL touches files.`);

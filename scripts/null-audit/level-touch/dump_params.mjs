// Dump LADDER_PARAMS as of the banking commit (e27a2775) to JSON for the independent re-implementation.
// First: git show e27a2775:js/forecastLadderParams.js > scripts/null-audit/level-touch/_lp_banked.mjs
// (then delete it). Output committed as ladder_params_2026-09-10.json.
import fs from 'fs';
import { LADDER_PARAMS } from './_lp_banked.mjs';
fs.writeFileSync(new URL('./ladder_params_2026-09-10.json', import.meta.url), JSON.stringify(LADDER_PARAMS));
console.log(LADDER_PARAMS.generated, Object.keys(LADDER_PARAMS.pairs).length);

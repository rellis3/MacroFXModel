// Theory Lab URL normalisation.   node js/theoryLabUrl.test.mjs
import { normaliseTheoryLabPath as n } from './theoryLabUrl.js';
let failures = 0;
const eq = (name, got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { console.log(`  ✗ FAIL ${name}  got ${a}, want ${b}`); failures++; } };

eq('/theory-lab redirects to the trailing-slash form', n('/theory-lab'), { redirect: '/theory-lab/' });
eq('/theory-lab/ is the start page', n('/theory-lab/'), { path: '/theory-lab/index.html' });
// The regression this exists for: an extensionless URL must be rewritten to the .html form, which is
// the form every strip/404 rule is keyed on. These all used to be served raw by express.static.
eq('replay without .html', n('/theory-lab/replay'), { path: '/theory-lab/replay.html' });
eq('drill page without .html', n('/theory-lab/market-reading'), { path: '/theory-lab/market-reading.html' });
eq('admin-only lesson without .html', n('/theory-lab/lessons/action-edge-decay'), { path: '/theory-lab/lessons/action-edge-decay.html' });
eq('institutional lesson without .html', n('/theory-lab/lessons/institutional-dupire-local-vol'), { path: '/theory-lab/lessons/institutional-dupire-local-vol.html' });
eq('visual guide without .html', n('/theory-lab/lessons/kelly-criterion-micro'), { path: '/theory-lab/lessons/kelly-criterion-micro.html' });
eq('hub without .html', n('/theory-lab/hub'), { path: '/theory-lab/hub.html' });
// An encoded dot must not be a way round it: the rewritten path still fails to match a real file.
eq('encoded dot is not a bypass', n('/theory-lab/replay%2ehtml'), { path: '/theory-lab/replay%2ehtml.html' });
// Left alone: pages already in the .html form, and everything with an extension.
for (const p of ['/theory-lab/hub.html', '/theory-lab/lessons/kelly-criterion.html', '/theory-lab/assets/theory.css',
  '/theory-lab/audio/kelly-criterion.m4a', '/theory-lab/capstone-board.json', '/theory-lab/desk-verdicts.json',
  '/', '/index.html', '/api/ohlc-range', '/theory-labs', '/education/notes']) eq('untouched: ' + p, n(p), null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);

// Synthetic, no-network unit test for the round-number fade/follow adapter.
import { roundNumberLean, blendLean } from './roundNumberLean.js';

const pip = 0.0001;            // majorUnit = 0.1 (1.3000), minorUnit = 0.01 (1.30, 1.31…)
const fig = 1.3000;
let fail = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fail++; };

// 1) Exactly at a big figure → max FADE (−1).
let r = roundNumberLean({ price: fig, pipSize: pip });
ok('at big figure → fade ≈ −1', r.mode === 'fade' && Math.abs(r.lean + 1) < 1e-6, JSON.stringify(r));

// 2) Inside the magnet band (2 pips above), no ref → partial FADE, weaker than at figure.
r = roundNumberLean({ price: fig + 2 * pip, pipSize: pip });
ok('2p from figure → fade, |lean|<1', r.mode === 'fade' && r.lean < 0 && r.lean > -1, `lean=${r.lean}`);

// 3) Outside magnet, NOT breached (approaching from above, ref above figure) → neutral.
r = roundNumberLean({ price: fig + 8 * pip, refPrice: fig + 5 * pip, pipSize: pip });
ok('8p above, not crossed → none', r.mode === 'none' && r.lean === 0, `lean=${r.lean}`);

// 4) Breached upward (ref below figure, now 8p above) → FOLLOW (positive).
r = roundNumberLean({ price: fig + 8 * pip, refPrice: fig - 5 * pip, pipSize: pip });
ok('breached up, 8p beyond → follow >0', r.mode === 'follow' && r.lean > 0, `lean=${r.lean}`);

// 5) Follow strength decays with distance beyond (4p closer than 12p past the figure).
const near = roundNumberLean({ price: fig + 4 * pip, refPrice: fig - 3 * pip, pipSize: pip });
const far  = roundNumberLean({ price: fig + 12 * pip, refPrice: fig - 3 * pip, pipSize: pip });
ok('follow decays with distance beyond', near.lean > far.lean && far.lean >= 0, `near=${near.lean} far=${far.lean}`);

// 6) Beyond the cascade band (20p past) → exhausted → neutral.
r = roundNumberLean({ price: fig + 20 * pip, refPrice: fig - 3 * pip, pipSize: pip });
ok('20p beyond (past cascade) → none', r.mode === 'none', `lean=${r.lean}`);

// 7) Half-figure magnet is weaker than big-figure magnet (minorWeight).
const bigAt   = roundNumberLean({ price: 1.3000, pipSize: pip });
const halfAt  = roundNumberLean({ price: 1.3100, pipSize: pip });  // minor multiple of 0.01
ok('half-figure fade weaker than big-figure', halfAt.type === 'minor' && Math.abs(halfAt.lean) < Math.abs(bigAt.lean), `big=${bigAt.lean} half=${halfAt.lean}`);

// 8) Symmetry: breached DOWNWARD → follow (negative price side, still +follow lean by convention).
r = roundNumberLean({ price: fig - 8 * pip, refPrice: fig + 5 * pip, pipSize: pip });
ok('breached down, 8p beyond → follow >0', r.mode === 'follow' && r.lean > 0, `lean=${r.lean}`);

// 9) All leans bounded in [-1,1] across a sweep.
let bad = 0;
for (let k = -250; k <= 250; k++) {
  const x = fig + k * pip;
  const a = roundNumberLean({ price: x, pipSize: pip });
  const b = roundNumberLean({ price: x, refPrice: fig - 30 * pip, pipSize: pip });
  if (a.lean < -1 || a.lean > 1 || b.lean < -1 || b.lean > 1) bad++;
}
ok('leans bounded in [-1,1] over sweep', bad === 0, `violations=${bad}`);

// 10) blendLean combines path + level leans, stays in [-1,1].
ok('blendLean(+0.8, −0.6, .5) midpoint', blendLean(0.8, -0.6, 0.5) === 0.1, `got=${blendLean(0.8, -0.6, 0.5)}`);
ok('blendLean clamps to [-1,1]', blendLean(1, 1, 0.5) === 1 && blendLean(-1, -1, 0.5) === -1);

console.log(fail === 0 ? '\nALL PASSED ✓' : `\n${fail} FAILED ✗`);
if (fail) process.exit(1);

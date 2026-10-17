from ._wb import *

# ── Vasicek, CIR and Hull-White (short-rate-models-vasicek-cir-hull-white) ───
# Paths: the lesson's own simulated Vasicek and CIR paths (a = 0.20, b = 0.5%, sigma = 1%,
# r0 = 0.5%, identical shocks), read back from its chart and thinned to every second point.
# Feller numbers: the lesson's worked example. ECB deposit facility rate: lesson's endpoints
# (-0.10% Jun 2014, -0.50% Sep 2019, 0 Jul 2022, 4.00% Sep 2023) plus the published steps
# between them; dates are effective months, approx.
VAS = [[0.0, 0.5], [0.13, 1.19], [0.27, 1.21], [0.4, 0.85], [0.53, 1.19], [0.67, 1.83], [0.8, 1.77], [0.93, 1.84], [1.07, 2.02], [1.2, 1.52], [1.33, 0.96], [1.47, 0.8], [1.6, 0.7], [1.73, 0.46], [1.87, 0.51], [2.0, 0.47], [2.13, 0.59], [2.27, 1.08], [2.4, 1.2], [2.53, 0.83], [2.67, 1.02], [2.8, 0.55], [2.93, 0.18], [3.07, 0.09], [3.2, 0.54], [3.33, 0.35], [3.47, 0.49], [3.6, 0.83], [3.73, 1.33], [3.87, 1.07], [4.0, 1.16], [4.13, 0.79], [4.27, 0.45], [4.4, 0.63], [4.53, 0.65], [4.67, 0.79], [4.8, 0.45], [4.93, 0.98], [5.07, 1.28], [5.2, 1.47], [5.33, 1.27], [5.47, 1.39], [5.6, 1.47], [5.73, 1.8], [5.87, 1.5], [6.0, 1.68], [6.13, 1.55], [6.27, 1.64], [6.4, 1.09], [6.53, 1.76], [6.67, 1.83], [6.8, 1.68], [6.93, 1.0], [7.07, 0.77], [7.2, 0.71], [7.33, 0.72], [7.47, 0.42], [7.6, -0.08], [7.73, -0.05], [7.87, -0.04], [8.0, 0.07], [8.13, 0.19], [8.27, -0.47], [8.4, -0.59], [8.53, -0.74], [8.67, -0.48], [8.8, -0.44], [8.93, -1.12], [9.07, -1.32], [9.2, -1.97], [9.33, -1.57], [9.47, -0.93], [9.6, -0.92], [9.73, -0.98], [9.87, -1.07], [10.0, -0.68]]
CIR = [[0.0, 0.5], [0.13, 0.55], [0.27, 0.55], [0.4, 0.52], [0.53, 0.55], [0.67, 0.6], [0.8, 0.59], [0.93, 0.6], [1.07, 0.61], [1.2, 0.57], [1.33, 0.53], [1.47, 0.52], [1.6, 0.51], [1.73, 0.49], [1.87, 0.5], [2.0, 0.49], [2.13, 0.5], [2.27, 0.54], [2.4, 0.55], [2.53, 0.52], [2.67, 0.53], [2.8, 0.5], [2.93, 0.47], [3.07, 0.47], [3.2, 0.5], [3.33, 0.48], [3.47, 0.49], [3.6, 0.52], [3.73, 0.55], [3.87, 0.54], [4.0, 0.54], [4.13, 0.52], [4.27, 0.49], [4.4, 0.5], [4.53, 0.51], [4.67, 0.52], [4.8, 0.49], [4.93, 0.53], [5.07, 0.55], [5.2, 0.56], [5.33, 0.55], [5.47, 0.56], [5.6, 0.56], [5.73, 0.59], [5.87, 0.57], [6.0, 0.58], [6.13, 0.57], [6.27, 0.58], [6.4, 0.54], [6.53, 0.59], [6.67, 0.59], [6.8, 0.58], [6.93, 0.53], [7.07, 0.51], [7.2, 0.51], [7.33, 0.51], [7.47, 0.49], [7.6, 0.45], [7.73, 0.45], [7.87, 0.46], [8.0, 0.46], [8.13, 0.47], [8.27, 0.43], [8.4, 0.42], [8.53, 0.41], [8.67, 0.43], [8.8, 0.43], [8.93, 0.38], [9.07, 0.37], [9.2, 0.33], [9.33, 0.36], [9.47, 0.4], [9.6, 0.4], [9.73, 0.39], [9.87, 0.39], [10.0, 0.41]]

ECB_NEG = [[2014.0, 0], [2014.44, 0], [2014.44, -0.1], [2014.69, -0.1], [2014.69, -0.2], [2015.94, -0.2],
           [2015.94, -0.3], [2016.21, -0.3], [2016.21, -0.4], [2019.71, -0.4], [2019.71, -0.5], [2022.57, -0.5]]
ECB_UP = [[2022.57, -0.5], [2022.57, 0], [2022.7, 0], [2022.7, 0.75], [2022.84, 0.75], [2022.84, 1.5],
          [2022.97, 1.5], [2022.97, 2.0], [2023.11, 2.0], [2023.11, 2.5], [2023.22, 2.5], [2023.22, 3.0],
          [2023.36, 3.0], [2023.36, 3.25], [2023.47, 3.25], [2023.47, 3.5], [2023.59, 3.5], [2023.59, 3.75],
          [2023.72, 3.75], [2023.72, 4.0], [2024.0, 4.0]]

P = (10, 10, 580, 300)
SR = dict(w=600, h=750, intro='One short rate, three models. Watch what each model\'s noise term does near zero, then what real rates did from 2014 to 2023. Press play, or step through.', steps=[
    step('The short rate is the interest rate on the shortest possible loan. Vasicek\'s picture: it wanders, but a spring pulls it back towards a long-run level b. In the lesson\'s example b = 0.5%.',
         chart('p', P, 'Short rate, %: one simulated 10-year path', [0, 10], [-2.4, 2.5],
               [[-2, '−2%'], [-1, '−1%'], [0, '0%'], [1, '1%'], [2, '2%']], [[0, '0'], [5, '5 yr'], [10, '10 yr']], zero=True, pl=50, pr=20),
         series('b', 'p', [[0, 0.5], [10, 0.5]], None, dash=True, ms=500, label='b = 0.5%', lat=[10, 0.5], ldx=-4, ldy=-12, lanchor='end', lsize=17)),
    step('The spring is the drift, a(b − r). With speed a = 0.20, a rate sitting at 2% is pulled down at 0.20 × (0.5% − 2%) = −0.3% a year. The further away, the harder the pull.',
         box('pull', 20, 330, 560, 78, 'pull = a(b − r)\nat r = 2%:  0.20 × (0.5% − 2%) = −0.3% a year', 'purple', size=19)),
    step('Add random shocks of a constant size, σ = 1%, and you have Vasicek. Here is one simulated path from the lesson, ten years long.',
         dict(hide='pull'),
         box('vas', 20, 330, 270, 78, 'Vasicek\nsame noise σ at every level', 'amber', size=18),
         series('vp', 'p', VAS, 'amber', ms=2200)),
    step('Nothing stops it crossing zero: the shove at 0% is as big as at 2%. This run tops out near 2.0% and, late on, falls to about −2.0%.',
         dot('vmax', 'p', [1.07, 2.02], '2.0%', 'amber', dx=8, dy=-4, anchor='start'),
         dot('vmin', 'p', [9.2, -1.97], '−2.0%', 'red', dx=-10, dy=4, anchor='end')),
    step('CIR keeps the same pull but multiplies the shock by the square root of the rate. At 0.5%, the square root is about 0.07, so the shove is about one fourteenth of Vasicek\'s. At zero it is nothing.',
         box('cir', 310, 330, 270, 78, 'CIR\nnoise σ√r shrinks near 0%', 'green', size=18)),
    step('Same parameters, same shocks, CIR\'s noise instead. The path never leaves a band between about 0.33% and 0.61%, and never goes below zero.',
         dict(dim='vp'), dict(dim='vmax'), dict(dim='vmin'),
         series('cp', 'p', CIR, 'green', ms=2000)),
    step('Why it holds: the Feller condition, 2ab ≥ σ². Here 2 × 0.20 × 0.005 = 0.002, against σ² = 0.0001. The pull beats the noise by a factor of 20, so the rate never touches zero.',
         box('fel', 20, 424, 560, 64, 'Feller:  2ab = 0.002  ≥  σ² = 0.0001   ✓ (× 20)', 'green', size=19)),
    step('Hull-White solves a different problem. With fixed settings, Vasicek draws one natural yield-curve shape, and today\'s real curve rarely matches it. Hull-White swaps the fixed target for θ(t), a target that moves over time, chosen so the model reprices today\'s curve exactly.',
         dict(hide='vas'), dict(hide='cir'), dict(hide='fel'),
         icon('crv', 'scroll', 40, 330, 0.72, 'blue', "today's curve", lsize=17),
         box('hw', 220, 336, 360, 78, 'Hull-White: target θ(t)\nmoves to fit today\'s curve', 'purple', size=18),
         arrow('crv', 'hw', 'calibrate', 'purple', id='cal')),
    step('Then reality. The ECB cut its deposit rate to −0.10% in June 2014, then in steps to −0.50% by September 2019. CIR said this was impossible.',
         chart('ecb', (10, 450, 580, 290), 'ECB deposit rate, % (approx. dates)', [2014, 2024], [-1.6, 4.5],
               [[0, '0%'], [2, '2%'], [4, '4%']], [[2014, '2014'], [2016, '2016'], [2019, '2019'], [2022, '2022'], [2024, '2024']], zero=True, pl=50, pr=20),
         series('neg', 'ecb', ECB_NEG, 'red', ms=1800),
         dot('m50', 'ecb', [2019.71, -0.5], '−0.50%', 'red', dx=0, dy=-14)),
    step('And Vasicek gave real odds to −3%. Neither happened: rates sat just below zero for eight years. The deepest major policy rates reached about −0.75% (the Swiss rate from 2015), because past that, holding cash is cheaper. A soft floor no model here has.',
         series('flr', 'ecb', [[2014, -0.75], [2024, -0.75]], 'amber', dash=True, ms=600, label='≈ −0.75% floor', lat=[2014, -0.75], ldx=4, ldy=18, lanchor='start', lsize=17)),
    step('Then the exit: zero in July 2022 and 4.00% by September 2023, 4.5 points in fourteen months. One fixed long-run level fits eight pinned years and a sprint very badly.',
         series('up', 'ecb', ECB_UP, 'blue', ms=1400),
         dot('top', 'ecb', [2023.72, 4.0], '4.00%', 'blue', dx=-8, dy=-10, anchor='end')),
    step('The noise term decides where a rate model puts the floor: CIR at a hard wall at zero, Vasicek and Hull-White nowhere. Check that floor against the regime you are actually in.',
         dict(hide='hw'), dict(hide='crv'), dict(hide='cal'),
         box('end', 20, 336, 560, 84, 'CIR: wall at 0  ·  Vasicek: no floor\ndata 2014–2022: soft floor ≈ −0.75%', 'amber', size=19)),
])


BOARD = dict(name='short_rate_models_vasicek_cir_hull_white', lesson='short-rate-models-vasicek-cir-hull-white',
             title='Three short-rate models and the floor at zero', cfg=SR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=10)

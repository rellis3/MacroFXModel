from ._wb import *

# ── Stochastic PDEs (stochastic-pdes) ────────────────────────────────────────
# Curve: the lesson's worked-example forward curve (3.00 / 3.80 / 4.20 / 4.35% at 0 / 5 / 10 / 15y),
# joined by straight segments; slopes 0.16 / 0.08 / 0.03 pp per year of tenor are the lesson's.
# Paths: the lesson's own one-year simulated realisation of three tenors (front, ~5y, ~10y),
# read back from its chart. The parallel-shift and steepener curves are illustrative.
CURVE = [[0, 3.0], [5, 3.8], [10, 4.2], [15, 4.35]]
FRONT = [[0.0, 3.0], [0.017, 2.992], [0.034, 3.031], [0.051, 3.048], [0.068, 3.051], [0.085, 3.084], [0.102, 3.023], [0.119, 3.024], [0.136, 2.943], [0.153, 2.994], [0.169, 3.008], [0.186, 3.039], [0.203, 3.003], [0.22, 3.04], [0.237, 2.982], [0.254, 2.99], [0.271, 3.009], [0.288, 2.974], [0.305, 3.003], [0.322, 2.958], [0.339, 3.039], [0.356, 3.115], [0.373, 3.079], [0.39, 3.076], [0.407, 3.111], [0.424, 3.139], [0.441, 3.084], [0.458, 3.075], [0.475, 3.055], [0.492, 3.02], [0.508, 3.018], [0.525, 3.077], [0.542, 3.016], [0.559, 3.083], [0.576, 3.058], [0.593, 3.026], [0.61, 3.103], [0.627, 2.966], [0.644, 2.938], [0.661, 3.037], [0.678, 3.109], [0.695, 3.108], [0.712, 3.035], [0.729, 3.159], [0.746, 3.077], [0.763, 3.169], [0.78, 3.191], [0.797, 3.183], [0.814, 3.182], [0.831, 3.138], [0.847, 3.108], [0.864, 3.181], [0.881, 3.195], [0.898, 3.145], [0.915, 3.175], [0.932, 3.18], [0.949, 3.153], [0.966, 3.15], [0.983, 3.113], [1.0, 3.119]]
MID = [[0.0, 3.8], [0.017, 3.795], [0.034, 3.791], [0.051, 3.784], [0.068, 3.791], [0.085, 3.795], [0.102, 3.802], [0.119, 3.799], [0.136, 3.79], [0.153, 3.783], [0.169, 3.807], [0.186, 3.761], [0.203, 3.736], [0.22, 3.702], [0.237, 3.703], [0.254, 3.731], [0.271, 3.753], [0.288, 3.734], [0.305, 3.729], [0.322, 3.699], [0.339, 3.718], [0.356, 3.718], [0.373, 3.75], [0.39, 3.76], [0.407, 3.779], [0.424, 3.762], [0.441, 3.792], [0.458, 3.814], [0.475, 3.759], [0.492, 3.773], [0.508, 3.782], [0.525, 3.809], [0.542, 3.836], [0.559, 3.834], [0.576, 3.88], [0.593, 3.843], [0.61, 3.866], [0.627, 3.885], [0.644, 3.862], [0.661, 3.828], [0.678, 3.814], [0.695, 3.776], [0.712, 3.803], [0.729, 3.812], [0.746, 3.808], [0.763, 3.757], [0.78, 3.804], [0.797, 3.789], [0.814, 3.783], [0.831, 3.794], [0.847, 3.802], [0.864, 3.8], [0.881, 3.816], [0.898, 3.849], [0.915, 3.885], [0.932, 3.947], [0.949, 3.944], [0.966, 3.954], [0.983, 3.896], [1.0, 3.874]]
LONG = [[0.0, 4.2], [0.017, 4.199], [0.034, 4.178], [0.051, 4.175], [0.068, 4.192], [0.085, 4.181], [0.102, 4.2], [0.119, 4.208], [0.136, 4.214], [0.153, 4.219], [0.169, 4.203], [0.186, 4.167], [0.203, 4.18], [0.22, 4.192], [0.237, 4.188], [0.254, 4.197], [0.271, 4.204], [0.288, 4.197], [0.305, 4.23], [0.322, 4.24], [0.339, 4.251], [0.356, 4.23], [0.373, 4.209], [0.39, 4.205], [0.407, 4.237], [0.424, 4.229], [0.441, 4.22], [0.458, 4.209], [0.475, 4.194], [0.492, 4.211], [0.508, 4.213], [0.525, 4.217], [0.542, 4.222], [0.559, 4.248], [0.576, 4.249], [0.593, 4.246], [0.61, 4.255], [0.627, 4.261], [0.644, 4.26], [0.661, 4.253], [0.678, 4.247], [0.695, 4.249], [0.712, 4.248], [0.729, 4.266], [0.746, 4.269], [0.763, 4.282], [0.78, 4.29], [0.797, 4.271], [0.814, 4.298], [0.831, 4.274], [0.847, 4.284], [0.864, 4.267], [0.881, 4.272], [0.898, 4.272], [0.915, 4.279], [0.932, 4.281], [0.949, 4.3], [0.966, 4.315], [0.983, 4.317], [1.0, 4.327]]
UP = [[x, round(v + 0.25, 2)] for x, v in CURVE]
STEEP = [[0, 2.8], [5, 3.75], [10, 4.35], [15, 4.6]]

SP = dict(w=600, h=726, intro='One forward curve, from a single point to the whole moving band, and back down to a short-rate model. Press play, or step through.', steps=[
    step('Start with one number: the short rate, 3.00% in the lesson\'s example. A short-rate model like Vasicek or Hull-White watches only this point.',
         chart('fc', (10, 10, 580, 270), 'Forward rate, % by tenor (years)', [0, 15], [2.5, 4.9],
               [[3, '3%'], [4, '4%']], [[0, '0'], [5, '5'], [10, '10'], [15, '15 yr']], pl=46, pr=24),
         dot('r0', 'fc', [0, 3.0], 'short rate 3.00%', 'green', dx=12, dy=12, anchor='start')),
    step('But the market has a rate for every maturity. Here is the lesson\'s forward curve: 3.80% at 5 years, 4.20% at 10, 4.35% at 15. The real object is this whole curve.',
         series('crv', 'fc', CURVE, 'purple', ms=1200),
         dot('r5', 'fc', [5, 3.8], '3.80%', 'blue', dx=6, dy=18, anchor='start'),
         dot('r10', 'fc', [10, 4.2], '4.20%', 'blue', dx=6, dy=18, anchor='start'),
         dot('r15', 'fc', [15, 4.35], '4.35%', 'blue', dx=-6, dy=20, anchor='end')),
    step('The whole curve moves at once, like a rubber band flexing along its length. Here is one simulated year from the lesson, at three tenors. The front ranges from 2.94% to 3.20%; the 10-year only from 4.17% to 4.33%.',
         chart('pc', (10, 296, 580, 250), 'Three tenors over one simulated year, %', [0, 1], [2.8, 4.5],
               [[3, '3%'], [3.5, '3.5%'], [4, '4%']], [[0, '0'], [0.5, '6 mo'], [1, '1 yr']], pl=56, pr=20),
         series('pf', 'pc', FRONT, 'green', ms=1300, label='front', lat=[1, FRONT[-1][1]], ldx=-4, ldy=-16, lanchor='end'),
         series('pm', 'pc', MID, 'blue', ms=1100, label='5y', lat=[1, MID[-1][1]], ldx=-4, ldy=-16, lanchor='end'),
         series('pl', 'pc', LONG, 'purple', ms=1000, label='10y', lat=[1, LONG[-1][1]], ldx=-4, ldy=-16, lanchor='end')),
    step('Noise hits every tenor at every instant. Nearby tenors move alike, distant ones less so. In its purest form, space-time white noise, it is so rough it has no value at any single point: it only makes sense averaged over a stretch.',
         box('wn', 20, 562, 560, 70, 'noise at every tenor, every instant\nonly meaningful once averaged over a stretch', 'amber', size=18)),
    step('The solution is built like the one-number case: carry today\'s curve forward with the noise-free dynamics, then add every past burst of noise, each carried forward to now. That is the mild solution.',
         box('mild', 20, 648, 560, 62, 'u(t) = S(t) u(0) + ∫ S(t − s) dW(s)', 'purple', size=21)),
    step('In Musiela\'s form, written by time to maturity, there is a curve-slide term: each tenor slides down the slope as time passes. At the front the slope is 0.16 points per year of tenor, then 0.08, then 0.03. Traders call it rolling down the curve.',
         cnote('s1', 'fc', [2.5, 3.4], '+0.16/yr', 'amber', 17, anchor='end', dx=-8, dy=-8),
         cnote('s2', 'fc', [7.5, 4.0], '+0.08/yr', 'amber', 17, anchor='end', dx=-8, dy=-10),
         cnote('s3', 'fc', [12.5, 4.28], '+0.03/yr', 'amber', 17, anchor='end', dx=-6, dy=-14)),
    step('No-arbitrage pins the rest of the drift. Choose how volatile each tenor is, and the drift is forced: volatility at x times the volatility summed from the short end out to x. It is not a free choice.',
         dict(hide='wn'), dict(hide='mild'),
         box('hjm', 20, 562, 560, 70, 'HJM drift:  α(t,x) = σ(t,x) ∫₀ˣ σ(t,u) du\npick the volatility; the drift follows', 'purple', size=18)),
    step('Sample the curve at four tenors and the one SPDE becomes four coupled SDEs: an ordinary vector SDE, the machinery of the multivariate lesson.',
         box('four', 20, 648, 560, 62, '4 tenor points → 4 coupled SDEs', 'blue', size=20),
         dict(pulse='r0'), dict(pulse='r5'), dict(pulse='r10'), dict(pulse='r15')),
    step('Now keep only the short end. Everything else is thrown away, and one mean-reverting equation is left: a Hull-White style short-rate model.',
         dict(dim='crv'), dict(dim='r5'), dict(dim='r10'), dict(dim='r15'), dict(dim='s1'), dict(dim='s2'), dict(dim='s3'),
         dict(pulse='r0'),
         dict(hide='four'),
         box('hw', 20, 648, 560, 62, 'keep x = 0 only → dr = [θ(t) − a r] dt + σ dW', 'green', size=19)),
    step('The cost: one factor moves every tenor with the same shock, so the curve can only shift in lockstep (dashed, illustrative). A steepener, front down and long end up, is a shape it cannot produce.',
         series('up', 'fc', UP, 'blue', dash=True, ms=900, label='one factor: shift', lat=[15, 4.6], ldx=-4, ldy=-14, lanchor='end'),
         series('st', 'fc', STEEP, 'red', dash=True, ms=900),
         cnote('stl', 'fc', [5, 3.75], 'steepener', 'red', 17, anchor='start', dx=10, dy=34)),
    step('The same idea runs filtering. The filter\'s belief about a hidden state is itself a whole curve, and it evolves by an SPDE, the Zakai equation. The Kalman filter solves it exactly when everything is linear and Gaussian; the particle filter approximates it otherwise.',
         dict(hide='pf'), dict(hide='pm'), dict(hide='pl'), dict(hide='pc'),
         box('zk', 20, 300, 560, 60, 'Zakai (1969): the filter\'s density is an SPDE too', 'amber', size=19),
         box('kf', 20, 412, 250, 70, 'Kalman\nexact, linear-Gaussian', 'blue', size=18),
         box('pfl', 330, 412, 250, 70, 'Particle filter\nMonte Carlo, general', 'purple', size=18),
         arrow('zk', 'kf', None, 'blue'), arrow('zk', 'pfl', None, 'purple')),
    step('Full SPDE machinery is rare outside specialist curve desks and filtering research. Its value is knowing what your one-point or few-factor model has thrown away, and whether your risk lives there.',
         dict(pulse='st'), dict(pulse='r0')),
])


BOARD = dict(name='stochastic_pdes', lesson='stochastic-pdes', title='SPDEs: the whole curve, and what a short-rate model keeps',
             cfg=SP, before='  <div class="tl-section-mark"><span>Section 03</span></div>', deck_after=8)

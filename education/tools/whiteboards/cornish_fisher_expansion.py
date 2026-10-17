from ._wb import *
from statistics import NormalDist

# ── Cornish-Fisher: same formula, the quantile mark moves (cornish-fisher-expansion) ──
# The lesson's worked example: mu = 0, sigma = 1.20%, S = -0.5, K = 3, 95% (z = -1.645).
#   skew term -0.14217, kurtosis term +0.06045, S^2 term +0.00471 -> z_CF = -1.7220
#   Gaussian VaR 1.974%, CF VaR 2.066% (+4.7%)
# The lesson's own calculator at 99%: Gaussian 2.792%, CF 3.962% (+42%).
# The breakdown (lesson pitfall), from the same formula: S = -3, K = 0 gives
#   95%: 2.794%, 99%: 1.374%  -> the 99% "VaR" is smaller than the 95%: not a valid quantile.
# March 2020 facts from the lesson: S&P 500 -12% on 16 March (worst since Oct 1987), VIX closed
# above 82; exceptions far more than 1 in 100; ECB temporarily cut the multiplier in April 2020.


def cf(p, S, K, sig=1.2):
    z = NormalDist().inv_cdf(1 - p / 100)
    t1, t2, t3 = (z * z - 1) * S / 6, (z ** 3 - 3 * z) * K / 24, -(2 * z ** 3 - 5 * z) * S * S / 36
    zc = z + t1 + t2 + t3
    return z, t1, t2, t3, zc, -z * sig, -zc * sig


z, t1, t2, t3, zc, g95, c95 = cf(95, -0.5, 3)
_, _, _, _, _, g99, c99 = cf(99, -0.5, 3)
b95, b99 = cf(95, -3, 0)[6], cf(99, -3, 0)[6]
assert round(g95, 3) == 1.974 and round(c95, 3) == 2.066 and round(g99, 3) == 2.792 and round(c99, 3) == 3.962
assert round(b95, 2) == 2.79 and round(b99, 2) == 1.37


def X(v):  # ruler: z from -2.0 (x = 50) to -1.5 (x = 550)
    return round(50 + (v + 2.0) * 1000, 1)


RY = 176
CH = (10, 420, 580, 260)
CF = dict(w=600, h=800, intro='A VaR formula that assumes a bell curve, a return series that isn\'t one, and a single number that gets nudged. Press play, or step through.', steps=[
    step('The everyday VaR recipe assumes returns follow a bell curve: VaR = −μ − z·σ. At 95% confidence z = −1.645. With μ = 0 and σ = 1.20% a day, VaR is 1.974%.',
         box('f', 15, 15, 330, 84, 'VaR = −μ − z·σ', 'purple', sub='μ = 0 · σ = 1.20%', size=22),
         box('var', 385, 15, 200, 84, '95% VaR', 'blue', sub='1.974%', size=20)),
    step('Think of z as a mark on a ruler. For a perfect bell curve, the 95% mark sits at −1.645.',
         dict(line='ruler', points=[[50, RY], [550, RY]], tone='chalk', width=3, ms=700),
         note('t1', 50, RY + 34, '−2.0', None, 17), note('t2', 150, RY + 34, '−1.9', None, 17), note('t3', 250, RY + 34, '−1.8', None, 17),
         note('t4', 350, RY + 34, '−1.7', None, 17), note('t5', 450, RY + 34, '−1.6', None, 17), note('t6', 550, RY + 34, '−1.5', None, 17),
         note('dir', 170, RY - 34, '← further into the loss tail', 'red', 17),
         chip('z', X(-1.645), RY, 'z', 'blue'),
         box('zv', 190, 236, 220, 70, 'the mark z', 'blue', sub='−1.645', size=19)),
    step('But this series is not a bell curve. Its skewness is S = −0.5: crashes are bigger than rallies. Its excess kurtosis is K = 3: extreme days come more often than a bell curve says.',
         box('S', 15, 324, 270, 70, 'skew S = −0.5', 'amber', size=20),
         box('K', 315, 324, 270, 70, 'excess kurtosis K = 3', 'purple', size=20)),
    step('Cornish and Fisher, 1938: keep the formula, nudge the mark. First the skew term, (z² − 1)·S ÷ 6 = −0.142. Negative skew drags the mark further into the loss tail.',
         dict(pulse='S'),
         move('z', X(z + t1), RY, 1000),
         dict(count='zv', **{'from': -1.645, 'to': round(z + t1, 3), 'dp': 3, 'ms': 1000})),
    step('Then the fat-tail term, (z³ − 3z)·K ÷ 24 = +0.060. At 95% it pulls the mark slightly back in. Beyond about 95.8% confidence it pushes the other way.',
         dict(pulse='K'),
         move('z', X(z + t1 + t2), RY, 900),
         dict(count='zv', **{'from': round(z + t1, 3), 'to': round(z + t1 + t2, 3), 'dp': 3, 'ms': 900})),
    step('A small second skew term, +0.005, and the mark settles at z_CF ≈ −1.722.',
         move('z', X(zc), RY, 600),
         dict(count='zv', **{'from': round(z + t1 + t2, 3), 'to': -1.722, 'dp': 3, 'ms': 600}),
         dict(sub='zv', text='z_CF ≈ −1.722')),
    step('Drop the new mark into the unchanged formula: −(−1.722) × 1.20% = 2.066%. Same μ, same σ, a VaR about 4.7% bigger.',
         dict(pulse='f'),
         dict(count='var', **{'from': 1.974, 'to': 2.066, 'dp': 3, 'suf': '%', 'ms': 1000})),
    step('Go deeper into the tail and the nudge grows. At 99% the same series has a Gaussian VaR of 2.792% and a Cornish-Fisher VaR of 3.962%: 42% bigger.',
         chart('ch', CH, 'Daily VaR (%): blue Gaussian, red Cornish-Fisher', [0.4, 4.9], [0, 5.2],
               [[0, '0'], [2, '2%'], [4, '4%']], [[1, '95%'], [2, '99%'], [3.4, '95%'], [4.4, '99%']], pl=52),
         dict(bars='bg', chart='ch', data=[[0.8, round(g95, 3), '1.97', 'blue'], [1.8, round(g99, 3), '2.79', 'blue']], bw=34, ms=900),
         dict(bars='bc', chart='ch', data=[[1.2, round(c95, 3), '2.07', 'red'], [2.2, round(c99, 3), '3.96', 'red']], bw=34, ms=900)),
    step('The patch has limits. Feed it extreme skew, S = −3 with K = 0, and the 95% VaR comes out at 2.79% but the 99% VaR at only 1.37%. A 99% loss smaller than a 95% one is not a valid quantile.',
         cnote('bk', 'ch', [3.9, 4.0], 'S = −3, K = 0', 'amber', 17),
         dict(bars='bb', chart='ch', data=[[3.4, round(b95, 3), '2.79', 'amber'], [4.4, round(b99, 3), '1.37', 'amber']], bw=34, ms=900),
         dict(cross='bb')),
    step('And it only knows the sample it is fed. Going into 2020, risk models looked back at a calm year, so S and K were mild and the corrected mark sat close to the Gaussian one.',
         icon('calm', 'umbrella', 30, 690, 0.55, 'blue', 'calm look-back\nmild S and K', lsize=16)),
    step('On 16 March 2020 the S&P 500 fell about 12%, its worst day since October 1987, and the VIX closed above 82. Losses beyond 99% VaR came far more often than 1 day in 100.',
         icon('crash', 'fire', 250, 690, 0.55, 'red', 'S&P −12%\n16 March', lsize=16),
         arrow('calm', 'crash', None, 'red')),
    step('Too many exceptions would have raised banks\' capital multipliers mid-crisis, so in April 2020 the ECB temporarily cut them. The correction had no storms in its window to learn from.',
         icon('ecb', 'bank', 470, 690, 0.55, 'amber', 'ECB cuts the\nmultiplier, April', sym='€', lsize=16),
         arrow('crash', 'ecb', None, 'amber')),
])


BOARD = dict(name='cornish_fisher_expansion', lesson='cornish-fisher-expansion',
             title='Same VaR formula, a moved mark: Cornish-Fisher step by step', cfg=CF,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: March 2020, when VaR models met the tail</h2>',
             deck_after=6)

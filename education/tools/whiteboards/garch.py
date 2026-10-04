from ._wb import *
from math import sqrt

# ── GARCH & volatility clustering (garch-volatility) ──────────────────────────
# The lesson's worked example: alpha = 0.08, beta = 0.90, omega = 1.0e-6, one 2.5% shock
# day with yesterday's variance at the long-run level. Every number below is exact
# arithmetic from those inputs. The daily-returns bars are illustrative.
W, A, B = 1.0e-6, 0.08, 0.90
LR = W / (1 - A - B)                        # 5.0e-5  -> 0.71%
S1 = W + A * 0.025 ** 2 + B * LR            # 9.6e-5  -> 0.98%
HV = (19 * LR + 0.025 ** 2) / 20            # 7.875e-5 -> 0.89%
EX = S1 - LR                                # 4.6e-5 excess
def _g(k): return round(100 * sqrt(LR + EX * (A + B) ** (k - 1)), 4)   # forecast for day k >= 1
LRP, HVP = round(100 * sqrt(LR), 4), round(100 * sqrt(HV), 4)
DECAY1 = [[k, _g(k)] for k in range(1, 12)]            # 0.98 -> 0.94 over ten days
DECAY2 = [[k, _g(k)] for k in range(11, 47)]           # on past the half-life (day 35)

# Illustrative daily returns, %: calm, a cluster of big days of both signs, calmer again.
RET = [0.3, -0.4, 0.2, -0.3, 0.5, -0.2, 0.3, -0.5, 0.4, -2.3, 2.6, -1.9, 2.9, -2.6, 1.8, -1.4,
       1.6, -1.1, 0.9, -1.2, 0.8, -0.6, 0.7, -0.5, 0.4, -0.6, 0.3, -0.4, 0.5, -0.3]
BARS = [[i + 1, v, ''] for i, v in enumerate(RET)]

RC = (10, 128, 580, 168)
FC = (10, 412, 580, 300)

GARCH = dict(w=600, h=830, intro='One shock day, two volatility forecasts: GARCH and a flat 20-day average, using the lesson\'s worked example. Press play, or step through.', steps=[
    step('Two questions about tomorrow. Which way will the price go? Like a coin flip, close to unpredictable. How big will the move be? Like the weather, that has memory: a stormy day makes another stormy day more likely.',
         icon('coin', 'coin', 60, 4, 0.62, 'blue', 'which way? no memory', sym='?', lsize=17),
         icon('storm', 'umbrella', 360, 4, 0.62, 'amber', 'how big? has memory', lsize=17),
         icon('bolt', 'bolt', 432, 10, 0.4, 'amber')),
    step('That is volatility clustering. Big days, up and down, come in clumps; calm comes in runs; and after a storm the market gets calmer, not instantly calm. Mandelbrot saw it in 1963: large changes follow large changes, of either sign.',
         chart('ret', RC, 'Daily returns, % (illustrative)', [0, 31], [-3.3, 4.3], [[-3, '−3'], [0, '0'], [3, '+3']], [], zero=True, pl=36),
         dict(bars='rb', chart='ret', data=BARS, bw=11, ms=1500),
         cnote('c1', 'ret', [5, -2.2], 'calm', 'green', 17),
         cnote('c2', 'ret', [20, 3.4], '← a cluster, both signs', 'red', 17, anchor='start'),
         cnote('c3', 'ret', [26, -2.2], 'calmer', 'blue', 17)),
    step('GARCH(1,1) turns that into tomorrow\'s variance: a floor ω, plus a reaction α to yesterday\'s squared shock, plus inertia β from yesterday\'s own variance. The lesson\'s example: α = 0.08, β = 0.90, ω = 0.000001.',
         box('rec', 10, 308, 580, 92, 'today\'s σ² = ω + α·(yesterday\'s ε)² + β·(yesterday\'s σ²)', 'purple', sub='floor + reaction + inertia', size=19)),
    step('Start on a quiet day. With no recent shocks the forecast sits at its long-run level: ω ÷ (1 − α − β) = 0.000001 ÷ 0.02 = 0.00005, a daily move of about 0.71%. A flat 20-day average (HV20) sits there too.',
         chart('fc', FC, 'Next-day volatility forecast, %', [-6, 46], [0.62, 1.04],
               [[0.71, '0.71'], [0.89, '0.89'], [0.98, '0.98']], [[0, 'shock'], [11, '+10'], [21, '+21'], [35, '+34'], [44, 'days']], pl=50, pr=14),
         series('lr', 'fc', [[-6, LRP], [46, LRP]], None, dash=True, ms=600),
         series('pre', 'fc', [[-6, LRP], [0, LRP]], 'blue', ms=700),
         cnote('lrl', 'fc', [36, LRP], 'long-run 0.71%', None, 17, dy=18)),
    step('Then a shock day: a 2.5% move. Its square is 0.000625. The sign does not matter: a −2.5% day squares to the same number and raises tomorrow\'s forecast exactly as much.',
         icon('shock', 'bolt', 66, 640, 0.38, 'red'),
         cnote('sq', 'fc', [1.5, 0.665], '±2.5% → ε² = 0.000625', 'red', 17, anchor='start')),
    step('GARCH reacts the very next day: 0.000001 + 0.08 × 0.000625 + 0.90 × 0.00005 = 0.000096. The forecast jumps from 0.71% to 0.98%, about 38% higher.',
         series('jump', 'fc', [[0, LRP], [1, _g(1)]], 'blue', ms=600),
         dot('d1', 'fc', [1, _g(1)], 'GARCH 0.98%', 'blue', dx=10, dy=-14, anchor='start'),
         dict(pulse='rec')),
    step('The flat 20-day average moves less. One 2.5% day among 19 ordinary ones gives it only 1/20 of the weight (against GARCH\'s 0.08), so it rises to about 0.89%.',
         series('hvj', 'fc', [[0, LRP], [1, HVP]], 'amber', ms=600),
         dot('h1', 'fc', [1, HVP], 'HV20 0.89%', 'amber', dx=10, dy=18, anchor='start')),
    step('Now nothing else happens. Each calm day, GARCH keeps 0.98 of the excess over the long-run level (α + β = 0.98) and lets the rest go. Ten trading days on it is still about 0.94%: visibly raised.',
         dict(hide='sq'), dict(hide='shock'),
         series('g1', 'fc', DECAY1, 'blue', ms=1200),
         dot('d10', 'fc', [11, _g(11)], '0.94%', 'blue', dy=-16)),
    step('The half-life is ln 0.5 ÷ ln 0.98 ≈ 34 trading days, about a month and a half: only then has half the extra variance gone (the forecast is about 0.85%). One sharp day leaves a slowly fading fingerprint.',
         series('g2', 'fc', DECAY2, 'blue', ms=1600),
         dot('d34', 'fc', [35, _g(35)], 'half-life\n≈ 0.85%', 'blue', dy=-34)),
    step('Meanwhile HV20 does something odd. It holds 0.89% for twenty days, then on day 21 the shock rolls out of the window and the estimate drops off a cliff to 0.71%, though nothing happened that day. That is the "ghosting" effect.',
         series('hvf', 'fc', [[1, HVP], [20, HVP], [21, LRP], [46, LRP]], 'amber', ms=1500),
         cnote('gh', 'fc', [21.5, 0.80], 'off a cliff:\nghosting', 'amber', 17, anchor='start')),
    step('The one number to check first is α + β, the persistence. Close to 1 (0.97–0.99), a spike lingers for weeks; around 0.85–0.90, it fades in a handful of days. It must stay below 1, or the forecast never settles back.',
         box('pers', 10, 728, 285, 96, 'α + β = 0.98\nhalf-life ≈ 34 days', 'blue', size=20)),
    step('The limit: GARCH learns only from past returns, so it sees a storm once it has started, never before. A calm February 2020 gave a calm forecast for March, which brought ±9–12% S&P days and a record VIX close of 82.69.',
         box('lim', 305, 728, 285, 96, 'tracks a storm\nonce it starts;\ncan\'t see one coming', 'red', size=19),
         dict(pulse='storm')),
])


BOARD = dict(name='garch', lesson='garch-volatility', title='One shock day, two volatility forecasts', cfg=GARCH,
             before='  <div class="tl-box example">\n    <div class="tl-icon-badge purple">🧪</div>\n    <div class="tl-box-label">Try it yourself</div>',
             deck_after=8)

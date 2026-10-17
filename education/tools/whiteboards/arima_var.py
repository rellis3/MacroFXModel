from ._wb import *

# ── ARIMA & VAR (arima-var) ───────────────────────────────────────────────────
# A two-variable VAR(1), X = yield spread, Y = EUR/USD, as in the lesson:
#   X_t = a11 X_{t-1} + a12 Y_{t-1} + e1,   Y_t = a21 X_{t-1} + a22 Y_{t-1} + e2
# The coefficients are ILLUSTRATIVE (the lesson reports no fitted values): a11 = 0.5,
# a12 = 0 (FX does not lead the spread), a21 = 0.4 (the spread leads FX), a22 = 0.3.
# Impulse responses are exact iterations of that system. Parameter counts k^2 * p are
# exact arithmetic (the lesson's 5 series x 4 lags = 100).
A11, A12, A21, A22 = 0.5, 0.0, 0.4, 0.3

def _irf(x, y, days=8):
    out = [(0, x, y)]
    for t in range(1, days + 1):
        x, y = A11 * x + A12 * y, A21 * x + A22 * y
        out.append((t, x, y))
    return out
IX = _irf(1.0, 0.0)
IY = _irf(0.0, 1.0)
PX = [[t, round(x, 4)] for t, x, y in IX]
PY = [[t, round(y, 4)] for t, x, y in IX]
QX = [[t, round(x, 4)] for t, x, y in IY]
QY = [[t, round(y, 4)] for t, x, y in IY]
Y1, Y2 = round(IX[1][2], 2), round(IX[2][2], 2)      # 0.40, 0.32
COUNTS = [[k, k * k * 4, str(k * k * 4)] for k in range(1, 6)]   # 4, 16, 36, 64, 100

IR = (10, 200, 580, 240)
PC = (10, 460, 580, 210)

VAR = dict(w=600, h=740, intro='Two series that may feed into each other: a yield spread and a currency. Watch a VAR follow a shock through both, with illustrative coefficients. Press play, or step through.', steps=[
    step('Two series: X, the daily change in the DE–US 2-year yield spread, and Y, the daily EUR/USD return. Both already differenced, so both are stationary. Does one lead the other?',
         box('X', 20, 40, 200, 84, 'spread (X)', 'blue', sub='Δ DE–US 2y', size=21),
         box('Y', 380, 40, 200, 84, 'EUR/USD (Y)', 'red', sub='daily return', size=21)),
    step('First, each series leans on its own past, like AR(1). In this illustration a11 = 0.5 and a22 = 0.3: half of yesterday\'s spread move carries into today, and less of the currency\'s.',
         note('o1', 120, 144, 'own past: a11 = 0.5', 'blue', 18),
         note('o2', 480, 144, 'own past: a22 = 0.3', 'red', 18)),
    step('Now the band between them. a21 links yesterday\'s spread to today\'s EUR/USD: here 0.4. A regression of FX on lagged spread could find this arrow, because it is the only one it looks for.',
         arrow('X', 'Y', 'a21 = 0.4', 'blue', bend=-26)),
    step('The VAR also estimates the reverse arrow, a12: yesterday\'s EUR/USD to today\'s spread. Here it is 0, a slack band. Both are fitted jointly, in one system, from the same data.',
         arrow('Y', 'X', 'a12 = 0', 'red', bend=-26, dash=True),
         note('eq', 300, 178, 'Yₜ = a21·Xₜ₋₁ + a22·Yₜ₋₁ + ε', None, 19)),
    step(f'Shock the spread by 1 on day 0 and run the system forward. The spread fades by half each day. EUR/USD feels nothing on day 0, then {Y1} on day 1 and {Y2} on day 2, then fades: the spread leads.',
         chart('ir', IR, 'Response to a shock of 1 on day 0 (illustrative)', [0, 8], [-0.1, 1.1],
               [[0, '0'], [0.5, '0.5'], [1, '1']], [[0, '0'], [2, '2'], [4, '4'], [6, '6'], [8, '8 days']], zero=True, pl=44, pr=20),
         series('px', 'ir', PX, 'blue', ms=1200, label='spread', lat=[1, 0.5], ldx=10, ldy=-12, lanchor='start', lsize=17),
         series('py', 'ir', PY, 'red', ms=1200, label='EUR/USD', lat=[2, Y2], ldx=8, ldy=-14, lanchor='start', lsize=17),
         dot('y1', 'ir', [1, Y1], str(Y1), 'red', dx=14, dy=20, anchor='start')),
    step('Now shock EUR/USD instead. Its own move fades fast (a22 = 0.3), and the spread never moves, because a12 = 0. The influence runs one way. Only a model with both arrows can show you that.',
         dict(hide='px'), dict(hide='py'), dict(hide='y1'),
         series('qy', 'ir', QY, 'amber', ms=1000, label='EUR/USD shock', lat=[0, 1], ldx=14, ldy=0, lanchor='start', lsize=17),
         series('qx', 'ir', QX, 'purple', dash=True, ms=700, label='spread: no response', lat=[5, 0], ldx=0, ldy=-16, lsize=17)),
    step('A Granger test asks the same thing with an F-test: do lagged spread changes improve the EUR/USD forecast beyond EUR/USD\'s own lags? If yes, the spread "Granger-causes" EUR/USD.',
         dict(hide='eq'),
         note('gr', 300, 178, 'own lags  vs  own lags + spread lags', 'purple', 19),
         dict(pulse='X>Y')),
    step('That word claims less than it sounds. A hidden common driver, say a shared macro shock that hits the spread a little earlier, produces the same result with no direct link at all.',
         dict(hide='ir'), dict(hide='qx'), dict(hide='qy'), dict(hide='gr'), dict(hide='o1'), dict(hide='o2'),
         icon('drv', 'globe', 252, 250, 0.95, 'amber', 'hidden common driver', lsize=18),
         arrow('drv', 'X', 'first', 'amber', dash=True, bend=20),
         arrow('drv', 'Y', 'a bit later', 'amber', dash=True, bend=-20)),
    step('The catch: every series talks to every other at every lag, so parameters grow as k² × p. With 4 lags: 1 series needs 4 coefficients, 2 need 16, 3 need 36.',
         chart('pc', PC, 'Coefficients in a VAR with 4 lags', [0.4, 5.6], [0, 115],
               [[0, '0'], [50, '50'], [100, '100']], [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5 series']], pl=48, pr=24),
         dict(bars='pb', chart='pc', data=COUNTS[:3], bw=50, ms=1000)),
    step('Five series need 100 coefficients. On a few thousand daily observations that is a lot of parameters chasing not much data: a fast road to overfitting.',
         dict(bars='pb2', chart='pc', data=[[4, 64, '64', 'amber'], [5, 100, '100', 'red']], bw=50, ms=900)),
    step('And the bar to clear: Meese and Rogoff (1983) found exchange-rate models, VARs included, did not beat a random walk out of sample. A lead-lag result earns trust only once it beats that, on data it has not seen.',
         note('mr', 300, 712, 'beat the random walk, out of sample', 'green', 21)),
])


BOARD = dict(name='arima_var', lesson='arima-var', title='A VAR follows a shock through two series', cfg=VAR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=10)

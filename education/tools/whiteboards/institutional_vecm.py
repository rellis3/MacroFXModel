from ._wb import *

# ── Vector error correction (institutional-vecm) ──────────────────────────────
# The lesson's toy history: AUD/USD (Y) 0.6600 0.6660 0.6700 0.6690 0.6650, NZD/USD (X)
# 0.6000 0.6010 0.6015 0.6030 0.6000, hedge ratio 1.10, c = 0, so Z = Y − 1.10 X =
# 0, 0.0049, 0.00835, 0.0057, 0.0050. Fitted alpha_Y = −0.35, alpha_X = +0.15 give
# dY = −0.00175, dX = +0.00075. The t = 6 forecast levels and the new spread are our
# arithmetic from those same numbers (lags held at zero, as in the lesson's calculator).
Y = [0.6600, 0.6660, 0.6700, 0.6690, 0.6650]
X = [0.6000, 0.6010, 0.6015, 0.6030, 0.6000]
B, AY, AX = 1.10, -0.35, 0.15
BX = [round(B * x, 5) for x in X]
Z = [round(y - b, 5) for y, b in zip(Y, BX)]
assert Z == [0.0, 0.0049, 0.00835, 0.0057, 0.005], Z
DY, DX = round(AY * Z[-1], 6), round(AX * Z[-1], 6)
assert (DY, DX) == (-0.00175, 0.00075)
Y6, X6 = round(Y[-1] + DY, 5), round(X[-1] + DX, 5)
BX6 = round(B * X6, 6)
Z6 = round(Y6 - BX6, 6)
assert (Y6, BX6, Z6) == (0.66325, 0.660825, 0.002425), (Y6, BX6, Z6)
PIPS = [round(z * 1e4, 2) for z in Z]          # 0, 49, 83.5, 57, 50

LV = (10, 150, 580, 250)                        # levels chart
ZC = (10, 420, 300, 230)                        # spread bars

VECM = dict(w=600, h=780, intro="Two currencies on a leash, and the question cointegration never answers: when the leash goes taut, who gets pulled? The lesson's own toy numbers. Press play, or step through.", steps=[
    step('Two prices on a leash: AUD/USD and NZD/USD. Cointegration says AUD/USD minus 1.10 times NZD/USD is stationary. However far they wander, that spread keeps coming home.',
         box('Y', 20, 20, 210, 84, 'AUD/USD  (Y)', 'blue', sub='0.6600', size=20),
         box('X', 370, 20, 210, 84, 'NZD/USD  (X)', 'purple', sub='0.6000', size=20),
         arrow('Y', 'X', label='leash: Y − 1.10·X', tone='green', dash=True, id='leash')),
    step('Five periods of the lesson\'s toy history. AUD/USD (blue) is drawn against 1.10 times NZD/USD (purple), so the vertical gap between the lines is the spread.',
         chart('lv', LV, 'Levels: Y and 1.10·X', [0.7, 6.3], [0.6585, 0.6715],
               [[0.66, '0.6600'], [0.665, '0.6650'], [0.67, '0.6700']], [[t, f't={t}'] for t in range(1, 6)], pl=74, pr=16),
         series('sy', 'lv', [[t + 1, y] for t, y in enumerate(Y)], 'blue', ms=1300, label='Y', lat=[3, 0.67], ldy=-14),
         series('sx', 'lv', [[t + 1, b] for t, b in enumerate(BX)], 'purple', ms=1300, label='1.10·X', lat=[2, BX[1]], ldy=18),
         dict(count='Y', **{'from': 0.66, 'to': 0.665, 'dp': 4})),
    step('The gap opens: AUD/USD runs up faster than its partner. The spread goes from zero to 49 pips, peaks at 83.5 pips in period 3, then starts back: 57, then 50.',
         dict(gap='gz', chart='lv', top=[[t + 1, y] for t, y in enumerate(Y)], bot=[[t + 1, b] for t, b in enumerate(BX)], tone='green', op=0.25),
         chart('zc', ZC, 'Spread Z, pips', [0.4, 6.6], [0, 100], [[50, '50'], [100, '100']], [[t, str(t)] for t in range(1, 6)] + [[6, 'next']], pl=44, pr=8, pt=48),
         dict(bars='zb', chart='zc', data=[[t + 1, p, f'{p:g}', 'green'] for t, p in enumerate(PIPS)], bw=30, ms=1100)),
    step('The question cointegration cannot answer: the spread is 50 pips wide. Will AUD fall back, will NZD rise to meet it, or both? The leash proves they stay close, not who moves.',
         dict(pulse='leash'),
         note('q', 455, 470, 'who closes\nthe 50 pips?', 'amber', 24)),
    step('A VECM fits each price\'s next change on last period\'s spread. AUD\'s adjustment speed comes out at −0.35: it closes 35% of the gap per period by falling.',
         dict(hide='q'),
         box('ay', 330, 420, 260, 66, 'ΔY = −0.35 × 50 pips', 'blue', size=19),
         series('fy', 'lv', [[5, Y[-1]], [6, Y6]], 'blue', dash=True, ms=700),
         dot('dy', 'lv', [6, Y6], '−17.5 pips', 'blue', dx=0, dy=-16)),
    step('NZD\'s speed is +0.15: it closes some of the gap by rising. 0.15 × 50 pips = +7.5 pips. Both legs move the way that shrinks the spread.',
         box('ax', 330, 500, 260, 66, 'ΔX = +0.15 × 50 pips', 'purple', size=19),
         series('fx', 'lv', [[5, BX[-1]], [6, BX6]], 'purple', dash=True, ms=700),
         dot('dx', 'lv', [6, BX6], '+7.5 pips', 'purple', dx=0, dy=18)),
    step('Put the forecast together: the spread is expected to shrink from 50 pips to about 24 next period (our arithmetic from the same numbers, with the lag terms held at zero).',
         dict(bars='zb6', chart='zc', data=[[6, 24.25, '≈24', 'amber']], bw=30, ms=700),
         note('z6', 455, 600, '50 → ≈ 24 pips', 'green', 22)),
    step('Compare the speeds: 0.35 ÷ 0.15 ≈ 2.3. AUD does about 2.3 times as much of the correcting. AUD is the follower; NZD sits closer to the anchor.',
         dict(hide='z6'),
         note('ratio', 455, 600, 'AUD ≈ 2.3× the correcting', 'green', 21),
         dict(pulse='ay')),
    step('An extreme case: if NZD\'s speed were exactly zero, NZD would ignore the gap completely and AUD would do all the work. That is weak exogeneity, a pure anchor.',
         note('weak', 300, 690, 'α_X = 0: X never responds (weak exogeneity)', 'purple', 19)),
    step('Both speeds zero is impossible for a cointegrated pair: nothing would pull the spread home. The Granger Representation Theorem (Engle and Granger, 1987) says cointegration and error correction are the same fact.',
         box('zero', 10, 712, 280, 56, 'α_Y = α_X = 0 ?', 'red', size=19),
         dict(cross='zero')),
    step('And the signs must point home. AUD speed above zero with NZD below zero would push the 50 pips wider every period: that is not error correction at all.',
         box('sign', 310, 712, 280, 56, 'α_Y > 0, α_X < 0 ?', 'red', size=19),
         dict(cross='sign')),
    step('So: cointegration tells you there is a leash. The two adjustment speeds tell you who gets pulled, and how hard. That is the first real handle on which price leads.',
         dict(hide='weak'),
         note('end', 300, 690, 'leash = cointegration · who moves = α_Y vs α_X', 'green', 19),
         dict(pulse='leash')),
])


BOARD = dict(name='institutional_vecm', lesson='institutional-vecm',
             title='Error correction: who closes the gap', cfg=VECM,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=5)

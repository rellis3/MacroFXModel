from ._wb import *

# ── Ornstein-Uhlenbeck & mean reversion (ou-mean-reversion) ───────────────────
# Numbers are the lesson's worked example: a daily AR(1) fit of phi = 0.90 gives
# theta = -ln(0.90) = 0.105/day and a half-life ln(2)/theta = 6.58 days, so a series
# 40 pips from its mean is expected at 20 pips after ~6.6 days and 10 pips after
# another ~6.6; phi = 0.98 gives theta = 0.0202/day and a 34.3-day half-life.
# Expected paths are exact: E[gap after t days] = 40 * phi^t. The noisy path is
# illustrative. August 2007 dates are the lesson's (losses 7-9 Aug, rebound 10 Aug).
POST = 60                     # x of the post (the mean, mu)
def _bx(gap): return POST + 10 * gap          # ball centre x for a gap in pips
def _ball(gap): return _bx(gap) - 28           # coin icon (s 0.56) top-left x
def _band(id, gap):                            # a zig-zag rubber band, post → ball
    x0, x1, pts, k = POST + 6, _bx(gap) - 30, [], 0
    n = max(2, int((x1 - x0) // 18))
    for i in range(n + 1):
        pts.append([round(x0 + (x1 - x0) * i / n, 1), 80 + (0 if i in (0, n) else (-8 if i % 2 else 8))])
    return dict(line=id, points=pts, tone='amber', width=2.6, ms=600)

def _exp(phi, t0, t1, dt=0.5):
    n = int(round((t1 - t0) / dt))
    return [[round(t0 + i * dt, 2), round(40 * phi ** (t0 + i * dt), 2)] for i in range(n + 1)]

HL1, HL2 = 6.58, 34.31
GAP = (10, 205, 580, 290)
NOISY = [[0, 40], [1, 46], [2, 52], [3, 55], [4, 50], [5, 47], [6, 41], [7, 37], [8, 33], [9, 34], [10, 29],
         [11, 25], [12, 26], [13, 21], [14, 18], [15, 19], [16, 15], [17, 13]]

OU = dict(w=600, h=712, intro='A price on a rubber band tied to its mean, and how fast it gets pulled back. Press play, or step through.', steps=[
    step('Picture the price as a ball tied by a rubber band to a post. The post is the long-run mean, μ. Right now the price is 40 pips away from it.',
         dict(line='post', points=[[POST, 22], [POST, 140]], width=5),
         dict(line='base', points=[[POST - 22, 140], [POST + 22, 140]], width=4),
         note('mu', POST + 2, 162, 'μ, the mean', None, 18),
         icon('ball', 'coin', _ball(40), 52, 0.56, 'blue', 'price', lsize=17),
         _band('b1', 40),
         note('g40', (POST + _bx(40)) / 2, 50, '40 pips away', 'amber', 18)),
    step('Two things act on it every instant. The band pulls it back toward μ, harder the further away it is: that is the drift, θ(μ − X). And random currents jostle it about: that is the noise, σ dW. A bigger θ is a stiffer band.',
         note('pull', 250, 108, '← pull grows with the gap', 'amber', 17),
         icon('dice', 'dice', 528, 96, 0.42, 'purple', 'jolts', lsize=16),
         note('eq', 300, 186, 'dX = θ(μ − X)dt + σ dW', 'purple', 21)),
    step('How stiff is the band? Regress today\'s value on yesterday\'s. Say the fit gives φ = 0.90. Then θ = −ln(0.90) ≈ 0.105 per day.',
         box('fit', 10, 510, 285, 92, 'fit: φ = 0.90\nθ = −ln 0.90 ≈ 0.105/day', 'blue', sub='half-life = ?', size=19)),
    step('Ignore the jostling and follow the expected path. The gap shrinks to 90% of itself each day. After ln(2) ÷ 0.105 ≈ 6.58 days it is down to 20 pips: half. That time is the half-life.',
         chart('gap', GAP, 'Gap to the mean, pips: the expected path', [0, 36], [0, 60],
               [[0, '0'], [20, '20'], [40, '40']], [[0, '0'], [HL1, '6.6'], [2 * HL1, '13.2'], [3 * HL1, '19.7'], [HL2, '34.3 days']], pl=44, pr=22, pt=36, pb=28),
         series('e1', 'gap', _exp(0.9, 0, HL1, 0.47), 'blue', ms=1100),
         dot('h1', 'gap', [HL1, 20], '20 pips after 6.6 days', 'blue', dx=10, dy=-16, anchor='start'),
         dict(hide='pull'), dict(hide='b1'), dict(hide='g40'),
         move('ball', _ball(20), 52, 1100),
         _band('b2', 20),
         note('g20', (POST + _bx(20)) / 2, 50, '20', 'amber', 18),
         dict(sub='fit', text='half-life ≈ 6.58 days')),
    step('Each half-life halves what is left: 10 pips after another 6.6 days, 5 after another. The gap never quite reaches zero; it just keeps halving.',
         series('e2', 'gap', _exp(0.9, HL1, 36), 'blue', ms=1300),
         dot('h2', 'gap', [2 * HL1, 10], '10', 'blue', dx=6, dy=-14),
         dot('h3', 'gap', [3 * HL1, 5], '5', 'blue', dx=6, dy=-14),
         dict(hide='b2'), dict(hide='g20'),
         move('ball', _ball(10), 52, 900),
         _band('b3', 10)),
    step('Now a slacker band. If the fit had given φ = 0.98, θ is only 0.020 a day and the half-life stretches to 34.3 days. Still mean-reverting, but far too slow for a multi-day fade.',
         series('e3', 'gap', _exp(0.98, 0, 36), 'amber', label='φ = 0.98', lat=[12, 31.4], ldy=20, ms=1300),
         dot('h4', 'gap', [HL2, 20], 'half-life 34.3 days', 'amber', dx=-8, dy=22, anchor='end'),
         box('fit2', 305, 510, 285, 92, 'fit: φ = 0.98\nθ = −ln 0.98 ≈ 0.020/day', 'amber', sub='half-life ≈ 34.3 days', size=19)),
    step('Cut the band and θ = 0: a plain random walk. Nothing pulls the price back, so the expected gap just stays where it is and the half-life is infinite. A fitted φ of 1 or more means the model does not apply, not that reversion is slow.',
         dict(hide='b3'),
         move('ball', _ball(40), 52, 1000),
         series('rw', 'gap', [[0, 40], [36, 40]], 'red', dash=True, label='φ = 1: stays at 40', lat=[36, 40], ldy=-14, lanchor='end', ms=700),
         box('fit3', 10, 618, 285, 84, 'φ ≥ 1: no band\nno half-life', 'red', size=19)),
    step('The half-life describes the expected path, not any one trade. A real path keeps getting jostled: it can widen before it narrows, and stop you out just before the reversion arrives.',
         dict(dim='rw'), dict(dim='e3'), dict(dim='h4'),
         dict(hide='h1'), dot('h1b', 'gap', [HL1, 20], '', 'blue'),
         move('ball', _ball(13), 52, 600), _band('b4', 13),
         series('nz', 'gap', NOISY, 'purple', label='one path (illustrative)', lat=[3, 55], ldx=10, ldy=-2, lanchor='start', ms=1500),
         dict(pulse='dice')),
    step('August 2007: crowded reversion funds all held the same band. Forced selling pushed prices further from fair value on 7, 8 and 9 August; the reversion came on 10 August, too late for the funds already forced out.',
         icon('crowd', 'crowd', 312, 620, 0.62, 'red'),
         note('q1', 384, 638, 'Aug 2007: gap widened', 'red', 17, anchor='start'),
         note('q2', 384, 662, '7–9 Aug, reverted 10 Aug', 'red', 17, anchor='start'),
         note('q3', 384, 686, 'too late for many', 'red', 17, anchor='start')),
    step('The payoff: one number you can say out loud. φ = 0.90 means "this gap tends to halve about every 6.6 days", a natural holding-period yardstick. Just remember it is an average, and θ, μ and σ can all shift.',
         dict(pulse='fit'), dict(pulse='h1b')),
])


BOARD = dict(name='ou', lesson='ou-mean-reversion', title='Mean reversion: a price on a rubber band', cfg=OU,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: the August 2007 "quant quake"</h2>',
             deck_after=9)

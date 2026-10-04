from ._wb import *
import random

# ── Cointegration: the drunk and her dog (cointegration) ──────────────────────
# The picture is the lesson's own (Murray 1994, "A Drunk and Her Dog"): two drunks on
# different streets = two unrelated random walks (the spurious-correlation trap); one drunk
# with a dog on a leash = two random walks whose gap is stationary. All paths are
# ILLUSTRATIVE, generated here from fixed seeds: her path and the other drunk's are random
# walks; the dog = her path + a mean-reverting gap (AR(1), phi 0.8) around the leash's slack.
# Numbers: the lesson's scratchpad (AUD/USD 0.6650, NZD/USD 0.6000, beta 1.10, sigma 0.0080
# -> spread 0.6650 - 1.10 x 0.6000 = 0.0050, z = 0.0050 / 0.0080 = 0.63); |z| >= 2 as the
# visual guide's illustrative entry threshold; LTCM ~25:1, Russia 17 Aug 1998, $3.6bn
# takeover by 14 firms brokered by the New York Fed; the "bungee cord" is the lesson's ELI5.
def _walk(seed, n=100):
    r, x = random.Random(seed), [0.0]
    for _ in range(n): x.append(x[-1] + r.gauss(0, 1))
    return x
def _ar(seed, n=100, phi=0.8):
    r, g = random.Random(seed), [0.0]
    for _ in range(n): g.append(phi * g[-1] + r.gauss(0, 1))
    return g

HER, OTHER, GAP = _walk(13), _walk(1001), _ar(2097)
SLACK = 6.0                                         # the leash's average slack (illustrative)
DOG = [h + SLACK + g for h, g in zip(HER, GAP)]
SD = (sum(v * v for v in GAP) / len(GAP) - (sum(GAP) / len(GAP)) ** 2) ** 0.5
PK = max(range(55, 70), key=lambda i: GAP[i])      # the stretch that crosses +2 sigma
EX = next(j for j in range(PK + 2, 101) if abs(GAP[j]) < 0.3 * SD)   # first time back near the slack
def _pts(xs): return [[i, round(v, 2)] for i, v in enumerate(xs)]
def _z(v): return round(SLACK + v * SD, 2)          # gap level at z standard deviations

# LTCM what-if: from the entry point the gap keeps stretching instead of snapping back.
BUNGEE = [[PK, round(SLACK + GAP[PK], 2)], [PK + 5, _z(3.0)], [PK + 9, _z(2.6)], [PK + 14, _z(4.0)],
          [PK + 19, _z(3.6)], [PK + 25, _z(5.0)]]

def _dog(x, y, s=1.0, tone='amber'):
    """A side-on dog doodle as draw-on lines; (x, y) = top-left of its 100 x 70 box."""
    P = lambda pts: [[round(x + px * s, 1), round(y + py * s, 1)] for px, py in pts]
    parts = [
        [[4, 10], [10, 22], [20, 30]],                                                  # tail
        [[20, 30], [68, 30], [74, 20], [78, 10], [92, 10], [100, 20], [96, 26], [84, 28],
         [76, 36], [72, 50], [20, 50], [16, 40], [20, 30]],                              # body + head
        [[82, 10], [78, 24]],                                                           # ear
        [[26, 50], [24, 68]], [[36, 50], [38, 68]], [[58, 50], [56, 68]], [[68, 50], [70, 68]],   # legs
        [[89, 15], [90, 16]],                                                           # eye
    ]
    return [dict(line=f'dog{i}', points=P(p), tone=tone, width=3, ms=260) for i, p in enumerate(parts)]
DOGX, DOGY = 200, 62
COLLAR = [DOGX + 74, DOGY + 24]

POS = (10, 182, 580, 236)
SPR = (10, 428, 580, 214)

COINT = dict(w=600, h=874, intro='A drunk, a dog, and the leash between them: what cointegration means, and how a pairs trade uses it. Press play, or step through.', steps=[
    step('Meet a drunk walking home. Every step goes in an unpredictable direction, with no destination. That is a random walk: you cannot say where she goes next, and she can end up arbitrarily far from where she started.',
         icon('her', 'person', 40, 20, 0.78, 'blue', 'the drunk', lsize=17),
         chart('pos', POS, 'Where they are, step by step (illustrative)', [0, 100], [-4, 26],
               [[0, 'start']], [[0, '0'], [50, '50'], [100, '100']], pl=58, pr=16),
         series('h', 'pos', _pts(HER), 'blue', label='her', lat=[100, HER[-1]], ldx=-4, ldy=18, lanchor='end', ms=1500)),
    step('A second drunk wanders on another street. They have never met. Yet both drift away from where they started, so plotted together the two paths can look related. Regress one on the other and you can get a high R² from nothing at all: the spurious-regression trap.',
         icon('oth', 'person', 470, 20, 0.7, 'purple', 'another drunk,\nanother street', lsize=16),
         series('o', 'pos', _pts(OTHER), 'purple', dash=True, label='a stranger', lat=[100, OTHER[-1]], ldx=-4, ldy=20, lanchor='end', ms=900)),
    step('Change the picture. Same drunk, but now she walks a dog on a leash. She still wanders at random. So does the dog.',
         dict(cross='oth'), dict(hide='o'),
         *_dog(DOGX, DOGY),
         dict(line='leash', points=[[96, 66], [160, 62], [236, 58], COLLAR], tone='green', width=2.4, ms=600),
         note('lsh', 160, 46, 'leash', 'green', 17)),
    step('Here is the dog\'s path. On its own it is just as unpredictable as hers. But it never strays far from her: the leash can stretch and slacken, it cannot grow without limit.',
         dict(hide='oth'),
         series('d', 'pos', _pts(DOG), 'amber', label='the dog', lat=[100, DOG[-1]], ldx=-4, ldy=-16, lanchor='end', ms=1500)),
    step('Now plot only the gap between them. It wobbles, but around one stable average, the leash\'s slack, and it keeps coming back. Neither path has a home; the gap does.',
         chart('spr', SPR, 'The gap: dog minus drunk (the spread)', [0, 100], [_z(-3.2), _z(5.4)],
               [[SLACK, 'avg']], [[0, '0'], [50, '50'], [100, '100']], pl=58, pr=16),
         series('avg', 'spr', [[0, SLACK], [100, SLACK]], None, dash=True, ms=400),
         series('g', 'spr', [[i, round(SLACK + v, 2)] for i, v in enumerate(GAP)], 'green', ms=1700)),
    step('That is cointegration. Each series is a random walk, I(1), but one combination of them, Y − βX, is stationary, I(0): a fixed mean and bounded variance. Correlation is about the changes; cointegration is about the levels.',
         series('up2', 'spr', [[0, _z(2)], [100, _z(2)]], 'red', dash=True, label='+2σ', lat=[100, _z(2)], ldx=-2, ldy=-12, lanchor='end', ms=500),
         series('dn2', 'spr', [[0, _z(-2)], [100, _z(-2)]], 'red', dash=True, label='−2σ', lat=[100, _z(-2)], ldx=-2, ldy=14, lanchor='end', ms=500),
         box('def', 10, 656, 285, 104, 'cointegrated:\nY − βX is stationary', 'green', size=19)),
    step('To check a real pair, Engle-Granger: Step 1 regresses the levels to get the hedge ratio β. Step 2 tests the gap itself. When it is unusually wide, does it shrink back? A high Step 1 R² proves nothing; only Step 2 tells a leash from a coincidence.',
         box('eg', 305, 656, 285, 104, '1) regress levels → β\n2) ADF test on the gap', 'purple', sub='wide gap shrinks back?', size=18)),
    step('The pairs trade. The gap stretches past +2σ: the dog leg is rich, the drunk leg is cheap. Sell the rich one and buy β times the cheap one. You are betting on the leash, not on where either of them goes.',
         dot('in', 'spr', [PK, round(SLACK + GAP[PK], 2)], 'z ≈ +2: open', 'red', dx=-10, dy=-16, anchor='end'),
         chip('sell', 150, 790, 'sell the rich leg', 'red'),
         chip('buy', 450, 790, 'buy β × the cheap leg', 'green'),
         move('sell', 150, 826, 700), move('buy', 450, 826, 700)),
    step('The leash pulls the gap back toward its average, and you close near the mean. It works whichever way the pair wanders together: the trade is market-neutral.',
         dot('out', 'spr', [EX, round(SLACK + GAP[EX], 2)], 'close', 'green', dx=12, dy=26, anchor='start'),
         dict(pulse='g')),
    step('With the lesson\'s numbers: AUD/USD 0.6650 − 1.10 × NZD/USD 0.6000 = a gap of 0.0050. Divide by the gap\'s usual size, σ = 0.0080: z = 0.63. Well inside the bands: no trade.',
         dict(hide='sell'), dict(hide='buy'), dict(hide='eg'),
         box('num', 305, 656, 285, 104, '0.6650 − 1.10 × 0.6000\n= 0.0050;  ÷ 0.0080', 'blue', sub='z = 0.00', size=18),
         dict(count='num', **{'from': 0, 'to': 0.63, 'dp': 2, 'pre': 'z = ', 'suf': ': no trade', 'ms': 1100})),
    step('LTCM, 1998: real leashes, levered about 25 to 1. After Russia defaulted on 17 August, the spreads stretched far past their history. The leash was a bungee cord: lenders wanted their money before it pulled back. A $3.6bn takeover by 14 firms followed.',
         series('bng', 'spr', BUNGEE, 'red', label='the bungee (illustrative)', lat=[PK + 7, _z(4.3)], ldx=-6, lanchor='end', ms=1200),
         box('ltcm', 10, 772, 580, 92, 'LTCM 1998: ~25:1 leverage, margin calls\n$3.6bn takeover by 14 firms', 'red', size=19)),
    step('So: correlation is not a leash. Test the gap, not the R². And even a real leash is bounded in the long run, not over the time your lenders give you.',
         dict(pulse='def'), dict(pulse='g')),
])


BOARD = dict(name='coint', lesson='cointegration', title='Cointegration: the drunk, her dog and the leash', cfg=COINT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: LTCM and the spread that wouldn\'t come home</h2>',
             deck_after=8)

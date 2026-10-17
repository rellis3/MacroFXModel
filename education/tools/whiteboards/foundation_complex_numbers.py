from ._wb import *
import math

# ── Complex numbers (foundation-complex-numbers) ─────────────────────────────
# Numbers are the lesson's own: i^2 = -1; z = 3 + 4i has modulus 5 and argument
# 0.9273 rad = 53.13 deg; e^(i pi/2) = i, e^(i pi) = -1; (2 + 3i)(1 - i) = 5 + i (self-test Q1);
# characteristic-function pricing (Heston 1993, Carr & Madan 1999).
UNIT = [[round(math.cos(math.radians(a)), 4), round(math.sin(math.radians(a)), 4)] for a in range(0, 361, 6)]
def arc(r, a0, a1, n=12):
    return [[round(r * math.cos(math.radians(a0 + (a1 - a0) * k / n)), 4), round(r * math.sin(math.radians(a0 + (a1 - a0) * k / n)), 4)] for k in range(n + 1)]
TH = math.degrees(math.atan2(4, 3))
assert abs(TH - 53.13) < 0.01

PL = (10, 10, 400, 420)

CX = dict(w=600, h=560, intro='Where the square root of minus one lives, and why e to an imaginary power is a point on a circle. Real numbers from the lesson. Press play, or step through.', steps=[
    step('Ordinary numbers live on a line, running left and right. Every one of them squared is zero or positive, so no ordinary number squared gives −1.',
         chart('pl', PL, 'The complex plane', [-2.2, 5.6], [-2.2, 5.6],
               [[-1, '−1'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], [[-1, '−1'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], zero=True, pl=36, pr=12),
         series('rl', 'pl', [[-2.1, 0], [5.5, 0]], 'blue', ms=800),
         cnote('rln', 'pl', [4.4, 0], 'real numbers', 'blue', 17, dy=-12)),
    step('So invent a number that does: i, with i × i = −1. Give it its own direction, straight up. Multiplying by i turns a number a quarter of the way round: 1 becomes i, and i becomes −1.',
         dot('one', 'pl', [1, 0], '1', 'blue', dx=8, dy=18, anchor='start'),
         dot('ii', 'pl', [0, 1], 'i', 'green', dx=10, dy=-6, anchor='start'),
         series('q1', 'pl', arc(1, 0, 90), 'green', ms=700),
         dot('m1', 'pl', [-1, 0], '−1', 'red', dx=-8, dy=18, anchor='end'),
         series('q2', 'pl', arc(1, 90, 180), 'red', ms=700)),
    step('A complex number is a point on this map. z = 3 + 4i means: walk 3 steps across (the real part), then 4 steps up (the imaginary part).',
         series('re', 'pl', [[0, 0], [3, 0]], 'purple', ms=700),
         series('im', 'pl', [[3, 0], [3, 4]], 'amber', ms=700),
         cnote('ren', 'pl', [2.3, 0], '3 across', 'purple', 17, dy=24),
         cnote('imn', 'pl', [3, 2], '4 up', 'amber', 17, anchor='start', dx=10),
         dot('z', 'pl', [3, 4], 'z = 3 + 4i', 'blue', dx=-10, dy=-12, anchor='end')),
    step('The same point, described another way: how far, and which way. The distance is √(3² + 4²) = √25 = 5. This is the modulus, |z| = 5.',
         series('mod', 'pl', [[0, 0], [3, 4]], 'blue', ms=800),
         cnote('modn', 'pl', [1.5, 2], '|z| = 5', 'blue', 18, anchor='end', dx=-10)),
    step('The direction is the angle from the real axis: tan⁻¹(4/3) = 0.9273 radians, or 53.13°. This is the argument. So 3 + 4i is also "5 at 53.13°".',
         series('ang', 'pl', arc(0.75, 0, TH), 'green', ms=600),
         cnote('angn', 'pl', [0.95, 0.42], '53.13°', 'green', 16, anchor='start'),
         box('pol', 420, 20, 170, 110, 'polar form\n5 at 53.13°', 'green', size=19)),
    step('Euler\'s formula: e raised to an imaginary power, e^(iθ), is the point on the circle of radius 1 at angle θ. As θ grows, e^(iθ) walks round the circle.',
         series('uc', 'pl', UNIT, 'purple', dash=True, ms=1400),
         box('eul', 420, 142, 170, 110, 'e^(iθ) =\ncos θ + i sin θ', 'purple', size=19)),
    step('A quarter turn, θ = π/2, lands on i: e^(iπ/2) = i. Half a turn, θ = π, lands on −1: e^(iπ) = −1. Add 1 and you get Euler\'s identity, e^(iπ) + 1 = 0.',
         dict(pulse='ii'), dict(pulse='m1'),
         box('id', 420, 264, 170, 80, 'e^(iπ) + 1 = 0', 'red', size=20)),
    step('Arithmetic works like ordinary brackets, with one extra rule: swap i × i for −1. (2 + 3i)(1 − i) = 2 − 2i + 3i − 3i² = 5 + i.',
         box('mul', 420, 356, 170, 74, '(2 + 3i)(1 − i)\n= 5 + i', 'blue', size=18)),
    step('Why a trader meets these: models like Heston (1993) have no usable formula for the probabilities, but a complex-valued version, the characteristic function, can be written down. Price in complex numbers, and the answer comes out real.',
         box('fin', 10, 446, 580, 104, 'Heston 1993, Carr & Madan 1999:\ncomplex in the middle, a real option price at the end', 'amber', size=19)),
])


BOARD = dict(name='foundation_complex_numbers', lesson='foundation-complex-numbers',
             title='Complex numbers: a point, a turn and a circle', cfg=CX,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=7)

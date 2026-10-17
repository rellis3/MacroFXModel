from ._wb import *
import math

# ── MCMC: Metropolis-Hastings (mcmc-metropolis-gibbs) ─────────────────────────
# Target: the lesson's double well f(t) = exp(-t^4/4 + t^2/2). The five hand-worked steps are
# the lesson's own (proposals 0.8, -0.7, -0.4, -1.6, -1.1; draws u = 0.55, 0.93, 0.21).
# Traces: the page's own seeded chain (mulberry32(20260727), Box-Muller proposals, 200
# iterations), replicated exactly, so step 0.10 accepts 97% and step 0.80 accepts 74%, the
# figures the lesson's slider shows; step 3.00 accepts 39%. The long-run bars are a 400,000-
# step random-walk Metropolis run (step 1.0, seed 7), rescaled to f's height.
def f(t): return math.exp(-t ** 4 / 4 + t ** 2 / 2)
def _imul(a, b): return ((a & 0xffffffff) * (b & 0xffffffff)) & 0xffffffff
def _mulberry32(a):
    st = [a & 0xffffffff]
    def r():
        st[0] = (st[0] + 0x6D2B79F5) & 0xffffffff; a = st[0]
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & 0xffffffff) ^ t
        return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296
    return r
def _run(sd):
    r = _mulberry32(20260727); th = 0.0; acc = 0; pts = [[0, 0.0]]
    for i in range(1, 201):
        u1 = max(r(), 1e-12); u2 = r(); z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
        p = th + sd * z; a = min(1, f(p) / f(th)); u3 = r()
        if u3 < a: th = p; acc += 1
        pts.append([i, round(th, 3)])
    return acc / 200, pts
A01, T01 = _run(0.10); A08, T08 = _run(0.80); A30, _ = _run(3.00)
assert (round(A01 * 100), round(A08 * 100), round(A30 * 100)) == (97, 74, 39)
assert min(v for _, v in T01) > -1 and min(v for _, v in T08) < -1.5 and max(v for _, v in T08) > 1.5
HIST = [0.008, 0.064, 0.274, 0.656, 1.044, 1.253, 1.275, 1.168, 1.069, 1.014, 1.003, 1.071, 1.182, 1.263, 1.25, 1.04, 0.646, 0.269, 0.064, 0.008]
CURVE = [[round(-2.5 + i * 0.05, 2), round(f(-2.5 + i * 0.05), 4)] for i in range(101)]

LR = (10, 10, 580, 290); PL, PR, PT, PB = 40, 14, 34, 30
def px(t): return round(LR[0] + PL + (t + 2.5) / 5 * (LR[2] - PL - PR), 1)
def py(v): return round(LR[1] + LR[3] - PB - v / 1.75 * (LR[3] - PT - PB), 1)
def at(t): return [t, round(f(t), 4)]
YOU = lambda t: (px(t), py(f(t)) - 26)

MH = dict(w=600, h=760, intro="A walker on a landscape it cannot see, using only height comparisons. The lesson's five hand-worked steps, then the long run. Press play, or step through.", steps=[
    step('The target has two hills, near −1 and +1, and a dip at 0. You can compute its height f anywhere, but not the area under it, so you cannot draw it as a probability. You start at 0, height 1.00.',
         chart('land', LR, 'Target shape f(θ): two hills', [-2.5, 2.5], [0, 1.75], [[0, '0'], [1, '1.0']],
               [[-2, '−2'], [-1, '−1'], [0, '0'], [1, '+1'], [2, '+2']], pl=PL, pr=PR, pt=PT, pb=PB),
         series('f', 'land', CURVE, 'purple', ms=1300),
         chip('you', *YOU(0), 'you', 'blue')),
    step('Step 1: propose 0.8. Its height is 1.24, more than 1.00: uphill. Uphill moves are always accepted, no coin flip needed.',
         dot('p1', 'land', at(0.8), '1.24 ✓', 'green', dy=24),
         move('you', *YOU(0.8), 900)),
    step('Step 2: propose −0.7, height 1.20. That is downhill: 1.20 ÷ 1.24 = 0.97, so accept with chance 97%. The coin draw is 0.55, below 0.97: accept.',
         dot('p2', 'land', at(-0.7), '0.97 ✓', 'green', dy=24),
         move('you', *YOU(-0.7), 1100)),
    step('Step 3: propose −0.4, height 1.08. Ratio 1.08 ÷ 1.20 = 0.89. The coin draw is 0.93, above 0.89: reject. You stay at −0.7, and that spot is counted again.',
         dot('p3', 'land', at(-0.4), '0.89 ✗', 'red', dx=10, dy=24, anchor='start'),
         dict(pulse='you')),
    step('Step 4: propose −1.6, well down the outer slope, height 0.70. Ratio 0.70 ÷ 1.20 = 0.58. The draw is 0.21: accept. Taking downhill steps sometimes is what lets the walk explore.',
         dot('p4', 'land', at(-1.6), '0.58 ✓', 'green', dx=-14, dy=4, anchor='end'),
         move('you', *YOU(-1.6), 1000)),
    step('Step 5: propose −1.1, height 1.27. Uphill again: accept. The walker found the left hill without ever being told where it was. But it has not yet visited the right hill at all.',
         dot('p5', 'land', at(-1.1), '✓', 'green', dy=24),
         move('you', *YOU(-1.1), 900)),
    step('Now let the walk run for 400,000 steps and count where it stood. The bars match the curve almost exactly, both hills included. The normalizing constant was never computed, because every step only divided one height by another.',
         *[dict(hide=k) for k in ('p1', 'p2', 'p3', 'p4', 'p5', 'you')],
         dict(bars='hist', chart='land', data=[[round(-2.375 + 0.25 * i, 3), h, '', 'blue'] for i, h in enumerate(HIST)], bw=20, ms=1400)),
    step('Step size matters. These are the lesson chart\'s own 200 iterations. With tiny steps of 0.1, 97% are accepted, but it creeps: it never reaches the left hill. With steps of 0.8, 74% are accepted and it crosses between the hills again and again.',
         chart('tr', (10, 316, 580, 230), 'Trace: θ by iteration', [0, 200], [-2.5, 2.5], [[-1, '−1'], [0, '0'], [1, '+1']],
               [[0, '0'], [100, '100'], [200, '200']], pl=40, pr=14, zero=True),
         series('t08', 'tr', T08, 'green', ms=1600, width=2.2, label='step 0.8', lat=[200, -2.2], ldx=-4, ldy=0, lanchor='end'),
         series('t01', 'tr', T01, 'amber', ms=1600, width=2.6, label='step 0.1', lat=[30, 1.9], ldx=0, ldy=0, lanchor='start')),
    step('Too big is bad too. With steps of 3.0, most proposals land far down a slope and only 39% are accepted, so the chain sits still for long runs. Both extremes mix poorly, for opposite reasons.',
         box('acc', 10, 562, 285, 92, 'accepted:\n0.1 → 97% · 0.8 → 74%\n3.0 → 39%', 'amber', size=18)),
    step('Gibbs sampling is the special case that never rejects. It draws each parameter straight from its exact conditional distribution, given the others, so the acceptance ratio is always exactly 1.',
         box('gibbs', 305, 562, 285, 92, 'Gibbs: draw from the\nexact conditional\n→ ratio = 1, always accept', 'green', size=18)),
    step('Before you trust any chain, run several from scattered starting points. If they all describe the same place, R̂ sits near 1.00. A single chain can look healthy while stuck on one hill.',
         box('rhat', 10, 666, 580, 84, 'several chains, scattered starts\nR̂ near 1.00 before you trust it', 'blue', size=19)),
])


BOARD = dict(name='mcmc_metropolis_gibbs', lesson='mcmc-metropolis-gibbs', title='Metropolis: a walk that compares heights', cfg=MH,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=7)

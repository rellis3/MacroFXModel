from ._wb import *
import random
from math import exp

# ── The Probability of Informed Trading (institutional-pin) ──────────────────
# The lesson's fitted parameters: alpha = 0.25, delta = 0.55, mu = 150, eps = 100 ->
# alpha*mu = 37.5, 2*eps = 200, PIN = 37.5 / 237.5 = 0.158. The 20-day strip is a
# simulation FROM that model (fixed seed), to show what the daily counts look like;
# it is illustrative, not real data.
A, DL, MU, EPS = 0.25, 0.55, 150, 100
PIN = A * MU / (A * MU + 2 * EPS)
assert round(PIN, 3) == 0.158
def _pois(r, lam):
    L, k, p = exp(-lam), 0, 1.0
    while True:
        p *= r.random()
        if p <= L: return k
        k += 1
_r = random.Random(35)
DAYS = []
for _ in range(20):
    u = _r.random()
    kind = 'none' if u >= A else ('bad' if _r.random() < DL else 'good')
    b = _pois(_r, EPS + (MU if kind == 'good' else 0)); s = _pois(_r, EPS + (MU if kind == 'bad' else 0))
    DAYS.append((kind, b, s))
NEV = sum(k != 'none' for k, _, _ in DAYS)

CFG = dict(w=600, h=800, intro='Nobody can see who is informed. But informed traders leave a fingerprint in the daily counts of buys and sells. Press play, or step through.', steps=[
    step('Every day, uninformed traders turn up on both sides: about 100 buys and 100 sells a day (ε = 100 per side), for reasons unrelated to the stock\'s value.',
         icon('noise', 'crowd', 80, 8, 0.7, 'blue', 'uninformed: ε = 100 a side', lsize=16),
         chart('types', (10, 132, 580, 236), 'Expected trades on each kind of day', [0.3, 6.7], [0, 300], [[100, '100'], [250, '250']],
               [[1.5, 'no event'], [3.5, 'bad news'], [5.5, 'good news']], pl=50, pr=14),
         dict(bars='t0', chart='types', data=[[1.15, 100, 'B 100', 'green'], [1.85, 100, 'S 100', 'red']], bw=34, size=15, ms=900)),
    step('On some days private news arrives. With probability α = 0.25, about one day in four, there is an information event.',
         icon('coin', 'coin', 300, 8, 0.66, 'amber', 'event? α = 0.25', lsize=16)),
    step('Bad news (55% of events, δ = 0.55): informed traders arrive at μ = 150 a day and all sell. Sells jump to about 250 while buys stay near 100.',
         icon('inf', 'person', 480, 8, 0.66, 'purple', 'informed: μ = 150', lsize=16),
         dict(bars='t1', chart='types', data=[[3.15, 100, 'B 100', 'green'], [3.85, 250, 'S 250', 'red']], bw=34, size=15, ms=900)),
    step('Good news is the mirror image: the informed all buy, so buys jump to about 250.',
         dict(bars='t2', chart='types', data=[[5.15, 250, 'B 250', 'green'], [5.85, 100, 'S 100', 'red']], bw=34, size=15, ms=900)),
    step(f'A researcher never sees the day type, only the counts. Here are 20 days simulated from this model: buys minus sells each day. Most days are roughly balanced; {NEV} are sharply lopsided.',
         chart('days', (10, 382, 580, 214), '20 simulated days: buys − sells', [0.3, 20.7], [-200, 200], [[150, '+150'], [0, '0'], [-150, '−150']],
               [[1, '1'], [10, '10'], [20, '20']], zero=True, pl=56, pr=14),
         dict(bars='dd', chart='days', data=[[i + 1, b - s, '', 'green' if b - s > 0 else 'red'] for i, (k, b, s) in enumerate(DAYS)], bw=18, ms=1300)),
    step('Maximum likelihood reads that pattern: how often days are lopsided gives α, how lopsided gives μ, and the balanced baseline gives ε. Here we take the fitted values as given: 0.25, 150 and 100.',
         note('mle', 300, 620, 'how often lopsided → α · how lopsided → μ · baseline → ε', 'purple', 18)),
    step('Expected informed trades a day: α × μ = 0.25 × 150 = 37.5. Expected uninformed: 2ε = 200. PIN is the informed share: 37.5 / 237.5 ≈ 0.158.',
         box('pin', 60, 644, 480, 58, 'PIN = 37.5 / (37.5 + 200) ≈ 0.158', 'green', size=21)),
    step('Notice δ never entered. Good news or bad news, the same share of the flow is informed. PIN measures how much, not which way.',
         note('delta', 300, 724, 'δ (bad vs good) drops out: PIN is direction-free', 'amber', 18)),
    step('Two cautions. Duarte and Young (2009) argue part of PIN is ordinary illiquidity-driven imbalance, not private information. And the fit is slow, which is why VPIN was built as a real-time approximation.',
         note('dy', 300, 760, 'contested: imbalance ≠ always information', 'red', 18)),
])


BOARD = dict(name='institutional_pin', lesson='institutional-pin', title='PIN: the informed fingerprint in daily buys and sells', cfg=CFG,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=10)

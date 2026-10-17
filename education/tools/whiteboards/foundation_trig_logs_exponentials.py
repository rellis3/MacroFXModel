from ._wb import *
import math

# ── Trig, logs & exponentials (foundation-trig-logs-exponentials) ────────────
# Numbers are the lesson's own: unit circle (cos, sin); the compounding chart's $100 at 8%
# for 10 years (annual $215.89 ... continuous $222.55); 5% simple = ln(1.05) = 4.879%
# continuous; the 4-day series 100, 102, 101, 104, 103 whose log-returns sum to ln(1.03).
CIRC = [[round(math.cos(math.radians(a)), 4), round(math.sin(math.radians(a)), 4)] for a in range(0, 361, 6)]
LAP1 = [[round(t / 20 * 2 * math.pi, 4), round(math.sin(t / 20 * 2 * math.pi), 4)] for t in range(0, 41)][:21]
LAP2 = [[round(t / 20 * 2 * math.pi, 4), round(math.sin(t / 20 * 2 * math.pi), 4)] for t in range(20, 41)]
A30 = math.radians(30)
P30 = [round(math.cos(A30), 4), 0.5]
COMP = [(1, 'yearly'), (4, 'quarterly'), (12, 'monthly'), (252, 'daily')]
VALS = [round(100 * (1 + 0.08 / m) ** (10 * m), 2) for m, _ in COMP] + [round(100 * math.exp(0.8), 2)]
assert VALS[0] == 215.89 and VALS[-1] == 222.55
PR = [100, 102, 101, 104, 103]
LR = [math.log(PR[i + 1] / PR[i]) for i in range(4)]
CUM = [0.0]
for v in LR: CUM.append(CUM[-1] + v)
assert abs(CUM[-1] - math.log(1.03)) < 1e-12

CI = (10, 10, 240, 250)
WV = (262, 10, 328, 250)
GR = (10, 272, 580, 230)
LG = (10, 514, 580, 236)

TLE = dict(w=600, h=760, intro='A point walking round a circle, money growing every instant, and returns that finally add up. Real numbers from the lesson. Press play, or step through.', steps=[
    step('Picture a circle of radius 1. A point starts at the 3 o\'clock position and walks anticlockwise round the rim.',
         chart('ci', CI, 'The unit circle', [-1.35, 1.35], [-1.35, 1.35], [[-1, '−1'], [1, '1']], [[-1, '−1'], [1, '1']], zero=True, pl=30, pr=8),
         series('rim', 'ci', CIRC, 'blue', ms=1400),
         dot('st', 'ci', [1, 0], '', 'blue')),
    step('Walk 30° round. The point\'s height above the centre is the sine: sin 30° = 0.5. Its sideways distance is the cosine, about 0.866.',
         series('rad', 'ci', [[0, 0], P30], 'amber', ms=600),
         series('ht', 'ci', [P30, [P30[0], 0]], 'purple', dash=True, ms=500),
         dot('p30', 'ci', P30, '0.5', 'purple', dx=10, dy=-10, anchor='start')),
    step('Keep walking and plot the height against how far you have walked. The height rises to 1 at 90°, falls back to 0 at 180°, reaches −1 at 270° and returns to 0 at 360°. That wave is the sine.',
         chart('wv', WV, 'Height as you walk', [0, 12.9], [-1.35, 1.35], [[-1, '−1'], [0, '0'], [1, '1']],
               [[0, '0'], [3.1416, '180°'], [6.2832, '360°'], [9.4248, '540°'], [12.566, '720°']], zero=True, pl=34, pr=10),
         series('l1', 'wv', LAP1, 'purple', ms=1600),
         dot('w30', 'wv', [A30, 0.5], '', 'purple')),
    step('Walk a second lap and the wave repeats exactly, because the circle is the same every time round. That is why anything that cycles, like a season or a daily rhythm, is described with sine and cosine.',
         series('l2', 'wv', LAP2, 'purple', dash=True, ms=1400)),
    step('A different question: money growing. $100 at 8% a year for 10 years, with interest added once a year, grows to $215.89.',
         chart('gr', GR, '$100 at 8% for 10 years, by how often interest is added', [0.4, 5.6], [0, 260],
               [[0, '0'], [100, '100'], [200, '200']], [[1, 'yearly'], [2, 'quarterly'], [3, 'monthly'], [4, 'daily'], [5, 'every instant']], pl=50),
         dict(bars='g1', chart='gr', data=[[1, VALS[0], f'{VALS[0]:.2f}', 'blue']], bw=60, ms=900)),
    step('Add interest more often and you earn a little more each time: $220.80 quarterly, $221.96 monthly, $222.53 daily. The extra keeps shrinking.',
         dict(bars='g2', chart='gr', data=[[2, VALS[1], f'{VALS[1]:.2f}', 'blue'], [3, VALS[2], f'{VALS[2]:.2f}', 'blue'], [4, VALS[3], f'{VALS[3]:.2f}', 'blue']], bw=60, ms=1100)),
    step('Push it to every instant and the total settles on $222.55: that is 100 × e^0.8. The number e, about 2.718, is what growth settles on when it compounds every instant. Jacob Bernoulli found it in 1683 with this exact money puzzle.',
         dict(bars='g3', chart='gr', data=[[5, VALS[4], f'{VALS[4]:.2f}', 'green']], bw=60, ms=900)),
    step('The natural log, ln, runs growth backwards. Which continuous rate grows money as much as 5% paid once a year? ln(1.05) = 4.879%. Slightly smaller, because it compounds every instant.',
         dict(hide='ci'), dict(hide='rim'), dict(hide='st'), dict(hide='rad'), dict(hide='ht'), dict(hide='p30'),
         dict(hide='wv'), dict(hide='l1'), dict(hide='l2'), dict(hide='w30'),
         box('ln', 10, 40, 580, 90, '5% once a year  =  ln(1.05) = 4.879% every instant', 'purple', size=21)),
    step('Now returns. Prices over four days: 100, 102, 101, 104, 103. Each day\'s log-return is ln(today ÷ yesterday): +1.98%, −0.99%, +2.93%, −0.97% (as hundredths of a log).',
         chart('lg', LG, 'Daily log-returns (×100), and their running total', [0.4, 5.6], [-2.4, 5.2],
               [[-1, '−1'], [0, '0'], [2, '2'], [4, '4']], [[1, 'day 1'], [2, 'day 2'], [3, 'day 3'], [4, 'day 4']], zero=True, pl=44),
         dict(bars='lrb', chart='lg', data=[[i + 1, round(100 * v, 2), f'{100 * v:+.2f}', 'green' if v > 0 else 'red'] for i, v in enumerate(LR)], bw=50, ms=1200)),
    step('Add them up day by day, like stacking blocks. After four days the running total is 2.96. And ln(103 ÷ 100) = 2.96 too, exactly the same. Logs turn multiplying into adding.',
         series('cum', 'lg', [[i + 0.5, round(100 * CUM[i], 3)] for i in range(1, 5)], 'amber', ms=1200),
         dot('ce', 'lg', [4.5, round(100 * CUM[-1], 3)], 'total 2.96 = ln 1.03', 'amber', dx=0, dy=26, anchor='middle')),
    step('Simple percentages don\'t add like that. Up 50% then down 50% is not 0%: $100 becomes $150, then $75, a 25% loss. In logs: ln 1.5 + ln 0.5 = −0.288, and e^−0.288 − 1 = −25%.',
         box('trap', 10, 146, 580, 90, '+50% then −50%: $100 → $150 → $75\nnot 0%, but −25%', 'red', size=20)),
])


BOARD = dict(name='foundation_trig_logs_exponentials', lesson='foundation-trig-logs-exponentials',
             title='Circles, compounding and returns that add up', cfg=TLE,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=9)

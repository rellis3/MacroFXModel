from ._wb import *
import math, random

# ── When an edge has stopped working (action-edge-decay) ─────────────────────
# The lesson's worked example: tested p0 = 55%, b = 1 (break-even 50%). Live: 180 trades,
# 88 wins; first 120 trades 67 wins, last 60 trades 21 wins ending in seven straight losses.
# Streak odds 30.6%; z = (88 - 99) / 6.67 = -1.65; LR 3.7; power 38%, 615 trades for 80%.
# CUSUM scores: win ln(0.50/0.55) = -0.095, loss ln(0.50/0.45) = +0.105, h = 3.
# The trade ORDER inside each stretch is illustrative (seeded shuffle with the lesson's
# counts, chosen so the path never crosses 3 and ends at 2.20, matching "at least 2.1, not over").
# Threshold table: the lesson's own simulation (40,000 paths, seed 3).
WI, LI = math.log(0.50 / 0.55), math.log(0.50 / 0.45)
_r = random.Random(8)
_a = [1] * 67 + [0] * 53; _r.shuffle(_a)
_b = [1] * 21 + [0] * 32; _r.shuffle(_b); _b += [0] * 7
SEQ = _a + _b
assert len(SEQ) == 180 and sum(SEQ) == 88 and sum(SEQ[:120]) == 67
PATH, _s = [[0, 0]], 0.0
for _t, _x in enumerate(SEQ, 1):
    _s = max(0.0, _s + (WI if _x else LI)); PATH.append([_t, round(_s, 3)])
assert max(v for _, v in PATH) < 3 and PATH[-1][1] >= 2.11
END = PATH[-1][1]

CU = (10, 192, 580, 266)
TH = (10, 470, 580, 240)

ED = dict(w=600, h=720, intro='A system tested at 55% wins, 180 live trades, and a losing streak at the end. Is the edge gone, or is this the usual noise? Press play, or step through.', steps=[
    step('The system was tested out of sample at 55% wins, with the average win equal to the average loss. So break-even is 50%. Live, it has made 180 trades and won 88, ending with seven losses in a row.',
         box('sys', 10, 10, 280, 80, 'tested: 55% wins\nbreak-even 50%', 'blue', size=19),
         box('live', 310, 10, 280, 80, 'live: 88 of 180 wins\nthen 7 losses in a row', 'red', size=19)),
    step('Start with the streak, because it feels the loudest. At 55%, a run of 7 or more losses turns up somewhere in 180 trades 30.6% of the time. About one live record in three has one. On its own, it is not evidence.',
         box('streak', 10, 102, 580, 78, 'a 7-loss run in 180 trades:\n30.6% likely even at 55%', 'amber', size=19)),
    step('Now the whole record. At 55%, 180 trades should give 99 wins, give or take 6.67 from luck. You have 88: z = (88 − 99) ÷ 6.67 = −1.65. Suggestive, not conclusive. That is the amber band.',
         dict(hide='streak'),
         box('z', 10, 102, 580, 78, 'expected 99 ± 6.67, got 88\nz = −1.65 → AMBER', 'amber', size=19)),
    step('How far should it move you? The record is 3.7 times likelier if the edge has gone. But the system passed an honest test: say odds of 3 to 1 that it is real. Combined, about a 55% chance it has gone. A coin flip.',
         dict(hide='sys'), dict(hide='live'),
         box('lr', 10, 10, 280, 80, 'LR 3.7, prior 3 : 1\n→ about 55% gone', 'purple', size=19),
         box('pw', 310, 10, 280, 80, '180 trades: 38% power\n80% needs ~615 trades', 'red', size=19)),
    step('And 180 trades can barely tell. The chance of spotting a fall from 55% to 50% is only about 38%. You would need about 615 trades for 80%. The test is weak, not the evidence clean.',
         dict(pulse='pw')),
    step('A CUSUM watches every trade instead. Each win scores −0.095, each loss +0.105, and the running total is never allowed below zero. The alarm is set in advance at h = 3. The first 120 trades went roughly to plan, 67 wins, so the total stays low.',
         chart('cu', CU, 'CUSUM after each trade (trade order illustrative)', [0, 180], [0, 3.4],
               [[0, '0'], [1, '1'], [2, '2'], [3, 'h = 3']], [[0, '0'], [60, '60'], [120, '120'], [180, '180']], pl=58, pr=20),
         series('hl', 'cu', [[0, 3], [180, 3]], 'amber', dash=True, ms=500),
         series('c1', 'cu', PATH[:121], 'purple', ms=1600)),
    step(f'Then the last 60 trades: 21 wins and 39 losses, ending in the seven-loss run. The losses push the total up to about {END:.1f}. Close to the alarm, but not over it.',
         series('c2', 'cu', PATH[120:], 'red', ms=1400),
         dot('ce', 'cu', PATH[-1], f'{END:.1f}', 'red', dx=-10, dy=-16, anchor='end')),
    step('Why h = 3? It is the smoke-alarm trade-off. From the lesson\'s simulation: a healthy 55% system trips the alarm within 300 trades 21.1% of the time at h = 2, 3.5% at h = 3, 0.5% at h = 4.',
         chart('th', TH, '% of runs: false alarm (red), decay caught (green)', [0.5, 4.5], [0, 128],
               [[0, '0'], [50, '50'], [100, '100']], [[1, 'h = 2'], [2, 'h = 3'], [3, 'h = 4'], [4, 'h = 5']], pl=50),
         dict(bars='fa', chart='th', data=[[0.8, 21.1, '21%', 'red'], [1.8, 3.5, '3.5%', 'red'], [2.8, 0.5, '0.5%', 'red'], [3.8, 0.05, '0.05%', 'red']], bw=34, ms=1000)),
    step('The other side of the trade-off: how often a real fall to 50% is caught within 1,000 trades. 99.6% at h = 2, 95.4% at h = 3, 86.5% at h = 4. No setting is fast and quiet at once.',
         dict(bars='ca', chart='th', data=[[1.2, 99.6, '99.6%', 'green'], [2.2, 95.4, '95%', 'green'], [3.2, 86.5, '87%', 'green'], [4.2, 73.6, '74%', 'green']], bw=34, ms=1000)),
    step('The verdict, from rules written before launch: AMBER. Halve the size and look for a named cause: costs, fills, a data change, a new regime. Red, and stop, if the CUSUM reaches 3 or z falls to −2.33. Never re-fit the system on its losing stretch.',
         dict(hide='lr'), dict(hide='pw'), dict(hide='z'),
         box('ver', 10, 10, 580, 170, 'AMBER: half size, find a cause\nRED if CUSUM ≥ 3 or z ≤ −2.33\nnever re-fit on the losing stretch', 'amber', size=21)),
])


BOARD = dict(name='action_edge_decay', lesson='action-edge-decay',
             title='A decay verdict, step by step', cfg=ED,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>',
             deck_after=8)

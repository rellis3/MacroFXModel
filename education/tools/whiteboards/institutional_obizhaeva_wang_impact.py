from ._wb import *
from math import exp, log

# ── Obizhaeva-Wang transient impact (institutional-obizhaeva-wang-impact) ──────
# The lesson's toy: sell Q = 100 over T = 1 in 5 trades at t = 0, .25, .5, .75, 1, rho = 2,
# kappa = 0.01, cost_i = q_i·D(t_i−) + ½κq_i². Totals (computed below, asserted against the
# lesson's table): one block 50.00; even 26.45 (10.00 self + 16.45 leftover); 40/6.67×3/40
# 25.92 (16.67 + 9.25); two 50-unit blocks 28.38. Half-life ln2/rho ≈ 0.35. With rho = 0
# every schedule costs ½κQ² = 50 (the lesson's calculator gives the same).
RHO, K, T = 2.0, 0.01, [0, 0.25, 0.5, 0.75, 1.0]

def run(q, rho=RHO):
    D, prev, cost, selfc, path = 0.0, None, 0.0, 0.0, [[0, 0]]
    for qi, t in zip(q, T):
        if prev is not None:
            for s in range(1, 9):
                tt = prev + (t - prev) * s / 8
                path.append([round(tt, 4), round(D * exp(-rho * (tt - prev)), 4)])
            D *= exp(-rho * (t - prev))
        cost += qi * D + 0.5 * K * qi * qi; selfc += 0.5 * K * qi * qi
        D += K * qi; path.append([t, round(D, 4)]); prev = t
    for s in range(1, 5):
        tt = 1 + 0.25 * s / 4
        path.append([round(tt, 4), round(D * exp(-rho * (tt - 1)), 4)])
    return cost, selfc, path

EVEN, FB, BLOCK, TWO = [20] * 5, [40, 20 / 3, 20 / 3, 20 / 3, 40], [100, 0, 0, 0, 0], [50, 0, 0, 0, 50]
CE, SE, PE = run(EVEN); CF, SF, PF = run(FB); CB, _, _ = run(BLOCK); C2, _, _ = run(TWO)
assert [round(x, 2) for x in (CB, CE, SE, CF, SF, C2)] == [50.0, 26.45, 10.0, 25.92, 16.67, 28.38]
assert round(run(EVEN, 0)[0], 2) == 50.0 and round(log(2) / RHO, 2) == 0.35

DT = (10, 112, 580, 270)

OW = dict(w=600, h=800, intro="Selling 100 units in five slices, into a book that heals at a finite speed. The lesson's own toy numbers. Press play, or step through.", steps=[
    step('You must sell 100 units in five trades at evenly spaced times. The resting bids near the mid are a reservoir: each sale drains some, and liquidity providers refill it, but not instantly.',
         icon('you', 'person', 24, 4, 0.62, 'blue', 'you: sell 100', lsize=17),
         icon('bk', 'crowd', 480, 4, 0.62, 'green', 'book refills', lsize=17),
         arrow('you', 'bk', label='5 slices', tone='blue', dash=True, id='sl')),
    step('Track one number: D, how far your own trading has pushed the price. First slice, 20 units: D jumps by κ × 20 = 0.01 × 20 = 0.2.',
         chart('dt', DT, 'Impact D(t): even split, 5 × 20', [0, 1.25], [0, 0.62],
               [[0.2, '0.2'], [0.4, '0.4'], [0.6, '0.6']], [[0, '0'], [0.25, '.25'], [0.5, '.5'], [0.75, '.75'], [1, '1']], pl=46, pr=14),
         series('e1', 'dt', PE[:2], 'purple', ms=500),
         cnote('j1', 'dt', [0, 0.2], '+0.2', 'purple', 17, anchor='start', dx=8, dy=-6)),
    step('Between trades the book heals: D decays at resilience ρ = 2, a half-life of about 0.35. By the next slice, 0.12 of the push is still there.',
         series('e2', 'dt', PE[1:10], 'purple', ms=900),
         dot('lo', 'dt', [0.25, 0.1213], '0.12 left', 'amber', dy=16)),
    step('The second slice lands on top of that leftover. It pays the 0.12 still in the book, plus half its own push. D jumps to 0.32.',
         series('e3', 'dt', PE[9:11], 'purple', ms=400)),
    step('Keep going: the book never fully heals before the next slice, so the leftover ratchets up to about 0.47. Total even-split cost: 26.45, of which 10.00 is self-impact and 16.45 is fighting your own leftover.',
         series('e4', 'dt', PE[10:], 'purple', ms=1600),
         chart('c', (10, 400, 300, 240), 'Total cost', [0.4, 4.6], [0, 58], [[25, '25'], [50, '50']],
               [[1, 'block'], [2, 'even'], [3, 'ends'], [4, '2×50']], pl=36, pr=8),
         dict(bars='be', chart='c', data=[[2, round(CE, 2), '26.45', 'purple']], bw=40, ms=800)),
    step('Compare one block of 100 at the start: no leftover at all, but the full self-impact of the whole size, ½ × 0.01 × 100² = 50.00. Nearly twice the even split.',
         dict(bars='bb', chart='c', data=[[1, 50, '50.00', 'red']], bw=40, ms=800)),
    step('Why the ends are special: at the start the book is fully rested, so there is nothing to fight. At the end, whatever you leave behind never meets another of your trades.',
         box('ends', 330, 400, 260, 76, 'start: rested book\nend: no later trade', 'green', size=18),
         dict(pulse='e1')),
    step('So trade bigger at the ends: 40 first, 6.67 three times, 40 last. The leftover the middle slices fight stays lower. Total 25.92: 16.67 self-impact plus only 9.25 leftover.',
         dict(dim='e1'), dict(dim='e2'), dict(dim='e3'), dict(dim='e4'), dict(dim='lo'), dict(dim='j1'),
         series('fb', 'dt', PF, 'green', ms=1800, label='ends-loaded', lat=[0.5, PF[19][1]], ldy=-16),
         dict(bars='bf', chart='c', data=[[3, round(CF, 2), '25.92', 'green']], bw=40, ms=800)),
    step('Only about 2% cheaper, because bigger blocks pay more for their own push. Push the idea too far, two blocks of 50 and nothing between, and it costs 28.38: worse than even.',
         dict(bars='b2', chart='c', data=[[4, round(C2, 2), '28.38', 'amber']], bw=40, ms=800),
         box('bal', 330, 492, 260, 76, 'ends bigger, not\nas big as possible', 'amber', size=18)),
    step('It all hinges on healing. If the book never healed, ρ = 0, every schedule would cost the same 50.00 as one block. Slicing only helps because the book refills.',
         box('r0', 330, 584, 260, 56, 'ρ = 0 → every schedule 50.00', 'red', size=17)),
    step('Three kinds of memory: Kyle\'s impact is permanent, Almgren-Chriss\'s temporary impact vanishes the instant you slow down, and Obizhaeva-Wang\'s has a real half-life.',
         box('m1', 10, 660, 180, 64, 'Kyle: never decays', 'amber', size=17),
         box('m2', 210, 660, 180, 64, 'AC: no memory', 'blue', size=17),
         box('m3', 410, 660, 180, 64, 'OW: half-life', 'purple', size=17)),
    step('The catch: the resilience rate is hard to estimate and probably moves through the day. Space your slices to let the book heal, and trade bigger where your footprint cannot hurt you.',
         note('end', 300, 768, 'let it heal · bigger at the ends · not all at once', 'green', 19)),
])


BOARD = dict(name='institutional_obizhaeva_wang_impact', lesson='institutional-obizhaeva-wang-impact',
             title='Transient impact: slicing into a book that heals', cfg=OW,
             before="  <div class=\"tl-section-mark\"><span>Section 03</span></div>\n  <h2>Why the optimal schedule isn't smooth</h2>",
             deck_after=7)

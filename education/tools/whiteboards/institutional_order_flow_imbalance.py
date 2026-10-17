from ._wb import *

# ── Order flow imbalance & the microprice (institutional-order-flow-imbalance) ──
# The lesson's four snapshots: (Pb, Qb, Pa, Qa) = (1.10040, 400, 1.10050, 400),
# (1.10040, 600, 1.10050, 400), (1.10040, 900, 1.10050, 300), (1.10050, 500, 1.10060, 350).
# QI, microprice and the Cont-Kukanov-Stoikov OFI per update are all recomputed here and
# checked against the lesson's table (QI 0 / 0.2 / 0.5 / 0.176; OFI +200 / +400 / +800).
SNAP = [(1.10040, 400, 1.10050, 400), (1.10040, 600, 1.10050, 400), (1.10040, 900, 1.10050, 300), (1.10050, 500, 1.10060, 350)]
def stats(s):
    pb, qb, pa, qa = s
    return (pb + pa) / 2, (qb - qa) / (qb + qa), (pb * qa + pa * qb) / (qb + qa)
def ofi(p, n):
    pb0, qb0, pa0, qa0 = p; pb, qb, pa, qa = n
    eb = qb if pb > pb0 else (qb - qb0 if pb == pb0 else -qb0)
    ea = qa if pa < pa0 else (qa - qa0 if pa == pa0 else -qa0)
    return eb, ea, eb - ea
ST = [stats(s) for s in SNAP]
OFI = [ofi(SNAP[i - 1], SNAP[i]) for i in range(1, 4)]
assert [round(q, 3) for _, q, _ in ST] == [0.0, 0.2, 0.5, 0.176]
assert [f'{m:.6f}' for _, _, m in ST] == ['1.100450', '1.100460', '1.100475', '1.100559']
assert OFI == [(200, 0, 200), (300, -100, 400), (500, -300, 800)]

def sizes(i, cap, *extra):
    pb, qb, pa, qa = SNAP[i]; mid, qi, mp = ST[i]
    ops = []
    if i: ops.append(dict(hide=f'sz{i - 1}'))
    ops.append(dict(bars=f'sz{i}', chart='sz', data=[[1, qb, f'{qb}', 'green'], [2, qa, f'{qa}', 'red']], bw=70, ms=700))
    ops.append(dict(sub='qi', text=f'{qi:+.3f}' if i else '0.000'))
    ops.append(dict(sub='mp', text=f'{mp:.6f}'))
    ops.append(dot(f'mid{i}', 'path', [i + 1, mid * 1e4], '', None, r=4.5))
    ops.append(dot(f'mp{i}', 'path', [i + 1, mp * 1e4], '', 'amber', r=5.5))
    if i:
        ops.append(series(f'ms{i}', 'path', [[i, ST[i - 1][0] * 1e4], [i + 1, mid * 1e4]], None, dash=True, ms=500))
        ops.append(series(f'ps{i}', 'path', [[i, ST[i - 1][2] * 1e4], [i + 1, mp * 1e4]], 'amber', ms=700))
    return step(cap, *ops, *extra)

CFG = dict(w=600, h=760, intro='Watch the top of the book, not the trades. Size builds on the bid, the ask thins, and the price follows. Press play, or step through.', steps=[
    step('A small EUR/USD-style book. Best bid 1.10040 with 400 resting, best ask 1.10050 with 400. Balanced: the midpoint is 1.100450.',
         box('bid', 20, 14, 270, 70, 'Best bid', 'green', sub='1.10040', size=18),
         box('ask', 310, 14, 270, 70, 'Best ask', 'red', sub='1.10050', size=18),
         chart('sz', (10, 98, 280, 222), 'Resting size at the touch', [0.4, 2.6], [0, 1050], [[400, '400'], [900, '900']],
               [[1, 'bid'], [2, 'ask']], pl=48, pr=14),
         box('qi', 310, 98, 270, 66, 'Queue imbalance QI', 'blue', sub='0.000', size=17),
         box('mp', 310, 176, 270, 66, 'Microprice', 'amber', sub='1.100450', size=17),
         box('of', 310, 254, 270, 66, 'OFI this update', 'purple', sub='none yet', size=17),
         chart('path', (10, 334, 580, 236), 'Midpoint (dashed) and microprice (amber)', [0.6, 4.4], [11003.8, 11006.2],
               [[11004, '1.10040'], [11005, '1.10050'], [11006, '1.10060']], [[1, 'n = 1'], [2, 'n = 2'], [3, 'n = 3'], [4, 'n = 4']], pl=78, pr=18),
         dict(bars='sz0', chart='sz', data=[[1, 400, '400', 'green'], [2, 400, '400', 'red']], bw=70, ms=700),
         dot('mid0', 'path', [1, ST[0][0] * 1e4], '', None, r=4.5), dot('mp0', 'path', [1, ST[0][2] * 1e4], '', 'amber', r=5.5)),
    step('The microprice weights each price by the opposite side\'s size. Equivalently it is the midpoint plus half the spread times the queue imbalance. Balanced book: QI = 0, so microprice = midpoint.',
         note('fml', 300, 592, 'micro = (bid × ask size + ask × bid size) ÷ total size\n= midpoint + half-spread × QI', 'amber', 17)),
    sizes(1, 'Update 2: the bid grows from 400 to 600 at the same price; the ask is unchanged. OFI = 200 − 0 = +200. QI rises to 0.2 and the microprice edges up to 1.100460. The midpoint has not moved.',
          dict(sub='of', text='+200')),
    sizes(2, 'Update 3: the bid grows to 900 and the ask thins from 400 to 300. A thinning ask counts as buying pressure: OFI = 300 − (−100) = +400. QI = 0.5, and the microprice is a quarter pip above the still-unmoved midpoint.',
          dict(sub='of', text='+400')),
    step('Update 4: the price ticks up. New best bid 1.10050 with 500, new best ask 1.10060 with 350. OFI = 500 − (−300) = +800. The book moved the way it had been leaning.',
         dict(sub='bid', text='1.10050'), dict(sub='ask', text='1.10060'),
         *sizes(3, '', dict(sub='of', text='+800'))['do']),
    step('Over the window, OFI = 200 + 400 + 800 = +1,400, built only from book updates. Not a single trade print was needed to see the pressure building.',
         note('sum', 300, 642, 'OFI over the window = +200 + 400 + 800 = +1,400', 'purple', 19)),
    step('On a desk: a market maker re-centres its quotes on the microprice, so it leans its bid and ask up before the midpoint moves, avoiding being picked off on the thin ask.',
         note('use', 300, 674, 'quote around the microprice, not the stale mid', 'green', 18)),
    step('Two cautions. Displayed size can be cancelled an instant later, so a spoofed wall can fake the reading. And both signals speak only to the next few ticks, and only about the top level of the book.',
         note('cav', 300, 706, 'displayed ≠ committed size · next few ticks only', 'red', 18)),
])


BOARD = dict(name='institutional_order_flow_imbalance', lesson='institutional-order-flow-imbalance',
             title='Order flow imbalance: the book tilts, then the price moves', cfg=CFG,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=11)

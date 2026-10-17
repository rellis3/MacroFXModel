from ._wb import *

# ── Knight Capital: eight copies and one stale flag (data-architecture-storage-versioning) ──
# Facts are the lesson's own (SEC order as retold there): 1 Aug 2012, NYSE Retail Liquidity
# Program, router on 8 servers, new code on 7, reused flag still meant "Power Peg" (unused since
# 2003, fill tracking broken) on the 8th, error emails before the open ignored, rollback of the
# new code made all 8 behave like the stale one; ~45 minutes, >4 million executions in 154 stocks,
# ~$440m loss (firm estimate), >$460m in the SEC's 2013 order, $12m fine.
# Worked example: spread 1.8 bp stored as 0.00018 → cost understated 1.8 / 0.00018 = 10,000×.

SX = [20 + i * 72 for i in range(8)]          # server box x positions (w 58)
SERVERS = [box('s%d' % i, SX[i], 46, 58, 50, str(i + 1), None, size=20) for i in range(8)]

KNIGHT = dict(w=600, h=730, intro='One firm, eight copies of one program, and a flag that meant two things. Then the same failure in slow motion. Press play, or step through.', steps=[
    step('1 August 2012. The New York Stock Exchange launches its Retail Liquidity Program, and Knight Capital updates its automated order router to support it. The router runs on eight servers.',
         note('t', 300, 22, "Knight Capital's order router: eight servers", None, 19),
         *SERVERS),
    step('A technician copies the new code to seven of the eight servers. The eighth keeps the old code. Nobody checks.',
         *[chip('n%d' % i, SX[i] + 29, 120, 'new', 'green') for i in range(7)],
         chip('o7', SX[7] + 29, 120, 'old', 'red'),
         dict(pulse='s7')),
    step('The new code reuses an old flag. On the seven updated servers, the flag now means: handle this as a Retail Liquidity order.',
         note('m1', 20, 160, 'flag on 1–7: "retail liquidity order"', 'green', 19, 'start')),
    step('On the eighth, the same flag still means "run Power Peg": an old function unused since 2003 but never removed. An earlier change had broken how Power Peg tracked filled orders.',
         note('m2', 20, 192, 'flag on 8: "run Power Peg" (dead since 2003)', 'red', 19, 'start')),
    step('Before the open, automated error emails go out. Nobody acts on them.',
         icon('mail', 'warn', 30, 208, 0.5, 'amber', 'error emails', lsize=17),
         note('m3', 110, 234, 'sent before the open: ignored', 'amber', 18, 'start')),
    step('The market opens. Server 8 receives the flag, runs Power Peg, cannot see that its orders have filled, and keeps sending child orders, again and again.',
         icon('mkt', 'globe', 492, 214, 0.7, 'blue', 'the market', lsize=17),
         arrow('s7', 'mkt', 'orders', 'red', bend=-30)),
    step('Staff try to stop it. They remove the new code from the seven good servers. Now all eight run the old code, all eight read the flag as Power Peg, and the fault spreads.',
         *[dict(hide='n%d' % i) for i in range(7)],
         *[chip('r%d' % i, SX[i] + 29, 120, 'old', 'red') for i in range(7)],
         dict(dim='m1'),
         note('m4', 20, 306, 'rollback: old code + new meaning = 8 broken copies', 'red', 18, 'start')),
    step('In about 45 minutes the router produces more than 4 million executions in 154 stocks, building billions of dollars of positions nobody wanted.',
         box('ex', 20, 326, 270, 76, 'executions', 'red', sub='0', size=19),
         dict(count='ex', **{'from': 0, 'to': 4, 'dp': 0, 'suf': ' million+', 'ms': 1400}),
         box('st', 310, 326, 270, 76, 'stocks hit', 'red', sub='0', size=19),
         dict(count='st', **{'from': 0, 'to': 154, 'dp': 0, 'ms': 1400})),
    step('The bill: about $440 million by the firm\'s own estimate that week; more than $460 million in the SEC\'s 2013 order, which also fined Knight $12 million. Knight needed emergency outside capital within days and was later acquired.',
         chart('loss', (20, 418, 560, 214), 'Knight Capital, $ million', [0.4, 3.6], [0, 520],
               [[0, '0'], [200, '200'], [400, '400']], [[1, 'loss, firm est.'], [2, 'loss, SEC 2013'], [3, 'SEC fine']], pl=48),
         dict(bars='lb', chart='loss', data=[[1, 440, '≈ $440m', 'red'], [2, 460, '> $460m', 'red'], [3, 12, '$12m', 'amber']], bw=64, ms=1100)),
    step('The same failure in slow motion: a spread column switches from basis points to a fraction with no version tag. A cost model still reading 1.8 basis points as 0.00018 understates every cost 10,000 times, and nothing errors.',
         note('slow', 300, 656, 'slow version: 1.8 bp stored as 0.00018\n→ costs read 10,000 times too small', 'amber', 18)),
    step('The fix is the same in both. One authoritative version, checked on every copy before it runs, and a version on the meaning of every field, so a rollback restores code and meaning together.',
         note('fix', 300, 712, 'one version, checked everywhere, meaning included', 'green', 19)),
])


BOARD = dict(name='data_architecture_storage_versioning', lesson='data-architecture-storage-versioning',
             title='Knight Capital: eight copies and one stale flag', cfg=KNIGHT,
             before='  <div class="tl-section-mark"><span>Section 06</span></div>',
             deck_after=11)

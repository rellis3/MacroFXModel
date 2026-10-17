from ._wb import *

# ── Hasbrouck information share (institutional-hasbrouck-information-share) ────
# The lesson's worked example: alpha_Y = −0.40, alpha_X = 0.10, Omega = [[4, 1], [1, 1]].
# psi_Y = 0.20, psi_X = 0.80; sigma_w^2 = 0.16 + 0.32 + 0.64 = 1.12.
# Y first: IS_Y = 4/7 ≈ 0.5714, IS_X = 3/7. X first: IS_Y = 3/28 ≈ 0.1071, IS_X = 25/28.
# Midpoint: Y 0.3393, X 0.6607. With sigma_YX = 0 both orderings give IS_Y = 0.20 (our
# arithmetic, the calculator's "both orderings agree exactly" case).
AY, AX, SYY, SXX, SYX = -0.40, 0.10, 4.0, 1.0, 1.0
PY, PX = AX / (AX - AY), -AY / (AX - AY)
W2 = PY ** 2 * SYY + 2 * PY * PX * SYX + PX ** 2 * SXX
IS_Y1 = (PY * SYY + PX * SYX) ** 2 / (SYY * W2)
IS_Y2 = PY ** 2 * (SXX * SYY - SYX ** 2) / (SXX * W2)
assert (round(PY, 2), round(PX, 2), round(W2, 2)) == (0.2, 0.8, 1.12)
assert round(IS_Y1, 4) == 0.5714 and round(IS_Y2, 4) == 0.1071
assert round((PY ** 2 * SYY) / (PY ** 2 * SYY + PX ** 2 * SXX), 2) == 0.20

X0, SC = 50, 500 / W2                    # bar left edge, px per unit of variance
def seg(id, a, b, y, text, tone, size=18):
    return box(id, round(X0 + a * SC, 1), y, round((b - a) * SC, 1), 54, text, tone, size=size)
OWN_Y, SHARED, OWN_X = PY ** 2 * SYY, 2 * PY * PX * SYX, PX ** 2 * SXX     # 0.16, 0.32, 0.64

HIS = dict(w=600, h=790, intro="One true price, two venues, and a fight over who gets credit for the news. The lesson's own worked example, split two ways. Press play, or step through.", steps=[
    step('One asset, two venues: spot (Y) and futures (X). Both prices track one efficient price that nobody sees directly. Each venue adds its own noise.',
         box('eff', 170, 10, 260, 60, 'efficient price\n(unseen)', 'amber', size=19),
         box('Y', 20, 130, 220, 70, 'spot (Y)', 'blue', sub='', size=20),
         box('X', 360, 130, 220, 70, 'futures (X)', 'purple', sub='', size=20),
         arrow('eff', 'Y', tone='amber', id='eY'), arrow('eff', 'X', tone='amber', id='eX')),
    step('News arrives. Each venue\'s price takes a shock. In the example the shocks have variances 4 and 1, and covariance 1: a correlation of 0.5. They share information.',
         icon('news', 'bolt', 26, 8, 0.55, 'amber', 'news', lsize=17),
         note('om', 300, 236, 'variances 4 and 1 · covariance 1 (correlation 0.5)', 'chalk', 18)),
    step('From the VECM\'s adjustment speeds, −0.40 for Y and 0.10 for X, each venue\'s weight in the common price: Y 0.10 ÷ 0.50 = 0.20, X 0.40 ÷ 0.50 = 0.80. The venue that corrects less carries more.',
         dict(sub='Y', text='weight 0.20'), dict(sub='X', text='weight 0.80')),
    step('Total variance of the common price: 0.16 from Y\'s own shock, 0.64 from X\'s own shock, and 0.32 from the cross term. Together, 1.12.',
         note('tot', 300, 284, 'common-price variance = 1.12', 'chalk', 19),
         seg('oy', 0, OWN_Y, 302, '0.16', 'blue'),
         seg('sh', OWN_Y, OWN_Y + SHARED, 302, '0.32 shared', 'amber'),
         seg('ox', OWN_Y + SHARED, W2, 302, '0.64', 'purple')),
    step('The 0.32 in the middle comes from the correlation. It belongs to both venues at once. Which venue should get the credit? Nothing in the economics says.',
         dict(pulse='sh'),
         note('who', 300, 384, 'who owns the shared 0.32?', 'amber', 20)),
    step('Hasbrouck\'s fix is a Cholesky ordering. List Y first and Y claims the shared part, plus the piece of X\'s shock that Y\'s shock explains. Y: 0.64 of 1.12 = 57.1%.',
         dict(hide='who'),
         note('r1', X0, 424, 'Y ordered first', 'blue', 18, anchor='start'),
         seg('a1', 0, IS_Y1 * W2, 440, 'Y 57.1%', 'blue'),
         seg('b1', IS_Y1 * W2, W2, 440, 'X 42.9%', 'purple')),
    step('Same model, same numbers, X listed first instead. Now X claims the shared part. Y is left with 0.12 of 1.12 = 10.7%.',
         note('r2', X0, 522, 'X ordered first', 'purple', 18, anchor='start'),
         seg('a2', 0, IS_Y2 * W2, 538, '10.7', 'blue', 16),
         seg('b2', IS_Y2 * W2, W2, 538, 'X 89.3%', 'purple')),
    step('So Y\'s information share is anywhere from 10.7% to 57.1%, purely from a bookkeeping choice. That is the standard critique of the measure.',
         dict(line='rng', points=[[X0 + round(IS_Y2 * W2 * SC, 1), 612], [X0 + round(IS_Y1 * W2 * SC, 1), 612]], tone='red', width=5, ms=700),
         note('rngl', 352, 612, "Y: 10.7% … 57.1%", 'red', 19, anchor='start')),
    step('Hasbrouck\'s own advice: report both orderings, or the midpoint. Here the midpoint gives Y 33.9% and X 66.1%. One number, but it papers over a wide range.',
         dict(line='mid', points=[[X0 + round(0.3393 * W2 * SC, 1), 598], [X0 + round(0.3393 * W2 * SC, 1), 626]], tone='green', width=4, ms=500),
         note('midl', X0 + round(0.3393 * W2 * SC, 1), 646, 'midpoint 33.9%', 'green', 18)),
    step('Check where the problem lives: set the covariance to zero and there is no shared part. Both orderings then give Y exactly 0.16 ÷ 0.80 = 20%.',
         box('zero', 10, 668, 280, 56, 'covariance 0 → Y = 20%\neither way', 'green', size=17)),
    step('Other measures avoid the ordering step: Gonzalo and Granger\'s component share (1995), and Putniņš\' information leadership share (2013), which combines the two.',
         box('alt', 310, 668, 280, 56, 'component share ·\nleadership share', 'purple', size=17)),
    step('Used with care it finds real leaders: E-mini futures over the S&P 500 cash index (Hasbrouck, 2003), credit default swaps over bonds (2005). Watch the leading market; know which ordering made the number.',
         note('end', 300, 760, 'watch the leader · report both orderings', 'green', 20),
         dict(pulse='X')),
])


BOARD = dict(name='institutional_hasbrouck_information_share', lesson='institutional-hasbrouck-information-share',
             title='Information share: who gets credit for the news', cfg=HIS,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=8)

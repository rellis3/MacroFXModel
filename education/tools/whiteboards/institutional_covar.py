from ._wb import *

# ── CoVaR and Delta-CoVaR (institutional-covar) ──────────────────────────────
# The lesson's toy data: ten paired daily returns (%) for i and j, and the given 5% quantile
# line q(j | i = x) = -0.4 + 0.8x. i's median 0%, i's own 5% VaR -3%.
I = [-4.5, -3.0, -2.0, -1.0, -0.5, 0.2, 0.6, 1.0, 1.8, 2.4]
J = [-4.3, -2.7, -1.5, -0.7, -0.3, 0.4, 0.7, 1.0, 1.5, 2.1]
A, B = -0.4, 0.8
MED, VAR = 0.0, -3.0
def q(x): return round(A + B * x, 3)
BELOW = [k for k in range(10) if J[k] < q(I[k])]
assert BELOW == [0], BELOW                       # only the i = -4.5 point sits below the line
C_MED, C_DIS = q(MED), q(VAR)
assert (C_MED, C_DIS) == (-0.4, -2.8)
DC = round(C_DIS - C_MED, 3)
assert DC == -2.4 and round(B * (VAR - MED), 3) == DC

CH = (10, 150, 580, 330)

COVAR = dict(w=600, h=700, intro="Two institutions, ten days of the lesson's toy returns, and one tail line read twice. Press play, or step through.", steps=[
    step('Two institutions, i and j. Plain VaR looks at j alone: how bad is j\'s return on roughly the worst day in twenty?',
         icon('i', 'bank', 40, 6, 0.8, 'red', 'institution i', lsize=17),
         icon('j', 'bank', 480, 6, 0.8, 'blue', 'institution j', lsize=17)),
    step('CoVaR asks a different question: how bad is j\'s worst day in twenty when i is already in distress? It is a VaR of j, conditioned on someone else.',
         arrow('i', 'j', 'spillover?', 'amber', dash=True, id='sp')),
    step('The lesson\'s ten toy days: i\'s return across, j\'s return up. They move together, and a few days are bad for both.',
         chart('sc', CH, "j's return vs i's return (%)", [-5, 3], [-5, 2.5],
               [[-4, '−4'], [-2, '−2'], [0, '0'], [2, '2']], [[-4, '−4'], [-3, '−3'], [-2, '−2'], [0, '0'], [2, '2']], pl=44, pr=14),
         *[dot(f'p{k}', 'sc', [I[k], J[k]], '', None, r=5) for k in range(10)]),
    step('A 5% quantile regression fits a line along the bottom edge of the cloud, not through its middle: j\'s 5th-percentile return given i. Here it is −0.4 + 0.8 × i. Only one of the ten points sits below it.',
         series('ql', 'sc', [[-5, q(-5)], [3, q(3)]], 'purple', ms=1200),
         cnote('qll', 'sc', [-1.2, q(-1.2)], 'slope 0.8', 'purple', 18, anchor='start', dx=14, dy=16),
         dict(pulse='p0')),
    step('A normal day for i: its median return, 0%. Read the line there. j\'s conditional 5% VaR is −0.4%.',
         series('hm', 'sc', [[-5, C_MED], [MED, C_MED]], 'blue', dash=True, ms=500),
         dot('dm', 'sc', [MED, C_MED], 'i normal: −0.4%', 'blue', r=8, dx=12, dy=22, anchor='start')),
    step('A distress day for i: its own 5% VaR, −3%. Read the same line there. j\'s conditional 5% VaR drops to −2.8%.',
         series('hd', 'sc', [[-5, C_DIS], [VAR, C_DIS]], 'red', dash=True, ms=500),
         dot('dd', 'sc', [VAR, C_DIS], 'i in distress: −2.8%', 'red', r=8, dx=14, dy=24, anchor='start')),
    step('ΔCoVaR is the drop between the two readings: −2.8 − (−0.4) = −2.4 points. It strips out j\'s own baseline and keeps only the extra tail risk that comes with i\'s distress.',
         dict(gap='dg', chart='sc', top=[[-4.95, C_MED], [-4.55, C_MED]], bot=[[-4.95, C_DIS], [-4.55, C_DIS]], tone='amber', op=0.6),
         cnote('dgl', 'sc', [-4.5, -1.6], 'ΔCoVaR −2.4', 'amber', 18, anchor='start', dx=6),
         dict(pulse='sp')),
    step('The shortcut: the intercept cancels, so ΔCoVaR is the slope times the distance between i\'s two states. 0.8 × (−3 − 0) = −2.4.',
         box('f', 10, 494, 580, 52, 'ΔCoVaR = β × (VaR of i − median of i) = 0.8 × (−3) = −2.4', 'purple', size=19)),
    step('If the slope were zero, the line would be flat. Both readings would be the same, and ΔCoVaR would be zero however bad i\'s day. The slope does all the systemic work.',
         series('flat', 'sc', [[-5, C_MED], [3, C_MED]], 'green', dash=True, ms=700),
         cnote('fl', 'sc', [3, -1.9], 'slope 0 → ΔCoVaR 0', 'green', 17, anchor='end', dx=-4)),
    step('Not CVaR. CVaR averages the losses inside one series\' own tail. CoVaR conditions one series on a different series\' distress. One letter apart, two different questions.',
         dict(dim='flat'), dict(dim='fl'),
         box('cv', 10, 562, 285, 62, 'CVaR: average of j\'s\nown worst days', 'blue', size=18),
         box('co', 305, 562, 285, 62, 'CoVaR: j\'s bad day\ngiven i\'s bad day', 'purple', size=18)),
    step('Two catches. A tail line fitted on few points is noisy. And a big ΔCoVaR shows the two move together in the tail, not that i\'s trouble causes j\'s. A shared shock can hit both.',
         note('end', 300, 660, 'co-movement in the tail, not proof of cause', 'red', 20)),
])


BOARD = dict(name='institutional_covar', lesson='institutional-covar',
             title='CoVaR: one tail line, read twice', cfg=COVAR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=6)

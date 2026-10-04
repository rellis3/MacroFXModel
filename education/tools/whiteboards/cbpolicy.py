from ._wb import *

# ── How a policy decision travels, and how the market reads it (central-bank-policy) ──
# Numbers are the lesson's own fictional FCB scenarios:
#   Scenario 1: unemployment 3.6%, inflation 5% (target 2%) → 50bp hike, priced 25bp → +25bp surprise
#   Hawkish hold: priced −25bp cut, actual hold → 0 − (−25) = +25bp
#   Scenario 3 (stagflation): unemployment 5.5%, inflation 6%
#   Dot plot: up to 19 participants, one dot each; median = the 10th of 19.
# Dot positions are ILLUSTRATIVE (the lesson gives no dot values): before, after the hike
# (most dots cluster higher), and a stagflation split (hawks high, doves low).
DOTS = {
    1: [4.0] * 3 + [4.5] * 6 + [5.0] * 6 + [5.5] * 3 + [6.0],
    2: [5.5] + [6.0] * 3 + [6.5] * 5 + [7.0] * 6 + [7.5] * 3 + [8.0],
    3: [3.0] * 2 + [3.5] * 3 + [4.0] * 3 + [4.5] + [5.5] + [7.0] + [7.5] * 3 + [8.0] * 3 + [8.5] * 2,
}
DX = 0.17   # horizontal spacing between dots on the same level (chart x units)


def dotcol(col, tone):
    vals = DOTS[col]
    assert len(vals) == 19
    med = sorted(vals)[9]
    ops, levels, mpos = [], {}, None
    for v in vals:
        levels.setdefault(v, 0)
        levels[v] += 1
    for v, n in levels.items():
        for k in range(n):
            x = col + (k - (n - 1) / 2) * DX
            is_med = v == med and k == (n - 1) // 2 and mpos is None
            if is_med:
                mpos = [round(x, 3), v]
            else:
                ops.append(dot(f'd{col}_{v}_{k}', 'dp', [round(x, 3), v], '', tone, r=4.6))
    ops.append(dot(f'm{col}', 'dp', mpos, '', 'amber', r=7))
    return ops


DP = (10, 380, 300, 270)
SP = (320, 380, 270, 270)

CBP = dict(w=600, h=690, intro='One fictional central bank, the FCB, with a Fed-style dual mandate: how a decision travels into the economy, what the dot plot and guidance say, and why the surprise moves the currency. Press play, or step through.', steps=[
    step('Meet the FCB, a fictional central bank with a Fed-style dual mandate. It has two jobs written into law, maximum employment and stable prices (a 2% inflation target), and one lever to pull: the policy rate.',
         icon('jobs', 'crowd', 50, 8, 0.8, 'green', 'jobs', lsize=17),
         icon('fcb', 'bank', 260, 8, 0.8, 'blue', 'the FCB', lsize=17),
         icon('px', 'thermo', 470, 8, 0.8, 'red', 'prices\ntarget 2%', lsize=17)),
    step('The economy runs hot. Unemployment is low at 3.6%, and inflation has climbed to 5%. Both halves of the mandate say the same thing: tighten. That is the clean, hawkish case.',
         dict(hide='jobs'), dict(hide='px'),
         icon('jobs1', 'crowd', 50, 8, 0.8, 'green', 'unemployment\n3.6% (low)', lsize=17),
         icon('px1', 'thermo', 470, 8, 0.8, 'red', 'inflation 5%\ntarget 2%', lsize=17),
         arrow('jobs1', 'fcb', 'tighten', 'red', id='a1'),
         arrow('px1', 'fcb', 'tighten', 'red', id='a2')),
    step('With the committee united, it votes to tighten: a 50bp hike. Policy moves on purpose from neutral into restrictive territory.',
         dict(pulse='fcb'),
         chip('hike', 300, 152, '+50bp', 'red')),
    step('Now follow the decision out into the economy. A higher policy rate makes borrowing dearer.',
         icon('cash', 'cash', 40, 212, 0.6, 'amber', 'borrowing\ncosts up', sym='$', lsize=17),
         move('hike', 70, 190, 1300)),
    step('Dearer money slows demand. That is the point: the committee wants a slower economy, on purpose, to cool prices.',
         icon('fac', 'factory', 270, 212, 0.6, 'amber', 'demand\nslows', lsize=17),
         arrow('cash', 'fac', None, 'amber', id='t1'),
         move('hike', 300, 190, 1200)),
    step('Slower demand cools inflation back toward 2%. But not fast: the policy lag between a rate change and its full effect is often measured in quarters. That is why banks act on forecasts, not just today\'s data.',
         icon('cool', 'thermo', 500, 212, 0.6, 'blue', 'inflation\ncools', lsize=17),
         arrow('fac', 'cool', None, 'amber', id='t2'),
         move('hike', 530, 190, 1200),
         icon('lag', 'clock', 196, 318, 0.36, 'purple'),
         note('lagn', 240, 336, 'policy lag: often quarters', 'purple', 18, anchor='start')),
    step('Meanwhile the dot plot: each of up to 19 policymakers puts one dot where they think rates should go. After this meeting most dots sit higher, signalling more hikes still to come. The amber dot is the median, the number everyone quotes.',
         chart('dp', DP, 'Dot plot (illustrative)', [0.4, 3.6], [1.5, 10], [[3, 'lower'], [8.5, 'higher']],
               [[1, 'before'], [2, 'after'], [3, 'split']], pl=58),
         *dotcol(1, 'chalk'),
         *[dict(dim=o['dot']) for o in dotcol(1, 'chalk')],
         *dotcol(2, 'red')),
    step('Forward guidance is firm, because the committee is united behind it. Words about the future path shape what the market expects today.',
         icon('mega', 'megaphone', 400, 104, 0.45, 'red', 'firm guidance', lsize=17)),
    step('Now the part that moves the currency. The market had priced only a 25bp hike; the FCB delivered 50bp. Surprise = actual − priced = 50 − 25 = +25bp, a hawkish surprise. The currency rallies on the surprise, not merely because a hike happened.',
         chart('sp', SP, 'Rate move (bp)', [0.4, 3.6], [-40, 66], [[-25, '−25'], [0, '0'], [25, '25'], [50, '50']],
               [[1, 'priced'], [2, 'actual'], [3, 'surprise']], zero=True),
         dict(bars='sb1', chart='sp', data=[[1, 25, '+25', 'purple'], [2, 50, '+50', 'blue'], [3, 25, '+25', 'green']], bw=40, ms=1100)),
    step('Same subtraction, other way round. If the market had priced a 25bp cut and the bank held instead, the surprise is 0 − (−25) = +25bp: a hold that rallies the currency. And a hike can sink one, if the market had priced an even bigger hike.',
         dict(hide='sb1'),
         dict(bars='sb2', chart='sp', data=[[1, -25, '−25', 'purple'], [2, 0, 'hold', 'blue'], [3, 25, '+25', 'green']], bw=40, ms=1100)),
    step('Now the trap: stagflation. A supply shock pushes unemployment up to 5.5% and inflation up to 6%. Jobs say ease, prices say tighten, and one interest rate cannot do both.',
         dict(hide='jobs1'), dict(hide='px1'), dict(hide='a1'), dict(hide='a2'), dict(hide='mega'),
         *[dict(dim=i) for i in ['hike', 'cash', 'fac', 'cool', 't1', 't2', 'lag', 'lagn']],
         icon('jobs2', 'crowd', 50, 8, 0.8, 'green', 'unemployment\n5.5% (rising)', lsize=17),
         icon('px2', 'thermo', 470, 8, 0.8, 'red', 'inflation 6%\ntarget 2%', lsize=17),
         arrow('jobs2', 'fcb', 'ease', 'green', id='a3'),
         arrow('px2', 'fcb', 'tighten', 'red', id='a4'),
         dict(pulse='fcb')),
    step('The committee fractures. Hawks look at 6% inflation and push their dots up; doves look at 5.5% unemployment and hold theirs flat or lower. The median is now just the midpoint of a split: load-bearing, but fragile.',
         *dotcol(3, 'purple')),
    step('With no agreement to stand behind, forward guidance turns vague and data-dependent. The thread: when the two goals agree, the bank moves fast and speaks firmly; when they clash, the dots scatter. Either way, what moves the currency is the surprise against what was priced.',
         icon('mega2', 'megaphone', 400, 104, 0.45, 'purple', 'data-dependent…', lsize=17),
         note('end', 300, 672, 'surprise = actual − priced: that is what moves the currency', 'amber', 19)),
])


BOARD = dict(name='cbpolicy', lesson='central-bank-policy', title='How a central bank decision travels, and how the market reads it', cfg=CBP,
             before='  <div class="tl-box pitfall">\n    <div class="tl-icon-badge red">⚠️</div>\n    <div class="tl-box-label">Common pitfalls</div>',
             deck_after=8)

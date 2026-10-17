from ._wb import *

# ── The data pipeline (data-pipeline-raw-to-trading-ready) ───────────────────
# Flash Crash facts are the lesson's (SEC-CFTC staff report): Accenture printed at one cent;
# after the close the venues cancelled over 20,000 trades in 300+ securities more than 60% from
# the 2:40 p.m. price. Bar counts are the lesson's worked example: 1-minute bars give the
# 15 / 5 / 40-minute stretches 15 / 5 / 40 bars; volume bars (~75 ticks each, ~60 an hour)
# give 2-3 / 50-55 / ~4 (drawn at 2.5, 53 and 4).
DP = dict(w=600, h=640, intro='A raw feed on its way to a backtest: six stations, one very bad afternoon, and the choice of clock that builds the bars. Press play, or step through.', steps=[
    step('Raw data arrives from the exchange or vendor: trade prints and quotes, exactly as transmitted. 6 May 2010, mid-afternoon: one of them says Accenture traded at one cent.',
         icon('feed', 'megaphone', 20, 6, 0.75, 'blue', 'exchange feed', lsize=16),
         chip('t1', 120, 30, 'ACN $0.01', 'red'),
         chip('t2', 120, 64, 'EUR/USD 1.27', 'blue')),
    step('Station 1, ingestion: capture every message as it arrived, unopened. The one-cent print is stored too. Fixing it now would destroy the only record of what the feed actually said.',
         box('ing', 20, 120, 150, 64, '1 · ingest', 'blue', size=19),
         move('t1', 110, 206, 1100), move('t2', 200, 30, 600)),
    step('Station 2, validation: schema checks, gap checks, sanity bounds. The one-cent print fails the sanity bound. Validation flags it; it does not fix it.',
         box('val', 225, 120, 150, 64, '2 · validate', 'purple', size=19),
         arrow('ing', 'val'),
         icon('flag', 'warn', 224, 190, 0.32, 'amber')),
    step('Station 3, cleaning. That afternoon the fix needed information from after the close: the venues cancelled over 20,000 trades, in more than 300 securities, priced more than 60% from 2:40 p.m. Applied as a separate, dated step, so both versions of the day survive.',
         box('cln', 430, 120, 150, 64, '3 · clean', 'red', size=19),
         arrow('val', 'cln'),
         dict(hide='t1'), chip('t1c', 110, 206, 'ACN $0.01: cancelled', 'red')),
    step('Station 4, normalization: adjust for splits, dividends and futures rolls, so a fake jump in the raw price is not read as a real return.',
         box('nrm', 430, 240, 150, 64, '4 · normalize', 'amber', size=19),
         arrow('cln', 'nrm')),
    step('Station 5, storage: one versioned copy everyone reads, not five teams each recomputing "the adjusted close" and slowly drifting apart.',
         box('sto', 225, 240, 150, 64, '5 · store', 'green', size=19),
         arrow('nrm', 'sto')),
    step('Station 6, point-in-time serving: asked about a past date, hand out only what was knowable then. "Clean as of the close" and "clean as of next morning" are different datasets for 6 May.',
         box('srv', 20, 240, 150, 64, '6 · serve as of X', 'blue', size=18),
         arrow('sto', 'srv'),
         icon('clk', 'clock', 70, 304, 0.3, 'blue')),
    step('One more choice hides in ingestion: the clock that groups ticks into bars. The lesson\'s hour: a 15-minute lull, a 5-minute release burst, a 40-minute quiet stretch. One-minute time bars give them 15, 5 and 40 bars.',
         chart('bc', (10, 350, 580, 270), 'Bars per stretch of the hour', [0.4, 3.6], [0, 76],
               [[20, '20'], [40, '40'], [60, '60']], [[1, 'lull 15 min'], [2, 'release 5 min'], [3, 'quiet 40 min']], pl=46, pr=14),
         dict(bars='tb', chart='bc', data=[[0.82, 15, '15', 'blue'], [1.82, 5, '5', 'blue'], [2.82, 40, '40', 'blue']], bw=34, ms=1000)),
    step('But about 4,000 of the hour\'s 4,500 ticks, 89%, fall in the release burst. A volume clock closes a bar every 75 ticks or so: 2 to 3 bars in the lull, 50 to 55 in the burst, about 4 after.',
         dict(bars='vb', chart='bc', data=[[1.18, 2.5, '2–3', 'green'], [2.18, 53, '50–55', 'green'], [3.18, 4, '≈4', 'green']], bw=34, ms=1000),
         cnote('lt', 'bc', [0.5, 71], 'blue = time bars · green = volume bars', None, 17, anchor='start')),
    step('Time bars oversample the quiet and undersample the burst. Volume and dollar bars keep each bar to a similar slice of activity, so their returns sit closer to the well-behaved shape most models assume.',
         dict(pulse='vb')),
    step('Only data that has passed all six stations, on a clock chosen on purpose, is fit to build a feature or a backtest on.',
         dict(pulse='ing'), dict(pulse='val'), dict(pulse='cln'), dict(pulse='nrm'), dict(pulse='sto'), dict(pulse='srv')),
])


BOARD = dict(name='data_pipeline_raw_to_trading_ready', lesson='data-pipeline-raw-to-trading-ready',
             title='Raw feed to trading-ready, drawn step by step', cfg=DP,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>', deck_after=4)

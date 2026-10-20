<!-- https://cog000.github.io/Data-Terminal-Software/ | My backtest — COLEZ TRADES Data Terminal Software -->
COLEZ*TRADES* >
GO
**BOOK**My backtest▾ PERIOD ALL3Y1Y6M3MYTD SCOPE ALL FILTER GUIDE
UNITS
**%R$
** **JNL**JOURNAL **OVW**OVERVIEW **DST**DISTRIBUTIONS **BRK**BREAKDOWN **EXC**EXCURSION **RSK**RISK **BLT**BLOTTER
JOURNAL EMPTY
**SIMPLECMPD
TKTTRADE TICKETnew trade · enter logs it · esc clears
ENTRY DATE
‹›
ENTRY TIME
EXIT DATE *blank = same day*
EXIT TIME
DIRECTION
LONGSHORT
INSTRUMENT
MODEL *optional*
ENTRY *price*
STOP *price*
EXIT *price*
RISK *% of equity*
RESULT *% of equity*
%
MAE *% against*
MFE *% in favour*
TAGS *comma separated*
NOTES
Enter the result in % of equity, or entry, stop and exit prices. This trade risks 1% of equity.
LOG TRADE⏎CLEARESC
EQBOOK EQUITY
|  |  |  |
|  |  |  |

The curve draws itself as you log trades: each trade is booked on its exit date at the risk and mode in the tab bar.
SESTHIS SESSIONsince 18:20
Trades you log in this sitting are tallied here, so you can review a replay session on its own.
CHKDATA CHECKS
Checks run on every save: duplicates, missing timestamps or excursions, typos and conflicts that would skew the terminal.
LOGTRADE LOG DELETE SELECTEDIMPORTEXPORTPROP FIRM CSV
#
SK
DATE
IN
OUT
HELD
INSTR
SIDE
MODEL
ENTRY
STOP
EXIT
RISK
RESULT %
MAE %
MFE %
TAGS
NOTES
NO TRADES YET
OPEN EXAMPLE BOOKIMPORT CSVREAD THE GUIDE
EQEQUITY CURVE — COMBINED PORTFOLIO
DDDRAWDOWN FROM PEAK
ROLLROLLING 63-DAY RETURNweekday grid
MRETMONTHLY RETURNS
SCALE
BANDABOVEBELOW
ATTRCONTRIBUTION BY INSTRUMENTnet at current risk · mode · period · filters
DISCLAIMER · DATA · METHOD ▸
RDSTRESULT DISTRIBUTION
MDSTMONTHLY NET DISTRIBUTION
EDGEEXPECTANCY DECOMPOSITION
SIGIS THE EDGE REAL? — SAMPLE SIGNIFICANCEt-test on per-trade results · bootstrap interval · seed fixed
GRPEQUITY BY INSTRUMENTsimple aggregation · current risk
GROUP BY
GTABSTATISTICS BY INSTRUMENTclick a row to filter the terminal to it
CORRMONTHLY CORRELATION BY INSTRUMENT
EXCMAE / MFE COVERAGE
MAEADVERSE EXCURSION VS RESULThow far each trade went against you
MFEFAVOURABLE EXCURSION VS RESULThow far each trade went for you
HOLDHOLDING TIME VS RESULT
RISKRISK METRICS
DDTSDRAWDOWN TIME SERIES — DISTANCE FROM THE EQUITY HIGH
TAILPERIOD EXTREMES AND TAIL RISKcalendar weeks and months · active-day VaR
DDEPTOP DRAWDOWN EPISODESweekday grid · current mode
RUNSSTREAK RUN-LENGTH DISTRIBUTIONconsecutive results · break-evens skipped
BLTTRADE BLOTTER
scope, filters and period apply first · column filters are local to this table · click a row to edit it in the journalEXPORT VIEWPROP FIRM CSV
SAVED SCOPE COMBINED FILTER NONE 0 / 0 TRADES · 0 DAYS · — BASE $100,000 · SIMPLE · DEFAULT RISK 1%
"""Insert the fomc-range-share Evidence Book entry and POWER row into js/deskEvidence.js (idempotent)."""
import re, sys
p = 'js/deskEvidence.js'
s = open(p, encoding='utf-8', newline='').read()
nl = '\r\n' if '\r\n' in s else '\n'
if "id: 'fomc-range-share'" in s:
    print('already banked'); sys.exit(0)
entry = nl.join([
    "  {",
    "    id: 'fomc-range-share', domain: 'events', verdict: 'context', date: '2026-11-14', doc: 'forge/FOMC_RANGE_SHARE_PREREG.md', also: ['analysis/output/fomc-range-share/RESULTS.md'],",
    "    instruments: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GOLD', 'NQ', 'SPX500'],",
    "    claim: 'On an FOMC day, the statement half hour (14:00-14:30 ET) and the press-conference hour (14:30-15:30 ET) each carry a larger share of the London-session realised variance than the same clock windows on matched ordinary days, and the press-conference hour adds to the statement window',",
    "    result: 'CONTEXT (registered control failed). 84 scheduled meetings 2016-2026-07, 10 instruments pooled per meeting, 1-minute bars, 2026-08-21 lockbox respected. Statement window carries 21.6% of the session variance vs 2.6% on matched ordinary days (excess +0.190 [+0.166, +0.216], gate +0.05, MDE 0.006). Press-conference hour carries 23.3% on press-conference meetings vs 3.6% (excess +0.197 [+0.174, +0.222], gate +0.03, MDE 0.008). Both numbers pass, but the control fails: on the 12 statement-only meetings of 2016-18 the 14:30-15:30 hour still carries +0.055 [+0.033, +0.081], so part of the excess is the 14:00 reaction decaying into the next hour. Post-hoc, inside 2016-18 only: press-conference meetings +0.132 vs statement-only +0.055, difference +0.077 [+0.034, +0.119] (12 vs 12). Session high or low printed inside S / P on 22% / 39% of FOMC instrument-days vs 6% / 10% on ordinary days. Indices carry less in S and more in P than FX.',",
    "    use: 'Say \"about a fifth of the London-session variance on an FOMC day arrives in the half hour after the 14:00 ET statement, and about a fifth again in the following hour on press-conference days, against 2-4% in the same windows on ordinary days\". A timing and size description with its interval: not a forecast, not a direction, not a trade rule, and the press-conference hour is not shown as a separate validated effect because the statement-only control carries part of it. Window edges are fixed (14:00/14:30/15:30 ET); a split of the second hour is untested.',",
    "  },",
])
# insert before the closing of the ledger array: the first '];' that follows the last ledger entry (the line after '  },')
m = re.search(r'(\n  \},\r?\n)(\];\r?\n\r?\n// The Theory Lab is the shareable zone)', s)
assert m, 'ledger end not found'
s = s[:m.end(1)] + entry + nl + s[m.start(2):]
row = "  'fomc-range-share':        { n: '84 scheduled FOMC meetings (72 with a press conference, 12 statement-only)', note: 'MDE 0.006 (S) / 0.008 (P) vs +0.05 / +0.03 gates; control H3 (statement-only P excess +0.055 [+0.033, +0.081], n 12) failed, so CONTEXT' },"
anchor = "  'gex-range-iv':            {"
i = s.index(anchor)
s = s[:i] + row + nl + s[i:]
open(p, 'w', encoding='utf-8', newline='').write(s)
print('banked')

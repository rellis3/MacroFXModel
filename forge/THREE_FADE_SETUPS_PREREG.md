# Three fade setups from an outside framework — pre-registration

Committed 2026-10-02 before any number below was computed. Tested on existing book data (no new builds):
{pair}_sequence.json (line, London minute, race), {pair}_div.json r15 (price 15 min after the touch: back inside = now < −0.1σ,
race restarted from that bar), {pair}_htf.json (H1 trend state), IV ÷ RV (CVOL / CBOE as before). 16 FX/gold + 6 indices;
setup C only on the 11 instruments with implied vol.

The "rejection" trigger in all three = price back inside the line by > 0.1σ fifteen minutes after the touch (the closest stored
proxy for a 15m close back inside / wick rejection); the fade is entered at that bar's open, target the line behind, stop the next
line out, exit at day end — the book's r15 race, net of spread.

- **A — counter-trend exhaustion:** the touch heads AGAINST the H1 trend, line = OH/OL p90 (secondary: p75), rejection → fade.
  Controls: the same with the touch WITH the trend; the same at p50.
- **B — London close:** touch between 16:00 and 17:00 London, line p90 (secondary p75), rejection → fade. Control: 13:00–16:00.
- **C — cheap vol:** IV ÷ RV in the bottom third (CVOL < 1.05, CBOE < 1.17), line p90 (secondary p75), rejection → fade.
  Control: rich third.
PASS per setup: fade R > 0 in 2016–22 AND 2023–26 on the 16 FX/gold set, same sign on the indices, and the pooled t-test survives
Benjamini–Hochberg 10% across the 3 setups × 2 line sets. Win rate is reported but R decides (the fade target is nearer than its stop).

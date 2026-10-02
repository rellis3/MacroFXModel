# Clusters of the forecast lines, and fade MFE / MAE at every touch — pre-registration

Committed 2026-10-03 before any number below was computed. Owner's chart (EURUSD 5m): five fades, each at a place where several of
his own forecast lines sit together (Close p75 + OH p75 at 1.1277; Close p50 + OH p50 at 1.1263; Close p50 + Proj at 1.1225).
Earlier tests stacked RETAIL levels on a line; never the forecast lines on each other. (ΔMed and Drift in the indicator are a label
on the Proj lines and a sloped arrow, not horizontal lines, so the cluster uses the 14 export lines.)

## Cluster (bars before the pass bar only)
For each pass of a line L at bar k, count the OTHER export lines (OH/OL p50/75/90, CloseUp/Dn p50/75, ProjH/L p50/75, priced by
linesAtBar at bar k) within 0.05σ of L on the same side. Groups: lone (0), pair (1), cluster (2+). Secondary radius 0.10σ.

## Fade MFE / MAE (for a fade entered at the line, the touch bar)
In σ (and pips for EURUSD): MFE = furthest price comes back inside from the line; MAE = furthest beyond the line; both over the
next 15, 30, 60, 120 minutes and to the London day's end. Plus, for stops 0.1σ / 0.2σ / 0.3σ beyond the line: the MFE reached
before the stop is hit (or by day end), and the share of fades whose stop is hit first.

## Tests
- T1: within-cell (line family × London hour × range used) continue difference, cluster(2+) vs lone, and pair vs lone; day-bootstrap
  95% CI; same sign 2016–22 / 2023–26; 16 FX/gold, indices reported separately. Expectation from the owner: clusters fade more.
- T2: fade R (the book's race) for cluster vs lone, > 0 both halves = PASS; BH 10% over {pair, cluster} × {FX, indices}.
- T3 (descriptive, the owner's MAE/MFE question): the MFE-before-stop distribution per group — median, 75th, and the share of
  fades reaching 0.1 / 0.2 / 0.3 / 0.5σ back before a 0.2σ stop; and the fixed-target expectancy (target t, stop s, net of spread)
  over t ∈ {0.1..0.6σ}, s ∈ {0.1, 0.2, 0.3σ}, reported as a grid with both halves (no pass rule; any positive cell needs its own test).

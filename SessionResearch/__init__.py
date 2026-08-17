"""SessionResearch — does session A's behaviour predict session B's?

A stats-first research engine over the Asia / London / London-NY overlap / NY
trading-session cycle. Built on `forge.bars.load_m1` so it runs unchanged over
any of the pair parquets in `VolRangeForecaster/data/m1/`, starting with gold.

See README.md for methodology, session definitions, and how to read the output.
"""

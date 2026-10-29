"""Day reconstruction, milestone 1: dump the repaired ForexFactory event tags per instrument
(forge.ff_calendar, the same tags forge/run_vol.py fitted the event multipliers on) to JSON for the JS checks.

    python scripts/day-reconstruction/ff_tags.py GOLD NQ EURUSD
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from forge import ff_calendar as FF  # noqa: E402

OUT = ROOT / "analysis/output/day-reconstruction/ff_tags.json"
df = FF.load_repaired(ROOT / "data/calendar/ff_calendar_2007_2025.csv")
dates = sorted(str(d)[:10] for d in df["date"].unique())
res = {"coverage": [dates[0], dates[-1]], "tags": {}}
for inst in (sys.argv[1:] or ["GOLD", "NQ", "EURUSD"]):
    res["tags"][inst] = {str(k)[:10]: v for k, v in FF.event_tags(df, FF.instrument_currencies(inst)).items()}
    print(inst, len(res["tags"][inst]), "tagged dates")
OUT.write_text(json.dumps(res))
print("coverage", res["coverage"], "->", OUT)

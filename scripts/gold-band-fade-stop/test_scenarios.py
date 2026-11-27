"""The four scenarios of the PDF, as bars, through sim_day. python scripts/gold-band-fade-stop/test_scenarios.py"""
import importlib.util, sys
from pathlib import Path
import numpy as np
from numba import njit  # noqa
ROOT = Path(__file__).resolve().parents[2]
src = (ROOT / "scripts/gold-band-fade-stop/run.py").read_text(encoding="utf-8")
ns = {}
exec(src.split("def sessions")[0].split("ROOT = Path")[0] + "\n" + "TGT, STP, TIME, GAP = 0, 1, 2, 3\n" +
     "@njit(cache=False)\ndef sim_day" + src.split("def sim_day")[1].split("def sessions")[0], ns)
sim = ns["sim_day"]

def bars(path):  # each step a bar from prev price to next price
    O, H, Lo, C = [], [], [], []
    for a, b in zip(path[:-1], path[1:]):
        O.append(a); C.append(b); H.append(max(a, b)); Lo.append(min(a, b))
    return [np.array(x, float) for x in (O, H, Lo, C)]

lines = np.array([[3590., 3600.], [3570., 3560.]])
ss = np.array([7.5, 7.5])
def go(path, pess=True):
    out = np.zeros((32, 7)); cnt = np.zeros(4, np.int64)
    n = sim(*bars(path), lines, ss, 3580.0, pess, False, 0.0, 0.0, 0.0, 0.0, 0.0, out, cnt)
    return out[:n], cnt
bad = 0
def check(name, cond):
    global bad
    print(("ok   " if cond else "FAIL ") + name); bad += (not cond)
# 1 short: up to 3590.2 (not armed at 3590: needs 3590.75), then 3600.75 arm @3600, back to 3599 fill, down to 3580 target
t, c = go([3580, 3585, 3590.2, 3595, 3600.75, 3599.5, 3599, 3590, 3580, 3578, 3578])
check("1 short fills at 3600, target 3580, +20/7.5 R", len(t) == 1 and t[0][0] == 0 and t[0][2] == 3600 and t[0][3] == 3580 and abs(t[0][6] - 20/7.5) < 1e-9)
# 2 long mirrored
t, c = go([3580, 3575, 3569.9, 3565, 3559.25, 3560.5, 3561, 3570, 3580, 3582, 3582])
check("2 long fills at 3560, target 3580", len(t) == 1 and t[0][0] == 1 and t[0][2] == 3560 and t[0][3] == 3580)
# 3 cancel: arm at 3600 then run to 3609.5 without retest
t, c = go([3580, 3590.5, 3595, 3600.8, 3605, 3609.5, 3615, 3612, 3612])
check("3 runaway cancels, no trade", len(t) == 0 and c[2] >= 1)
# 4 chase: arm @3590 (3590.8), no retest, reach 3600.8 -> chase, retest 3599.5 fill @3600
t, c = go([3580, 3586, 3590.8, 3594, 3598, 3600.8, 3600.2, 3599.5, 3590, 3580, 3580])
check("4 chase: P75 cancelled, fill at P90 3600", len(t) == 1 and t[0][1] == 1 and t[0][2] == 3600 and c[1] == 1)
# stop: fill short 3600 then up to 3607.6
t, c = go([3580, 3600.8, 3599.8, 3603, 3607.6, 3610, 3610])
check("short stopped at 3607.5 = -1R", len(t) == 1 and t[0][3] == 3607.5 and abs(t[0][6] + 1) < 1e-9)
print("ALL OK" if not bad else f"{bad} FAILED"); sys.exit(bad)

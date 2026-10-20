# Rule A exits: decision from 2020-23 only (written 2026-10-20, before 2024-26 excursions were read)

Source: `scripts/decision_lab/rule_a_excursions.py --block disc` → `excursions_disc.json`. Data: 1,164 rule A trades,
2020-08 → 2023-12, 0.2σ stop, 2× spread costs.

**What 2020-23 shows:**
- 74% of trades are stopped.
- The median best move before the stop is 1.0R; 25% reach 3R, 10% reach 5.9R, 5% reach 8R.
- The median trade sees its best point 62 minutes after entry, and only 0.3R against it before that.

| Exit | Net R per trade |
|---|---|
| Small targets, 0.5–1.5R | −0.04 to −0.12 (lose) |
| 2R | ≈ 0 |
| 4–15R, held to 16:00–22:00 London | +0.12 to +0.20 (a broad plateau) |
| Current rule, 5R, out at 22:00 | +0.172 |
| Best cell, 10R, out at 18:00 | +0.200, picked from 60 cells, within noise of the plateau |

**Decision:**
- **Keep 5R and the 22:00 exit.** The edge needs a far target and a hold into the New York session; taking profit early destroys it.
- **No change to the stop** (0.2σ; the 0.1σ stop already tested worse).

**The 2024-26 read** checks only the shape (small targets lose, far targets plus holding pay); it does not pick a new exit. The 10:00 entry cut-off is not examined here: later entries would be new trades, so that is a separate test.

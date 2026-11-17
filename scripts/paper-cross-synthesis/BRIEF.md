# Brief: cross-paper system blueprints for one theme

Goal (the owner's words): don't summarise papers one by one. Analyse each paper against every other to find complementary research that could be combined into ONE trading system (one paper's direction signal + another's regime filter + another's timing, sizing or exit, on the same market and horizon). Also report where papers corroborate each other and where they contradict.

## Inputs (all in this folder)
- `<THEME>.json`:
  - `papers` = tagged cards. role = direction/timing/sizing/regime/exit/forecast/cost/method/theory. str = A (OOS + costs + numbers) > B > C > D (theory). produces/one/claim/effect describe each.
  - `top_pairs` = a deterministic pre-screen over all 390k pairs: an anchor (direction or forecast paper) and a part paper that adds a slot. Scored by strength × same asset × same horizon × reader cross-ref bonus.
  - `clusters` = same family/role/asset/horizon groups (corroboration).
  - `contradictions` = reader-flagged contradicting pairs.
- `deskEvidence.js` = the desk's Evidence Book of internal tests. Each entry has an id, a verdict (validated/null/underpowered/context) and text. You MUST screen every blueprint against it: grep for the mechanism's keywords (e.g. carry, momentum, VRP, gamma, FOMC, COT, overnight, noise, VWAP, HAR, range, VIX, skew, trend, ...).
- `DATA_ASSET_MAP.md` = what data the desk holds. In short: M1 bid/ask FX + gold + index CFDs 2016-2026; NT8 futures ES/NQ/YM/RTY minute data; SPY 1-min; CME option settlements and IV 6 years; OI/GEX nightly; FRED macro; yields; COT; VIX/Cboe; calendar/surprises; IBKR.

## The task
1. Read the pack. Use top_pairs as leads, not as the answer. You may combine 3-5 papers into one system and pull in any paper from the pack.
2. Produce 6-10 SYSTEM BLUEPRINTS for this theme, ranked by (strength of the parts) × (mechanisms fit, not just tags) × (we hold the data) × (not already a banked null).
   - Reject combos whose mechanisms clash or whose markets/horizons don't really match, even if tags matched.
   - Prefer parts graded A/B.
   - An idea already NULL in the Evidence Book may appear only if the combination adds something the null did not test. Say exactly what.
3. Produce 3-6 CORROBORATION findings: where several independent papers agree on one effect, how strong, and on which markets.
4. Produce 3-6 CONTRADICTION findings: where papers disagree and what would settle it. Note whether our Evidence Book already sides with one.

## Output
Write `<THEME>_out.json` in this folder. One JSON object:

```
{"theme": "...", "summary": "3-4 plain sentences",
 "blueprints": [{"name": "short name",
   "idea": "2-3 plain sentences: what the system does",
   "market": "...", "horizon": "...",
   "parts": [{"slot": "direction|regime|timing|sizing|exit|forecast|cost", "k": "P123", "why": "what this paper contributes and why it fits the others (1 sentence)"}],
   "mechanism_fit": "why these mechanisms belong together (1-2 sentences)",
   "data": "held|partial|missing", "data_note": "which of our files/feeds",
   "evidence": [{"id": "evidence-id", "verdict": "...", "bearing": "how it bears (1 sentence)"}],
   "status": "new|partly-tested|tested-null-but-new-angle",
   "risk": "main reason it could fail (1 sentence)",
   "first_test": "the single first test to run, one sentence, with a benchmark",
   "grade": "1-5 (5 = strongest case)"}],
 "corroborations": [{"title": "...", "papers": ["P.."], "finding": "...", "markets": "...", "strength": "strong|moderate|weak"}],
 "contradictions": [{"title": "...", "papers": ["P.."], "finding": "...", "settle": "...", "our_evidence": "evidence id + verdict or 'none'"}]}
```

Rules:
- Plain English and short sentences; the owner is a trader, not an academic.
- Use the k ids (P123) exactly as given.
- Never invent paper results: quote effects only as they appear in the pack.
- Use real evidence ids found in deskEvidence.js only.
- Valid JSON.
- Reply at the end with: number of blueprints, top 3 names, and anything you couldn't do.

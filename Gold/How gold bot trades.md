What is a Zone?
A zone is a Fibonacci retracement level drawn from a completed impulse leg — a significant price move between a swing low and a swing high (or vice versa for a short setup).

The bot identifies pivot highs and lows in the recent M30 and H4 bar data. For every pair of pivots, it calculates the full retracement levels (.382, .500, .618, .650, .786, .886). The GP zone (Golden Pocket) is the .618–.650 band — the most common institutional retracement level. This band's midpoint is where the entry targets.

The bot also generates .786 and .886 zones from the same impulse for deeper retraces, plus .382 and .500 zones for shallower ones. After generation, zones are:

Clustered — near-duplicate pivots within 0.25×ATR merged to one
Scored — confluence factors stacked (nPOC, VWAP, session levels, HTF bias, fib overlap from other impulses, trendlines)
Deduplicated — same-direction zones within $8 of each other collapsed to the best-scoring representative
The zone stays active until price closes beyond swing_origin (the impulse's start point) — that's the structural invalidation.

The State Machine
The bot is always in one of these states:

WAITING → ARMED → MANAGING → COOLDOWN → WAITING
Only one zone is watched at a time. Only one trade is open at a time. Max 2 trades per day.

WAITING — Scanning for proximity
Every price tick, the bot loops through all active zones and checks:

distance = how far price is from the nearest GP edge
If distance ≤ proximity_pips (default 5 pips), the zone is armed.

There's a secondary minimum score filter — if the ATR squeeze ratio is low (compressed volatility), the score threshold rises from 3.0 to 4.5, meaning only better-quality zones get armed in choppy conditions.

First zone to qualify wins — the bot arms that one and stops scanning. Any other zones are ignored until this one resolves.

ARMED — Waiting for confirmation
Armed = price is near or inside the GP zone. Now the bot runs VuManChu Cipher B on the last 60 M5 bars on every tick.

Three things are evaluated:

Signal LONG needs SHORT needs
WT oscillator OVERSOLD, divergence, or hidden bull OVERBOUGHT, divergence, or hidden bear
Money Flow Positive (MF > 0) Negative (MF < 0)
VWAP Price above VWAP (upward bias) Price below VWAP (downward bias)
Each one that aligns adds 1 to components_aligned. Need minimum 2 out of 3 (default vu_min_components = 2).

The divergence check is anchored to zone_gp_entry_time — the moment price first touched the GP window. This stops the bot firing on old divergences that happened hours before price reached the zone.

Disarm condition: if price moves more than max(10 pips, 1×ATR_15m) away from the GP band, the zone disarms and the bot returns to WAITING. Normal wick noise won't disarm it, but a genuine move away does.

Two extra gates before entry:

Gold Macro gate — reads ai_goldmodel KV signal. If the macro model strongly opposes direction, skips the entry and enters a 15-minute cooldown.
ML gate — reads gold_ml_signal KV. If the ML model rated this specific zone as PASS (not worth trading), blocks the entry.
Entry — becoming a trade
When VuManChu confirms AND both gates allow:

SL placement:

Anchor = swing_origin (the impulse low for longs, impulse high for shorts) — this is the structural invalidation. A close beyond here means the whole retrace is invalidated.
SL = swing_origin − 0.3×ATR (a small buffer beyond the structural level)
Floor: if that SL is tighter than 1.5×ATR, widen to 1.5×ATR
Hard cap: never wider than 40 pips regardless of structure
TP placement:

TP1 = entry + 1×SL_distance (1:1 risk/reward)
TP2 = entry + 2×SL_distance (2:1 risk/reward)
Lot size: 0.5% of balance ÷ SL in pips (risk-based sizing)

In live mode (--live), an MT5 market order is placed. In paper mode, the bot tracks price manually.

The bot transitions to MANAGING and trades_today increments.

MANAGING — Running the trade
Every tick, price is checked against SL/TP:

Paper mode: pure price comparison

Hit TP1 → log it, keep running for TP2
Hit TP2 → WIN, enter cooldown
Hit SL → LOSS, enter cooldown
Live mode: same logic, plus:

When TP1 is hit → MT5 order sent to move SL to breakeven (entry price). From that point the trade is risk-free — worst case is scratch.
Monitors MT5 position status directly; if the position disappears (closed externally or by broker), reads the exit deal price from history
EOD expiry: if a trade is still open at the end of the trading day (20:00 UTC), it's force-closed and logged as EXPIRED. PnL is whatever price is at that moment.

COOLDOWN
After any trade close (WIN, LOSS, or EXPIRED), the bot enters a 30-minute cooldown before it will arm another zone. This prevents immediately re-entering after a stop-out on the same level.

The full timeline visually

Bar data updated (every M30 / H4 close)
→ detect_fib_zones() → score_zones() → deduplicate_zones()
→ zones stored in self.zones + pushed to KV

Price tick received (every ~5 seconds via /api/quote)
→ COOLDOWN? → wait and return
→ MANAGING? → check SL/TP, update MT5 if live
→ Outside 07:00–20:00 UTC? → return
→ 2 trades today already? → return
→ ARMED? → run VuManChu → gates → enter trade if confirmed
→ WAITING? → scan zones for proximity → arm if found
One zone at a time, one trade at a time, max 2 per day, 30-minute rest between trades, only trading 07:00–20:00 UTC.

Good question. Here's what I'd consider, roughly in order of signal quality:

Already in the system — just need surfacing at decision point

Fib direction — every level already has direction: 'H→L' or 'L→H'. H→L = price came from above, expect short. L→H = price came from below, expect long. If this conflicts with macro bias → stay out. Already computed, not explicitly shown as a go/no-go gate.

aligned flag — already checks fib direction vs macro bias. A 7-star level with aligned: false is structurally strong but counter-trend. That's your first stay-out signal.

Pivot position — price above PP = lean long, below PP = lean short. Already have pivot data.

Session — already have sessionData. A level hit during Asia consolidation is less reliable than the same level hit during London or NY open.

Not in the system — highest value additions

Candle confirmation on 5m — the single most reliable real-time filter. Don't enter on touch, enter on a 5m close that confirms direction: bullish engulfing / pin bar close above level = long, bearish = short. You already have S.ohlc5m — it's a case of looking at the last 2-3 closed candles at the moment of alert.

EMA alignment on 5m — is the 5m close above or below a fast EMA (8 or 21) at the time of level touch? Price above EMA at a long zone = go, price below EMA at a long zone = wait. Simple, fast, reduces counter-trend entries significantly.

COT positioning — already loaded. If commercials are net long and the level is a long setup, that's institutional alignment. Useful as a weekly-scale confirmation rather than real-time.

The practical flow at a 7-star hit:


Level touched
  → Is it aligned (fib direction = macro bias)?      No → stay out
  → Is session London or NY?                          No → wait
  → Did last 5m candle close confirming direction?   No → wait for next close
  → Is 5m price above/below EMA in bias direction?   No → stay out
  → All yes → take the trade
The candle close + EMA pair is the most actionable because it's real-time and already answerable from data you're already fetching. Want me to build those two as a confirmation layer on top of the existing entry scanner?




Vix trend help the Forex pairs?

can we do session Volume and see VAH/L and POC?  how?


Add the Run Day process to allow to filter by starts like export so can see the benefits of which stars get good results
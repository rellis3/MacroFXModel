# SignalCopier

Copies the **ColezTrades | Private → Signals** Telegram topic onto MT5, run like every other bot. You set it up on
**bot-config.html → 📡 Signal Copier**:
- Telegram + MT5 credentials, the login code, risk, which signal styles to copy, the symbol map and alerts.
- Open positions show on **📊 Positions**. Closed trades land in its **Trade History** and the bot audit.
- Every signal is scored on M1 bars and exported in the **COG import template**, per pair or all.

**Status: paper by default.** Live needs a clean paper run, MT5 credentials and `--live` (or unticking Paper trade).

## Run it (Windows box with MT5, repo root)

```bat
.venv\Scripts\python.exe -m pip install -r SignalCopier\requirements.txt
.venv\Scripts\python.exe SignalCopier\signal_copier.py --url <dashboard-url>                         & rem paper
.venv\Scripts\python.exe SignalCopier\signal_copier.py --url <dashboard-url> --backfill-since 2025-01-01 & rem history → outcomes, no orders
.venv\Scripts\python.exe SignalCopier\signal_copier.py --url <dashboard-url> --live
```

First run: the bot asks Telegram for a login code and shows **needs login code** on the bot page. Type the code from
your Telegram app into the **Telegram login** card. A 2FA password is asked for the same way if your account has one.
The resulting session is the local file `SignalCopier/signalcopier.session`. **Treat it like a password.** It never
goes to KV.

## How it reads a group you're not an admin of

Telegram bots (Bot API) can only read chats they administer. This uses **Telethon**, a *user* client: it reads as your
own account and sees exactly what your app sees. Don't forward the content, because it's a paid group.

## What it does with each instruction

| His message | Bot |
|---|---|
| market `SELL X now at …` | market order with his SL/TP, sized to **Risk % / signal** from MT5's own tick value |
| `Limit SELL X at …` | resting limit with SL/TP. If the market already traded through it: take the better price at market, or skip (setting) |
| `Cancel at HH:MM UK if not filled` | cancels at that time, unless ours filled; a filled one is kept |
| `Closed at HH:MM UK` / day section `closed at 21:00` | closes at that time |
| `Cancel the …` | cancels the resting order (keeps it, with an alert, if ours already filled) |
| `CLOSE the X SELL from …` | closes that position |
| anything trade-like it can't parse, edits, deletions | alert only, never guessed |

Entry guards: kill switch, styles on/off, skip list, max open, stale market signal (default 300 s), price already
past the stop, entry drift worse than 0.25R, spread wider than 0.2 × stop, min lot that would over-risk the account.
Every decision goes to the Decision Timeline with its reason.

It behaves like the other pylego bots (Vote Atlas / Motif / Fib Atlas):
- **Risk guard:** the shared `pylego.risk_guard` daily/monthly drawdown lockout. It's on by default; the cooldown defaults to 0.
- **Symbol check:** `verify_symbols` runs at start and on each new symbol. A mismatch shows on the tab and skips that symbol's signals.
- **Alerts:** gated by the ⚙ Alerts master switch (`ai_alert_cfg.tgMaster.signalCopier`). One close alert per position, replied onto its entry alert.
- **Retries:** a broker reject that isn't the order's fault is retried up to 3 times, 60 s apart.
- **Proof of life:** counters show on the tab.
- **Bot Audit:** the daily reconciliation row (`js/signalCopierRecon.js`) matches each real trade to its signal by the `SC[…]` tag.

## Signal Outcomes (the COG template)

`outcome.py` scores each signal on M1 bars:
- **Fills:** a market signal fills at the mid the bot saw when the message arrived. A limit fills at its price on the
  first bar that trades through it before its cancel time.
- **Exits:** SL or TP on a bar's range; SL wins when one bar holds both. Timed and channel closes exit at the next
  bar's open.
- **Costs:** one spread is charged.
- **Sources:** live and `--backfill-since` use the same function. Bars come from MT5; without MT5 they're sampled
  prices, which miss wicks.

Rows follow `Date,Time,Exit Date,Exit Time,Instrument,Direction,Model,Risk %,Return %,MAE %,MFE %,Tags,Notes`, times
UK. Model is `ColezTrades Swing` / `Day` / `Single`. Return/MAE/MFE are % of account at **Template Risk %** per 1R.
**It measures his signals as a follower would get them, not his own fills.**

## Also here

`copier.py` is a standalone monitor/CLI with no dashboard (`chats` lists your groups and forum topic ids, `listen`,
`backfill` to CSV, `parse`), configured by env vars:

```bash
export TG_API_ID=… TG_API_HASH=…   # my.telegram.org → API development tools
python3 SignalCopier/copier.py chats
```

## What it understands (from the 30 Oct 2026 messages)

| Message | Becomes |
|---|---|
| `Trades, Friday 30 October / Risk 1R on each.` | header (context) |
| `Still holding: …` | holding (context) |
| `Swings, hold until I post the close` | following trades are swings, closed manually |
| `Day trades, limit orders, closed at 21:00` | following trades close at 21:00 UK |
| `🔴 SELL USDJPY now at 157.69 / Stop loss (SL) 157.96 / 0.01 lots = $1.73 risk` | open, market |
| `🔴 Limit SELL NAS100 at 28,965 / SL 29,096, TP 28,703 / Cancel at 13:00 UK if not filled` | open, limit, expires 13:00 UK |
| `🔴 SELL SP500(normal, NOT futures) now at 7,640.6 / SL …, TP … / Closed at 21:00 UK if still open` | open, market, closes 21:00 UK |
| `Cancel the NAS100 limit SELL at 28,965, not filled` | cancel (matched by symbol + side + entry) |
| `CLOSE the USDJPY SELL from 157.69, flat for the weekend` | close (one per line) |

**Safety net:** a message that mentions a known symbol or a price *and* an action word (buy, sell, close, cancel, SL,
TP, move, breakeven, half…) but matches none of the above raises **⚠️ Unparsed instruction — check manually**. It is
never guessed at. When you see one, paste it into `python3 copier.py parse` and add the pattern plus a test.

Also flagged rather than applied:
- **edits** to a signal message that change its instructions (reactions also arrive as edits; those are ignored)
- **deletions** of a signal message
- a cancel or close that matches **no live order** in the book

## Files

| File | What |
|---|---|
| `parser.py` | text → events. Pure, no network |
| `book.py` | events + clock → order transitions; saved to `data/book.json` |
| `signal_copier.py` | the bot: Telegram login via dashboard, book → MT5/Paper broker, status, decisions, outcomes |
| `outcome.py` | signal + M1 bars → fill/exit/R/MAE/MFE and the COG template row. Pure |
| `copier.py` | standalone monitor/CLI (no dashboard) |
| `start.bat` | Windows launcher, pins `.venv\\Scripts\\python.exe` like the other bots |
| tests | `python3 test_parser.py`, `test_outcome.py`, `test_copier.py` (end to end on PaperBroker); `node js/signalCopierRecon.test.mjs` |

## Known limits

- **Partial closes / SL moves:** none seen yet. When one appears, the review net flags it and the bot does nothing.
- **Positions tab:** `js/botRegistry.js` marks Signal Copier `paper: true`. Set it to `false` once it trades a real
  account, so its P&L counts as real money.
- **Sampled outcomes:** without MT5 (paper on a machine with no terminal), outcomes come from sampled prices and are
  lost on restart. Run with the terminal open.

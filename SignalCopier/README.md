# SignalCopier

Watches the **ColezTrades | Private → Signals** Telegram topic. It turns every instruction into a structured event and
keeps a live book of what the channel says should be open. It sends you an alert for each new trade, cancel and close,
and for anything it couldn't understand.

**Status: monitor only.** The executor is a paper stub that logs what a real one would do. Nothing is sent to a broker.

## How it reads a group you're not an admin of

Telegram bots (the Bot API) can only read chats where they've been added as an admin. This uses **Telethon**, a
*user* client. It logs in as your own Telegram account once (phone number + login code), and after that it sees the
same messages you see in the app. Run it on your own account and don't forward the content: it's a paid group.

## Setup

```bash
pip install -r SignalCopier/requirements.txt
# https://my.telegram.org → API development tools → create an app
export TG_API_ID=1234567
export TG_API_HASH=abc...

cd SignalCopier
python3 copier.py chats       # first run: phone + code. Prints group ids and forum topics
```

Find **ColezTrades | Private** in the list and the **Signals** topic id under it, then:

```bash
export SIGNAL_CHAT=-1001606516039      # default already; confirm against `chats`
export SIGNAL_TOPIC=<Signals topic id>
export SIGNAL_SENDERS="ColezTrades Alerts"   # optional: ignore everyone else's posts
# optional: alerts to your own bot chat (create a bot with @BotFather)
export NOTIFY_BOT_TOKEN=...  NOTIFY_CHAT_ID=...

python3 copier.py listen
```

Login creates `signalcopier.session`. **Treat it like a password**, because it can read and send as your account. It's
gitignored. To run it headless (e.g. Railway), export a `StringSession` into `TG_SESSION` instead.

## Backfill: get a track record

```bash
python3 copier.py backfill --since 2025-01-01
```

This replays the topic's whole history through the same parser and book. It writes `data/trades.csv` (one row per
signal with entry/SL/TP/cancel/close times and how it ended) and `data/history.jsonl` (every raw message plus its
parsed events). Unparsed instructions are printed so you can extend the parser. The trades file is the input for
resolving each signal against price data, which tells you whether these signals make money **at the price you could
actually get**.

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
| `copier.py` | Telethon listener, backfill, CLI, alerts, paper executor |
| `test_parser.py` | the real messages as tests: `python3 test_parser.py` |

## Not built yet (deliberately)

- **Live execution.** `PaperExecutor` is the hook. A broker executor (MT5 via `bot/position_manager.py`'s
  `order_send`, OANDA, or NT8 via `nt8_bridge/`) would map symbols (his `US30` = DJ30 cash, `SP500` = cash, not
  futures) and size from your own risk per trade. It would need hard caps and a kill switch. Build it after the backfill
  says the signals are worth taking.
- **Fill tracking.** The book tracks *instructions*. A limit order shows `working` until it's cancelled or expires; the
  book can't know whether it filled. A real executor would.
- **Partial closes / SL moves.** None seen yet. When one appears, the review net will flag it.

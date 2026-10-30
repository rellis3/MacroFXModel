"""SignalCopier — watch the ColezTrades "Signals" topic and keep a live book.

Reads the group as YOUR Telegram account (Telethon user client — the Bot API
can't read a group you're not an admin of). Monitor-only: every instruction
becomes a book transition and an alert; the executor is a paper stub.

Commands
--------
  python3 copier.py chats                 list your groups/channels (+ topics) with ids
  python3 copier.py listen                live monitor
  python3 copier.py backfill --since 2026-01-01
                                          replay history → data/history.jsonl + data/trades.csv
  python3 copier.py parse < message.txt   parse pasted text, print events

Env (values never go in git)
----------------------------
  TG_API_ID, TG_API_HASH   from https://my.telegram.org → API development tools
  TG_SESSION               optional StringSession; else ./signalcopier.session file
  SIGNAL_CHAT              group id (default -1001606516039 = "ColezTrades | Private")
  SIGNAL_TOPIC             forum topic id of "Signals" (find it with `chats`); unset = all topics
  SIGNAL_SENDERS           optional comma list of sender names/ids to trust (e.g. "ColezTrades Alerts")
  NOTIFY_BOT_TOKEN, NOTIFY_CHAT_ID   optional: push alerts to your own bot chat
"""
import argparse
import asyncio
import csv
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from book import Book, describe
from parser import has_trade_events, parse_message

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
DEFAULT_CHAT = -1001606516039


# ── alerts ──────────────────────────────────────────────────────────────
def notify(text):
    print(f"[{datetime.now(timezone.utc):%H:%M:%S}Z] {text}", flush=True)
    tok, chat = os.environ.get('NOTIFY_BOT_TOKEN'), os.environ.get('NOTIFY_CHAT_ID')
    if not (tok and chat):
        return
    try:
        body = urllib.parse.urlencode({'chat_id': chat, 'text': text[:4000]}).encode()
        urllib.request.urlopen(f'https://api.telegram.org/bot{tok}/sendMessage', body, timeout=10)
    except Exception as e:                      # alerts must never kill the listener
        print(f'  (notify failed: {e})', flush=True)


# ── execution (paper only) ──────────────────────────────────────────────
class PaperExecutor:
    """Logs what a real executor would do. Swap for a broker executor
    (MT5 / OANDA / NT8) once the history shows the signals are worth taking."""
    name = 'paper'

    def handle(self, action, order, detail):
        if action == 'place':
            return f"📥 NEW  {describe(order)}"
        if action == 'cancel':
            return f"🚫 CANCEL  {order['side']} {order['symbol']} @ {order['entry']:g} — {detail}"
        if action == 'close':
            return f"✅ CLOSE  {order['side']} {order['symbol']} @ {order['entry']:g} — {detail}"
        return f"⚠️ {detail}"


# ── telegram plumbing ───────────────────────────────────────────────────
def make_client():
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
    except ImportError:
        sys.exit('pip install -r SignalCopier/requirements.txt  (needs telethon)')
    api_id, api_hash = os.environ.get('TG_API_ID'), os.environ.get('TG_API_HASH')
    if not (api_id and api_hash):
        sys.exit('Set TG_API_ID and TG_API_HASH (https://my.telegram.org → API development tools)')
    sess = os.environ.get('TG_SESSION')
    session = StringSession(sess) if sess else os.path.join(HERE, 'signalcopier')
    return TelegramClient(session, int(api_id), api_hash)


def topic_of(msg):
    r = getattr(msg, 'reply_to', None)
    if not r or not getattr(r, 'forum_topic', False):
        return 1                                 # "General" topic
    return r.reply_to_top_id or r.reply_to_msg_id


def sender_label(msg):
    s = getattr(msg, 'sender', None) or getattr(msg, 'sender_chat', None)
    name = getattr(s, 'title', None) or ' '.join(
        x for x in (getattr(s, 'first_name', None), getattr(s, 'last_name', None)) if x)
    return name or str(msg.sender_id), str(msg.sender_id)


def make_filter():
    topic = os.environ.get('SIGNAL_TOPIC')
    senders = {s.strip().lower() for s in os.environ.get('SIGNAL_SENDERS', '').split(',') if s.strip()}

    def ok(msg):
        if topic and topic_of(msg) != int(topic):
            return False
        if senders:
            name, sid = sender_label(msg)
            return name.lower() in senders or sid in senders
        return True
    return ok


def chat_id():
    return int(os.environ.get('SIGNAL_CHAT', DEFAULT_CHAT))


def log_jsonl(path, row):
    with open(path, 'a') as f:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + '\n')


# ── commands ────────────────────────────────────────────────────────────
async def cmd_chats(client):
    async for d in client.iter_dialogs():
        if not (d.is_group or d.is_channel):
            continue
        print(f'{d.id:>16}  {d.name}')
        if getattr(d.entity, 'forum', False):
            for t in await _topics(client, d.entity):
                print(f'{"":>16}    topic {t.id:>6}  {t.title}')


async def _topics(client, entity):
    from telethon import functions
    req = getattr(functions.messages, 'GetForumTopicsRequest', None)
    try:
        if req:
            res = await client(req(peer=entity, offset_date=None, offset_id=0, offset_topic=0, limit=100))
        else:
            res = await client(functions.channels.GetForumTopicsRequest(
                channel=entity, offset_date=None, offset_id=0, offset_topic=0, limit=100))
        return [t for t in res.topics if hasattr(t, 'title')]
    except Exception as e:
        print(f'{"":>16}    (could not list topics: {e})')
        return []


def process(book, ex, msg, edited=False, log='messages.jsonl'):
    """Parse one message, apply it, alert. Shared by listen + backfill."""
    text = msg.message or ''
    posted = msg.date.astimezone(timezone.utc)
    events = parse_message(text)
    name, sid = sender_label(msg)
    log_jsonl(os.path.join(DATA, log), {
        'msg_id': msg.id, 'date': posted, 'edited': edited, 'sender': name, 'sender_id': sid,
        'topic': topic_of(msg), 'text': text, 'events': events})

    key, sig = str(msg.id), json.dumps(events, sort_keys=True)
    lines = []
    if edited and key not in book.seen:
        # an edit (or reaction) to a message from before we started — never replay it
        if has_trade_events(events):
            lines.append(f"✏️ Message {msg.id} (older than this monitor) was edited — not applied, check:\n{text}")
        return lines
    if key in book.seen:
        if book.seen[key] != sig and has_trade_events(events):
            lines.append(f"✏️ EDITED message {msg.id} changed its instructions — not auto-applied, check:\n{text}")
            book.seen[key] = sig
    else:
        book.seen[key] = sig
        for action, order, detail in book.apply(events, msg.id, posted):
            lines.append(ex.handle(action, order, detail))
    return lines


async def cmd_listen(client):
    from telethon import events as tev
    os.makedirs(DATA, exist_ok=True)
    book, ex, ok, chat = Book(os.path.join(DATA, 'book.json')), PaperExecutor(), make_filter(), chat_id()

    async def on_msg(ev, edited=False):
        await ev.message.get_sender()            # sender name for SIGNAL_SENDERS
        if not ok(ev.message):
            return
        lines = process(book, ex, ev.message, edited)
        book.save()
        if lines:
            notify('\n'.join(lines))

    client.add_event_handler(lambda e: on_msg(e), tev.NewMessage(chats=chat))
    client.add_event_handler(lambda e: on_msg(e, True), tev.MessageEdited(chats=chat))

    @client.on(tev.MessageDeleted(chats=chat))
    async def _(ev):
        hit = [i for i in ev.deleted_ids if str(i) in book.seen]
        if hit:
            notify(f'🗑 Signal message(s) {hit} were deleted in the channel — check the book.')

    entity = await client.get_entity(chat)
    notify(f'SignalCopier listening to "{getattr(entity, "title", chat)}" '
           f'(topic {os.environ.get("SIGNAL_TOPIC") or "all"}), executor={ex.name}, '
           f'{len(book.live())} live orders in book')

    while True:                                  # timed cancels / closes
        lines = [ex.handle(*t) for t in book.tick(datetime.now(timezone.utc))]
        if lines:
            book.save()
            notify('\n'.join(lines))
        await asyncio.sleep(20)


async def cmd_backfill(client, since):
    os.makedirs(DATA, exist_ok=True)
    p = os.path.join(DATA, 'history.jsonl')
    if os.path.exists(p):
        os.remove(p)
    book, ex, ok = Book(), PaperExecutor(), make_filter()
    n = 0
    topic = os.environ.get('SIGNAL_TOPIC')
    kw = {'reply_to': int(topic)} if topic and int(topic) != 1 else {}
    async for msg in client.iter_messages(chat_id(), reverse=True, offset_date=since, **kw):
        if not ok(msg):
            continue
        for t in book.tick(msg.date.astimezone(timezone.utc)):
            ex.handle(*t)
        for line in process(book, ex, msg, log='history.jsonl'):
            if line.startswith('⚠️'):
                print(f'{msg.date:%Y-%m-%d %H:%M}  {line}')
        n += 1
    book.tick(datetime.now(timezone.utc))

    path = os.path.join(DATA, 'trades.csv')
    cols = ['id', 'posted_at', 'symbol', 'side', 'order', 'entry', 'sl', 'tp', 'style',
            'cancel_at', 'close_at', 'status', 'ended_at', 'end_reason', 'risk_lots', 'risk_usd', 'note']
    rows = sorted(book.orders.values(), key=lambda o: o['posted_at'])
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, cols, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)
    print(f'{n} messages → {len(rows)} trades → {path}  ({len(book.live())} still live)')


def cmd_parse():
    print(json.dumps(parse_message(sys.stdin.read()), indent=1, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['chats', 'listen', 'backfill', 'parse'])
    ap.add_argument('--since', help='backfill start date YYYY-MM-DD', default='2025-01-01')
    a = ap.parse_args()
    if a.cmd == 'parse':
        return cmd_parse()

    client = make_client()

    async def run():
        if a.cmd == 'chats':
            await cmd_chats(client)
        elif a.cmd == 'listen':
            await cmd_listen(client)
        else:
            since = datetime.strptime(a.since, '%Y-%m-%d').replace(tzinfo=timezone.utc)
            await cmd_backfill(client, since)

    with client:                                 # first run asks for phone + login code
        client.loop.run_until_complete(run())


if __name__ == '__main__':
    main()

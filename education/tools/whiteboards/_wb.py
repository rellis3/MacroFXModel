"""Shared helpers for "Watch it" scene files. Each op mirrors the player's JSON (see the
header of theory-lab/assets/whiteboard.js)."""

def box(id, x, y, w, h, text, tone=None, sub=None, top=False, size=None):
    d = dict(box=id, x=x, y=y, w=w, h=h, text=text)
    if tone: d['tone'] = tone
    if sub is not None: d['sub'] = sub
    if top: d['top'] = True
    if size: d['size'] = size
    return d
def arrow(a, b, label=None, tone=None, bend=0, dash=False, id=None, size=None):
    d = dict(arrow=[a, b])
    if label: d['label'] = label
    if tone: d['tone'] = tone
    if bend: d['bend'] = bend
    if dash: d['dash'] = True
    if id: d['id'] = id
    if size: d['size'] = size
    return d
def note(id, x, y, text, tone=None, size=20, anchor='middle'):
    d = dict(note=id, x=x, y=y, text=text, size=size, anchor=anchor)
    if tone: d['tone'] = tone
    return d
def step(cap, *ops): return dict(cap=cap, do=list(ops))


def chart(id, r, title, xd, yd, yt, xt, tone=None, **kw):
    d = dict(chart=id, x=r[0], y=r[1], w=r[2], h=r[3], title=title, xd=xd, yd=yd, yt=yt, xt=xt, **kw)
    if tone: d['tone'] = tone
    return d
def series(id, ch, pts, tone, **kw): return dict(series=id, chart=ch, pts=pts, tone=tone, **kw)
def dot(id, ch, at, text, tone, **kw): return dict(dot=id, chart=ch, at=at, text=text, tone=tone, **kw)
def cnote(id, ch, at, text, tone, size=17, anchor='middle', dx=0, dy=0):
    return dict(note=id, chart=ch, at=at, text=text, tone=tone, size=size, anchor=anchor, dx=dx, dy=dy)

def icon(id, name, x, y, s=0.8, tone=None, label=None, sym=None, lsize=None):
    d = dict(icon=id, name=name, x=x, y=y, s=s)
    if tone: d['tone'] = tone
    if label: d['label'] = label
    if sym: d['sym'] = sym
    if lsize: d['lsize'] = lsize
    return d
def chip(id, x, y, text, tone): return dict(chip=id, x=x, y=y, text=text, tone=tone)
def move(id, x, y, ms=None):
    d = dict(move=id, x=x, y=y)
    if ms: d['ms'] = ms
    return d

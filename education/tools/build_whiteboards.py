"""Builds every "Watch it" whiteboard and inserts it into its lesson and visual guide.

One scene file per board in whiteboards/ (anything not starting with "_"). Each defines
BOARD = dict(name, lesson, title, cfg, before, deck_after):
  lesson      slug; the board goes into lessons/<slug>.html and, if deck_after is set,
              as its own "▶ Watch it" slide in lessons/<slug>-micro.html
  before      exact text in the full lesson the board is inserted in front of
  deck_after  data-slide number the deck slide follows (None = no deck slide)
Also writes theory-lab/watch.html (an index of every board) and a ▶ badge on
the hub card of each lesson that has one.
Re-runnable: boards sit between <!-- WB:name:START/END --> markers and are replaced.
Run:  python3 education/tools/build_whiteboards.py [name …]
"""
import importlib, json, os, pkgutil, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
L = os.path.join(HERE, '..', '..', 'theory-lab', 'lessons') + '/'
import whiteboards


def block(name, title, cfg, indent='  ', anchor=''):
    js = json.dumps(cfg, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return (f'{indent}<!-- WB:{name}:START -->\n{indent}<div class="wb"{anchor} data-title="{title}">\n'
            f'{indent}  <script type="application/json">{js}</script>\n{indent}</div>\n{indent}<!-- WB:{name}:END -->\n')


def renumber(s):
    n = [0]
    def bump(m):
        n[0] += 1
        return m.group(1) + str(n[0]) + m.group(2)
    return re.sub(r'(<section class="sl-slide(?: active)?" data-slide=")\d+(")', bump, s), n[0]


def ensure_assets(s, css_before):
    if 'assets/whiteboard.css' not in s:
        s = s.replace(css_before, '<link rel="stylesheet" href="../assets/whiteboard.css">\n' + css_before, 1)
    if 'assets/whiteboard.js' not in s:
        s = s.replace('</body>', '<script src="../assets/whiteboard.js" defer></script>\n</body>', 1)
    return s


def build(B):
    name, title, cfg = B['name'], B['title'], B['cfg']
    p = L + B['lesson'] + '.html'; s = open(p).read()
    s = re.sub(rf'  <!-- WB:{name}:START -->[\s\S]*?<!-- WB:{name}:END -->\n\n?', '', s)
    assert s.count(B['before']) == 1, (name, 'anchor found', s.count(B['before']), 'times')
    s = s.replace(B['before'], block(name, title, cfg, anchor=f' id="wb-{name}"') + '\n' + B['before'], 1)
    open(p, 'w').write(ensure_assets(s, '<link rel="stylesheet" href="../assets/theory.css'))
    msg = f'ok {name}: {len(cfg["steps"])} steps → {B["lesson"]}.html'
    if B.get('deck_after'):
        p = L + B['lesson'] + '-micro.html'; s = open(p).read()
        s = re.sub(rf'    <!-- WB:{name}-deck:START -->[\s\S]*?<!-- WB:{name}-deck:END -->\n\n', '', s)
        s, _ = renumber(s)
        m = re.search(rf'<section class="sl-slide(?: active)?" data-slide="{B["deck_after"] + 1}">', s)
        assert m, (name, 'no slide after', B['deck_after'])
        at = s.rfind('\n', 0, m.start()) + 1
        slide = (f'    <!-- WB:{name}-deck:START -->\n    <section class="sl-slide" data-slide="0">\n'
                 f'      <div class="sl-kicker">▶ Watch it</div>\n      <h2 class="sl-h2">{title}</h2>\n'
                 + block(name, title, cfg, indent='      ')
                 + f'    </section>\n    <!-- WB:{name}-deck:END -->\n\n')
        s, total = renumber(s[:at] + slide + s[at:])
        open(p, 'w').write(ensure_assets(s, '<link rel="stylesheet" href="../assets/deck.css'))
        msg += f' + slide {B["deck_after"] + 1} of {total} in the visual guide'
    print(msg)


TL = os.path.join(HERE, '..', '..', 'theory-lab') + '/'
BADGE = '<span class="tl-card-wb-badge" title="Has a ▶ Watch it animation">▶</span>'


def hub_index():
    """Every hub card as (category heading, slug, card title), in hub order."""
    hub = open(TL + 'hub.html').read()
    out = []
    for cat in re.finditer(r'<div class="tl-cat"[^>]*>\s*<h2>(.*?)</h2>([\s\S]*?)(?=<div class="tl-cat"|<script)', hub):
        for card in re.finditer(r'data-slug="([^"]+)"[\s\S]*?<h3>(.*?)</h3>', cat.group(2)):
            out.append((cat.group(1), card.group(1), card.group(2)))
    return out


def badge_hub(slugs):
    """A ▶ badge on every hub card whose lesson has a board."""
    p = TL + 'hub.html'; s = s0 = open(p).read()
    s = s.replace(BADGE, '')
    def add(m):
        if m.group(1) not in slugs: return m.group(0)
        head = m.group(0); i = head.index('</div>', head.index('tl-card-toprow') + 1)
        # after the level pill / micro badge: just before the toprow's closing </div>
        j = head.index('</div>', i + 1) if 'tl-card-num' in head[:i + 6] else i
        return head[:j] + BADGE + head[j:]
    s = re.sub(r'<a class="tl-card"[^>]*data-slug="([^"]+)"[^>]*>\s*<div class="tl-card-toprow">[\s\S]*?</div>[\s\S]*?</div>', add, s)
    if s != s0: open(p, 'w').write(s)


def write_index(boards):
    """theory-lab/watch.html: every board, grouped by the hub category of its lesson."""
    idx = hub_index(); where = {}
    for cat, slug, title in idx:
        where.setdefault(slug, (cat, title))
    groups = {}
    for B in boards:
        cat, ltitle = where.get(B['lesson'], ('More', B['lesson']))
        groups.setdefault(cat, []).append((B, ltitle))
    order = [c for c in dict.fromkeys(c for c, _, _ in idx) if c in groups] + [c for c in groups if c not in dict.fromkeys(c for c, _, _ in idx)]
    strip = lambda t: re.sub(r'<!-- DESK:START -->[\s\S]*?<!-- DESK:END -->', '', t)
    body = []
    for cat in order:
        cards = ''.join(
            f'      <a class="tl-card" href="lessons/{B["lesson"]}.html#wb-{B["name"]}">\n'
            f'        <div class="tl-card-toprow"><div class="tl-card-num">▶ {len(B["cfg"]["steps"])} steps</div></div>\n'
            f'        <h3>{B["title"]}</h3>\n        <p>{strip(lt)}</p>\n      </a>\n'
            for B, lt in groups[cat])
        body.append(f'  <div class="tl-cat">\n    <h2>{strip(cat)}</h2>\n    <div class="tl-grid">\n{cards}    </div>\n  </div>\n')
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Watch It — Theory Lab — MacroFX</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/theory.css">
</head>
<body>
<!-- Generated by education/tools/build_whiteboards.py — edit the scene files, not this page. -->
<div id="page">
  <div class="tl-crumb"><a href="hub.html">Theory Lab</a> · Watch it</div>
  <div class="tl-hub-hero">
    <div class="tl-kicker">Learn it by watching</div>
    <h1>▶ Watch It</h1>
    <p>Every animated whiteboard in the lab, {len(boards)} in all. Each one draws an idea step by step: the actors, what moves, and the punchline, with a caption for every step. Tap a card to jump straight to the board inside its lesson. On the hub, a ▶ on a lesson's card means it has one.</p>
  </div>
{''.join(body)}</div>
</body>
</html>
'''
    open(TL + 'watch.html', 'w').write(html)
    print(f'ok index: {len(boards)} boards → watch.html; ▶ badges on hub')


only = set(sys.argv[1:])
boards = []
for mod in sorted(m.name for m in pkgutil.iter_modules(whiteboards.__path__) if not m.name.startswith('_')):
    B = importlib.import_module('whiteboards.' + mod).BOARD
    boards.append(B)
    if not only or B['name'] in only:
        build(B)
write_index(boards)
badge_hub({B['lesson'] for B in boards})

"""Builds every "Watch it" whiteboard and inserts it into its lesson and visual guide.

One scene file per board in whiteboards/ (anything not starting with "_"). Each defines
BOARD = dict(name, lesson, title, cfg, before, deck_after):
  lesson      slug; the board goes into lessons/<slug>.html and, if deck_after is set,
              as its own "▶ Watch it" slide in lessons/<slug>-micro.html
  before      exact text in the full lesson the board is inserted in front of
  deck_after  data-slide number the deck slide follows (None = no deck slide)
Re-runnable: boards sit between <!-- WB:name:START/END --> markers and are replaced.
Run:  python3 education/tools/build_whiteboards.py [name …]
"""
import importlib, json, os, pkgutil, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
L = os.path.join(HERE, '..', '..', 'theory-lab', 'lessons') + '/'
import whiteboards


def block(name, title, cfg, indent='  '):
    js = json.dumps(cfg, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return (f'{indent}<!-- WB:{name}:START -->\n{indent}<div class="wb" data-title="{title}">\n'
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
    s = s.replace(B['before'], block(name, title, cfg) + '\n' + B['before'], 1)
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


only = set(sys.argv[1:])
for mod in sorted(m.name for m in pkgutil.iter_modules(whiteboards.__path__) if not m.name.startswith('_')):
    B = importlib.import_module('whiteboards.' + mod).BOARD
    if not only or B['name'] in only:
        build(B)

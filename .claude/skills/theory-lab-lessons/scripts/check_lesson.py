#!/usr/bin/env python3
"""Style-guide §8 checks for Theory Lab / COG lessons, plus the CI lesson tests.

Usage (from the repo root):
    python3 .claude/skills/theory-lab-lessons/scripts/check_lesson.py theory-lab/lessons/foo.html [more.html ...]
    python3 .claude/skills/theory-lab-lessons/scripts/check_lesson.py --ci theory-lab/lessons/foo.html

Per file: tag balance, `node --check` on inline scripts, relative hrefs resolve,
every tl-* class exists in theory.css and every sl-* class in deck.css (or a local <style>).
-micro decks also get structural checks (required ids, data-slide order, deck.js not deferred, quiz markup).
The deskStrip leak test always runs (it scans the repo's lessons, so it only sees files inside the repo);
--ci adds the other node tests that .github/workflows/theory-lab.yml runs.
Exit code 1 if anything fails.
"""
import os
import re
import subprocess
import sys
import tempfile
from urllib.parse import unquote

REPO = os.getcwd()
ASSETS = os.path.join(REPO, "theory-lab", "assets")
TAGS = ['div', 'svg', 'script', 'a', 'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
        'details', 'summary', 'table', 'tr', 'td', 'span', 'section', 'button']
CI_TESTS = ["js/deskEvidence.test.mjs", "js/lessonEvidence.test.mjs", "js/lessonPaths.test.mjs",
            "js/lessonLinks.test.mjs", "js/progressSync.test.mjs", "js/deskStrip.test.mjs"]


def css_classes(path):
    try:
        s = open(path, encoding="utf-8").read()
    except FileNotFoundError:
        return set()
    return set(re.findall(r"\.([A-Za-z_][\w-]*)", s))


def check_tags(s):
    issues = []
    for tag in TAGS:
        opens = len(re.findall(rf"<{tag}(?:\s[^>]*)?>", s)) - len(re.findall(rf"<{tag}(?:\s[^>]*)?/>", s))
        closes = len(re.findall(rf"</{tag}>", s))
        if opens != closes:
            issues.append(f"tag {tag}: {opens} open vs {closes} close")
    return issues


def check_scripts(s):
    issues = []
    for i, m in enumerate(re.finditer(r"<script(?P<attrs>[^>]*)>(?P<body>.*?)</script>", s, re.S)):
        attrs, body = m.group("attrs"), m.group("body")
        if "src=" in attrs or not body.strip() or "MathJax" in body[:200] or "application/json" in attrs:
            continue
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
            f.write(body)
            tmp = f.name
        r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        os.unlink(tmp)
        if r.returncode != 0:
            errs = [l for l in r.stderr.splitlines() if "Error" in l] or ["syntax error"]
            issues.append(f"inline script #{i}: {errs[0].strip()}")
    return issues


def check_links(path, s):
    issues = []
    for href in re.findall(r'href="([^"]+)"', s):
        if re.match(r"^(https?:|mailto:|#|javascript:|data:)", href):
            continue
        target = unquote(href.split("#")[0].split("?")[0])
        if not target:
            continue
        full = os.path.normpath(os.path.join(os.path.dirname(path), target))
        if not os.path.exists(full):
            issues.append(f"broken link: {href}")
    return issues


def check_classes(s, theory, deck):
    local = set()
    for st in re.findall(r"<style[^>]*>(.*?)</style>", s, re.S):
        local |= set(re.findall(r"\.([A-Za-z_][\w-]*)", st))
    used = set()
    for attr in re.findall(r'class="([^"]+)"', s):
        used |= set(attr.split())
    issues = []
    for c in sorted(used):
        if c.startswith("tl-") and c not in theory and c not in local:
            issues.append(f"class {c} not in theory.css")
        if c.startswith("sl-") and c not in deck and c not in local:
            issues.append(f"class {c} not in deck.css")
    return issues


def check_deck(s):
    """Structural checks for -micro decks (deck.js wiring)."""
    if 'id="deck"' not in s:
        return []
    issues = []
    for i in ["sl-count", "sl-total", "sl-prev", "sl-next", "sl-progress", "sl-viewport"]:
        if f'id="{i}"' not in s:
            issues.append(f"deck: missing required id {i}")
    nums = [int(n) for n in re.findall(r'<section class="sl-slide[^"]*" data-slide="(\d+)"', s)]
    if nums != list(range(1, len(nums) + 1)):
        issues.append(f"deck: data-slide not 1..N in order: {nums}")
    if len(re.findall(r'class="sl-slide active"', s)) != 1:
        issues.append("deck: exactly one slide (the first) should be 'sl-slide active'")
    if re.search(r'<script[^>]*src="[^"]*deck\.js"[^>]*\b(defer|async)\b', s):
        issues.append("deck: deck.js must be a plain script, not defer/async")
    if "deck.js" not in s:
        issues.append("deck: deck.js not loaded")
    for q in re.findall(r'<div class="sl-quiz-q".*?(?=<div class="sl-quiz-q"|</section>)', s, re.S):
        if 'data-correct="true"' not in q:
            issues.append("deck: a quiz question has no option with data-correct=\"true\"")
        if re.search(r'<(?!button)\w+[^>]*class="sl-quiz-opt', q):
            issues.append("deck: quiz options must be <button class=\"sl-quiz-opt\">")
    return issues


def main(argv):
    ci = "--ci" in argv
    files = [a for a in argv if not a.startswith("--")]
    if not files and not ci:
        print(__doc__)
        return 2
    theory = css_classes(os.path.join(ASSETS, "theory.css"))
    deck = css_classes(os.path.join(ASSETS, "deck.css"))
    failed = False
    for path in files:
        s = open(path, encoding="utf-8").read()
        issues = check_tags(s) + check_scripts(s) + check_links(path, s) + check_classes(s, theory, deck) + check_deck(s)
        if issues:
            failed = True
            print(f"✗ {path}")
            for i in issues:
                print(f"    {i}")
        else:
            print(f"✓ {path}")
    # deskStrip always runs: a DESK leak is the easiest failure to miss
    tests = CI_TESTS if ci else ["js/deskStrip.test.mjs"]
    if tests:
        for t in tests:
            if not os.path.exists(t):
                print(f"- skip {t} (missing)")
                continue
            r = subprocess.run(["node", t], capture_output=True, text=True)
            ok = r.returncode == 0
            failed |= not ok
            print(f"{'✓' if ok else '✗'} node {t}")
            if not ok:
                print("    " + "\n    ".join((r.stdout + r.stderr).strip().splitlines()[-15:]))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

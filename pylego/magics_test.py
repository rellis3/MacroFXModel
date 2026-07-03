"""Magic-registry checker — fails on any duplicate or source/registry mismatch.

Parses each registered bot source for its `MAGIC = <int>` assignment and
asserts (a) it equals the registry value, (b) no two bots share a magic.
Run:  python3 pylego/magics_test.py   (offline, no MT5 needed)
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pylego.magics import MAGICS, RETIRED  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MAGIC_RE = re.compile(r"^MAGIC\s*=\s*(\d+)", re.MULTILINE)

failures = []

# (b) uniqueness across the registry itself
seen = {}
for path, magic in MAGICS.items():
    if magic in seen:
        failures.append(f"registry duplicate: {path} and {seen[magic]} both claim {magic}")
    seen[magic] = path
for magic in RETIRED:
    if magic in seen:
        failures.append(f"retired magic {magic} re-assigned to {seen[magic]}")

# (a) each source file's MAGIC constant matches the registry
for path, magic in MAGICS.items():
    src_path = ROOT / path
    if not src_path.exists():
        failures.append(f"{path}: file missing (registry stale?)")
        continue
    m = MAGIC_RE.search(src_path.read_text(encoding="utf-8", errors="replace"))
    if not m:
        failures.append(f"{path}: no `MAGIC = <int>` assignment found")
    elif int(m.group(1)) != magic:
        failures.append(f"{path}: source MAGIC={m.group(1)} != registry {magic}")

# sweep: any OTHER file defining a MAGIC constant must be registered
for src in ROOT.rglob("*.py"):
    rel = src.relative_to(ROOT).as_posix()
    if rel.startswith((".", "archive/", "pylego/")) or rel in MAGICS:
        continue
    m = MAGIC_RE.search(src.read_text(encoding="utf-8", errors="replace"))
    if m and int(m.group(1)) >= 20260000:
        val = int(m.group(1))
        owner = seen.get(val)
        # modules of a registered bot may re-declare the same magic (e.g.
        # bot/modules/portfolio_beta.py == bot/main.py) — same value is fine,
        # an UNREGISTERED value is not.
        if owner is None:
            failures.append(f"{rel}: unregistered MAGIC {val} — add it to pylego/magics.py")

if failures:
    print("MAGIC REGISTRY FAILURES:")
    for f in failures:
        print(f"  ✗ {f}")
    sys.exit(1)
print(f"✓ magic registry consistent — {len(MAGICS)} bots, all unique")

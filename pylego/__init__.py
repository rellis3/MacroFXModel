"""pylego — the shared Python baseplate for the MacroFX bots.

The Python sibling of the JS lego bricks (see LEGO_MODULES.md / PYTHON_LEGO.md).
Bots import bricks from here instead of copy-pasting pip tables, MT5 plumbing,
sizing and risk logic into every island.

Slice 1 ships only the `instruments` brick (pip size / digits / aliases),
generated from js/instrumentRegistry.js so the bots and the dashboard can never
silently disagree on a pip.
"""

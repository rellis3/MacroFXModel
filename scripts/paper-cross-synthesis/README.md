# paper-cross-synthesis

Every paper in the library set against every other (exploratory, not pre-registered).

The inputs are private: paper notes from KV and full texts from R2. They are pulled into a scratch folder with
`railway run node pull_lib.mjs <repo> <scratch>` and never committed.

1. **Tag.** Each paper card was tagged by an AI reader with role, asset, horizon, family and strength. Six readers ran
   in parallel, each writing `batches/t*.jsonl`.
2. **`cross.py`.** Deterministic. It scores all 390,286 pairs: anchor (direction/forecast) × a part that adds a missing
   slot, on the same market and a matching horizon, weighted by strength and reader cross-refs. It also writes the
   corroboration clusters and the contradiction edges.
3. **Theme readers.** Five AI readers (`BRIEF.md`), one per theme, write blueprints, corroborations and contradictions.
   Each screened its blueprints against `js/deskEvidence.js` and `plans/DATA_ASSET_MAP.md`.
4. **`build_data.py`.** Merges the themes, drops any evidence id not in the Evidence Book, and groups the same system
   reached by several themes (parts Jaccard ≥ 0.5). It writes `analysis/output/paper-cross-synthesis/`.

Page: `paper-synthesis.html`.

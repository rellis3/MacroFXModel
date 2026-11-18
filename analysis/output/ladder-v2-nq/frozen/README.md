# ladder-v2-nq frozen inputs

Byte-exact copies of the files the banked `ladder-v2-nq` / `-fut` / `-cvf` verdicts were computed from, taken
2026-11-18 before the futures re-download rewrote `analysis/output/nt8/continuous/NQ_*`. The data files stay local
(gitignored, ~260 MB; repo is public). `SHA256SUMS` is tracked; the first five hashes equal `input_sha256` in
`../results.json`. To reproduce: point `scripts/ladder-v2-nq/build.py` / `score.py` at these copies.

# Lockbox addendum 1 — reported metric only (2026-10-06, before any holdout data exists locally)

forge/LOCKBOX_PROTOCOL.md is not changed. plans/ROBUSTNESS.md found that the layer-3 rule's σ-quintile buckets (live σ
÷ its median) favour HAR, because a bucketing variable built from one arm's σ shares that arm's forecast error. At the
one evaluation, beside the frozen rule, the evaluation also **reports** the 30-cell regime miss with neutral buckets
(trailing 20-session mean realised H−L ÷ trailing 250-session median, strictly before each day). The verdict is the
frozen rule's; the neutral figure is printed next to it so the bias is visible. Written before the M1 refresh: the
local cache ends 2026-08-21 and `python -m forge.lockbox_check --evaluate` reports 0 holdout sessions.

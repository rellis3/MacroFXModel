# Holdout seal (forge/STABILITY_AND_HOLDOUT_PREREG.md)

Sealed 2026-10-07 at commit 10c416a8. Holdout = sessions after 2026-08-21; opened once on 2027-01-04.

| file | sha256 |
|---|---|
| `js/forecastLadderPersistParams.js` | `df73ce78f8666ffeaccd1c79d007f8c121fd65a60bfd39f9d45a35c7b73c707f` |
| `js/howMuchParams.js` | `a4fc420ec411f64882fe89c6d05b5fb62df8498c53fe5f3809dcb8dec6b7b842` |
| `js/forecastLadderPersist.js` | `15ffe59011267cc972105e634cd1099fadb4e2b3172e4c2291ff1d8bd16b37a6` |
| `js/howMuch.js` | `a4b117b16be342154e5bb04dd3a796741f6f9f1556effc34fb568e519a833aa4` |

Line-ending-proof check (git blob ids; verify with `git hash-object <file>`):

| file | git blob |
|---|---|
| `js/forecastLadderPersistParams.js` | `094eca5589fc4828a3a189db2bb1d6a7f15f59cc` |
| `js/howMuchParams.js` | `dfaff153429bf852e4b2cb2eb0c6894cfbe8fbc0` |
| `js/forecastLadderPersist.js` | `256615753ced7fba74df7e3e655489111366f3a7` |
| `js/howMuch.js` | `1bc6d8e103dde8cf4ce227911b8e6b47a5710dd8` |

## Logged changes after sealing

- 2026-10-07: `js/forecastLadderPersist.js` — σ history computed in one pass instead of 256 prefix recomputes (the live endpoint timed out). **Outputs identical**: regime, res1, res5 and σ matched the old method exactly on EURUSD, GBPUSD, GOLD, NQ, EURJPY, USDJPY (yz_10 and ewma_094). New git blob: `b0072d2c7a626b6027017872de0035585d299f07`. No parameter or rule changed.
- 2026-10-07: `js/forecastLadderPersist.js` — added `vol_annual` + `event_mult` display fields: the export text skipped every adjusted instrument without them (owner spotted the paste held only BTC/commodities). **Lines unchanged** (σ_new, widths, rungs identical). New git blob: `72f186f7aa7b949fc7d5167c551222d70ce2e92e`.

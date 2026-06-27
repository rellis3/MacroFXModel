# Forecast Level Analyser — Setup & Password Guide

How to configure the analyser's storage and access. Plain-English; no code
needed. Everything is controlled by **environment variables** in Railway.

---

## 1. What needs setting

The analyser reuses the **same R2 bucket** as the M1 parquet files, and adds a
shared **password** for access. Six env vars in total — four you already have
(R2), two new (passwords).

| Variable | What it's for | Already set? |
|---|---|---|
| `R2_ENDPOINT` | R2 account URL | ✅ (used by the backtesters) |
| `R2_BUCKET` | bucket name (e.g. `r2-storage`) | ✅ |
| `R2_ACCESS_KEY` | R2 access key id | ✅ |
| `R2_SECRET_KEY` | R2 secret | ✅ |
| `ANALYSER_PASSWORD` | **view** password — to open the tool | ⬜ new |
| `ANALYSER_ADMIN_PASSWORD` | **admin** password — to refresh the data | ⬜ new (optional) |

> The four `R2_*` values are identical to what the volatility / regime
> backtesters already use. When you create the new hosted container (the
> separate Railway service), **copy the same four R2 values across** — the
> analyser reads/writes the same bucket, just under a different folder
> (`forecast-analysis/…`), so nothing in `m1/…` is touched.

---

## 2. The two passwords (how access works)

There are two levels, and a request proves itself by sending the password in a
header, a query string, or a cookie (`x-analyser-pw`, `?pw=…`, or
`analyser_pw=…`).

- **`ANALYSER_PASSWORD` (view)** — anyone with this can *see* the tool and its
  data. Share it with the few people you trust. **Change the env var to rotate
  access** (old password stops working immediately on redeploy).
  - If this is left unset, the read endpoints are **open** (no gate) — so set it
    before you make the URL public.
- **`ANALYSER_ADMIN_PASSWORD` (admin)** — required to trigger a data **refresh**
  (the expensive recompute). Keep this private to you. If you don't set it, it
  falls back to `ANALYSER_PASSWORD`. If *neither* is set, refresh is disabled
  (returns a clear "set ANALYSER_ADMIN_PASSWORD" message) so the public can never
  trigger a recompute.

Recommendation: set **both** — a view password to share, and a separate admin
password only you hold.

---

## 3. Setting them in Railway

1. Open the Railway project → the service → **Variables**.
2. Add `ANALYSER_PASSWORD` = (a password to share) and
   `ANALYSER_ADMIN_PASSWORD` = (a private one).
3. Save → Railway redeploys automatically. Done.

To **rotate**: change the value and save. The previous password stops working on
the next deploy. No accounts, no database — just a shared secret.

---

## 4. Refreshing the dataset (generating the data)

The data is **precomputed and stored**, not calculated per visit. You trigger a
refresh; it loops every M1 pair on R2, runs the analyser, and writes the results
back to R2.

**Trigger a full refresh** (replace the host + admin password):
```
curl -X POST "https://<your-service>/api/forecast-analysis/refresh" \
  -H "x-analyser-pw: <ANALYSER_ADMIN_PASSWORD>" \
  -H "Content-Type: application/json" -d '{}'
```
It returns a `jobId`. Check progress:
```
curl "https://<your-service>/api/forecast-analysis/refresh/status/<jobId>" \
  -H "x-analyser-pw: <ANALYSER_ADMIN_PASSWORD>"
```

**Refresh a subset** (faster, e.g. while testing):
```
-d '{"pairs":["eurusd","gold"],"horizons":["daily"]}'
```

When it finishes, the data is live for all viewers — the page reads the stored
artifacts instantly.

---

## 5. What gets written to R2

Under the same bucket, in a `forecast-analysis/` folder (your `m1/` files are
untouched):

```
forecast-analysis/manifest.json          coverage, last-refresh, definitions
forecast-analysis/aggregates.json         the rollups the dashboard charts
forecast-analysis/{pair}/{horizon}.json   raw per-window records (drilldown)
```

---

## 6. Reading the data (what the public page uses)

All gated by the **view** password:
- `GET /api/forecast-analysis/manifest` — coverage + last refreshed.
- `GET /api/forecast-analysis/aggregates` — the precomputed stats.
- `GET /api/forecast-analysis/pairs` — list of available pairs.
- `GET /api/forecast-analysis/pair/:pair/:horizon` — raw records for drilldown.

---

## 7. The separate hosted service (when you deploy it)

The plan (spec §8) is to run the public analyser as its **own Railway service**
from this same repo. When you create it:
1. New service → same repo.
2. Set its start command to the analyser entry (added in a later phase).
3. **Copy the four `R2_*` vars** + set `ANALYSER_PASSWORD`
   (+ `ANALYSER_ADMIN_PASSWORD`).
4. Give it its own domain — that's the URL you share.

Because the data lives in R2, the public service only *reads*; you run refreshes
from wherever holds the admin password.

---

## 8. Auto-refresh (optional, later)

Railway's base service has no built-in cron, but the persistent node server can
run an **in-process daily refresh** after the close, toggled by an env flag
(`ANALYSER_AUTO_REFRESH=1`). Off by default — turn it on once you're happy with
manual refreshes.

---

*Questions this answers: where the data lives (R2, same bucket), how to gate
access (one shared password, rotatable via env), and how to regenerate the data
(one authenticated API call).*

# Forecast Level Analyser — Deploy to a Separate Site (Railway)

How to run the analyser as its **own public website** on Railway, from this same
repo, with its own URL — like the range-analysis site. ~10 minutes, no code.

The standalone entry point is **`server-analyser.js`**. It serves only the
analyser (the dashboard + refresh pages + the `/api/forecast-analysis/*` API) and
reads the precomputed dataset from R2. The main app is untouched.

---

## 1. What you're creating

A **second Railway service** in the same project, pointing at the same GitHub
repo, but with a different **start command** (`node server-analyser.js`) and its
own domain. Both services share the same R2 bucket; the analyser only reads it.

```
Railway project
├── service 1: MacroFX (existing)      start: bash start.sh        → main app
└── service 2: Forecast Analyser (new) start: node server-analyser.js → public site
```

---

## 2. Create the service

1. Open your Railway **project** → click **+ New** → **GitHub Repo** → pick
   `rellis3/MacroFXModel` (the same repo).
2. Railway adds a new service and starts a build. Rename it (Settings → name) to
   e.g. **forecast-analyser** so it's easy to tell apart.

## 3. Set the start command (important)

By default it would try the repo's `start.sh` (which runs the Python bots — not
what you want here).

- Service → **Settings → Deploy → Custom Start Command** →
  ```
  node server-analyser.js
  ```
- Save.

## 4. Set the variables

Service → **Variables** → add:

| Variable | Value |
|---|---|
| `R2_ENDPOINT` | copy from the main service |
| `R2_BUCKET` | copy from the main service |
| `R2_ACCESS_KEY` | copy from the main service |
| `R2_SECRET_KEY` | copy from the main service |
| `R2_KEY_PREFIX` | copy if the main service sets it (else skip — defaults to `m1`) |
| `ANALYSER_PASSWORD` | the **view** password you share with people |
| `ANALYSER_ADMIN_PASSWORD` | your **private** admin password (refresh) |
| `ANALYSER_AUTO_REFRESH` | `1` only if you want a daily auto-refresh (optional) |

> Tip: in Railway you can use **variable references** to pull the four `R2_*`
> values from the main service instead of retyping them.

`PORT` is provided by Railway automatically — don't set it.

## 5. Give it a domain

Service → **Settings → Networking → Generate Domain**. Railway gives you a URL
like `forecast-analyser-production.up.railway.app`. That's the public site —
share it (with the view password).

## 6. First data

If the dataset isn't built yet (or you just added the new calibration/vol
fields), run a refresh on the new service:
- Open `https://<your-analyser-domain>/forecast-refresh.html`, enter the **admin**
  password, tap **Refresh data** (blank pairs = all). Or use the dashboard's
  admin **⟳ Refresh data** button.

The data writes to R2; both services then read the same dataset.

---

## 7. Daily auto-refresh (optional)

Set `ANALYSER_AUTO_REFRESH=1` on the service. `server-analyser.js` then runs a
full refresh ~1 minute after boot and every 24h after — no external cron needed.
Leave it off if you'd rather refresh by hand.

---

## 8. How access works on the live site

- A visitor opens the URL → the page asks for a **password**.
- The **view** password lets them see everything (read-only).
- Your **admin** password additionally shows the **⟳ Refresh data** button.
- Rotate access anytime by changing `ANALYSER_PASSWORD` in Variables (redeploys,
  old password stops working).

---

## 9. Updating

Both services auto-deploy on push to `main`. A change to `forecast-analysis.html`
or the analyser engine ships to the public site on the next deploy. No separate
build step — same repo, same commits.

---

## Troubleshooting

- **Page loads but says "No dataset yet"** → run a refresh (step 6).
- **"Refresh disabled" message** → `ANALYSER_ADMIN_PASSWORD` isn't set on this
  service.
- **Build runs the Python bots / crashes** → the Custom Start Command (step 3)
  isn't set to `node server-analyser.js`.
- **Calibration / Volatility tabs say "needs a fresh refresh"** → the stored data
  predates those fields; run one refresh.

---

*The standalone service is `server-analyser.js`; it mounts the same routes as the
main app via `js/analyserRoutes.js`, so the two can never drift.*

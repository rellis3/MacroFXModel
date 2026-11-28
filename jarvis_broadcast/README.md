# Jarvis morning broadcast → YouTube (unlisted), daily from the laptop

Every weekday at **07:00 UK** the laptop:

1. opens the desk site in a real Chrome window, parked off-screen;
2. plays Jarvis's **MORNING BROADCAST** in the SHORT length, in portrait;
3. records it as a **1080×1920 MP4 with the voice**;
4. uploads it to your YouTube channel as **unlisted**.

The link lands in `out\last_run.json` and `out\run.log`, and you share it yourself.

It runs at 07:00 so it comes **after the 06:30 OI pull** (`oi_recon\run_daily.bat`). That way the gamma views carry today's option books.

## How it records (and why the sound is reliable)

| | How | Why |
|---|---|---|
| Browser | Real Chrome, your saved login profile, window off-screen (same as the CME pull in `oi_recon`) | The site is owner-only, and a real window uses the GPU, so the 3D views run smoothly |
| Picture | Chrome's own frame feed (DevTools screencast), each frame time-stamped | No "share this tab" prompt to click |
| Sound | Jarvis plays his voice and sound effects through one audio bus inside the page and records it there | No sound card, Stereo Mix or "share tab audio" tick needed. It records even with the laptop muted |
| Mixing | ffmpeg (bundled through `imageio-ffmpeg`) lines up picture and sound by their timestamps; H.264 + AAC | |
| Safety | A recording whose loudest moment is near silence is **not uploaded**; the log says why | The voice must be on it |

**Frame by frame (both runs, from 24 Nov 2026).** Recording live drops frames whenever the laptop is busy (short freezes at the heavy 3D changes). The morning run now records frame by frame instead:
- `vclock.js` is loaded before the page; just before the broadcast the page's clock is frozen and moved on 1/30 s at a time, with a screenshot after each step;
- timers, animations and the audio clock all follow it, so every frame is complete however slow the laptop is;
- the sound is rendered at the end, in step with the frames, and the server voice is asked for at the broadcast's speed (pitch unchanged).

It takes about 20-30 minutes to capture plus about 2 to encode, so the 07:00 video is up by about 07:30. Frame by frame asks for a fuller short (about 2 min 45 s), since it has no waits between lines. `--live` records the old way. The evening run (21:00) records frame by frame too, so it is up by about 21:30.

**SHORT length.** The broadcast keeps its lines short and drops the least essential segments, so the video stays under YouTube's 3-minute Shorts limit:
- drop order (least useful first): the macro, currencies, rates, positioning, volatility;
- Markets, The Chain and The Day Ahead always stay.

A test run came out at 2 min 56 s before the budget was tightened; it now aims for about 2.5 minutes. If a video ever runs over 3 minutes, it still uploads, but YouTube files it as a normal video rather than a Short.

## One-off setup (about 20 minutes)

### 1. Python packages (the laptop already has Python and Playwright for the CME pull)

```
cd C:\...\MacroFXModel\jarvis_broadcast
pip install -r requirements.txt
```

### 2. Log the recorder's browser into the desk site

```
python record_broadcast.py --login
```

A Chrome window opens. Log in as the owner and wait for the Desk Terminal to load, then close the window. The login is saved in `jarvis_broadcast\.profile` (git-ignored) and reused every morning.

### 3. A Google Cloud project for YouTube uploads

1. Go to https://console.cloud.google.com/ and create a project, e.g. **Jarvis Broadcast**.
2. Open **APIs & Services → Library**, find **YouTube Data API v3**, and click **Enable**.
3. Open **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name: anything, e.g. Jarvis Broadcast. Add your email.
   - Scopes: add `.../auth/youtube.upload` (upload only: it can't read, edit or delete anything else).
   - Test users: add the Google account that owns the YouTube channel.
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**.
   - **Download JSON** and save it as `jarvis_broadcast\client_secret.json` (git-ignored).
5. Sign in once:

   ```
   python record_broadcast.py --youtube-auth
   ```

   A browser opens. Pick your channel's account and allow the upload permission. Google will warn that the app is unverified, because it's your own app: choose **Advanced → Go to Jarvis Broadcast**. This saves `token.json` (git-ignored).

### 4. Stop the sign-in expiring every 7 days

While the consent screen is in **Testing**, Google expires the sign-in after 7 days, and the job's log will say "YouTube sign-in missing or expired". To stop that:

1. **OAuth consent screen → Publish app** (status "In production").
2. Run `--youtube-auth` once more.

Upload is a "sensitive" permission, so Google may ask you to verify the app. For a personal app used only by you, you can keep using it unverified, clicking through the warning once at sign-in. Otherwise, re-run `--youtube-auth` weekly.

**About privacy.** For API projects created since 2020 that Google hasn't audited, YouTube has at times locked uploads to **private** until the project passes a compliance audit.
- Google's current docs say this no longer applies, but reports vary.
- If a video arrives as private: open it in YouTube Studio, set it to Unlisted (one click), and consider requesting the audit (Google's "YouTube API Services - Audit and Quota Extension" form).
- Quota is not an issue: one upload a day uses about 1,600 of the default 10,000 daily units.

### 5. Try it with the window visible, without uploading

```
python record_broadcast.py --no-upload --show
```

Watch the broadcast play. When it finishes, the MP4 is in `out\<date>_<time>\`. Check that you can hear the voice, then do a real run:

```
python record_broadcast.py
```

The unlisted link appears in the output and in `out\last_run.json`.

### 6. Schedule it: Task Scheduler, 07:00 weekdays

Create a task the same way as the OI pull:

- **Program/script:** `C:\...\MacroFXModel\jarvis_broadcast\run_daily.bat`
- **Start in:** `C:\...\MacroFXModel\jarvis_broadcast`
- **Trigger:** daily at **07:00**, Monday to Friday.
- **Run only when user is logged on:** yes. It needs the desktop to draw the browser window.
- **Conditions:** tick **Wake the computer to run this task**, and untick "Start only if on AC power".
- **Settings:** tick **Run task as soon as possible after a scheduled start is missed**.

## Options

| Flag | Default | |
|---|---|---|
| `--len short\|quick\|full` | `short` | `short` stays under 3 min (a Short); `quick`/`full` as in the Jarvis panel |
| `--voice server\|kokoro` | `server` | `server` = the site's voice (ElevenLabs with a key, else the free British neural voice). `kokoro` = the open-source in-browser voice; it needs a fast machine and waits up to 3 min for the model to load |
| `--no-upload` | | record and encode only |
| `--show` | | keep the browser window on screen |
| `--base URL` | the production site | or set `JARVIS_SITE` |

Environment overrides, for unusual machines only:
- `JARVIS_CHROME`: a Chrome executable path.
- `JARVIS_CHROME_ARGS`: extra Chrome flags, e.g. `--use-angle=swiftshader` on a PC with no working GPU.
- `JARVIS_PROFILE`: the profile folder.

## The Telegram note, the extra programmes and the checks (27 Nov 2026)

### The Telegram note

When a video has uploaded, the job tells the desk server (`helix_notify.py` → `POST /api/helix/broadcast-published`). The **server** sends the note; the laptop never talks to Telegram. A failed run sends a short failure note the same way (`/api/helix/broadcast-failed`). The note is:

```
H.E.L.I.X. · Morning briefing is up
H.E.L.I.X. Morning · Gold runs 2.4 times its usual move · Fri 27 Nov
https://youtu.be/<id>
4 min 31 s · unlisted
```

- It goes out under its own switch, **helixBroadcast** in ⚙ Alerts (on by default). Each video id is sent once, however often the laptop retries.
- Auth is the site's laptop-push rule: the `X-Auth-Token` header carries `KV_WRITE_SECRET`. The job reads it from the environment, or from `jarvis_broadcast\push_secret.txt` (git-ignored). The server checks it only when the variable is set there. **Set the same `KV_WRITE_SECRET` on Railway and on the laptop**; the podcast upload refuses without it.
- A note that cannot be sent is logged and never fails the run (the video is up anyway).
- Helix lists what was published under the briefing panel (`GET /api/helix/broadcasts`).

### The extra programmes

| Programme | When | How |
|---|---|---|
| **Short** (45-60 s) | after each morning upload | The wide video's opening (title, headline, lead), reframed to 1080×1920 over a blurred copy. Uploaded as a Short. `--no-short` skips it |
| **Podcast episode** | after each morning, evening, weekly and special upload | The loudnormed sound as an MP3, uploaded to the server (R2) and listed in a private RSS feed at `/api/helix/podcast/<key>/feed.xml` (the address is on the briefing panel). `--no-podcast` skips it |
| **Weekly recap** | Fridays 22:00, task **Helix Weekly Recap** | **After** the Friday evening briefing, which still goes out at 21:00. The evening look-back with the 5-day chain, its own title card, opener and sign-off. It queues behind the evening run if that is still recording |
| **Release special** | task **Helix Release Special**, every 10 min on weekdays 07:00-22:30 | It exits at once unless a rank-3 release (payrolls, CPI, the Fed's or another central bank's rate decision, from the same ForexFactory week the evening briefing uses) printed 30-80 min ago and has no special yet. One short wide special per release |

`setup_tasks.ps1` registers the three new tasks (Weekly Recap, Release Special, Upload Retry). It only adds tasks that are missing and never touches the existing ones: `powershell -ExecutionPolicy Bypass -File setup_tasks.ps1 -WhatIf` shows what it would do.

YouTube quota: each upload costs about 1,600 of the 10,000 daily units, captions 400, and a thumbnail 50. A Friday with one special uses about 9,800, so a second special that day would run out of quota: its upload fails and goes into the retry queue for the next day.

### The checks before upload

- **Every line voiced.** Every line is rendered before going on air, and the run stops if one cannot be. The page then counts the voiced lines, and anything under 100% is not uploaded. The old -50 dB check passed on the drone alone.
- **Time window.** Morning runs from 06:45 to 11:30, evening and weekly from 18:00 to 23:59, and specials from 07:00 to 22:30. A late or missed run is skipped, never recorded under the wrong name; `--force` overrides this.
- **Loudness.** A limiter sits on the page's sound bus. The encoder then runs a two-pass `loudnorm` to -14 LUFS and -1 dBTP. The drone ducks about 8 dB under the voice.
- **Picture.** `freezedetect` refuses a picture stuck for 20 s; `blackdetect` refuses a video that is 25% black.
- **Retry.** A failed upload goes into `out\upload_queue.json`. Task **Helix Upload Retry** retries it every 2 h with back-off. `--upload-only DIR` uploads one folder by hand.
- **Laptop awake.** The laptop is kept awake for the run. In the morning the job waits until the 06:30 desk-run launcher has finished with the browser profile.

### The YouTube text

- **Title:** the title carries the headline.
- **Tags:** from the markets the programme named.
- **Description:** chapters from the segment times (the "N s · voice" line is gone).
- **Thumbnail:** the headline card. YouTube needs the channel phone-verified for custom thumbnails.
- **Captions:** an `.srt` made from the script timings.
  - Captions need a second, optional sign-in: `python record_broadcast.py --youtube-auth-captions`, which saves `token_captions.json` (git-ignored).
  - In the Google Cloud consent screen, add the scope `.../auth/youtube.force-ssl` first.
  - Without it, captions are skipped and nothing else changes.

### Voice

- **ElevenLabs speed and context.** ElevenLabs now gets the broadcast's speed (`voice_settings.speed`), so its clips are no longer sped up and pitched up in the browser. It also gets the lines either side, for a natural run between them.
- **Pronunciation dictionary.** Optional: set `JARVIS_ELEVEN_DICT=<dictionary id>:<version id>`.
- **Day budget.** If the ElevenLabs budget left today is less than the script, the whole programme uses the free voice. It never switches voice halfway.
- **Desk shorthand.** It is read out the same way for every voice, for example EURUSD as "euro dollar", bp as "basis points", 2s10s as "twos tens", and 1.2M as "1.2 million".

`python record_broadcast.py --dry-run` runs a stand-in capture through every step after recording, with nothing uploaded or sent.

## Files

- `record_broadcast.py`: the job.
- `broadcast_core.py`: pure helpers (frame timing, silence check, titles), tested in `test_broadcast_core.py`.
- `youtube_upload.py`: the upload (resumable, retries on Google 5xx errors).
- `run_daily.bat`: what Task Scheduler runs.
- `helix_notify.py`: tells the server after an upload (the server sends the Telegram note). `special_check.py`: the release-special launcher.
- `backfill_media.py`: one-off, puts the uploads from before the server's published list (out/run.log, out/*/meta.json, optionally the uploads playlist with `--youtube`) into the MEDIA section (`POST /api/helix/broadcasts/backfill`, no Telegram). Run `--dry-run` first; sending needs KV_WRITE_SECRET (or push_secret.txt) set on both sides. Tests: `test_backfill_media.py`.
- `run_weekly.bat`, `run_special_check.bat`, `run_upload_retry.bat`, `setup_tasks.ps1`: the extra programmes' launchers and their task setup.
- Git-ignored: `.profile/`, `out/`, `client_secret.json`, `token.json`. The job keeps the last 7 days of MP4s and deletes the frames once encoded.

Everything in the video is **description only**, like the rest of Jarvis. Each upload's description says so.

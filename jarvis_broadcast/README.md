# Jarvis morning broadcast → YouTube (unlisted), daily from the laptop

Every weekday at **07:15 UK** the laptop:

1. opens the desk site in a real Chrome window, parked off-screen;
2. plays Jarvis's **MORNING BROADCAST** in the SHORT length, in portrait;
3. records it as a **1080×1920 MP4 with the voice**;
4. uploads it to your YouTube channel as **unlisted**.

The link lands in `out\last_run.json` and `out\run.log`, and you share it yourself.

It runs at 07:15 so it comes **after the 06:30 OI pull** (`oi_recon\run_daily.bat`). That way the gamma views carry today's option books.

## How it records (and why the sound is reliable)

| | How | Why |
|---|---|---|
| Browser | Real Chrome, your saved login profile, window off-screen (same as the CME pull in `oi_recon`) | The site is owner-only, and a real window uses the GPU, so the 3D views run smoothly |
| Picture | Chrome's own frame feed (DevTools screencast), each frame time-stamped | No "share this tab" prompt to click |
| Sound | Jarvis plays his voice and sound effects through one audio bus inside the page and records it there | No sound card, Stereo Mix or "share tab audio" tick needed. It records even with the laptop muted |
| Mixing | ffmpeg (bundled through `imageio-ffmpeg`) lines up picture and sound by their timestamps; H.264 + AAC | |
| Safety | A recording whose loudest moment is near silence is **not uploaded**; the log says why | The voice must be on it |

**SHORT length.** The broadcast keeps its lines short and drops the least essential segments, so the video stays under YouTube's 3-minute Shorts limit:
- drop order: volatility, then positioning, currencies, the macro, rates;
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

### 6. Schedule it: Task Scheduler, 07:15 weekdays

Create a task the same way as the OI pull:

- **Program/script:** `C:\...\MacroFXModel\jarvis_broadcast\run_daily.bat`
- **Start in:** `C:\...\MacroFXModel\jarvis_broadcast`
- **Trigger:** daily at **07:15**, Monday to Friday.
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

## Files

- `record_broadcast.py`: the job.
- `broadcast_core.py`: pure helpers (frame timing, silence check, titles), tested in `test_broadcast_core.py`.
- `youtube_upload.py`: the upload (resumable, retries on Google 5xx errors).
- `run_daily.bat`: what Task Scheduler runs.
- Git-ignored: `.profile/`, `out/`, `client_secret.json`, `token.json`. The job keeps the last 7 days of MP4s and deletes the frames once encoded.

Everything in the video is **description only**, like the rest of Jarvis. Each upload's description says so.

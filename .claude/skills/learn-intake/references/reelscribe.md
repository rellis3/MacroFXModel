# Fetching transcripts with ReelScribe

ReelScribe is a claude.ai connector (`mcp__claude_ai_Reelscribr__*`). In Claude Code its tools are deferred: load them with
`ToolSearch` `select:mcp__claude_ai_Reelscribr__search_transcriptions,mcp__claude_ai_Reelscribr__transcribe_video,mcp__claude_ai_Reelscribr__get_transcription,mcp__claude_ai_Reelscribr__list_transcriptions,mcp__claude_ai_Reelscribr__get_credits`.
The website server can't call it; intake runs in a session.

Supported: YouTube (videos, Shorts), Instagram, TikTok, Facebook, Threads, LinkedIn, X, Bluesky. **Not** Discord
attachments or private files. For those, the owner pastes the text, or a local transcription is needed (ask).

## Cost and the spend rule

1 credit per *new* video; an existing transcript is reused for free. Retention is unlimited while the subscription is active.
1. `search_transcriptions` for each URL first. Found means use it, at no cost.
2. Count the new ones and check `get_credits`. **Up to 25 new: proceed and say the count.** More than 25, or under
   100 credits left: give the count and ask first.
3. Submit with `transcribe_video`, one call per URL. `transcribe_bulk` needs an API key or batch consent this
   account may not have; try it only for big backfills, and if it's refused fall back to single calls (the refusal costs nothing).
4. A failed job: report it. **Don't retry without asking** (owner rule: paid APIs stop on failure).

## Reading results

- `list_transcriptions` returns previews only (500 chars). Always `get_transcription` by `id` for the full text.
- Large results get saved to a tool-results file. Copy that to `education/intake/raw/...` and read it in chunks; don't paste it into context whole.
- Useful fields: `owner` (creator handle), `caption` (often holds the video title), `duration`, `createdAt`
  (when *we* transcribed it, not when the video was made), `url`.
- Jobs are async: `transcribe_video` returns a `requestId`. Poll `get_transcription` with `requestId`; Shorts take
  seconds, an hour-long video can take minutes.

## Creator handles seen in the library (2026-11-12, 99 items)

Nicholas Crown / nicholascrown (38) · Jessinskip (24) · QuantGuild / quantguild (15) · Marilee Cordova (3) · Aleks Rosme (3)
· QuantitativeAndMacroInsights (1) · Jay-ColezTrades (1) · others singletons. See `sources.md` for their lanes.

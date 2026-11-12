# Research rooms (built 2026-11-12)

*Owner direction 2026-11-11/12: research should feel like a Teams-style conversation at one table, not a board you drag cards across. Built on the existing research cases, so the Desk Office research tab keeps working.*

## What it is
`research.html`, in the Desk Terminal's look. Each idea is a **room**: a research case (KV `research_cases`) with a `room` block (`js/researchRoom.js`).

- **Rooms list**: every case, sorted by who it waits on (*waiting on you*, *the team is working*, *parked and closed*), with the seats that have spoken, the last line said and a row of progress dots. Older cases show here too.
- **One room**: the table on the left (the idea in the middle, the seats around it; tap a seat to read only that voice), the conversation on the right, and a reply box with *To: Everyone / Quant / Macro / Flow*, **Send** (or **Start the discussion**), **Ask the Head now**, **Let them discuss** and **Park**. The stage line across the top (Brief, Papers, Discussion, Head, Test, Verdict) follows what happened; nobody moves anything.
- **New idea**: pick the shape of the question (optional), write the idea in your own words, **Translate** (the brief translator, one capped call), fix the brief in place (title, one-line idea, lags, splits), see what is already on file, then **Open the room**. Or open a room from the plain words without translating. The ROE page's New idea tab has the same Go button.

## Who sits at the table
| Seat | When it speaks | Cost |
|---|---|---|
| Translator | when you translate the idea (its brief is the room's question) | 1 call, cap 100 (`research_brief_v1`) |
| Already on file | when the room opens: the closest Evidence Book entries | free (code) |
| Librarian | when the room opens: the closest papers in the library (rule-based) | free (code) |
| Quant, Macro, Flow (core) | each round you start; **they take turns**, each reading the ones before it in the same round, plus the room's remarks | the usual research-pod calls (`research-pod`) |
| Guests: Vol & options, Rates & curves, Skeptic, Theory desk | suggested by code from the topic, at most 2 per room; join only when you accept; speak when you press **Ask** or **Let them discuss** | 1 small call each (`research-room`), cap 300 (`research_room_talk_v1`) |
| Head of Research | only when you press **Ask the Head now**; reads the whole room including the remarks | the usual Head review (`research-head`) |

- **Bench**: any one or two of Quant, Macro, Flow can be benched for a room; they stay at the table, greyed out, and skip rounds and discussion until brought back.
- **Let them discuss**: each active researcher and each guest gives one short remark (at most three sentences) or passes, in turn, each reading the remarks before it. At most 5 voices a press. The remarks go into every later prompt in the room.
- Nothing runs on its own. Every model call starts with a button; the caps are reserved before each call and fail closed.

## Routes (all behind the dashboard login; POSTs same-origin)
`GET /api/research-room/list`, `GET /api/research-room?id=`, `GET /api/research-room/onfile?q=`, `POST /api/research-room/open`, `POST /api/research-room/seat`, `POST /api/research-room/talk`. Rounds, the Head and parking use the existing `/api/research-pod/case/{reply,review,status}`.

## Not built yet (next)
1. The librarian as a model-picked list when the room opens (today: rule-based; the researchers' own library context still follows the `libraryContext` switch).
2. Programme mode: one goal ("a 6-layer process") split into one room per layer, linked.
3. Concept cards (Theory Lab and C.OG education) in the researchers' reading.
4. Test results posted back into the room as a message, with the count of changes tried on the idea.
5. Pictures (screenshots) attached to a room message from this page (the case routes already accept them).

## The research hub (2026-11-12): one front door, two ways in

Owner: "attack it from both sides": on a phone, the research-director skill; at the desk, the rooms. Both read and write one shelf.

research.html opens on **Home**, the loop: ① In → ② Ask → ③ Talk → ④ Test → ⑤ Known, with ⑥ Shelf underneath feeding every step. Every count is live (`GET /api/research-hub`, js/researchHub.js `hubMap`); a source that cannot be read shows a dash, never 0.

| Step | What sits there |
|---|---|
| ① In | **Drop in** tab: links, videos, pictures, text (KV `research_intake_queue_v1`, free, no model call); PDFs go straight to the library backlog (`/api/research-pod/upload`) |
| ② Ask | the Director's agenda cards (parsed from `.claude/skills/research-director/agendas/*.md`, each with **Open a room**), ROE scanner questions, New idea |
| ③ Talk | the rooms. A new room's librarian now also posts the related open agenda cards and intake notes (`room.reading`, code, free), and every prompt in the room reads them |
| ④ Test | the register's claimed/registered/running rows; links to Quick test and Build & validate (Desk Office) |
| ⑤ Known | Evidence Book count and the latest verdicts; Research Log |
| ⑥ Shelf | Library 🔒 (link only: it keeps its own password), concept cards, method lessons, Theory Lab, C.OG education |

**The Claude side** (`.claude/skills/research-director/scripts/shelf.mjs`, bearer `RESEARCH_READ_TOKEN` or the laptop's `ROE_PUSH_TOKEN`; unset = refused):
`papers "<q>"` (library desk notes), `paper <id> --full`, `rooms` (what the rooms said, the Head's verdict), `queue`, `image <id> <file>`, `done <id> --path <note>`.
The research-director skill reads papers and rooms at step 1; learn-intake empties the drop box ("process the research inbox") and marks each item done.

Retired: the Desk Terminal's Research tab is now a link to the hub (its renderer in js/terminal/terminalTabs.js is unreachable and goes with step 3).

### Next (step 3, needs the owner's sign-off)
Move the Desk Office Research tab's Ideas & cases and Build & validate tools into the hub, then retire that tab. Its Forecasts and Fleet & allocation sub-tabs are not research and need their own home first.
To use the shelf from a phone/cloud session: set `RESEARCH_READ_TOKEN` (24+ characters) on Railway and in the cloud environment's settings.

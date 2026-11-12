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

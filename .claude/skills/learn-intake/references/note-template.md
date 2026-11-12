# Note template

File: `education/intake/<lane>/<source>/<YYYY-MM-DD>-<slug>.md`. The date is the day we processed it. If the video's
own date is known, add it under "Recorded".

```markdown
# <video title or a short descriptive title>

| | |
|---|---|
| Lane / source | technical / quant-guild |
| Speaker(s) | QG = Roman Paolucci (tag every claim) |
| URL | <url> |
| ReelScribe id | <id> · <duration> |
| Recorded | <date if known, else "unknown"> |
| Processed | <YYYY-MM-DD> |

## Lesson
Two to five sentences: what is being taught, in plain words. Write it so the owner could explain it to someone else.

## Approach
How the speaker gets from question to answer. Use the bullets that apply:
- **Question**: how the problem is framed (what's measured, over what horizon, against what benchmark)
- **Evidence**: what data or test they lean on, and how they guard against fooling themselves
- **Kill rule**: what would make them drop it
- **Habit**: a repeatable way of working (journaling, sizing, a check they always run)

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "<short verbatim or close quote>" (QG) | method / mechanism / trading / call | ON FILE: `<id>` NULL. / PARTLY: differs in … / UNTESTED |

## What we could learn
Where this differs from how this desk works now. Each point tagged ALREADY DO / DO WORSE / DON'T DO, with the
file or skill it touches. The point is moved to `education/RESEARCH_METHOD_LESSONS.md` (method) or carded (idea).

## Research ideas
Question cards, written as in research-director's `question-card.md`, compactly: variable · condition · horizons ·
noise threshold · benchmark · what the answer would change. Name the agenda each was added to, or write "not carded: <why>".

## Quotes
Up to ~5 short verbatim lines worth keeping, with timestamps if the transcript has them. The full text stays in raw/.
```

Keep a note under ~150 lines (cog: no limit). Leave out what isn't there: a hype Short with one claim gets a short note.

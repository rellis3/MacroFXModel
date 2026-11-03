# The question card

Every question on an agenda is one card. The statement is in C.OG's register; everything under it is ours.

```markdown
### Q<n>. <short name> — score <total>/15

> <The question, 2-5 lines, in his register: build → condition → horizons → noise threshold → distribution → benchmark.
> Leave open what the sweep decides.>

| | |
|---|---|
| Construct | the derived variable(s), from which series, knowable when |
| Condition | the state / extreme / regime / bucket, defined relative to its own history where possible |
| Horizons | the family swept (e.g. 1 session, 3, 5, 10, 20) |
| Noise threshold | how it is found (placebo distribution, shifted labels, the control's spread) |
| Outcome distribution | what is read: DR, MAE/MFE, paths, hit rate, R, across the horizon family |
| Benchmark / control / mirror | buy-and-hold, the shipped line, the disagreeing instrument, the opposite sign |
| Mechanism | who is forced to trade and why it should persist (one or two lines) |
| Builds on | ledger ids and what each says (honest numbers) |
| Data & power | data we have (dates, n), rough MDE, testable now / from <date> |
| If yes → | what changes (line, bot, page, next question) |
| If no → | what changes, and what stops being said |
| Falsifier | the result that kills it |
```

## Screening and ranking

Score each 0-3; the total ranks the agenda. A card with **Answerable = 0** goes to "Parked" with the date or n that
would make it answerable.

| Criterion | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **Value of the answer** | changes nothing | changes a page's wording | changes the next study | changes a live line, gate or size |
| **Answerable now** | no data / data arrives later | data exists, power unknown | powered for a large effect only | powered for the effect that would matter |
| **Mechanism** | none named | plausible story | named mechanism, untested | named mechanism with supporting evidence in the book |
| **Novelty vs the book** | re-asks a banked null | variant of a banked result | new cut of a known effect | a question the book hasn't touched |
| **Cost** | needs new data bought or built | days of build | a script on existing data | a re-score of existing outputs |

Tie-break: prefer the question whose **"no" would also change something**. A question that only matters if it says
yes is half a question.

## Cutting

Cut a candidate when:
- it re-asks a banked null with the same mechanism;
- it is a direction question in a domain with no validated direction evidence and no new mechanism (state why if it
  stays);
- its value score is 0;
- it is a parameter sweep pretending to be a question (fold it into another card's horizon family).

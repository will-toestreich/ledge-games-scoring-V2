# The Ledge Games — Scoring Rules Specification

This is the codified rules spec the scoring engine implements. It merges the
official rules document with rulings made on 2026-07-18. Items marked
**RULING NEEDED** are open questions for the rules committee — the engine uses
the stated default until resolved.

## Divisions

| | Men's | Women's | Mentors |
|---|---|---|---|
| Rounds per event | 4 | 3 | 3 |
| Cut after Round 1 | top ½ of field | top ½ of field | no cuts |
| Cut after Round 2 | top 10 | top 3 (finals) | — |
| Cut after Round 3 | top 3 (finals) | — | — |
| Events | all 6 | all 6 | 4 (no Caber, no Keg) |
| Finals scores reset | yes | yes | n/a |

- **Bib numbering**: Men's bibs start at **#1**, Women's at **#101**, Mentors
  at **#151**. (Historical note: the imported 2025 season used 91–100 for
  Mentors; division assignment is stored per competitor, not derived from bib.)
- **"Half" rounds up** (75 competitors → top 38 advance).
- **Cut-line ties: everyone tied at the line advances** ("one tie, all tie"),
  including a tie for the last finals spot (4 may compete in a final).
  One-tie-all-tie is **not** in effect inside the finals.

## Competition points (per event)

- Event finish position = competition points (1st = 1 pt, 12th = 12 pts).
- **Lowest cumulative total across the division's events wins overall.**
- Ties share the better rank, golf-style: two tied for 5th both get 5, next
  finisher gets 7. A tie for 2nd/3rd in a finals: both get 2.
- **Finish order is stratified by how far you advanced.** Finalists take the
  top places (ranked by finals-round score — finals scores reset); those cut
  after the second-to-last round come next (ranked by their cumulative score
  at elimination); and so on down to those cut after Round 1. **A competitor
  cut in an earlier round can never outrank someone who advanced further**,
  regardless of scores.
- A competitor who misses a round they were eligible for ranks below everyone
  in their stratum who completed it.

## No-shows, skips, scratches

- **Day no-show** (determined at morning registration, the "scratch" flag):
  removed from the field entirely — not on the scoreboard, not ranked, not
  counted in field size.
- **Skipping/scratching a single event**: that competitor receives
  **field size + 1** competition points for that event (field size = division
  members not marked as day no-shows; the check-in flag is registration-desk
  workflow and does not affect eligibility or field size). All skippers share
  that value.
- Participating but scoring zero ranks last **among participants** — better
  than skipping.

## Overall tiebreaker

If tied for the division win (Man/Woman/Mentor of The Ledge): **1 arrow each,
closest to bullseye.** The app flags "tiebreaker required" — the arrow-off is
resolved on the field and recorded as a manual rank adjustment.

---

## Events

### Caber Toss (Men's, Women's — no Mentors)

- Caber must rotate 180° end-over-end to score.
- Clock scoring: 12:00 = 10 pts · 11 & 1 = 9 · 10 & 2 = 8 · 9 & 3 = 7 ·
  **any successful flip outside 9–3 = 6** · failed flip = 0.
- 2 attempts per round; **round score = the better attempt**. A competitor
  happy with their first flip may **pass** the second — the scorer records
  the pass so the round counts as complete and nobody waits on them.
- Cumulative carries across rounds; **finals reset**.
- Event tiebreaker: (1) bigger caber, (2) total score of multiple attempts,
  (3) narrowed stakes.

### Keg Toss (Men's, Women's — no Mentors)

- **No rounds — high-jump/ladder format.** Bar starts at 10 ft, rises in 1-ft
  increments. The division-level round cuts do not apply; the ladder cuts the
  field naturally.
- 2 attempts at the current bar height. Clear → advance to next height.
  Miss both → out; **result = highest height cleared**.
- **Passing allowed** (must report to the keg scorer). If you pass ahead and
  never clear your chosen entry height, your result drops to the highest
  height you actually cleared — 0 if none. Zero-height participants still
  rank as participants (last), ahead of event skippers.
- Keg must clear the bar without knocking it to the ground.
- Event tiebreaker: keep tossing.

### Archery (all divisions)

- 5 arrows per round, every round. Gold 5 · Red 4 · Blue 3 · Black 2 ·
  White 1 · miss 0. Arrow touching a ring line scores the higher ring.
- Round score = total of 5 arrows (max 25). Cumulative carries;
  **finals reset (Men's & Women's only)** — Mentors rank on 3-round cumulative.
- Event tiebreaker: 1 arrow, closest to center.

### Axe Throw (all divisions)

- Bullseye 3 · White ring 2 · Red ring 1 · miss 0. Embedded axe touching a
  ring line scores the higher ring.
- Regular rounds: 2 sets of 3 axes; round score = sum of both sets (max 18).
- Finals (M/W): 1 set of 5 axes (max 15). Cumulative carries; finals reset
  (M/W only). Mentors: 3 rounds of 2×3, cumulative.
- Event tiebreaker: 1 set of 5 axes, highest total.

### Hammer Toss (all divisions)

- Men 10 lb, Women/Mentors 8 lb. Thrown from behind the line; score requires
  knocking a cross-section off the block, breaking part of it, or tipping the
  block. Only the log set directly in front of your lane counts.
- Rounds 1–2: logs in a "V" — front log 10 pts, back logs 20 pts.
  2 sets of 2 throws; round score = sum of both sets.
- Later rounds (Men's R3+R4, Women's R3, Mentors R3): 1 set of 3 throws, all
  logs on the back row, **20 pts each** (max 60).
- Cumulative carries; finals reset (M/W only). Mentors: 3-round cumulative.
- Event tiebreaker: rethrow 3 logs at the back row. One-tie-all-tie not in
  effect for finals.

### Speed Chop (all divisions)

- Timed, **lower is better**. Competitors select wood, start/stop own time.
- Must remove a piece completely off the primary piece (judges' discretion).
- **Axe must end in the designated area: +10-second penalty** (per infraction).
- Regular rounds: 3 pieces. Finals (M/W): 5 pieces. Cumulative (total time)
  carries; finals reset (M/W only). Mentors: lowest 3-round total time.
- **RULING NEEDED — event tiebreaker.** The official rules define none.
  Default: tied times share competition points golf-style (no chop-off).

---

## Rulings log (2026-07-18)

1. Stratified finish order confirmed; round reached always trumps score.
2. Keg = ladder format, no rounds; result = highest height cleared; pass-risk
   rule as described above.
3. One-tie-all-tie at every cut line, all events (not within finals).
4. Odd-size field halves round up.
5. Day no-shows excluded from field entirely; single-event skips = field+1.
6. Caber flips landing outside 9–3 = 6 pts.
7. Hammer later rounds: all back-row logs 20 pts.
8. Finals tie for 2nd/3rd: both get 2 competition points.
9. Mentors compete in Archery, Axe Throw, Hammer Toss, Speed Chop only.

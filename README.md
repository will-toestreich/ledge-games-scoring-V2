# The Ledge Games — Scoring System

Live competition scoring for **The Ledge Games**, an annual lumberjack-games
competition: Axe Throw, Keg Toss, Caber Toss, Archery, Speed Chop, and Hammer
Toss across Men's, Women's, and Mentors divisions.

Three surfaces, one engine:

| Surface | Route | Who uses it |
|---|---|---|
| **Admin** | `/admin` | Event director: Mission Control (live ops), roster/registration, score corrections, seasons, settings |
| **Scoring** | `/score` | Field scorers (PIN-gated, phone-first): round-aware queues, per-event entry UIs, keg ladder console |
| **Scoreboard** | `/scoreboard` | The big TV: auto-scaling standings, live event progress, per-division boards |

## The scoring model

The official rules live in [docs/RULES.md](docs/RULES.md) and are implemented
by a **pure, config-driven engine** ([src/lib/scoring.ts](src/lib/scoring.ts),
33 unit tests):

- **Golf scoring**: event finish position = competition points; lowest total
  across events wins the division. Ties share rank (two tied for 5th → both
  get 5, next gets 7).
- **Round cuts**: Men's runs 4 rounds (cut to top ½, top 10, top 3 finals),
  Women's 3 (top ½, top 3), Mentors 3 with no cuts. Ties at a cut line all
  advance; "half" rounds up. Finals scores reset (M/W).
- **Stratified finish order**: how far you advanced always outranks raw score.
- **Keg Toss is a height ladder** (high-jump style): 2 attempts per bar
  height, clear to advance, pass at your own risk; result = highest cleared.
- **Set-by-set entry**: multi-attempt rounds (axe/hammer sets, caber flips)
  save one attempt at a time, matching how the field actually runs; a
  competitor can **pass** a caber flip they don't want to throw.
- Per-event skips score field-size + 1; day no-shows leave the field
  entirely; tied titles are resolved by a recorded archery arrow-off.

Every view — scoreboard, Mission Control, scorer queues — derives from the
same engine output, so they can never disagree.

## Mission Control

The event director's air-traffic-control view: who owes a score **right now**
(grouped by competitor, most-blocking first, filterable by event/division),
which rounds are complete and **ready to advance** (with the locked cut list,
finals highlighted), per-event **pace** (ahead/behind the median live event)
and **stall alarms**, plus arrow-off recording when a title ends tied.

## Data & seasons

- **One competition (season) is active at a time**; past seasons stay
  archived and browsable (Settings → Seasons). Starting a new season archives
  the current one. The scoreboard marks archived seasons "Final".
- Data currently persists to **browser localStorage** behind an async
  adapter ([src/data/db.ts](src/data/db.ts)) accessed only through TanStack
  Query hooks — the planned Supabase swap touches one file.
  **Until then, all data lives in one browser profile: use
  Settings → Data → Download backup early and often.** Restore replaces
  everything from a backup file.
- The **2025 season** ships as a built-in archive, imported from the original
  Google Sheets by [scripts/import-2025.mjs](scripts/import-2025.mjs) (raw
  CSVs in `scripts/data-2025/`).
- Roster tools: CSV import with preview/validation, walk-on entry with
  per-division bib blocks (Men's #1+, Women's #101+, Mentors #151+),
  full competitor editing.

## Stack

Vite 7 · React 19 · TypeScript · TanStack Router + Query · Tailwind 4 ·
Vitest · PWA (installable, offline app shell).

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine + import smoke tests
npm run build      # typecheck + production build (includes PWA)
node scripts/import-2025.mjs   # regenerate src/data/season-2025.json
```

Scorer PIN defaults to `1234` (Settings → Scorer PIN).

## Roadmap

1. **Supabase backend** — the multi-device unlock (today all devices sharing
   one competition must share one browser). Realtime scoreboard, offline
   mutation outbox, admin auth, audit log.
2. Printable cut sheets & final results for the awards ceremony.
3. Schedule-based pace targets (ahead/behind the clock, not just the median).

## Rules committee — open item

Speed Chop has no event-level tiebreaker in the official rules; the app
defaults to golf-style shared points (see docs/RULES.md).

// Deterministic demo data — same seed, same competition, every reload.
// Simulates a realistic mid-competition Saturday using the real engine for
// round advancement, so seeded round-2+ scores only exist for advancers.

import type { AttemptScore, Competitor, DivisionId, EventId, KegAttempt, Settings } from "@/lib/types";
import { divisions, getEvent } from "./competition-config";
import { computeEventResults, divisionField } from "@/lib/scoring";

// ─── Seeded RNG (mulberry32) ───────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0x1ed6e);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (p: number) => rng() < p;
const between = (lo: number, hi: number) => lo + rng() * (hi - lo);

// ─── Roster ────────────────────────────────────────────────

const mensFirstNames = [
  "Jake", "Hank", "Cole", "Wyatt", "Travis", "Cody", "Brett", "Dustin", "Grant", "Shane",
  "Kyle", "Derek", "Tyler", "Ryan", "Chase", "Blake", "Bryce", "Drew", "Nate", "Luke",
  "Jared", "Trent", "Mason", "Hunter", "Colton", "Gavin", "Dalton", "Brock", "Levi", "Tanner",
  "Brady", "Clay", "Wade", "Reid", "Zach", "Quinn", "Dean", "Vince", "Kirk", "Troy",
  "Mitch", "Kent", "Doug", "Cliff", "Ray", "Beau", "Holt", "Nash", "Penn", "Cruz",
  "Dane", "Rhett", "Slade", "Knox", "Gage", "Wes", "Neil", "Mark", "Todd", "Gus",
  "Finn", "Axel", "Jett", "Boone", "Bo", "Cal", "Ty", "Rex", "Ace", "Kit",
  "Russ", "Ward", "Heath", "Lane", "Vaughn",
];
const womensFirstNames = [
  "Brooke", "Sierra", "Dana", "Jess", "Kara", "Leah", "Paige", "Shay", "Tori", "Val",
  "Erin", "Dawn", "Faith", "Hope", "Jade", "Kate", "Lynn", "Mia", "Nell", "Rae",
  "Beth", "Cass", "Elle", "Gwen", "Iris", "Joy", "Kim", "Lark", "Mae", "Nora",
];
const mentorsFirstNames = ["Big Jim", "Ironwood Ed", "Old Tom", "Sawyer Pete"];
const lastNames = [
  "Birch", "Stone", "Creek", "Timber", "Ridge", "Pike", "Wolf", "Marsh", "Pine", "Hawk",
  "Blaze", "Forge", "Steele", "Grove", "Thorn", "Moss", "Vale", "Storm", "Clay", "Ash",
  "Colt", "Drake", "Flint", "Gale", "Hart", "Knox", "Lake", "Nash", "Oaks", "Reed",
  "Sage", "Wade", "York", "Dunn", "Hale", "Kane", "Lang", "Mill", "Peak", "Shaw",
  "Webb", "Voss", "Rowe", "Kern", "Dale", "Finn", "Grey", "Holt", "Judd", "Kirk",
  "Lund", "Mack", "Nunn", "Pace", "Rand", "Sims", "Tate", "Vane", "Watt", "Zane",
  "Berg", "Cain", "Doss", "Egan", "Foxx", "Goff", "Haas", "Ives", "Juhl", "Kerr",
  "Lowe", "Muir", "Nave", "Orr", "Pugh",
];
const hometowns = [
  "Minocqua, WI", "Eagle River, WI", "Hayward, WI", "Rhinelander, WI",
  "Wausau, WI", "Stevens Point, WI", "Merrill, WI", "Tomahawk, WI",
  "Antigo, WI", "Marshfield, WI", "Medford, WI", "Phillips, WI",
  "Park Falls, WI", "Hurley, WI", "Crandon, WI",
];
const nicknames = ["Axe", "Bear", "Bull", "Stump", "Iron", "Timber", "Blaze", "Storm"];
const shirtSizes = ["S", "M", "L", "XL", "2XL"];

function makeCompetitors(firstNames: string[], divisionId: DivisionId, bibStart: number): Competitor[] {
  return firstNames.map((firstName, i) => {
    const lastName = lastNames[i % lastNames.length];
    const registration = pick<Competitor["registration"]>(["paid", "paid", "paid", "cash", "cash", "sponsor", null]);
    return {
      id: `${divisionId}-${i + 1}`,
      divisionId,
      bibNumber: bibStart + i,
      firstName,
      lastName,
      nickname: chance(0.25) ? `"The ${pick(nicknames)}"` : null,
      hometown: chance(0.9) ? pick(hometowns) : null,
      email: `${firstName.toLowerCase().replace(/\s+/g, "")}${lastName.toLowerCase()}@email.com`,
      shirtSize: chance(0.85) ? pick(shirtSizes) : null,
      registration,
      paid: registration !== null && chance(0.9),
      checkedIn: registration !== null && chance(0.85),
      noShow: chance(0.05),
      eventSkips: chance(0.04) ? [pick<EventId>(["keg", "chop", "hammer"])] : [],
    };
  });
}

// ─── Score simulation ──────────────────────────────────────

/** Plausible attempt value for one entry field of an event round. */
function attemptValue(eventId: EventId, maxPerAttempt: number | undefined): { value: number; penalty: number } {
  switch (eventId) {
    case "caber":
      return { value: pick([0, 0, 6, 6, 7, 7, 7, 8, 8, 9, 10]), penalty: 0 };
    case "archery":
      return { value: Math.round(between(6, maxPerAttempt ?? 25)), penalty: 0 };
    case "axe":
      return { value: Math.round(between(0, maxPerAttempt ?? 9)), penalty: 0 };
    case "hammer":
      return { value: Math.min(pick([0, 10, 10, 20, 20, 30, 30, 40]), maxPerAttempt ?? 40), penalty: 0 };
    case "chop":
      return { value: Math.round(between(24, 75) * 10) / 10, penalty: chance(0.08) ? 10 : 0 };
    default:
      return { value: 0, penalty: 0 };
  }
}

function scoreRound(
  out: AttemptScore[],
  eventId: EventId,
  competitorIds: string[],
  round: number,
  coverage: number
) {
  const event = getEvent(eventId)!;
  for (const id of competitorIds) {
    if (!chance(coverage)) continue;
    const divisionId = id.split("-")[0] as DivisionId;
    const plan = event.divisions[divisionId];
    if (!plan || plan.rounds.length < round) continue;
    const rp = plan.rounds[round - 1];
    for (let a = 1; a <= rp.attempts; a++) {
      const { value, penalty } = attemptValue(eventId, rp.maxPerAttempt);
      out.push({
        id: `${id}:${eventId}:r${round}:a${a}`,
        competitorId: id,
        eventId,
        round,
        attempt: a,
        value,
        penalty,
      });
    }
  }
}

function simulateKeg(competitors: Competitor[]): KegAttempt[] {
  const out: KegAttempt[] = [];
  const event = getEvent("keg")!;
  const ladder = event.ladder!;
  for (const div of ["mens", "womens"] as DivisionId[]) {
    const field = divisionField(div, competitors).filter(
      (c) => !c.eventSkips.includes("keg") && chance(0.9) // a few haven't tossed yet
    );
    let alive = field.map((c) => c.id);
    let height = ladder.startHeight;
    // Run the ladder until a handful remain (mid-event snapshot)
    while (alive.length > 3 && height < ladder.startHeight + 8) {
      const nextAlive: string[] = [];
      for (const id of alive) {
        if (chance(0.05)) {
          out.push({ id: `${id}:keg:h${height}:a1`, competitorId: id, heightFt: height, attempt: 1, result: "pass" });
          nextAlive.push(id);
          continue;
        }
        const pClear = Math.max(0.08, 0.95 - (height - ladder.startHeight) * 0.16);
        if (chance(pClear)) {
          out.push({ id: `${id}:keg:h${height}:a1`, competitorId: id, heightFt: height, attempt: 1, result: "clear" });
          nextAlive.push(id);
        } else if (chance(pClear * 0.9)) {
          out.push({ id: `${id}:keg:h${height}:a1`, competitorId: id, heightFt: height, attempt: 1, result: "miss" });
          out.push({ id: `${id}:keg:h${height}:a2`, competitorId: id, heightFt: height, attempt: 2, result: "clear" });
          nextAlive.push(id);
        } else {
          out.push({ id: `${id}:keg:h${height}:a1`, competitorId: id, heightFt: height, attempt: 1, result: "miss" });
          out.push({ id: `${id}:keg:h${height}:a2`, competitorId: id, heightFt: height, attempt: 2, result: "miss" });
        }
      }
      alive = nextAlive;
      height += ladder.increment;
    }
  }
  return out;
}

// ─── Public seed ───────────────────────────────────────────

export interface SeedData {
  competitors: Competitor[];
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
  settings: Settings;
}

export function buildSeed(): SeedData {
  // Bib convention: Men's from #1, Women's from #101, Mentors from #151
  const competitors = [
    ...makeCompetitors(mensFirstNames, "mens", 1),
    ...makeCompetitors(womensFirstNames, "womens", 101),
    ...makeCompetitors(mentorsFirstNames, "mentors", 151),
  ];

  const scores: AttemptScore[] = [];

  // Mid-competition snapshot:
  // axe — round 1 complete everywhere, men's round 2 underway (advancers only)
  for (const div of divisions) {
    const field = divisionField(div.id, competitors);
    const ids = field.filter((c) => !c.eventSkips.includes("axe")).map((c) => c.id);
    scoreRound(scores, "axe", ids, 1, 1);
  }
  {
    const div = divisions.find((d) => d.id === "mens")!;
    const field = divisionField("mens", competitors);
    const res = computeEventResults({
      event: getEvent("axe")!,
      division: div,
      field,
      scores,
      kegAttempts: [],
    });
    scoreRound(scores, "axe", res.eligibleByRound[1] ?? [], 2, 0.6);
  }

  // archery — round 1 mostly scored
  for (const div of divisions) {
    const field = divisionField(div.id, competitors);
    scoreRound(scores, "archery", field.map((c) => c.id), 1, 0.75);
  }

  // caber (M/W only) — round 1 in progress
  for (const divId of ["mens", "womens"] as DivisionId[]) {
    const field = divisionField(divId, competitors);
    scoreRound(scores, "caber", field.map((c) => c.id), 1, 0.5);
  }

  // chop — round 1 about half done
  for (const div of divisions) {
    const field = divisionField(div.id, competitors);
    const ids = field.filter((c) => !c.eventSkips.includes("chop")).map((c) => c.id);
    scoreRound(scores, "chop", ids, 1, 0.55);
  }

  // hammer — not started yet (afternoon event)

  const kegAttempts = simulateKeg(competitors);

  // Stamp plausible recent write times so stall/pace displays demo well:
  // most activity in the last half hour, some older
  const now = Date.now();
  for (const s of scores) s.recordedAt = now - Math.floor(between(1, 90) * 60_000);
  for (const a of kegAttempts) a.recordedAt = now - Math.floor(between(1, 45) * 60_000);

  return {
    competitors,
    scores,
    kegAttempts,
    settings: { competitionName: "The Ledge Games", year: 2026, scorerPin: "1234", mentorsEnabled: true },
  };
}

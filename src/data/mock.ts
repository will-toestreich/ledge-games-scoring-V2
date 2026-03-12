// Mock data for The Ledge Games V2
// All data is in-memory — no backend yet

export interface Competition {
  id: string;
  name: string;
  year: number;
  status: "setup" | "active" | "completed";
}

export interface Division {
  id: string;
  name: string;
  slug: string;
  color: string;
  displayOrder: number;
}

export interface Event {
  id: string;
  name: string;
  slug: string;
  scoringType: "points" | "distance" | "time" | "height";
  higherIsBetter: boolean;
  displayOrder: number;
  rounds: number;
}

export interface Competitor {
  id: string;
  divisionId: string;
  bibNumber: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  hometown: string | null;
  email: string | null;
  shirtSize: string | null;
  registration: "paid" | "cash" | "sponsor" | null;
  paid: boolean;
  checkedIn: boolean;
  scratch: boolean;
  status: "active" | "withdrawn" | "disqualified";
}

export interface Score {
  competitorId: string;
  eventId: string;
  roundNumber: number;
  rawScore: number;
}

export interface Standing {
  competitorId: string;
  divisionId: string;
  bibNumber: number;
  firstName: string;
  lastName: string;
  nickname: string | null;
  totalPoints: number;
  rank: number;
  eventPoints: Record<string, number>;
}

// ─── Static Data ───────────────────────────────────────────

export const competition: Competition = {
  id: "comp-2026",
  name: "The Ledge Games",
  year: 2026,
  status: "active",
};

export interface DivisionRound {
  divisionId: string;
  currentRound: number;
  roundLabel: string;
  totalRounds: number;
}

export const divisions: Division[] = [
  { id: "div-mens", name: "Men's", slug: "mens", color: "#0A4366", displayOrder: 1 },
  { id: "div-womens", name: "Women's", slug: "womens", color: "#990000", displayOrder: 2 },
  { id: "div-mentors", name: "Mentors", slug: "mentors", color: "#985d25", displayOrder: 3 },
];

// Simulate different divisions being at different rounds
export const divisionRounds: DivisionRound[] = [
  { divisionId: "div-mens", currentRound: 1, roundLabel: "Round 1 — Full Field", totalRounds: 4 },
  { divisionId: "div-womens", currentRound: 2, roundLabel: "Round 2 — Top 10", totalRounds: 3 },
  { divisionId: "div-mentors", currentRound: 1, roundLabel: "Round 1 — All", totalRounds: 3 },
];

export function getDivisionRound(divisionId: string): DivisionRound | undefined {
  return divisionRounds.find((r) => r.divisionId === divisionId);
}

export const events: Event[] = [
  { id: "evt-axe", name: "Axe Throw", slug: "axe-throw", scoringType: "points", higherIsBetter: true, displayOrder: 1, rounds: 3 },
  { id: "evt-keg", name: "Keg Toss", slug: "keg-toss", scoringType: "height", higherIsBetter: true, displayOrder: 2, rounds: 3 },
  { id: "evt-caber", name: "Caber Toss", slug: "caber-toss", scoringType: "points", higherIsBetter: true, displayOrder: 3, rounds: 3 },
  { id: "evt-archery", name: "Archery", slug: "archery", scoringType: "points", higherIsBetter: true, displayOrder: 4, rounds: 3 },
  { id: "evt-chop", name: "Speed Chop", slug: "speed-chop", scoringType: "time", higherIsBetter: false, displayOrder: 5, rounds: 3 },
  { id: "evt-hammer", name: "Hammer Toss", slug: "hammer-toss", scoringType: "points", higherIsBetter: true, displayOrder: 6, rounds: 3 },
];

// Generate realistic competitors
const mensFirstNames = [
  "Jake", "Hank", "Cole", "Wyatt", "Travis", "Cody", "Brett", "Dustin", "Grant", "Shane",
  "Kyle", "Derek", "Tyler", "Ryan", "Chase", "Blake", "Bryce", "Drew", "Nate", "Luke",
  "Jared", "Trent", "Mason", "Hunter", "Colton", "Gavin", "Dalton", "Brock", "Levi", "Tanner",
  "Brady", "Clay", "Wade", "Reid", "Zach", "Quinn", "Dean", "Vince", "Kirk", "Troy",
  "Mitch", "Kent", "Doug", "Cliff", "Ray", "Beau", "Holt", "Nash", "Penn", "Cruz",
  "Dane", "Rhett", "Slade", "Knox", "Gage", "Wes", "Neil", "Mark", "Todd", "Gus",
  "Finn", "Axel", "Jett", "Cruz", "Bo", "Cal", "Ty", "Rex", "Ace", "Kit",
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
  "Park Falls, WI", "Hurley, WI", "Crandon, WI", null,
];

const shirtSizes = ["S", "M", "L", "XL", "2XL", null];

function generateCompetitors(
  firstNames: string[],
  divisionId: string,
  bibStart: number
): Competitor[] {
  return firstNames.map((firstName, i) => {
    const regOptions: ("paid" | "cash" | "sponsor" | null)[] = ["paid", "paid", "paid", "cash", "cash", "sponsor", null];
    const registration = regOptions[Math.floor(Math.random() * regOptions.length)];
    const checkedIn = registration !== null && Math.random() > 0.2;
    return {
      id: `${divisionId}-${i}`,
      divisionId,
      bibNumber: bibStart + i,
      firstName,
      lastName: lastNames[i % lastNames.length],
      nickname: Math.random() > 0.7 ? `"The ${["Axe", "Bear", "Bull", "Stump", "Iron", "Timber", "Blaze", "Storm"][Math.floor(Math.random() * 8)]}"` : null,
      hometown: hometowns[Math.floor(Math.random() * hometowns.length)],
      email: `${firstName.toLowerCase().replace(/\s+/g, "")}${lastNames[i % lastNames.length].toLowerCase()}@email.com`,
      shirtSize: shirtSizes[Math.floor(Math.random() * shirtSizes.length)],
      registration,
      paid: registration !== null && Math.random() > 0.15,
      checkedIn,
      scratch: Math.random() > 0.92,
      status: "active" as const,
    };
  });
}

export const competitors: Competitor[] = [
  ...generateCompetitors(mensFirstNames, "div-mens", 100),
  ...generateCompetitors(womensFirstNames, "div-womens", 200),
  ...generateCompetitors(mentorsFirstNames, "div-mentors", 300),
];

// Generate some mock scores (partial — simulates mid-competition)
const mockScores: Score[] = [];

// Score about 60% of competitors for each event's round 1
for (const event of events) {
  for (const competitor of competitors) {
    if (Math.random() > 0.6) continue;
    const baseScore =
      event.scoringType === "time"
        ? 10 + Math.random() * 50
        : event.scoringType === "height"
          ? Math.floor(Math.random() * 8)
          : Math.floor(Math.random() * 40) + 10;
    mockScores.push({
      competitorId: competitor.id,
      eventId: event.id,
      roundNumber: 1,
      rawScore: Math.round(baseScore * 10) / 10,
    });
  }
}

export const scores: Score[] = mockScores;

// ─── Computed standings ────────────────────────────────────

function computeStandings(): Standing[] {
  const standingsByDivision: Standing[] = [];

  for (const div of divisions) {
    const divCompetitors = competitors.filter((c) => c.divisionId === div.id);

    const standings = divCompetitors.map((c) => {
      const eventPoints: Record<string, number> = {};
      let totalPoints = 0;

      for (const event of events) {
        const score = scores.find(
          (s) => s.competitorId === c.id && s.eventId === event.id
        );
        // Golf scoring: rank = points. Unscored = max rank
        eventPoints[event.id] = score ? score.rawScore : 0;
      }

      // Simple total for now — real ranking comes later
      totalPoints = Object.values(eventPoints).reduce((a, b) => a + b, 0);

      return {
        competitorId: c.id,
        divisionId: div.id,
        bibNumber: c.bibNumber,
        firstName: c.firstName,
        lastName: c.lastName,
        nickname: c.nickname,
        totalPoints,
        rank: 0,
        eventPoints,
      };
    });

    // Sort by total points descending (higher is better for now)
    standings.sort((a, b) => b.totalPoints - a.totalPoints);
    standings.forEach((s, i) => (s.rank = i + 1));

    standingsByDivision.push(...standings);
  }

  return standingsByDivision;
}

export const standings: Standing[] = computeStandings();

// ─── Helper getters ────────────────────────────────────────

export function getDivisionCompetitors(divisionId: string): Competitor[] {
  return competitors.filter((c) => c.divisionId === divisionId);
}

export function getDivisionStandings(divisionId: string): Standing[] {
  return standings.filter((s) => s.divisionId === divisionId);
}

export function getCompetitor(id: string): Competitor | undefined {
  return competitors.find((c) => c.id === id);
}

export function getEvent(id: string): Event | undefined {
  return events.find((e) => e.id === id);
}

export function getEventScoringProgress(eventId: string, divisionId: string): { scored: number; total: number } {
  const divComps = competitors.filter((c) => c.divisionId === divisionId);
  const scored = divComps.filter((c) =>
    scores.some((s) => s.competitorId === c.id && s.eventId === eventId)
  ).length;
  return { scored, total: divComps.length };
}

export function getEventLeader(eventId: string, divisionId: string): Standing | null {
  const divStandings = getDivisionStandings(divisionId);
  // Find who has the best raw score for this event
  let best: Standing | null = null;
  let bestScore = -Infinity;
  for (const s of divStandings) {
    const pts = s.eventPoints[eventId];
    if (pts && pts > bestScore) {
      bestScore = pts;
      best = s;
    }
  }
  return best;
}

export function getTotalScoringProgress(): { scored: number; total: number } {
  let scored = 0;
  let total = 0;
  for (const event of events) {
    for (const div of divisions) {
      const p = getEventScoringProgress(event.id, div.id);
      scored += p.scored;
      total += p.total;
    }
  }
  return { scored, total };
}

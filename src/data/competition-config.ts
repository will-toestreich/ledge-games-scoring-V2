// Static competition configuration — the official rules encoded as data.
// Source of truth for the rules text: docs/RULES.md.

import type { Division, DivisionId, EventConfig, EventDivisionPlan, RoundPlan } from "@/lib/types";

export const divisions: Division[] = [
  {
    id: "mens",
    name: "Men's",
    color: "#0A4366",
    displayOrder: 1,
    rounds: 4,
    cutsAfterRound: { 1: "half", 2: 10, 3: 3 },
  },
  {
    id: "womens",
    name: "Women's",
    color: "#990000",
    displayOrder: 2,
    rounds: 3,
    cutsAfterRound: { 1: "half", 2: 3 },
  },
  {
    id: "mentors",
    name: "Mentors",
    color: "#985d25",
    displayOrder: 3,
    rounds: 3,
    cutsAfterRound: {},
  },
];

function repeat(plan: Omit<RoundPlan, never>, n: number): RoundPlan[] {
  return Array.from({ length: n }, () => ({ ...plan }));
}

const archeryRound: RoundPlan = { attempts: 1, attemptAgg: "sum", maxPerAttempt: 25, attemptLabel: "5 arrows — total points" };
const axeRegular: RoundPlan = { attempts: 2, attemptAgg: "sum", maxPerAttempt: 9, attemptLabel: "2 sets of 3 axes" };
const axeFinal: RoundPlan = { attempts: 1, attemptAgg: "sum", maxPerAttempt: 15, attemptLabel: "1 set of 5 axes" };
const hammerV: RoundPlan = { attempts: 2, attemptAgg: "sum", maxPerAttempt: 40, attemptLabel: "2 sets of 2 throws (V: front 10 / back 20)" };
const hammerBack: RoundPlan = { attempts: 1, attemptAgg: "sum", maxPerAttempt: 60, attemptLabel: "1 set of 3 throws (back row, 20 each)" };
const caberRound: RoundPlan = { attempts: 2, attemptAgg: "best", maxPerAttempt: 10, attemptLabel: "2 flips — better one counts" };
const chopRegular: RoundPlan = { attempts: 1, attemptAgg: "sum", attemptLabel: "3 pieces — total seconds" };
const chopFinal: RoundPlan = { attempts: 1, attemptAgg: "sum", attemptLabel: "5 pieces — total seconds" };

const mw = (rounds: { mens: RoundPlan[]; womens: RoundPlan[] }): Partial<Record<DivisionId, EventDivisionPlan>> => ({
  mens: { rounds: rounds.mens, finalsReset: true },
  womens: { rounds: rounds.womens, finalsReset: true },
});

export const events: EventConfig[] = [
  {
    id: "axe",
    name: "Axe Throw",
    displayOrder: 1,
    format: "rounds",
    direction: "desc",
    unit: "pts",
    decimals: 0,
    divisions: {
      ...mw({
        mens: [...repeat(axeRegular, 3), { ...axeFinal }],
        womens: [...repeat(axeRegular, 2), { ...axeFinal }],
      }),
      mentors: { rounds: repeat(axeRegular, 3), finalsReset: false },
    },
  },
  {
    id: "keg",
    name: "Keg Toss",
    displayOrder: 2,
    format: "ladder",
    direction: "desc",
    unit: "ft",
    decimals: 0,
    ladder: { startHeight: 10, increment: 1, attemptsPerHeight: 2 },
    // Ladder events have no round plans — the bar cuts the field naturally.
    divisions: {
      mens: { rounds: [], finalsReset: false },
      womens: { rounds: [], finalsReset: false },
    },
  },
  {
    id: "caber",
    name: "Caber Toss",
    displayOrder: 3,
    format: "rounds",
    direction: "desc",
    unit: "pts",
    decimals: 0,
    allowedValues: [0, 6, 7, 8, 9, 10],
    divisions: mw({
      mens: repeat(caberRound, 4),
      womens: repeat(caberRound, 3),
    }),
  },
  {
    id: "archery",
    name: "Archery",
    displayOrder: 4,
    format: "rounds",
    direction: "desc",
    unit: "pts",
    decimals: 0,
    divisions: {
      ...mw({
        mens: repeat(archeryRound, 4),
        womens: repeat(archeryRound, 3),
      }),
      mentors: { rounds: repeat(archeryRound, 3), finalsReset: false },
    },
  },
  {
    id: "chop",
    name: "Speed Chop",
    displayOrder: 5,
    format: "rounds",
    direction: "asc",
    unit: "sec",
    decimals: 1,
    penaltySeconds: 10,
    divisions: {
      ...mw({
        mens: [...repeat(chopRegular, 3), { ...chopFinal }],
        womens: [...repeat(chopRegular, 2), { ...chopFinal }],
      }),
      mentors: { rounds: repeat(chopRegular, 3), finalsReset: false },
    },
  },
  {
    id: "hammer",
    name: "Hammer Toss",
    displayOrder: 6,
    format: "rounds",
    direction: "desc",
    unit: "pts",
    decimals: 0,
    divisions: {
      ...mw({
        mens: [...repeat(hammerV, 2), { ...hammerBack }, { ...hammerBack }],
        womens: [...repeat(hammerV, 2), { ...hammerBack }],
      }),
      mentors: { rounds: [...repeat(hammerV, 2), { ...hammerBack }], finalsReset: false },
    },
  },
];

export function getDivision(id: string): Division | undefined {
  return divisions.find((d) => d.id === id);
}

export function getEvent(id: string): EventConfig | undefined {
  return events.find((e) => e.id === id);
}

/** Events a division competes in, in display order. */
export function divisionEvents(divisionId: DivisionId): EventConfig[] {
  return events.filter((e) => e.divisions[divisionId] !== undefined);
}

/** Human label for a round given the division's cut structure, e.g. "Top 10" or "Finals". */
export function roundLabel(division: Division, round: number): string {
  if (round === division.rounds && Object.keys(division.cutsAfterRound).length > 0) return "Finals";
  if (round === 1) return "Full Field";
  const cut = division.cutsAfterRound[round - 1];
  if (cut === "half") return "Top ½";
  if (typeof cut === "number") return `Top ${cut}`;
  return `Round ${round}`;
}

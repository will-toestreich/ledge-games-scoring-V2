import { describe, expect, it } from "vitest";
import {
  computeEventResults,
  computeStandings,
  divisionField,
  eventProgress,
  kegCompetitorState,
  pendingScorers,
  roundReadiness,
} from "./scoring";
import type {
  AttemptScore,
  Competitor,
  Division,
  EventConfig,
  KegAttempt,
} from "./types";

// ─── Fixtures ──────────────────────────────────────────────

function comp(id: string, overrides: Partial<Competitor> = {}): Competitor {
  return {
    id,
    divisionId: "mens",
    bibNumber: 0,
    firstName: id,
    lastName: "Test",
    nickname: null,
    hometown: null,
    email: null,
    shirtSize: null,
    registration: "paid",
    paid: true,
    checkedIn: true,
    noShow: false,
    eventSkips: [],
    ...overrides,
  };
}

function score(
  competitorId: string,
  round: number,
  attempt: number,
  value: number,
  penalty = 0
): AttemptScore {
  return {
    id: `${competitorId}:axe:r${round}:a${attempt}`,
    competitorId,
    eventId: "axe",
    round,
    attempt,
    value,
    penalty,
  };
}

/** Small test division: 2 rounds, cut to top "half" after round 1, finals reset. */
const div2: Division = {
  id: "mens",
  name: "Men's",
  color: "#000",
  displayOrder: 1,
  rounds: 2,
  cutsAfterRound: { 1: "half" },
};

function pointsEvent(overrides: Partial<EventConfig> = {}): EventConfig {
  return {
    id: "axe",
    name: "Axe Throw",
    displayOrder: 1,
    format: "rounds",
    direction: "desc",
    unit: "pts",
    decimals: 0,
    divisions: {
      mens: {
        rounds: [
          { attempts: 1, attemptAgg: "sum", attemptLabel: "r1" },
          { attempts: 1, attemptAgg: "sum", attemptLabel: "r2" },
        ],
        finalsReset: true,
      },
    },
    ...overrides,
  };
}

function run(
  event: EventConfig,
  field: Competitor[],
  scores: AttemptScore[],
  division: Division = div2,
  kegAttempts: KegAttempt[] = []
) {
  return computeEventResults({ event, division, field, scores, kegAttempts });
}

// ─── Golf ranks & ties ─────────────────────────────────────

describe("golf-style ties", () => {
  it("tied competitors share the better rank and the next skips", () => {
    // One round, no cuts — pure score ranking
    const div1: Division = { ...div2, rounds: 1, cutsAfterRound: {} };
    const ev = pointsEvent({
      divisions: {
        mens: { rounds: [{ attempts: 1, attemptAgg: "sum", attemptLabel: "r1" }], finalsReset: false },
      },
    });
    const field = ["a", "b", "c", "d"].map((id) => comp(id));
    const res = run(ev, field, [
      score("a", 1, 1, 20),
      score("b", 1, 1, 15),
      score("c", 1, 1, 15),
      score("d", 1, 1, 10),
    ], div1);
    expect(res.byCompetitor.get("a")!.points).toBe(1);
    expect(res.byCompetitor.get("b")!.points).toBe(2);
    expect(res.byCompetitor.get("c")!.points).toBe(2);
    expect(res.byCompetitor.get("d")!.points).toBe(4); // 3rd place skipped
  });

  it("a zero score participates and beats a skipper", () => {
    const div1: Division = { ...div2, rounds: 1, cutsAfterRound: {} };
    const ev = pointsEvent({
      divisions: {
        mens: { rounds: [{ attempts: 1, attemptAgg: "sum", attemptLabel: "r1" }], finalsReset: false },
      },
    });
    const field = [comp("zero"), comp("skip", { eventSkips: ["axe"] }), comp("winner")];
    const res = run(ev, field, [score("winner", 1, 1, 9), score("zero", 1, 1, 0)], div1);
    expect(res.byCompetitor.get("zero")!.points).toBe(2);
    expect(res.byCompetitor.get("skip")!.points).toBe(4); // field(3) + 1
    expect(res.byCompetitor.get("skip")!.rank).toBeNull();
  });
});

// ─── Direction & penalties ─────────────────────────────────

describe("speed chop (asc + penalties)", () => {
  const chopEv = pointsEvent({
    id: "chop" as const,
    direction: "asc",
    divisions: {
      mens: { rounds: [{ attempts: 1, attemptAgg: "sum", attemptLabel: "r1" }], finalsReset: false },
    },
  });
  const div1: Division = { ...div2, rounds: 1, cutsAfterRound: {} };

  it("lower time wins", () => {
    const field = [comp("fast"), comp("slow")];
    const res = run(chopEv, field, [
      { ...score("fast", 1, 1, 31.5), eventId: "chop" },
      { ...score("slow", 1, 1, 44.2), eventId: "chop" },
    ], div1);
    expect(res.byCompetitor.get("fast")!.points).toBe(1);
    expect(res.byCompetitor.get("slow")!.points).toBe(2);
  });

  it("a 10s penalty can flip the order", () => {
    const field = [comp("clean"), comp("flagged")];
    const res = run(chopEv, field, [
      { ...score("clean", 1, 1, 40), eventId: "chop" },
      { ...score("flagged", 1, 1, 35, 10), eventId: "chop" }, // 45 effective
    ], div1);
    expect(res.byCompetitor.get("clean")!.points).toBe(1);
    expect(res.byCompetitor.get("flagged")!.points).toBe(2);
  });
});

// ─── Attempt aggregation ───────────────────────────────────

describe("caber best-of-two", () => {
  it("round score is the better flip, not the sum", () => {
    const div1: Division = { ...div2, rounds: 1, cutsAfterRound: {} };
    const ev = pointsEvent({
      id: "caber" as const,
      divisions: {
        mens: { rounds: [{ attempts: 2, attemptAgg: "best", attemptLabel: "2 flips" }], finalsReset: false },
      },
    });
    const field = [comp("a"), comp("b")];
    const res = run(ev, field, [
      { ...score("a", 1, 1, 7), eventId: "caber" },
      { ...score("a", 1, 2, 10), eventId: "caber" },
      { ...score("b", 1, 1, 9), eventId: "caber" },
      { ...score("b", 1, 2, 8), eventId: "caber" },
    ], div1);
    expect(res.byCompetitor.get("a")!.roundScores[0]).toBe(10);
    expect(res.byCompetitor.get("b")!.roundScores[0]).toBe(9);
    expect(res.byCompetitor.get("a")!.points).toBe(1);
  });
});

// ─── Cuts & stratification ─────────────────────────────────

describe("cuts and strata", () => {
  it("partial round 1 ranks by cumulative — no phantom finals, no tied-at-1", () => {
    // Regression: with only 3 of 75 scored, premature cuts used to cascade
    // the scored competitors into a "finals" and tie them all at rank 1
    const field = ["a", "b", "c", "d", "e"].map((id) => comp(id));
    const res = run(pointsEvent(), field, [
      score("a", 1, 1, 8),
      score("b", 1, 1, 5),
      score("c", 1, 1, 4),
      // d, e haven't thrown round 1 yet
    ]);
    expect(res.byCompetitor.get("a")!.points).toBe(1);
    expect(res.byCompetitor.get("b")!.points).toBe(2);
    expect(res.byCompetitor.get("c")!.points).toBe(3);
    expect(res.byCompetitor.get("a")!.isFinalist).toBe(false); // no cut locked yet
    // Cut hasn't happened: everyone is still eligible for round 2
    expect(res.eligibleByRound[1].length).toBe(5);
  });

  it("half rounds up and ties at the line all advance", () => {
    // 5 competitors → top 3 advance; c and d tie for 3rd → 4 advance
    const field = ["a", "b", "c", "d", "e"].map((id) => comp(id));
    const res = run(pointsEvent(), field, [
      score("a", 1, 1, 50),
      score("b", 1, 1, 40),
      score("c", 1, 1, 30),
      score("d", 1, 1, 30),
      score("e", 1, 1, 10),
    ]);
    expect(res.eligibleByRound[1].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("someone cut earlier can never outrank someone who advanced further", () => {
    const field = ["a", "b", "c", "d"].map((id) => comp(id));
    const res = run(pointsEvent(), field, [
      score("a", 1, 1, 50),
      score("b", 1, 1, 40),
      score("c", 1, 1, 39), // cut (top half of 4 = 2)
      score("d", 1, 1, 5), // cut
      score("a", 2, 1, 1), // finals reset: terrible finals score
      score("b", 2, 1, 30),
    ]);
    // Finalists take 1-2 regardless of c's near-miss cumulative
    expect(res.byCompetitor.get("b")!.points).toBe(1);
    expect(res.byCompetitor.get("a")!.points).toBe(2);
    expect(res.byCompetitor.get("c")!.points).toBe(3);
    expect(res.byCompetitor.get("d")!.points).toBe(4);
  });

  it("finals reset: cumulative leader loses if beaten in the finals", () => {
    // 4 competitors, top half (2) advance: a and b both reach the finals
    const field = ["a", "b", "c", "d"].map((id) => comp(id));
    const res = run(pointsEvent(), field, [
      score("a", 1, 1, 100), // dominant round 1
      score("b", 1, 1, 50),
      score("c", 1, 1, 10),
      score("d", 1, 1, 5),
      score("a", 2, 1, 5),
      score("b", 2, 1, 6), // edges the finals
    ]);
    expect(res.byCompetitor.get("b")!.points).toBe(1);
    expect(res.byCompetitor.get("a")!.points).toBe(2);
  });

  it("without finals reset (mentors), cumulative decides", () => {
    const div: Division = { ...div2, cutsAfterRound: {} };
    const ev = pointsEvent({
      divisions: {
        mens: {
          rounds: [
            { attempts: 1, attemptAgg: "sum", attemptLabel: "r1" },
            { attempts: 1, attemptAgg: "sum", attemptLabel: "r2" },
          ],
          finalsReset: false,
        },
      },
    });
    const field = ["a", "b"].map((id) => comp(id));
    const res = run(ev, field, [
      score("a", 1, 1, 100),
      score("b", 1, 1, 10),
      score("a", 2, 1, 5),
      score("b", 2, 1, 6),
    ], div);
    expect(res.byCompetitor.get("a")!.points).toBe(1); // 105 vs 16
  });

  it("missing a round ranks below everyone who completed it in the same stratum", () => {
    // No cuts, 2 rounds: 'partial' skips round 2 but has a huge round 1
    const div: Division = { ...div2, cutsAfterRound: {} };
    const ev = pointsEvent({
      divisions: {
        mens: {
          rounds: [
            { attempts: 1, attemptAgg: "sum", attemptLabel: "r1" },
            { attempts: 1, attemptAgg: "sum", attemptLabel: "r2" },
          ],
          finalsReset: false,
        },
      },
    });
    const field = ["partial", "complete"].map((id) => comp(id));
    const res = run(ev, field, [
      score("partial", 1, 1, 100),
      score("complete", 1, 1, 5),
      score("complete", 2, 1, 5),
    ], div);
    expect(res.byCompetitor.get("complete")!.points).toBe(1);
    expect(res.byCompetitor.get("partial")!.points).toBe(2);
  });
});

// ─── Cut lines (projected + locked) ────────────────────────

describe("cut line info", () => {
  it("projects the cut mid-round without applying it", () => {
    const field = ["a", "b", "c", "d"].map((id) => comp(id));
    const res = run(pointsEvent(), field, [
      score("a", 1, 1, 50),
      score("b", 1, 1, 40),
      score("c", 1, 1, 30),
      // d hasn't thrown round 1 yet
    ]);
    expect(res.cuts).toHaveLength(1);
    const cut = res.cuts[0];
    expect(cut.afterRound).toBe(1);
    expect(cut.locked).toBe(false);
    expect(cut.target).toBe(2); // half of 4
    expect([...cut.advancerIds].sort()).toEqual(["a", "b"]);
    expect(cut.bubbleScore).toBe(40); // last competitor inside the line
    expect(cut.scoredCount).toBe(3);
    expect(cut.eligibleCount).toBe(4);
    // The projection never cuts anyone early
    expect(res.eligibleByRound[1]).toHaveLength(4);
  });

  it("locks when the round completes; ties extend past the target; agrees with the real cut", () => {
    // 5 competitors → top 3; c and d tie at the line → 4 advance
    const field = ["a", "b", "c", "d", "e"].map((id) => comp(id));
    const res = run(pointsEvent(), field, [
      score("a", 1, 1, 50),
      score("b", 1, 1, 40),
      score("c", 1, 1, 30),
      score("d", 1, 1, 30),
      score("e", 1, 1, 10),
    ]);
    const cut = res.cuts[0];
    expect(cut.locked).toBe(true);
    expect(cut.target).toBe(3);
    expect([...cut.advancerIds].sort()).toEqual(["a", "b", "c", "d"]);
    expect(cut.advancerIds).toEqual(res.eligibleByRound[1]); // line = the actual cut
    expect(cut.bubbleScore).toBe(30);
  });

  it("no-cut divisions and ladder events expose no cut lines", () => {
    const noCuts: Division = { ...div2, cutsAfterRound: {} };
    const res = run(pointsEvent(), [comp("a")], [score("a", 1, 1, 5)], noCuts);
    expect(res.cuts).toEqual([]);
  });
});

// ─── No-shows and field definition ─────────────────────────

describe("day no-shows", () => {
  it("are excluded from the field entirely", () => {
    const all = [comp("here"), comp("gone", { noShow: true }), comp("other", { divisionId: "womens" })];
    const field = divisionField("mens", all);
    expect(field.map((c) => c.id)).toEqual(["here"]);
  });
});

// ─── Keg ladder ────────────────────────────────────────────

function keg(
  competitorId: string,
  heightFt: number,
  attempt: number,
  result: "clear" | "miss" | "pass"
): KegAttempt {
  return { id: `${competitorId}:keg:h${heightFt}:a${attempt}`, competitorId, heightFt, attempt, result };
}

describe("keg ladder", () => {
  const kegEvent: EventConfig = {
    id: "keg",
    name: "Keg Toss",
    displayOrder: 2,
    format: "ladder",
    direction: "desc",
    unit: "ft",
    decimals: 0,
    ladder: { startHeight: 10, increment: 1, attemptsPerHeight: 2 },
    divisions: { mens: { rounds: [], finalsReset: false } },
  };

  it("result is highest height cleared; ties share rank", () => {
    const field = ["a", "b", "c"].map((id) => comp(id));
    const res = run(kegEvent, field, [], div2, [
      keg("a", 10, 1, "clear"),
      keg("a", 11, 1, "clear"),
      keg("a", 12, 1, "miss"),
      keg("a", 12, 2, "miss"),
      keg("b", 10, 1, "clear"),
      keg("b", 11, 2, "clear"),
      keg("b", 12, 1, "miss"),
      keg("b", 12, 2, "miss"),
      keg("c", 10, 1, "clear"),
      keg("c", 11, 1, "miss"),
      keg("c", 11, 2, "miss"),
    ]);
    expect(res.byCompetitor.get("a")!.points).toBe(1); // 11ft, tied
    expect(res.byCompetitor.get("b")!.points).toBe(1);
    expect(res.byCompetitor.get("c")!.points).toBe(3); // 10ft
  });

  it("the pass gamble: passing then never clearing scores 0 but still beats a skipper", () => {
    const field = [comp("gambler"), comp("safe"), comp("skipper", { eventSkips: ["keg"] })];
    const res = run(kegEvent, field, [], div2, [
      keg("safe", 10, 1, "clear"),
      keg("gambler", 10, 1, "pass"),
      keg("gambler", 11, 1, "miss"),
      keg("gambler", 11, 2, "miss"),
    ]);
    expect(res.byCompetitor.get("safe")!.points).toBe(1);
    expect(res.byCompetitor.get("gambler")!.points).toBe(2); // 0 ft, participated
    expect(res.byCompetitor.get("skipper")!.points).toBe(4); // field(3) + 1
  });

  it("ladder status: current bar height + resolved count among survivors", () => {
    const field = ["a", "b", "c"].map((id) => comp(id));
    const res = run(kegEvent, field, [], div2, [
      keg("a", 10, 1, "clear"),
      keg("a", 11, 1, "clear"), // a: alive, hasn't thrown at 12 yet
      keg("b", 10, 1, "clear"),
      keg("b", 11, 1, "miss"),
      keg("b", 11, 2, "miss"), // b: out below the bar — not in remaining
      keg("c", 10, 1, "clear"),
      keg("c", 11, 1, "clear"),
      keg("c", 12, 1, "pass"), // c: resolved at 12
    ]);
    expect(res.ladderStatus).toEqual({ height: 12, done: 1, remaining: 2, alive: 2, pending: ["a"] });
  });

  it("event completes when the last survivors all miss out at the final height", () => {
    // Regression: both finalists going out at the same bar left them counted
    // as "remaining" there, so the event never read complete
    const field = ["a", "b"].map((id) => comp(id));
    const res = run(kegEvent, field, [], div2, [
      keg("a", 10, 1, "clear"),
      keg("a", 11, 1, "miss"),
      keg("a", 11, 2, "miss"),
      keg("b", 10, 1, "clear"),
      keg("b", 11, 1, "miss"),
      keg("b", 11, 2, "miss"),
    ]);
    expect(eventProgress(res).complete).toBe(true);
    expect(pendingScorers(res)).toBeNull();
    expect(res.byCompetitor.get("a")!.points).toBe(1); // tied at 10 ft
    expect(res.byCompetitor.get("b")!.points).toBe(1);
  });

  it("two misses at a height puts you out; state tracks it", () => {
    const attempts = [
      keg("x", 10, 1, "clear"),
      keg("x", 11, 1, "miss"),
      keg("x", 11, 2, "miss"),
    ];
    const st = kegCompetitorState("x", attempts, 2);
    expect(st.out).toBe(true);
    expect(st.highestCleared).toBe(10);
    expect(st.missesAt(11)).toBe(2);
  });
});

// ─── Mission control helpers ───────────────────────────────

describe("pendingScorers", () => {
  it("chases the first incomplete round's missing competitors", () => {
    const field = ["a", "b", "c", "d"].map((id) => comp(id));
    const res = run(pointsEvent(), field, [
      score("a", 1, 1, 50),
      score("b", 1, 1, 40),
      score("c", 1, 1, 30),
      // d hasn't scored round 1
    ]);
    const p = pendingScorers(res)!;
    expect(p.round).toBe(1);
    expect(p.competitorIds).toEqual(["d"]);
    expect(p.roundFraction).toBe(0.75);
  });

  it("returns null for unstarted and fully complete events", () => {
    const div1: Division = { ...div2, rounds: 1, cutsAfterRound: {} };
    const ev = pointsEvent({
      divisions: {
        mens: { rounds: [{ attempts: 1, attemptAgg: "sum", attemptLabel: "r1" }], finalsReset: false },
      },
    });
    const field = ["a", "b"].map((id) => comp(id));
    expect(pendingScorers(run(ev, field, [], div1))).toBeNull();
    expect(
      pendingScorers(run(ev, field, [score("a", 1, 1, 5), score("b", 1, 1, 6)], div1))
    ).toBeNull();
  });

  it("ladder: lists survivors unresolved at the current bar", () => {
    const kegEvent: EventConfig = {
      id: "keg", name: "Keg Toss", displayOrder: 2, format: "ladder",
      direction: "desc", unit: "ft", decimals: 0,
      ladder: { startHeight: 10, increment: 1, attemptsPerHeight: 2 },
      divisions: { mens: { rounds: [], finalsReset: false } },
    };
    const field = ["a", "b", "c"].map((id) => comp(id));
    const res = run(kegEvent, field, [], div2, [
      keg("a", 10, 1, "clear"),
      keg("a", 11, 1, "clear"), // a: owes an outcome at 12
      keg("b", 10, 1, "clear"),
      keg("b", 11, 1, "miss"),
      keg("b", 11, 2, "miss"), // b: out — not chased
      keg("c", 10, 1, "clear"),
      keg("c", 11, 1, "clear"),
      keg("c", 12, 1, "pass"), // c: resolved at 12
    ]);
    const p = pendingScorers(res)!;
    expect(p.label).toBe("12 ft");
    expect(p.competitorIds).toEqual(["a"]);
  });
});

describe("partial rounds (set-by-set field workflow)", () => {
  const div1: Division = { ...div2, rounds: 1, cutsAfterRound: {} };
  const twoSetEvent = pointsEvent({
    divisions: {
      mens: { rounds: [{ attempts: 2, attemptAgg: "sum", maxPerAttempt: 9, attemptLabel: "2 sets" }], finalsReset: false },
    },
  });

  it("a competitor with only set 1 recorded still owes the round", () => {
    const field = [comp("half"), comp("full")];
    const res = run(twoSetEvent, field, [
      score("half", 1, 1, 7), // set 1 only
      score("full", 1, 1, 5),
      score("full", 1, 2, 6),
    ], div1);
    expect(res.byCompetitor.get("half")!.roundScores[0]).toBe(7); // counts so far
    expect(res.byCompetitor.get("half")!.roundComplete[0]).toBe(false);
    expect(res.byCompetitor.get("full")!.roundComplete[0]).toBe(true);
    const p = pendingScorers(res)!;
    expect(p.competitorIds).toEqual(["half"]); // chased for set 2
  });

  it("a declined attempt (pass) completes the round without scoring", () => {
    const field = [comp("passer"), comp("thrower")];
    const ev = pointsEvent({
      id: "caber" as const,
      divisions: {
        mens: { rounds: [{ attempts: 2, attemptAgg: "best", attemptLabel: "2 flips" }], finalsReset: false },
      },
    });
    const res = run(ev, field, [
      { ...score("passer", 1, 1, 9), eventId: "caber" },
      { ...score("passer", 1, 2, 0), eventId: "caber", declined: true }, // passes flip 2
      { ...score("thrower", 1, 1, 7), eventId: "caber" },
      { ...score("thrower", 1, 2, 10), eventId: "caber" },
    ], div1);
    const passer = res.byCompetitor.get("passer")!;
    expect(passer.roundComplete[0]).toBe(true); // nobody waits on them
    expect(passer.roundScores[0]).toBe(9); // pass contributes nothing
    expect(pendingScorers(res)).toBeNull();
    expect(res.byCompetitor.get("thrower")!.points).toBe(1); // 10 beats 9
    expect(passer.points).toBe(2);
  });

  it("readiness waits for every set, not just the first", () => {
    const field = ["a", "b"].map((id) => comp(id));
    const ev = pointsEvent({
      divisions: {
        mens: {
          rounds: [
            { attempts: 2, attemptAgg: "sum", attemptLabel: "2 sets" },
            { attempts: 2, attemptAgg: "sum", attemptLabel: "2 sets" },
          ],
          finalsReset: true,
        },
      },
    });
    // Everyone has thrown set 1 of round 1 — round is NOT complete
    const res = run(ev, field, [score("a", 1, 1, 5), score("b", 1, 1, 4)]);
    expect(roundReadiness(res)).toBeNull();
  });
});

describe("roundReadiness", () => {
  it("signals the locked cut when a round completes and the next hasn't started", () => {
    // div2: 2 rounds, cut to top half after R1 → R2 is the finals
    const field = ["a", "b", "c", "d"].map((id) => comp(id));
    const res = run(pointsEvent(), field, [
      score("a", 1, 1, 50),
      score("b", 1, 1, 40),
      score("c", 1, 1, 30),
      score("d", 1, 1, 20),
    ]);
    const r = roundReadiness(res)!;
    expect(r.completedRound).toBe(1);
    expect(r.nextRound).toBe(2);
    expect(r.advancerIds.sort()).toEqual(["a", "b"]);
    expect(r.isFinals).toBe(true);
  });

  it("returns null while the round is running or once the next has started", () => {
    const field = ["a", "b", "c", "d"].map((id) => comp(id));
    // round 1 incomplete
    expect(roundReadiness(run(pointsEvent(), field, [score("a", 1, 1, 50)]))).toBeNull();
    // round 2 already underway
    expect(
      roundReadiness(
        run(pointsEvent(), field, [
          score("a", 1, 1, 50),
          score("b", 1, 1, 40),
          score("c", 1, 1, 30),
          score("d", 1, 1, 20),
          score("a", 2, 1, 9),
        ])
      )
    ).toBeNull();
  });
});

// ─── Overall standings ─────────────────────────────────────

describe("overall standings", () => {
  const div1: Division = { ...div2, rounds: 1, cutsAfterRound: {} };
  const evA = pointsEvent({
    id: "axe" as const,
    divisions: { mens: { rounds: [{ attempts: 1, attemptAgg: "sum", attemptLabel: "r1" }], finalsReset: false } },
  });
  const evB = pointsEvent({
    id: "archery" as const,
    divisions: { mens: { rounds: [{ attempts: 1, attemptAgg: "sum", attemptLabel: "r1" }], finalsReset: false } },
  });

  it("sums points across started events only; lowest total wins", () => {
    const field = ["a", "b"].map((id) => comp(id));
    const scores: AttemptScore[] = [
      score("a", 1, 1, 10), // axe: a wins (1pt), b second (2pts)
      score("b", 1, 1, 5),
      // archery: no scores — must not count
    ];
    const { standings } = computeStandings({
      division: div1,
      field,
      events: [evA, evB],
      scores,
      kegAttempts: [],
    });
    expect(standings[0].competitorId).toBe("a");
    expect(standings[0].total).toBe(1);
    expect(standings[0].eventPoints.archery).toBeUndefined();
  });

  it("a recorded arrow-off winner takes the title alone", () => {
    const field = ["a", "b", "c"].map((id) => comp(id));
    const scores: AttemptScore[] = [
      score("a", 1, 1, 10),
      score("b", 1, 1, 10), // tied with a
      score("c", 1, 1, 1),
    ];
    const { standings } = computeStandings({
      division: div1,
      field,
      events: [evA],
      scores,
      kegAttempts: [],
      titleTiebreakWinner: "b",
    });
    const a = standings.find((s) => s.competitorId === "a")!;
    const b = standings.find((s) => s.competitorId === "b")!;
    expect(b.rank).toBe(1);
    expect(b.wonTiebreak).toBe(true);
    expect(a.rank).toBe(2);
    expect(b.tiebreakRequired).toBe(false);
    expect(a.tiebreakRequired).toBe(false);
    expect(standings[0].competitorId).toBe("b"); // sorted winner first
  });

  it("a stale arrow-off winner (no longer tied for first) is ignored", () => {
    const field = ["a", "b", "c"].map((id) => comp(id));
    const scores: AttemptScore[] = [
      score("a", 1, 1, 10),
      score("b", 1, 1, 10),
      score("c", 1, 1, 1), // c is NOT tied for first
    ];
    const { standings } = computeStandings({
      division: div1,
      field,
      events: [evA],
      scores,
      kegAttempts: [],
      titleTiebreakWinner: "c", // stale — scores changed since it was recorded
    });
    const a = standings.find((s) => s.competitorId === "a")!;
    const b = standings.find((s) => s.competitorId === "b")!;
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(1);
    expect(a.tiebreakRequired).toBe(true); // flag re-raises for the real tie
  });

  it("a shared first place flags the archery arrow-off", () => {
    const field = ["a", "b", "c"].map((id) => comp(id));
    const scores: AttemptScore[] = [
      score("a", 1, 1, 10),
      score("b", 1, 1, 10),
      score("c", 1, 1, 1),
      { ...score("a", 1, 1, 10), id: "a:archery", eventId: "archery" },
      { ...score("b", 1, 1, 10), id: "b:archery", eventId: "archery" },
      { ...score("c", 1, 1, 1), id: "c:archery", eventId: "archery" },
    ];
    const { standings } = computeStandings({
      division: div1,
      field,
      events: [evA, evB],
      scores,
      kegAttempts: [],
    });
    const a = standings.find((s) => s.competitorId === "a")!;
    const b = standings.find((s) => s.competitorId === "b")!;
    const c = standings.find((s) => s.competitorId === "c")!;
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(1);
    expect(a.tiebreakRequired).toBe(true);
    expect(b.tiebreakRequired).toBe(true);
    expect(c.rank).toBe(3);
    expect(c.tiebreakRequired).toBe(false);
  });
});

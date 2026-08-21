// Full mock event day, driven through the REAL localStorage adapter and the
// REAL engine — the same calls the UI makes, in the order a real Saturday
// runs: registration → round 1 with stragglers and corrections → cuts →
// keg ladder → finals → arrow-off → backup. Hard invariants are asserted;
// operational surprises are collected in OBSERVATIONS and printed at the end.

import { describe, expect, it } from "vitest";
import type { AttemptScore, Competitor, DivisionId, EventId } from "./types";
import {
  computeEventResults,
  computeStandings,
  divisionField,
  eventProgress,
  pendingScorers,
  roundReadiness,
  type EventResults,
  type Standing,
} from "./scoring";
import { divisionEvents, divisions, getDivision, getEvent } from "@/data/competition-config";
import { newCompetitorId } from "./roster";

// ── Browser shims so the real adapter runs under Node ──────
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  window: {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  },
});
const db = await import("@/data/db-local");

// ── Deterministic RNG (same mulberry32 as the demo seed) ───
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
const rng = mulberry32(0xdecaf);
const chance = (p: number) => rng() < p;
const between = (lo: number, hi: number) => lo + rng() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];

const OBSERVATIONS: string[] = [];
const note = (s: string) => OBSERVATIONS.push(s);

// ── Roster helpers ─────────────────────────────────────────
function makeCompetitor(divisionId: DivisionId, bib: number, i: number): Competitor {
  return {
    id: newCompetitorId(bib),
    divisionId,
    bibNumber: bib,
    firstName: `${divisionId === "mens" ? "Max" : divisionId === "womens" ? "Willa" : "Mentor"}${i}`,
    lastName: `Sim${bib}`,
    nickname: null,
    hometown: chance(0.8) ? "Minocqua, WI" : null,
    email: null,
    shirtSize: pick(["S", "M", "L", "XL", "2XL"]),
    registration: pick(["paid", "paid", "paid", "cash", "sponsor"] as const),
    paid: true,
    checkedIn: false,
    noShow: false,
    eventSkips: [],
  };
}

// ── Engine views, recomputed from persisted state like the UI does ──
async function view(eventId: EventId, divisionId: DivisionId) {
  const [competitors, scores, kegAttempts] = await Promise.all([
    db.fetchCompetitors(),
    db.fetchScores(),
    db.fetchKegAttempts(),
  ]);
  const division = getDivision(divisionId)!;
  const field = divisionField(divisionId, competitors);
  const res = computeEventResults({
    event: getEvent(eventId)!,
    division,
    field,
    scores,
    kegAttempts,
  });
  return { res, field, competitors };
}

async function standingsFor(divisionId: DivisionId) {
  const [competitors, scores, kegAttempts, settings] = await Promise.all([
    db.fetchCompetitors(),
    db.fetchScores(),
    db.fetchKegAttempts(),
    db.fetchSettings(),
  ]);
  const division = getDivision(divisionId)!;
  const field = divisionField(divisionId, competitors);
  return {
    field,
    ...computeStandings({
      division,
      field,
      events: divisionEvents(divisionId),
      scores,
      kegAttempts,
      titleTiebreakWinner: settings.titleTiebreakWinners?.[divisionId] ?? null,
    }),
  };
}

// ── Score generation per event ─────────────────────────────
function genAttempt(eventId: EventId, maxPer: number | undefined): { value: number; penalty: number } {
  switch (eventId) {
    case "caber":
      return { value: pick([0, 0, 6, 6, 7, 7, 8, 8, 9, 10]), penalty: 0 };
    case "archery":
      return { value: int(5, maxPer ?? 25), penalty: 0 };
    case "chop":
      return { value: Math.round(between(20, 80) * 10) / 10, penalty: chance(0.07) ? 10 : 0 };
    case "hammer":
      return { value: Math.min(pick([0, 10, 20, 20, 30, 30, 40, 50, 60]), maxPer ?? 60), penalty: 0 };
    default: // axe
      return { value: int(0, maxPer ?? 9), penalty: 0 };
  }
}

function attemptRow(
  competitorId: string,
  eventId: EventId,
  round: number,
  attempt: number,
  v: { value: number; penalty: number; declined?: boolean }
): AttemptScore {
  return {
    id: `${competitorId}:${eventId}:r${round}:a${attempt}`,
    competitorId,
    eventId,
    round,
    attempt,
    value: v.value,
    penalty: v.penalty,
    declined: v.declined,
  };
}

/**
 * Score one round for everyone eligible, exactly like the field runs it:
 * set 1 saved for the whole line first, then set 2 (each submit re-sends all
 * filled attempts, like the entry form). `holdOut` competitors are left
 * unscored so the chase list can be verified, then caught up.
 * `scripted` pins exact values (used to engineer the mentors title tie).
 */
async function scoreRound(
  eventId: EventId,
  divisionId: DivisionId,
  round: number,
  opts: { holdOut?: number; scripted?: Map<string, number[]> } = {}
) {
  const event = getEvent(eventId)!;
  const plan = event.divisions[divisionId]!;
  const roundPlan = plan.rounds[round - 1];

  let { res } = await view(eventId, divisionId);
  const eligible = res.eligibleByRound[round - 1].filter(
    (id) => !res.byCompetitor.get(id)!.roundComplete[round - 1]
  );
  const holdouts = new Set(eligible.slice(0, opts.holdOut ?? 0));
  const active = eligible.filter((id) => !holdouts.has(id));

  // Pre-generate every competitor's full round so resubmits are consistent
  const values = new Map<string, { value: number; penalty: number; declined?: boolean }[]>();
  for (const id of eligible) {
    const scripted = opts.scripted?.get(id);
    values.set(
      id,
      Array.from({ length: roundPlan.attempts }, (_, a) => {
        if (scripted) return { value: scripted[a] ?? 0, penalty: 0 };
        // Caber: a competitor happy with flip 1 sometimes passes flip 2
        if (eventId === "caber" && a === 1 && chance(0.15)) {
          return { value: 0, penalty: 0, declined: true };
        }
        return genAttempt(eventId, roundPlan.maxPerAttempt);
      })
    );
  }

  // Set-by-set passes: each submit sends attempts 1..a (form resubmits all)
  for (let a = 1; a <= roundPlan.attempts; a++) {
    for (const id of active) {
      const vs = values.get(id)!;
      await db.saveRoundAttempts(
        vs.slice(0, a).map((v, i) => attemptRow(id, eventId, round, i + 1, v))
      );
    }
    if (a === 1 && roundPlan.attempts > 1) {
      // Mid-round: everyone owes their remaining sets, nobody reads complete
      const mid = (await view(eventId, divisionId)).res;
      const p = pendingScorers(mid);
      expect(p?.round).toBe(round);
      expect(new Set(p!.competitorIds)).toEqual(new Set(eligible));
    }
  }

  if (holdouts.size > 0) {
    // The chase list must name exactly the stragglers
    const midRes = (await view(eventId, divisionId)).res;
    const p = pendingScorers(midRes);
    expect(p).not.toBeNull();
    expect(p!.round).toBe(round);
    expect(new Set(p!.competitorIds)).toEqual(holdouts);
    expect(roundReadiness(midRes)).toBeNull(); // can't advance with stragglers out
    for (const id of holdouts) {
      const vs = values.get(id)!;
      await db.saveRoundAttempts(vs.map((v, i) => attemptRow(id, eventId, round, i + 1, v)));
    }
  }

  res = (await view(eventId, divisionId)).res;
  for (const id of res.eligibleByRound[round - 1]) {
    expect(res.byCompetitor.get(id)!.roundComplete[round - 1]).toBe(true);
  }
  return res;
}

/** Assert readiness fires with the locked cut, then return the advancers. */
function expectReadiness(res: EventResults, round: number): string[] {
  const r = roundReadiness(res);
  expect(r).not.toBeNull();
  expect(r!.completedRound).toBe(round);
  const cut = res.cuts.find((c) => c.afterRound === round);
  if (cut) {
    expect(cut.locked).toBe(true);
    expect(new Set(r!.advancerIds)).toEqual(new Set(cut.advancerIds));
    expect(cut.advancerIds).toEqual(res.eligibleByRound[round]);
    // One tie, all tie can extend past the target but never shrink below it
    expect(cut.advancerIds.length).toBeGreaterThanOrEqual(
      Math.min(cut.target, cut.eligibleCount)
    );
  }
  return r!.advancerIds;
}

function golfConsistent(standings: Standing[]) {
  // rank r shared by k competitors → the next distinct rank is r + k
  const byRank = new Map<number, number>();
  for (const s of standings) byRank.set(s.rank, (byRank.get(s.rank) ?? 0) + 1);
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  let expected = 1;
  for (const r of ranks) {
    expect(r).toBe(expected);
    expected += byRank.get(r)!;
  }
}

// ════════════════════════════════════════════════════════════
describe("mock event day (full simulation through the real adapter)", () => {
  let mensField = 0;
  let womensField = 0;

  it("phase 0-1 — fresh install, new season, registration desk", async () => {
    const comps = await db.fetchCompetitions();
    expect(comps.map((c) => c.id)).toContain("season-2025"); // archive ships
    expect(comps.find((c) => c.isActive)!.status).toBe("completed");
    note("Fresh install boots with the ARCHIVED 2025 season active (by design) — the director's first act must be Start New Season.");

    await db.createCompetition({ name: "The Ledge Games (Mock)", year: 2026 });
    expect((await db.fetchCompetitions()).find((c) => c.isActive)!.year).toBe(2026);

    // Bulk import: 74 men, 29 women, 4 mentors
    const roster: Competitor[] = [
      ...Array.from({ length: 74 }, (_, i) => makeCompetitor("mens", 1 + i, i + 1)),
      ...Array.from({ length: 29 }, (_, i) => makeCompetitor("womens", 101 + i, i + 1)),
      ...Array.from({ length: 4 }, (_, i) => makeCompetitor("mentors", 151 + i, i + 1)),
    ];
    await db.addCompetitors(roster);

    // Desk safety rails
    await expect(db.addCompetitors([makeCompetitor("mens", 14, 99)])).rejects.toThrow(/taken/);
    const dupId = { ...makeCompetitor("mens", 80, 99), id: roster[0].id };
    await expect(db.addCompetitors([dupId])).rejects.toThrow(/already exists/);

    // Walk-ons at the desk (form path: next free bib in the division block)
    await db.addCompetitors([makeCompetitor("mens", 75, 75), makeCompetitor("womens", 130, 30)]);

    // Check-in sweep; two men never show → scratched at morning registration
    const all = await db.fetchCompetitors();
    for (const c of all) await db.updateCompetitor(c.id, { checkedIn: true });
    const mens = all.filter((c) => c.divisionId === "mens");
    await db.updateCompetitor(mens[9].id, { noShow: true, checkedIn: false });
    await db.updateCompetitor(mens[23].id, { noShow: true, checkedIn: false });

    // Pre-declared single-event skips
    await db.updateCompetitor(mens[4].id, { eventSkips: ["keg", "chop"] });
    const womens = all.filter((c) => c.divisionId === "womens");
    await db.updateCompetitor(womens[7].id, { eventSkips: ["keg"] });

    await db.saveSettings({ scorerPin: "4242" });
    expect((await db.fetchSettings()).scorerPin).toBe("4242");

    const final = await db.fetchCompetitors();
    mensField = divisionField("mens", final).length;
    womensField = divisionField("womens", final).length;
    expect(mensField).toBe(73); // 75 - 2 day no-shows
    expect(womensField).toBe(30);
    expect(divisionField("mentors", final).length).toBe(4);
    note(`Registration: 108 imported + 2 walk-ons; 2 day no-shows → fields M${mensField}/W${womensField}/Mentors 4; PIN change persisted.`);
  });

  it("phase 2 — round 1 everywhere, with stragglers, a fat-finger fix, and a deleted round", async () => {
    // Round 1 with 3 stragglers per event (chase list verified inside)
    const axe = await scoreRound("axe", "mens", 1, { holdOut: 3 });

    // Cut projection sanity mid-competition: with round 1 fully scored the
    // line is locked and equals the top-half exactly
    const cut = axe.cuts.find((c) => c.afterRound === 1)!;
    expect(cut.target).toBe(Math.ceil(mensField / 2));

    // Fat-finger: scorer enters the wrong archery total, then corrects it
    // with a resubmit (same id → upsert)
    const { field } = await view("archery", "mens");
    const victim = field[3].id;
    await db.saveRoundAttempts([attemptRow(victim, "archery", 1, 1, { value: 21, penalty: 0 })]);
    await db.saveRoundAttempts([attemptRow(victim, "archery", 1, 1, { value: 12, penalty: 0 })]); // corrected
    const arch1 = (await view("archery", "mens")).res;
    expect(arch1.byCompetitor.get(victim)!.roundScores[0]).toBe(12);

    await scoreRound("axe", "womens", 1, { holdOut: 2 });
    await scoreRound("archery", "mens", 1, { holdOut: 2 });
    await scoreRound("archery", "womens", 1);
    // (Mentors run in the afternoon — scripted in phase 6)
    await scoreRound("caber", "mens", 1, { holdOut: 2 });
    await scoreRound("caber", "womens", 1);
    await scoreRound("chop", "mens", 1);
    await scoreRound("chop", "womens", 1);

    // Admin deletes a wrongly-attributed caber round and re-enters it
    const caber = (await view("caber", "mens")).res;
    const wrong = caber.eligibleByRound[0][10];
    await db.deleteRoundAttempts(wrong, "caber", 1);
    const afterDelete = (await view("caber", "mens")).res;
    expect(afterDelete.byCompetitor.get(wrong)!.roundScores[0]).toBeNull();
    expect(pendingScorers(afterDelete)!.competitorIds).toContain(wrong); // back in the chase
    await db.saveRoundAttempts([
      attemptRow(wrong, "caber", 1, 1, { value: 8, penalty: 0 }),
      attemptRow(wrong, "caber", 1, 2, { value: 0, penalty: 0, declined: true }),
    ]);
    expect((await view("caber", "mens")).res.byCompetitor.get(wrong)!.roundScores[0]).toBe(8);
  });

  it("phase 3 — late walk-on after a cut locks (operational probe)", async () => {
    // Axe mens R1 is complete and its cut is locked
    const before = (await view("axe", "mens")).res;
    const lockedCut = before.cuts.find((c) => c.afterRound === 1)!;
    expect(lockedCut.locked).toBe(true);
    const advancersBefore = [...before.eligibleByRound[1]];

    // A walk-on registers AFTER axe round 1 finished
    const late = makeCompetitor("mens", 76, 76);
    late.checkedIn = true;
    await db.addCompetitors([late]);

    const after = (await view("axe", "mens")).res;
    const cutAfter = after.cuts.find((c) => c.afterRound === 1)!;
    if (!cutAfter.locked) {
      note(
        "Late walk-on UNLOCKS an already-announced cut: they join round 1 as unscored, the round reads incomplete again, and the locked cut reverts to a projection until they're scored or marked skipped for that event."
      );
    }
    // Field remedy: they missed every morning event — mark those skipped so
    // the locked cuts re-lock; they'll compete in keg + hammer this afternoon
    await db.updateCompetitor(late.id, { eventSkips: ["axe", "archery", "caber", "chop"] });
    const fixed = (await view("axe", "mens")).res;
    expect(fixed.cuts.find((c) => c.afterRound === 1)!.locked).toBe(true);
    expect(fixed.eligibleByRound[1]).toEqual(advancersBefore);
    expect(fixed.byCompetitor.get(late.id)!.points).toBe(fixed.fieldSize + 1);
    mensField += 1; // in the field for the remaining events
  });

  it("phase 4 — keg ladder, pass gamble, undo, and a decided event", async () => {
    for (const divisionId of ["mens", "womens"] as DivisionId[]) {
      const contenders = (await view("keg", divisionId)).field.filter(
        (c) => !c.eventSkips.includes("keg")
      );
      const gambler = contenders[1].id; // passes the opening bar — pass-risk rule
      let alive = contenders.map((c) => c.id);
      let height = 10;
      while (alive.length > 1 && height < 22) {
        const next: string[] = [];
        for (const id of alive) {
          const t = (a: number, result: "clear" | "miss" | "pass") =>
            db.recordKegAttempt({
              id: `${id}:keg:h${height}:a${a}`,
              competitorId: id,
              heightFt: height,
              attempt: a,
              result,
            });
          if (id === gambler && height === 10) {
            await t(1, "pass");
            next.push(id);
            continue;
          }
          const pClear = Math.max(0.06, 0.95 - (height - 10) * 0.18);
          const firstClears = chance(pClear);
          const secondClears = chance(pClear); // fresh draw for attempt 2
          if (firstClears) {
            await t(1, "clear");
            next.push(id);
          } else if (secondClears) {
            await t(1, "miss");
            await t(2, "clear");
            next.push(id);
          } else {
            await t(1, "miss");
            await t(2, "miss");
          }
        }
        alive = next;
        height += 1;
      }
      // Last survivor keeps tossing until out (going for the record)
      while (alive.length === 1 && height < 26) {
        const id = alive[0];
        await db.recordKegAttempt({ id: `${id}:keg:h${height}:a1`, competitorId: id, heightFt: height, attempt: 1, result: "miss" });
        await db.recordKegAttempt({ id: `${id}:keg:h${height}:a2`, competitorId: id, heightFt: height, attempt: 2, result: chance(0.3) ? "clear" : "miss" });
        const st = (await view("keg", divisionId)).res;
        const mine = st.byCompetitor.get(id)!;
        if (mine.cumulative < height) alive = []; // two misses → out
        else height += 1;
      }

      const done = (await view("keg", divisionId)).res;
      expect(eventProgress(done).complete).toBe(true);
      expect(pendingScorers(done)).toBeNull();

      // Pass-risk: if the gambler never cleared anything they score 0 but
      // still rank as a participant, ahead of the keg skipper (field+1)
      const g = done.byCompetitor.get(gambler)!;
      expect(g.participated).toBe(true);
      const skipper = done.results.find((r) => r.skipped);
      if (skipper) expect(g.points!).toBeLessThan(skipper.points!);

      const winner = done.results[0];
      note(`Keg ${divisionId}: won at ${winner.cumulative} ft by bib ${(await view("keg", divisionId)).field.find((c) => c.id === winner.competitorId)!.bibNumber}; gambler cleared ${g.cumulative} ft after passing the opener.`);
    }

    // Fat-finger undo: record a bogus clear at 30 ft, undo it, state reverts
    const { field } = await view("keg", "mens");
    const oops = field.find((c) => !c.eventSkips.includes("keg"))!.id;
    const before = (await view("keg", "mens")).res.byCompetitor.get(oops)!.cumulative;
    await db.recordKegAttempt({ id: `${oops}:keg:h30:a1`, competitorId: oops, heightFt: 30, attempt: 1, result: "clear" });
    await db.undoLastKegAttempt(oops);
    expect((await view("keg", "mens")).res.byCompetitor.get(oops)!.cumulative).toBe(before);
  });

  it("phase 5 — remaining rounds, cuts, finals resets, mid-day withdrawal", async () => {
    // Mens axe rounds 2-4 (cut top 10, then finals top 3)
    for (let r = 2; r <= 4; r++) {
      const res = await scoreRound("axe", "mens", r);
      if (r < 4) expectReadiness(res, r);
    }
    const axe = (await view("axe", "mens")).res;
    expect(eventProgress(axe).complete).toBe(true);
    // Finals reset: winner is the best FINALS score among finalists
    const finalists = axe.results.filter((x) => x.isFinalist);
    expect(finalists.length).toBeGreaterThanOrEqual(3);
    const best = Math.max(...finalists.map((f) => f.finalsScore ?? -1));
    expect(finalists.find((f) => f.rank === 1)!.finalsScore).toBe(best);
    // Stratification: every finalist outranks every non-finalist
    const worstFinalist = Math.max(...finalists.map((f) => f.rank!));
    const bestNonFinalist = Math.min(
      ...axe.results.filter((x) => !x.isFinalist && x.rank !== null).map((x) => x.rank!)
    );
    expect(worstFinalist).toBeLessThan(bestNonFinalist);

    // Mid-day withdrawal probe: an archery R1 finisher tweaks a knee and
    // leaves. Their missing R2 keeps the cut from ever locking...
    const arch = (await view("archery", "mens")).res;
    const hurt = arch.eligibleByRound[1][5];
    await scoreRound("archery", "mens", 2, { holdOut: 0, scripted: undefined }).catch(() => {});
    // (scoreRound scored everyone incl. the "hurt" competitor — rewind THEIR
    // round 2 to simulate the no-show, then observe the stuck state)
    await db.deleteRoundAttempts(hurt, "archery", 2);
    const stuck = (await view("archery", "mens")).res;
    expect(roundReadiness(stuck)).toBeNull(); // cut can't lock
    expect(pendingScorers(stuck)!.competitorIds).toEqual([hurt]);
    note(
      "Mid-day withdrawal: a competitor who quits after scoring earlier rounds blocks the cut forever until the director marks them event-skipped — which then scores them field+1 and DISCARDS their earlier rounds in that event. The rules' 'missed a round ranks below their stratum' treatment isn't reachable for a live cut."
    );
    // Director resolves it the only way available: event skip (field+1)
    await db.updateCompetitor(hurt, { eventSkips: ["archery"] });
    const resolved = (await view("archery", "mens")).res;
    expect(resolved.cuts.find((c) => c.afterRound === 2)?.locked).toBe(true);
    expect(resolved.byCompetitor.get(hurt)!.points).toBe(resolved.fieldSize + 1);

    for (let r = 3; r <= 4; r++) await scoreRound("archery", "mens", r);
    for (const [ev, lastRound] of [["caber", 4], ["chop", 4], ["hammer", 4]] as [EventId, number][]) {
      for (let r = ev === "hammer" ? 1 : 2; r <= lastRound; r++) await scoreRound(ev, "mens", r);
      expect(eventProgress((await view(ev, "mens")).res).complete).toBe(true);
    }

    // Womens: 3 rounds each (cut half, then top 3 finals)
    for (const ev of ["axe", "archery", "caber", "chop", "hammer"] as EventId[]) {
      const plan = getEvent(ev)!.divisions.womens!;
      for (let r = ev === "hammer" ? 1 : 2; r <= plan.rounds.length; r++) {
        await scoreRound(ev, "womens", r);
      }
      expect(eventProgress((await view(ev, "womens")).res).complete).toBe(true);
    }
  });

  it("phase 6 — mentors scripted to a title tie; arrow-off decides it", async () => {
    const mentors = (await db.fetchCompetitors()).filter((c) => c.divisionId === "mentors");
    const [A, B, C, D] = mentors.map((c) => c.id);
    // A wins axe+archery, B second; B wins chop+hammer, A second; C third, D fourth
    // → A and B tie on 6 points total: arrow-off required.
    const script = (ev: EventId, vals: [number[], number[], number[], number[]], round: number) =>
      scoreRound(ev, "mentors", round, {
        scripted: new Map([[A, vals[0]], [B, vals[1]], [C, vals[2]], [D, vals[3]]]),
      });

    for (let r = 1; r <= 3; r++) {
      await script("axe", [[9, 9], [8, 8], [5, 5], [2, 2]], r);       // A > B > C > D
      await script("archery", [[24], [20], [15], [10]], r);           // A > B > C > D
      await script("chop", [[30], [25], [50], [70]], r);              // B < A < C < D (asc)
      await script("hammer", r < 3 ? [[30, 30], [40, 40], [20, 20], [10, 10]] : [[40], [60], [20], [0]], r); // B > A > C > D
    }

    const st = await standingsFor("mentors");
    const a = st.standings.find((s) => s.competitorId === A)!;
    const b = st.standings.find((s) => s.competitorId === B)!;
    expect(a.total).toBe(6);
    expect(b.total).toBe(6);
    expect(a.tiebreakRequired).toBe(true);
    expect(b.tiebreakRequired).toBe(true);

    // Field runs the arrow-off; B lands closest to the bull
    const settings = await db.fetchSettings();
    await db.saveSettings({
      titleTiebreakWinners: { ...(settings.titleTiebreakWinners ?? {}), mentors: B },
    });
    const after = await standingsFor("mentors");
    expect(after.standings[0].competitorId).toBe(B);
    expect(after.standings[0].wonTiebreak).toBe(true);
    expect(after.standings.find((s) => s.competitorId === A)!.rank).toBe(2);
    note("Mentors title tied at 6 pts (engineered) — arrow-off flow flagged, recorded, and resolved cleanly.");
  });

  it("phase 7 — end of day: everything complete, standings sane, backup survives", async () => {
    // Every event/division fully complete, nobody chased
    for (const div of divisions) {
      for (const ev of divisionEvents(div.id)) {
        const { res } = await view(ev.id, div.id);
        const p = eventProgress(res);
        if (!p.complete) {
          console.log(`INCOMPLETE: ${ev.id}/${div.id}`, p, pendingScorers(res));
        }
        expect(p.complete, `${ev.id}/${div.id} should be complete`).toBe(true);
        expect(pendingScorers(res)).toBeNull();
      }
    }

    // Standings integrity per division
    for (const div of divisions) {
      const { standings, eventResults, field } = await standingsFor(div.id);
      expect(standings.length).toBe(field.length);
      golfConsistent(standings);
      for (const s of standings) {
        const sum = Object.values(s.eventPoints).reduce((x, y) => x + y, 0);
        expect(sum).toBe(s.total);
      }
      // Every started event awarded points to every field member
      for (const [, res] of eventResults) {
        for (const c of field) {
          const r = res.byCompetitor.get(c.id)!;
          expect(r.points).not.toBeNull();
          if (r.skipped) expect(r.points).toBe(res.fieldSize + 1);
        }
      }
      const champ = field.find((c) => c.id === standings[0].competitorId)!;
      note(`${div.name} champion: bib ${champ.bibNumber} ${champ.firstName} ${champ.lastName} with ${standings[0].total} pts across ${eventResults.size} events.`);
    }

    // Backup round-trip: export, re-import, standings identical, archive intact
    const before = await Promise.all(divisions.map((d) => standingsFor(d.id)));
    const backup = await db.exportBackup();
    const { competitions } = await db.importBackup(backup);
    expect(competitions).toBe(2); // 2025 archive + mock 2026
    const after = await Promise.all(divisions.map((d) => standingsFor(d.id)));
    for (let i = 0; i < divisions.length; i++) {
      expect(after[i].standings.map((s) => [s.competitorId, s.rank, s.total])).toEqual(
        before[i].standings.map((s) => [s.competitorId, s.rank, s.total])
      );
    }

    console.log("\n══ MOCK EVENT OBSERVATIONS ══\n" + OBSERVATIONS.map((o) => "• " + o).join("\n"));
  });

  it("phase 8 — reset active season scores: scores gone, roster kept, tiebreak cleared", async () => {
    const rosterBefore = (await db.fetchCompetitors()).length;
    expect((await db.fetchScores()).length).toBeGreaterThan(0);
    await db.resetActiveSeasonScores();
    expect(await db.fetchScores()).toEqual([]);
    expect(await db.fetchKegAttempts()).toEqual([]);
    expect((await db.fetchCompetitors()).length).toBe(rosterBefore);
    expect((await db.fetchSettings()).titleTiebreakWinners?.mentors).toBeUndefined();
    // The archived 2025 season is untouched — only the ACTIVE season resets
    const comps = await db.fetchCompetitions();
    expect(comps.find((c) => c.id === "season-2025")!.competitorCount).toBeGreaterThan(0);
  });

  it("phase 9 — season lifecycle: archive, reopen, one live season at a time", async () => {
    const before = (await db.fetchCompetitions()).find((c) => c.isActive)!;

    // Archive the live season in place — nothing is live afterwards
    await db.archiveCompetition(before.id);
    let comps = await db.fetchCompetitions();
    expect(comps.every((c) => c.status === "completed")).toBe(true);

    // Reopen the 2025 archive: it becomes the ONLY live season and the viewed one
    await db.reopenCompetition("season-2025");
    comps = await db.fetchCompetitions();
    expect(comps.filter((c) => c.status === "active").map((c) => c.id)).toEqual(["season-2025"]);
    expect(comps.find((c) => c.isActive)!.id).toBe("season-2025");

    // Starting a new season: it is live and viewed; every other season is archived
    await db.createCompetition({ name: "The Ledge Games", year: 2027 });
    comps = await db.fetchCompetitions();
    expect(comps.filter((c) => c.status === "active").map((c) => c.year)).toEqual([2027]);
    expect(comps.find((c) => c.isActive)!.year).toBe(2027);
  });
});

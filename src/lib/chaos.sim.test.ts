// Adversarial mock events — everything a chaotic Saturday could throw at the
// system, through the REAL adapter: rounds scored out of order, duplicate and
// conflicting saves, roster sabotage mid-event, keg entered sideways, season
// lifecycle abuse, and hostile values. Invariants are asserted after every
// blow; anything that survives here should survive the field.

import { describe, expect, it } from "vitest";
import type { AttemptScore, Competitor, DivisionId, EventId } from "./types";
import {
  computeEventResults,
  computeStandings,
  divisionField,
  eventProgress,
  kegCompetitorState,
  pendingScorers,
  projectedCut,
  type Standing,
} from "./scoring";
import { divisionEvents, getDivision, getEvent } from "@/data/competition-config";
import { newCompetitorId } from "./roster";

// ── Browser shims for the real adapter ─────────────────────
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  },
  window: { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true },
});
const db = await import("@/data/db-local");

function makeCompetitor(divisionId: DivisionId, bib: number): Competitor {
  return {
    id: newCompetitorId(bib),
    divisionId,
    bibNumber: bib,
    firstName: `C${bib}`,
    lastName: "Chaos",
    nickname: null,
    hometown: null,
    email: null,
    shirtSize: null,
    registration: "cash",
    paid: false,
    checkedIn: true,
    noShow: false,
    eventSkips: [],
  };
}

function attempt(cid: string, eventId: EventId, round: number, a: number, value: number, penalty = 0): AttemptScore {
  return { id: `${cid}:${eventId}:r${round}:a${a}`, competitorId: cid, eventId, round, attempt: a, value, penalty };
}

async function axeView(divisionId: DivisionId = "mens") {
  const [competitors, scores, kegAttempts] = await Promise.all([
    db.fetchCompetitors(),
    db.fetchScores(),
    db.fetchKegAttempts(),
  ]);
  const field = divisionField(divisionId, competitors);
  return {
    field,
    res: computeEventResults({
      event: getEvent("axe")!,
      division: getDivision(divisionId)!,
      field,
      scores,
      kegAttempts,
    }),
  };
}

function golfConsistent(standings: Standing[]) {
  const byRank = new Map<number, number>();
  for (const s of standings) byRank.set(s.rank, (byRank.get(s.rank) ?? 0) + 1);
  let expected = 1;
  for (const r of [...byRank.keys()].sort((a, b) => a - b)) {
    expect(r).toBe(expected);
    expected += byRank.get(r)!;
  }
}

async function standingsSane(divisionId: DivisionId) {
  const [competitors, scores, kegAttempts] = await Promise.all([
    db.fetchCompetitors(),
    db.fetchScores(),
    db.fetchKegAttempts(),
  ]);
  const field = divisionField(divisionId, competitors);
  const { standings } = computeStandings({
    division: getDivision(divisionId)!,
    field,
    events: divisionEvents(divisionId),
    scores,
    kegAttempts,
  });
  expect(standings.length).toBe(field.length);
  golfConsistent(standings);
  for (const s of standings) {
    expect(Number.isFinite(s.total)).toBe(true);
    expect(Object.values(s.eventPoints).reduce((x, y) => x + y, 0)).toBe(s.total);
  }
  return standings;
}

let mens: Competitor[] = [];

describe("chaos events (adversarial)", () => {
  it("setup — fresh chaos season", async () => {
    await db.createCompetition({ name: "Chaos Cup", year: 2030 });
    mens = Array.from({ length: 10 }, (_, i) => makeCompetitor("mens", i + 1));
    await db.addCompetitors([...mens, ...Array.from({ length: 4 }, (_, i) => makeCompetitor("womens", 101 + i))]);
  });

  it("chaos 1 — rounds scored out of order never lock a cut early", async () => {
    // A scorer on the wrong tab enters ROUND 3 before round 1 exists
    await db.saveRoundAttempts([attempt(mens[0].id, "axe", 3, 1, 9), attempt(mens[0].id, "axe", 3, 2, 8)]);
    let { res } = await axeView();
    expect(res.currentRound).toBe(3);
    expect(res.cuts.every((c) => !c.locked)).toBe(true); // nothing locks
    expect(pendingScorers(res)!.round).toBe(1); // the chase points at round 1
    expect(res.eligibleByRound[1].length).toBe(10); // nobody phantom-cut

    // Round 1 completes for everyone — the cut must lock on ROUND 1 data
    // only, unmoved by the stray round-3 rows
    for (const c of mens) {
      await db.saveRoundAttempts([attempt(c.id, "axe", 1, 1, c.bibNumber), attempt(c.id, "axe", 1, 2, 0)]);
    }
    res = (await axeView()).res;
    const cut = res.cuts.find((x) => x.afterRound === 1)!;
    expect(cut.locked).toBe(true);
    expect(cut.advancerIds.length).toBe(5); // top half of 10, bibs 6-10 scored highest
    expect(new Set(cut.advancerIds)).toEqual(new Set(mens.slice(5).map((c) => c.id)));
    await standingsSane("mens");
  });

  it("chaos 2 — duplicate, conflicting, and hostile saves", async () => {
    const c = mens[7].id;
    // Same attempt saved twice with different values → exactly one row, last wins
    await db.saveRoundAttempts([attempt(c, "axe", 2, 1, 3)]);
    await db.saveRoundAttempts([attempt(c, "axe", 2, 1, 7)]);
    const rows = (await db.fetchScores()).filter((s) => s.competitorId === c && s.eventId === "axe" && s.round === 2);
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe(7);

    // Two "devices" interleave: A deletes the round while B re-saves it
    await db.deleteRoundAttempts(c, "axe", 2);
    await db.saveRoundAttempts([attempt(c, "axe", 2, 1, 5), attempt(c, "axe", 2, 2, 6)]);
    expect((await axeView()).res.byCompetitor.get(c)!.roundScores[1]).toBe(11);

    // Hostile values straight at the data layer: huge, penalty-stacked —
    // the engine must stay finite and golf-consistent
    await db.saveRoundAttempts([attempt(mens[6].id, "chop", 1, 1, 1e12, 10)]);
    await db.saveRoundAttempts([attempt(mens[5].id, "chop", 1, 1, 31.4, 40)]);
    await standingsSane("mens");
    await db.deleteRoundAttempts(mens[6].id, "chop", 1);
    await db.deleteRoundAttempts(mens[5].id, "chop", 1);
  });

  it("chaos 3 — roster sabotage mid-event", async () => {
    // Delete a competitor who has scores and once advanced: no orphan rows,
    // the locked cut recomputes on the smaller field
    const victim = mens[9]; // top scorer, advanced
    await db.deleteCompetitor(victim.id);
    expect((await db.fetchScores()).some((s) => s.competitorId === victim.id)).toBe(false);
    let { res, field } = await axeView();
    expect(field.length).toBe(9);
    const cut = res.cuts.find((x) => x.afterRound === 1)!;
    expect(cut.locked).toBe(true);
    expect(cut.target).toBe(5); // ceil(9/2)
    mens = mens.slice(0, 9);

    // Bib swap mid-event: identity is the id, standings unmoved
    const before = await standingsSane("mens");
    await db.updateCompetitor(mens[0].id, { bibNumber: 99 });
    const after = await standingsSane("mens");
    expect(after.map((s) => [s.competitorId, s.rank])).toEqual(before.map((s) => [s.competitorId, s.rank]));

    // An advancer is scratched mid-day (injury): field shrinks, half-target
    // shifts, everything stays consistent — then they're un-scratched
    await db.updateCompetitor(mens[8].id, { noShow: true });
    ({ res, field } = await axeView());
    expect(field.length).toBe(8);
    expect(res.cuts.find((x) => x.afterRound === 1)!.target).toBe(4);
    await standingsSane("mens");
    await db.updateCompetitor(mens[8].id, { checkedIn: true }); // clears noShow too
    expect((await axeView()).field.length).toBe(9);

    // Walk-on flood + duplicate bib rejection
    await expect(db.addCompetitors([makeCompetitor("mens", 99)])).rejects.toThrow(/taken/);
    await db.addCompetitors(Array.from({ length: 150 }, (_, i) => makeCompetitor("mens", 200 + i)));
    expect((await axeView()).field.length).toBe(159);
    // The flood re-opens round 1 (they all owe it) — locked cut reverts to
    // projection; mark them all event-skipped and it re-locks
    expect((await axeView()).res.cuts.find((x) => x.afterRound === 1)!.locked).toBe(false);
    for (const c of (await db.fetchCompetitors()).filter((x) => x.bibNumber >= 200)) {
      await db.updateCompetitor(c.id, { eventSkips: ["axe", "keg", "caber", "archery", "chop", "hammer"] });
    }
    expect((await axeView()).res.cuts.find((x) => x.afterRound === 1)!.locked).toBe(true);
    await standingsSane("mens");
  });

  it("chaos 4 — keg entered sideways", async () => {
    const [a, b] = mens.map((c) => c.id);
    const keg = (cid: string, h: number, n: number, result: "clear" | "miss" | "pass") =>
      db.recordKegAttempt({ id: `${cid}:keg:h${h}:a${n}`, competitorId: cid, heightFt: h, attempt: n, result });

    // Heights recorded out of order: clear at 15 first, then miss out at 12
    await keg(a, 15, 1, "clear");
    await keg(a, 12, 1, "miss");
    await keg(a, 12, 2, "miss");
    const stA = kegCompetitorState(a, await db.fetchKegAttempts(), 2);
    expect(stA.highestCleared).toBe(15); // best cleared stands
    expect(stA.out).toBe(true); // and they're out — no crash, no zombie

    // Pass recorded over an existing miss (id collision at attempt 1) —
    // the UI hides Pass after a miss; the data layer overwrites. Document
    // that the state stays sane and undo unwinds it.
    await keg(b, 10, 1, "miss");
    await keg(b, 10, 1, "pass"); // same id — upsert
    let stB = kegCompetitorState(b, await db.fetchKegAttempts(), 2);
    expect(stB.missesAt(10)).toBe(0); // the miss is gone, pass stands
    await db.undoLastKegAttempt(b);
    stB = kegCompetitorState(b, await db.fetchKegAttempts(), 2);
    expect(stB.attempts.length).toBe(0);
    await db.undoLastKegAttempt(b); // undo past empty — harmless no-op

    const { res } = await axeView(); // engine-wide sanity with keg data present
    void res;
    await standingsSane("mens");
  });

  it("chaos 5 — lifecycle abuse: reset, archive/reopen round trips, restore", async () => {
    const before = await standingsSane("mens");

    // Archive mid-event, reopen — nothing moves
    const comp = (await db.fetchCompetitions()).find((c) => c.isActive)!;
    await db.archiveCompetition(comp.id);
    await db.reopenCompetition(comp.id);
    const after = await standingsSane("mens");
    expect(after.map((s) => [s.competitorId, s.rank, s.total])).toEqual(
      before.map((s) => [s.competitorId, s.rank, s.total])
    );

    // Backup → nuke scores → restore → identical again
    const backup = await db.exportBackup();
    await db.resetActiveSeasonScores();
    expect(await db.fetchScores()).toEqual([]);
    expect(projectedCut((await axeView()).res)).toBeNull(); // nothing to project
    await db.importBackup(backup);
    const restored = await standingsSane("mens");
    expect(restored.map((s) => [s.competitorId, s.rank, s.total])).toEqual(
      before.map((s) => [s.competitorId, s.rank, s.total])
    );

    // The 2025 archive survived every bit of this
    const comps = await db.fetchCompetitions();
    expect(comps.find((c) => c.id === "season-2025")!.competitorCount).toBeGreaterThan(100);
  });

  it("chaos 6 — degenerate fields never divide by zero", async () => {
    // Everyone in womens skips axe; a division of one; an empty field
    for (const c of (await db.fetchCompetitors()).filter((x) => x.divisionId === "womens")) {
      await db.updateCompetitor(c.id, { eventSkips: ["axe"] });
    }
    const w = await axeView("womens");
    expect(w.res.results.every((r) => r.skipped)).toBe(true);
    expect(eventProgress(w.res).started).toBe(false);
    expect(pendingScorers(w.res)).toBeNull();
    await standingsSane("womens");

    // Field of exactly 1 (mentors has nobody; use a lone walk-on division sim)
    await db.addCompetitors([makeCompetitor("mentors", 151)]);
    const lone = (await db.fetchCompetitors()).find((c) => c.divisionId === "mentors")!;
    await db.saveRoundAttempts([attempt(lone.id, "archery", 1, 1, 20)]);
    const m = await (async () => {
      const [competitors, scores, kegAttempts] = await Promise.all([
        db.fetchCompetitors(),
        db.fetchScores(),
        db.fetchKegAttempts(),
      ]);
      const field = divisionField("mentors", competitors);
      return computeEventResults({
        event: getEvent("archery")!,
        division: getDivision("mentors")!,
        field,
        scores,
        kegAttempts,
      });
    })();
    expect(m.byCompetitor.get(lone.id)!.rank).toBe(1);
    await standingsSane("mentors");
  });
});

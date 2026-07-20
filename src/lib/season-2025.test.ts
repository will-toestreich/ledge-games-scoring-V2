// Smoke test: the engine over the real imported 2025 season.
// Guards the import pipeline and engine against regressions using known
// outcomes from last year. Note: the engine applies the CURRENT rules
// (finals reset, field+1 skips), so overall ranks can legitimately differ
// from the 2025 published standings — assertions here stick to outcomes
// that hold under both rule sets.

import { describe, expect, it } from "vitest";
import season from "../data/season-2025.json";
import { computeStandings, divisionField } from "./scoring";
import { divisions, divisionEvents } from "../data/competition-config";
import type { AttemptScore, Competitor, DivisionId, KegAttempt } from "./types";

const competitors = season.competitors as unknown as Competitor[];
const scores = season.scores as unknown as AttemptScore[];
const kegAttempts = season.kegAttempts as unknown as KegAttempt[];

function standingsFor(divisionId: DivisionId) {
  const division = divisions.find((d) => d.id === divisionId)!;
  const field = divisionField(divisionId, competitors);
  return {
    field,
    ...computeStandings({
      division,
      field,
      events: divisionEvents(divisionId),
      scores,
      kegAttempts,
    }),
  };
}

const byBib = (field: Competitor[], bib: number) => field.find((c) => c.bibNumber === bib)!;

describe("2025 season import", () => {
  it("fields match the real rosters", () => {
    expect(divisionField("mens", competitors).length).toBe(74);
    expect(divisionField("womens", competitors).length).toBe(30);
    expect(divisionField("mentors", competitors).length).toBe(4);
  });

  it("every division event started and produced points for participants", () => {
    for (const div of divisions) {
      const { eventResults } = standingsFor(div.id);
      expect(eventResults.size).toBe(divisionEvents(div.id).length);
      for (const res of eventResults.values()) {
        expect(res.started).toBe(true);
        for (const r of res.results) {
          if (r.participated) expect(r.points).not.toBeNull();
        }
      }
    }
  });

  it("mentors compete in exactly 4 events (no caber, no keg)", () => {
    const ids = divisionEvents("mentors").map((e) => e.id).sort();
    expect(ids).toEqual(["archery", "axe", "chop", "hammer"]);
  });

  it("keg: James Berghammer (bib 77) won at 18 ft", () => {
    const { field, eventResults } = standingsFor("mens");
    const berghammer = byBib(field, 77);
    const keg = eventResults.get("keg")!.byCompetitor.get(berghammer.id)!;
    expect(keg.cumulative).toBe(18); // highest cleared height
    expect(keg.rank).toBe(1);
  });

  it("hammer: women's winner Emma Davis (bib 104), finals score 120", () => {
    const { field, eventResults } = standingsFor("womens");
    const emma = byBib(field, 104);
    const hammer = eventResults.get("hammer")!.byCompetitor.get(emma.id)!;
    // Her finals landed in the loosely-used RD4 column — importer must catch it
    expect(hammer.finalsScore).toBe(120);
    expect(hammer.rank).toBe(1);
  });

  it("standings have contiguous golf ranks starting at 1", () => {
    for (const div of divisions) {
      const { standings } = standingsFor(div.id);
      expect(standings[0].rank).toBe(1);
      for (let i = 1; i < standings.length; i++) {
        expect(standings[i].rank).toBeGreaterThanOrEqual(standings[i - 1].rank);
        expect(standings[i].total).toBeGreaterThanOrEqual(standings[i - 1].total);
      }
    }
  });
});

// CSV exports and the data health check, against the built-in 2025 season
// (real shapes) plus synthetic junk the health check must catch.

import { describe, expect, it } from "vitest";
import season2025 from "@/data/season-2025.json";
import type { AttemptScore, Competitor, KegAttempt, Settings } from "./types";
import { resultsCsv, rosterCsv } from "./exports";
import { checkDataHealth } from "./health";

const season = season2025 as unknown as {
  competitors: Competitor[];
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
  settings: Settings;
};

describe("csv exports", () => {
  it("results export covers every fielded competitor with sane ranks", () => {
    const csv = resultsCsv(season);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("Division,Rank,Bib");
    expect(lines[0]).toContain("Axe Throw");
    // One line per non-no-show competitor plus the header
    const fielded = season.competitors.filter((c) => !c.noShow).length;
    expect(lines.length).toBe(fielded + 1);
    // The 2025 men's champion leads the men's block with rank 1
    expect(lines[1].startsWith("Men's,1,")).toBe(true);
  });

  it("roster export includes desk columns and escapes commas", () => {
    const withComma: Competitor = {
      ...season.competitors[0],
      id: "x",
      bibNumber: 999,
      hometown: "Fond du Lac, WI",
    };
    const csv = rosterCsv([withComma]);
    expect(csv.split("\n")[0]).toContain("Paid,Checked in,No-show");
    expect(csv).toContain('"Fond du Lac, WI"');
  });
});

describe("data health check", () => {
  it("the real 2025 season yields exactly one KNOWN historical finding", () => {
    const report = checkDataHealth(season.competitors, season.scores, season.kegAttempts);
    // The 2025 sheets recorded 39 hammer set values above the current rules'
    // theoretical max (2 throws × 20-pt back logs = 40). Historical record,
    // imported as-is — the check is right to flag it, and this test pins it
    // so any NEW kind of junk still fails loudly.
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toContain("exceed the round's max");
    expect(report.checked.competitors).toBe(season.competitors.length);
  });

  it("catches every category of junk", () => {
    const c = season.competitors[0]; // mens
    const junkScores: AttemptScore[] = [
      { id: "gone:axe:r1:a1", competitorId: "deleted-guy", eventId: "axe", round: 1, attempt: 1, value: 5, penalty: 0 },
      { id: `${c.id}:caber:r9:a1`, competitorId: c.id, eventId: "caber", round: 9, attempt: 1, value: 6, penalty: 0 },
      { id: `${c.id}:axe:r1:a9`, competitorId: c.id, eventId: "axe", round: 1, attempt: 9, value: 5, penalty: 0 },
      { id: `${c.id}:axe:r2:a1`, competitorId: c.id, eventId: "axe", round: 2, attempt: 1, value: -3, penalty: 0 },
      { id: `${c.id}:archery:r1:a1`, competitorId: c.id, eventId: "archery", round: 1, attempt: 1, value: 999, penalty: 0 },
    ];
    const mentors = season.competitors.find((x) => x.divisionId === "mentors")!;
    junkScores.push({
      id: `${mentors.id}:caber:r1:a1`, // mentors don't throw caber
      competitorId: mentors.id,
      eventId: "caber",
      round: 1,
      attempt: 1,
      value: 6,
      penalty: 0,
    });
    const junkKeg: KegAttempt[] = [
      { id: "gone:keg:h10:a1", competitorId: "deleted-guy", heightFt: 10, attempt: 1, result: "clear" },
      { id: `${mentors.id}:keg:h10:a1`, competitorId: mentors.id, heightFt: 10, attempt: 1, result: "clear" },
    ];
    const dupBib = [{ ...season.competitors[1], id: "dup-bib-guy" }];
    const contradictory = [{ ...season.competitors[2], id: "flags-guy", bibNumber: 998, checkedIn: true, noShow: true }];

    const report = checkDataHealth(
      [...season.competitors, ...dupBib, ...contradictory],
      junkScores,
      junkKeg
    );
    const all = report.findings.join(" | ");
    expect(all).toContain("belong to deleted competitors");
    expect(all).toContain("shared by multiple competitors");
    expect(all).toContain("both checked in and no-show");
    expect(all).toContain("rounds beyond the event's plan");
    expect(all).toContain("attempt slots beyond the round's plan");
    expect(all).toContain("negative or non-finite");
    expect(all).toContain("exceed the round's max");
    expect(all).toContain("division doesn't run");
    expect(all).toContain("division that doesn't toss");
  });
});

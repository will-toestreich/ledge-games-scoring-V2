// Data health check: the junk that hand-corrections and imports can leave
// behind. The engine tolerates all of it (proven by the chaos suite) —
// tolerating isn't the same as it being right, so this makes it visible.

import { getEvent } from "@/data/competition-config";
import type { AttemptScore, Competitor, KegAttempt } from "./types";

export interface HealthReport {
  findings: string[];
  checked: { competitors: number; scores: number; kegAttempts: number };
}

export function checkDataHealth(
  competitors: Competitor[],
  scores: AttemptScore[],
  kegAttempts: KegAttempt[]
): HealthReport {
  const findings: string[] = [];
  const byId = new Map(competitors.map((c) => [c.id, c]));
  const label = (c: Competitor) => `bib ${c.bibNumber} ${c.firstName} ${c.lastName}`;
  const add = (count: number, msg: string, example?: string) => {
    if (count > 0) findings.push(`${count} ${msg}${example ? ` (e.g. ${example})` : ""}`);
  };

  // Orphans: rows pointing at competitors that no longer exist
  const orphanScores = scores.filter((s) => !byId.has(s.competitorId));
  add(orphanScores.length, "scores belong to deleted competitors", orphanScores[0]?.id);
  const orphanKeg = kegAttempts.filter((a) => !byId.has(a.competitorId));
  add(orphanKeg.length, "keg attempts belong to deleted competitors", orphanKeg[0]?.id);

  // Roster integrity
  const bibCount = new Map<number, Competitor[]>();
  for (const c of competitors) bibCount.set(c.bibNumber, [...(bibCount.get(c.bibNumber) ?? []), c]);
  const dupBibs = [...bibCount.entries()].filter(([, cs]) => cs.length > 1);
  add(dupBibs.length, "bib numbers are shared by multiple competitors", dupBibs[0] ? `bib ${dupBibs[0][0]}` : undefined);
  const idCount = new Map<string, number>();
  for (const c of competitors) idCount.set(c.id, (idCount.get(c.id) ?? 0) + 1);
  add([...idCount.values()].filter((n) => n > 1).length, "competitor ids are duplicated");
  const contradictory = competitors.filter((c) => c.checkedIn && c.noShow);
  add(contradictory.length, "competitors are both checked in and no-show", contradictory[0] && label(contradictory[0]));

  // Score shape vs. each competitor's division plan
  let wrongEvent = 0;
  let beyondRound = 0;
  let beyondAttempt = 0;
  let overMax = 0;
  let badValue = 0;
  let skippedButScored = 0;
  const example: Record<string, string> = {};
  for (const s of scores) {
    const c = byId.get(s.competitorId);
    if (!c) continue;
    const who = `${label(c)} ${s.eventId} r${s.round}`;
    if (!Number.isFinite(s.value) || s.value < 0 || !Number.isFinite(s.penalty) || s.penalty < 0) {
      badValue++;
      example.badValue ??= who;
    }
    const plan = getEvent(s.eventId)?.divisions[c.divisionId];
    if (!plan || plan.rounds.length === 0) {
      wrongEvent++;
      example.wrongEvent ??= who;
      continue;
    }
    if (s.round < 1 || s.round > plan.rounds.length) {
      beyondRound++;
      example.beyondRound ??= who;
      continue;
    }
    const rp = plan.rounds[s.round - 1];
    if (s.attempt < 1 || s.attempt > rp.attempts) {
      beyondAttempt++;
      example.beyondAttempt ??= who;
    }
    if (rp.maxPerAttempt !== undefined && s.value > rp.maxPerAttempt) {
      overMax++;
      example.overMax ??= who;
    }
    if (c.eventSkips.includes(s.eventId)) {
      skippedButScored++;
      example.skippedButScored ??= who;
    }
  }
  add(wrongEvent, "scores are in events their division doesn't run", example.wrongEvent);
  add(beyondRound, "scores are in rounds beyond the event's plan", example.beyondRound);
  add(beyondAttempt, "scores are in attempt slots beyond the round's plan", example.beyondAttempt);
  add(overMax, "scores exceed the round's max per attempt", example.overMax);
  add(badValue, "scores have negative or non-finite values/penalties", example.badValue);
  add(skippedButScored, "scores exist for competitors marked skipped in that event", example.skippedButScored);

  // Keg sanity
  let kegBad = 0;
  let kegSkipped = 0;
  let kegWrongDiv = 0;
  for (const a of kegAttempts) {
    const c = byId.get(a.competitorId);
    if (!c) continue;
    if (!Number.isInteger(a.heightFt) || a.heightFt <= 0 || a.attempt < 1) kegBad++;
    if (c.eventSkips.includes("keg")) kegSkipped++;
    if (getEvent("keg")?.divisions[c.divisionId] === undefined) kegWrongDiv++;
  }
  add(kegBad, "keg attempts have nonsense heights or attempt numbers");
  add(kegSkipped, "keg attempts exist for competitors marked keg-skipped");
  add(kegWrongDiv, "keg attempts exist for a division that doesn't toss");

  return {
    findings,
    checked: { competitors: competitors.length, scores: scores.length, kegAttempts: kegAttempts.length },
  };
}

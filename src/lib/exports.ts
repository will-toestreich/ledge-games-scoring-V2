// CSV exports: final results (standings with per-event points) for the
// awards ceremony and the record, and the roster with desk-relevant columns
// (check-in, payment, merch). Pure builders — the UI only downloads them.

import { divisionEvents, divisions, events } from "@/data/competition-config";
import { computeStandings, divisionField } from "./scoring";
import type { AttemptScore, Competitor, KegAttempt, Settings } from "./types";

function esc(v: string | number | boolean | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: (string | number | boolean | null | undefined)[]) => cells.map(esc).join(",");

export function resultsCsv(opts: {
  competitors: Competitor[];
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
  settings: Settings;
}): string {
  const { competitors, scores, kegAttempts, settings } = opts;
  const lines: string[] = [
    row([
      "Division",
      "Rank",
      "Bib",
      "First name",
      "Last name",
      "Nickname",
      "Hometown",
      ...events.map((e) => e.name),
      "Total",
    ]),
  ];
  for (const division of divisions) {
    const field = divisionField(division.id, competitors);
    if (field.length === 0) continue;
    const { standings } = computeStandings({
      division,
      field,
      events: divisionEvents(division.id),
      scores,
      kegAttempts,
      titleTiebreakWinner: settings.titleTiebreakWinners?.[division.id] ?? null,
    });
    const byId = new Map(field.map((c) => [c.id, c]));
    for (const s of standings) {
      const c = byId.get(s.competitorId)!;
      lines.push(
        row([
          division.name,
          s.rank,
          c.bibNumber,
          c.firstName,
          c.lastName,
          c.nickname,
          c.hometown,
          // Blank for events the division doesn't run or that haven't started
          ...events.map((e) => s.eventPoints[e.id] ?? ""),
          s.total || "",
        ])
      );
    }
  }
  return lines.join("\n");
}

export function rosterCsv(competitors: Competitor[]): string {
  const order = new Map(divisions.map((d) => [d.id, d.displayOrder]));
  const name = new Map(divisions.map((d) => [d.id, d.name]));
  const sorted = [...competitors].sort(
    (a, b) => (order.get(a.divisionId) ?? 9) - (order.get(b.divisionId) ?? 9) || a.bibNumber - b.bibNumber
  );
  const lines: string[] = [
    row([
      "Bib",
      "First name",
      "Last name",
      "Division",
      "Nickname",
      "Hometown",
      "Email",
      "Shirt/Merch",
      "Paid",
      "Checked in",
      "No-show",
      "Event skips",
    ]),
  ];
  for (const c of sorted) {
    lines.push(
      row([
        c.bibNumber,
        c.firstName,
        c.lastName,
        name.get(c.divisionId) ?? c.divisionId,
        c.nickname,
        c.hometown,
        c.email,
        c.shirtSize,
        c.paid ? "yes" : "no",
        c.checkedIn ? "yes" : "no",
        c.noShow ? "yes" : "no",
        c.eventSkips.join(" "),
      ])
    );
  }
  return lines.join("\n");
}

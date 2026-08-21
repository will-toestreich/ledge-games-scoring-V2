// Roster conventions shared by the walk-on form, CSV import, and admin table.

import type { Competitor, DivisionId } from "./types";

export const SHIRT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

/** Bib blocks per the rules: Men's from #1, Women's from #101, Mentors from #151. */
const BIB_START: Record<DivisionId, number> = { mens: 1, womens: 101, mentors: 151 };

export function nextFreeBib(divisionId: DivisionId, competitors: Competitor[]): number {
  const taken = new Set(competitors.map((c) => c.bibNumber));
  let bib = BIB_START[divisionId];
  while (taken.has(bib)) bib++;
  return bib;
}

/**
 * Unique competitor id. The bib prefix is only for debuggability — the random
 * suffix is what prevents collisions: a plain `b${bib}` id collides when a
 * competitor's bib is later edited and the freed bib is reused by a new entry.
 */
export function newCompetitorId(bib: number): string {
  return `b${bib}-${crypto.randomUUID().slice(0, 8)}`;
}

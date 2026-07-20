// Domain types for The Ledge Games scoring system.
// The rules these encode live in docs/RULES.md.

export type DivisionId = "mens" | "womens" | "mentors";
export type EventId = "axe" | "keg" | "caber" | "archery" | "chop" | "hammer";

export interface Division {
  id: DivisionId;
  name: string;
  color: string;
  displayOrder: number;
  /** Total rounds per event for this division (ladder events ignore this). */
  rounds: number;
  /**
   * Field cuts applied after a round completes, keyed by round number.
   * "half" = ceil(field/2). Ties at the cut line all advance.
   */
  cutsAfterRound: Record<number, number | "half">;
}

export interface Competitor {
  id: string;
  divisionId: DivisionId;
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
  /** Day-level no-show (the admin "Scratch" column): excluded from the field entirely. */
  noShow: boolean;
  /** Events this competitor skipped/scratched: scores field size + 1 for each. */
  eventSkips: EventId[];
}

/** How a round's attempts combine into the round score. */
export type AttemptAgg = "sum" | "best";

export interface RoundPlan {
  /** Number of scored attempts (entry fields) in this round. */
  attempts: number;
  attemptAgg: AttemptAgg;
  /** Validation ceiling per attempt value (undefined = uncapped, e.g. chop time). */
  maxPerAttempt?: number;
  /** Scorer-facing description, e.g. "2 sets of 3 axes". */
  attemptLabel: string;
}

export interface EventDivisionPlan {
  rounds: RoundPlan[];
  /** Final round scores reset — finalists rank on the final round alone. */
  finalsReset: boolean;
}

export interface LadderConfig {
  startHeight: number;
  increment: number;
  attemptsPerHeight: number;
}

export interface EventConfig {
  id: EventId;
  name: string;
  displayOrder: number;
  /** "rounds" = round/cut progression; "ladder" = keg-style progressive height. */
  format: "rounds" | "ladder";
  /** "desc" = higher score wins; "asc" = lower wins (Speed Chop). */
  direction: "desc" | "asc";
  unit: string;
  /** Digits accepted/shown after the decimal point. */
  decimals: number;
  /** Chop: +10s penalty for axe outside the designated area, stackable. */
  penaltySeconds?: number;
  /** Caber: attempt values are restricted to these (clock scoring). */
  allowedValues?: number[];
  ladder?: LadderConfig;
  /** Divisions that compete in this event, each with its round plan. */
  divisions: Partial<Record<DivisionId, EventDivisionPlan>>;
}

/** One scored attempt in a rounds-format event. */
export interface AttemptScore {
  id: string; // `${competitorId}:${eventId}:r${round}:a${attempt}`
  competitorId: string;
  eventId: EventId;
  round: number; // 1-based
  attempt: number; // 1-based within the round
  value: number;
  /** Added to value when scoring (chop penalties). Stored separately for auditability. */
  penalty: number;
  /**
   * Competitor declined this attempt (e.g. happy with caber flip 1, passes
   * flip 2). Counts toward round completeness but contributes no score.
   */
  declined?: boolean;
  /** Epoch ms, stamped by the data layer on write. Drives stall detection. */
  recordedAt?: number;
}

/** One attempt (or pass) at a bar height in the keg ladder. */
export interface KegAttempt {
  id: string; // `${competitorId}:keg:h${height}:a${attempt}`
  competitorId: string;
  heightFt: number;
  attempt: number; // 1-based at this height; a pass is recorded as attempt 1
  result: "clear" | "miss" | "pass";
  /** Epoch ms, stamped by the data layer on write. Drives stall detection. */
  recordedAt?: number;
}

export interface Settings {
  competitionName: string;
  year: number;
  scorerPin: string;
  /** Mentors division runs only in years with enough sign-ups. */
  mentorsEnabled: boolean;
  /**
   * Arrow-off results: when a division title ends tied, the field-resolved
   * winner (1 arrow, closest to bullseye) is recorded here by competitor id.
   */
  titleTiebreakWinners?: Partial<Record<DivisionId, string>>;
}

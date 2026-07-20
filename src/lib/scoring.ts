// The Ledge Games scoring engine.
//
// Pure functions only — no store access, no side effects. Implements
// docs/RULES.md: stratified finish order with round cuts, golf-style shared
// ranks, finals resets, the keg ladder, per-event skips (field size + 1),
// and lowest-total-wins overall standings.

import type {
  AttemptScore,
  Competitor,
  Division,
  EventConfig,
  EventId,
  KegAttempt,
} from "./types";

// ─── Result shapes ─────────────────────────────────────────

export interface EventResult {
  competitorId: string;
  /** Has at least one recorded attempt in this event. */
  participated: boolean;
  /** Explicitly skipped this event → field size + 1 points. */
  skipped: boolean;
  /** Last round this competitor was eligible for (rounds format). */
  eligibleThrough: number;
  isFinalist: boolean;
  /** Per-round scores, index round-1; null = no attempts recorded. */
  roundScores: (number | null)[];
  /** Attempts recorded per round (sets happen one at a time on the field). */
  roundAttempts: number[];
  /** True once every planned attempt for the round is recorded. */
  roundComplete: boolean[];
  /** Cumulative across scored rounds (pre-reset; ladder: highest cleared). */
  cumulative: number;
  /** Finals-round score when the event resets in finals, else null. */
  finalsScore: number | null;
  /** Shared golf rank among the division field; null until they have one. */
  rank: number | null;
  /** Competition points toward the overall title; null if event not started. */
  points: number | null;
}

export interface EventResults {
  eventId: EventId;
  divisionId: string;
  /** Any scores recorded for this division+event. */
  started: boolean;
  /** Division runs cuts (false for Mentors and for ladder events). */
  hasCuts: boolean;
  fieldSize: number;
  /** Ordered best → worst, participants first, then pending, then skipped. */
  results: EventResult[];
  byCompetitor: Map<string, EventResult>;
  /** Competitor ids eligible for each round (index round-1). Rounds format only. */
  eligibleByRound: string[][];
  /** Planned attempts per round from the division's plan (rounds format only). */
  attemptsPlanned: number[];
  /** Highest round with any recorded score (0 = not started). */
  currentRound: number;
  /** Ladder events: current bar height and progress of the surviving field at it. */
  ladderStatus?: {
    height: number;
    done: number;
    remaining: number;
    /** Survivors who still owe an outcome at the current bar. */
    pending: string[];
  };
}

export interface Standing {
  competitorId: string;
  /** Competition points per started event. */
  eventPoints: Partial<Record<EventId, number>>;
  eventRanks: Partial<Record<EventId, number | null>>;
  total: number;
  rank: number;
  /** Shares rank 1 → archery arrow-off decides the title (not yet resolved). */
  tiebreakRequired: boolean;
  /** Took the title via the recorded arrow-off result. */
  wonTiebreak: boolean;
}

// ─── Internals ─────────────────────────────────────────────

interface RankEntry {
  competitorId: string;
  /** Primary: higher stratum = advanced further. */
  stratum: number;
  /** Secondary: rounds completed within the ranked span (missing a round ranks you below). */
  completeness: number;
  /** Tertiary: the score being ranked, normalized so HIGHER is always better. */
  score: number;
}

/** Order entries best→worst and assign shared golf ranks (1,2,2,4…). */
function assignGolfRanks(entries: RankEntry[]): Map<string, number> {
  const sorted = [...entries].sort(
    (a, b) => b.stratum - a.stratum || b.completeness - a.completeness || b.score - a.score
  );
  const ranks = new Map<string, number>();
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (
      !prev ||
      prev.stratum !== cur.stratum ||
      prev.completeness !== cur.completeness ||
      prev.score !== cur.score
    ) {
      rank = i + 1; // new tie group starts at its position
    }
    ranks.set(cur.competitorId, rank);
  }
  return ranks;
}

function effectiveValue(s: AttemptScore): number {
  return s.value + s.penalty;
}

/** Round score from its attempts, per the round plan. Null if no attempts recorded. */
function roundScore(
  attempts: AttemptScore[],
  agg: "sum" | "best",
  direction: "asc" | "desc"
): number | null {
  // Declined attempts (passes) count for completeness but never for score
  const thrown = attempts.filter((a) => !a.declined);
  if (thrown.length === 0) return null;
  const values = thrown.map(effectiveValue);
  if (agg === "sum") return values.reduce((a, b) => a + b, 0);
  return direction === "desc" ? Math.max(...values) : Math.min(...values);
}

/** Normalize so higher-is-better regardless of event direction. */
function normalize(value: number, direction: "asc" | "desc"): number {
  return direction === "desc" ? value : -value;
}

function cutTarget(cut: number | "half", fieldInRound: number): number {
  return cut === "half" ? Math.ceil(fieldInRound / 2) : cut;
}

// ─── Rounds-format events ──────────────────────────────────

function computeRoundsEvent(
  event: EventConfig,
  division: Division,
  field: Competitor[],
  allScores: AttemptScore[]
): EventResults {
  const plan = event.divisions[division.id]!;
  const nRounds = plan.rounds.length;
  const hasCuts = Object.keys(division.cutsAfterRound).length > 0;

  const skippedIds = new Set(
    field.filter((c) => c.eventSkips.includes(event.id)).map((c) => c.id)
  );
  const contenders = field.filter((c) => !skippedIds.has(c.id));

  const scores = allScores.filter(
    (s) => s.eventId === event.id && contenders.some((c) => c.id === s.competitorId)
  );
  const started = scores.length > 0;
  const currentRound = scores.reduce((m, s) => Math.max(m, s.round), 0);

  // Per-competitor round scores + attempt bookkeeping (sets land one at a time)
  const roundScoresById = new Map<string, (number | null)[]>();
  const roundAttemptsById = new Map<string, number[]>();
  const roundCompleteById = new Map<string, boolean[]>();
  for (const c of contenders) {
    const rs: (number | null)[] = [];
    const ra: number[] = [];
    const rc: boolean[] = [];
    for (let r = 1; r <= nRounds; r++) {
      const attempts = scores.filter((s) => s.competitorId === c.id && s.round === r);
      rs.push(roundScore(attempts, plan.rounds[r - 1].attemptAgg, event.direction));
      ra.push(attempts.length);
      rc.push(attempts.length >= plan.rounds[r - 1].attempts);
    }
    roundScoresById.set(c.id, rs);
    roundAttemptsById.set(c.id, ra);
    roundCompleteById.set(c.id, rc);
  }

  const cumulativeThrough = (id: string, throughRound: number): number => {
    const rs = roundScoresById.get(id)!;
    let sum = 0;
    for (let r = 0; r < throughRound; r++) sum += rs[r] ?? 0;
    return sum;
  };
  const scoredCount = (id: string, throughRound: number): number => {
    const rs = roundScoresById.get(id)!;
    let n = 0;
    for (let r = 0; r < throughRound; r++) if (rs[r] !== null) n++;
    return n;
  };

  // Advancement: everyone contends round 1; apply cuts (ties all advance)
  const eligibleByRound: string[][] = [contenders.map((c) => c.id)];
  for (let r = 1; r < nRounds; r++) {
    const cut = division.cutsAfterRound[r];
    const current = eligibleByRound[r - 1];
    if (cut === undefined) {
      eligibleByRound.push([...current]);
      continue;
    }
    const target = cutTarget(cut, current.length);
    const entries: RankEntry[] = current.map((id) => ({
      competitorId: id,
      stratum: 0,
      completeness: scoredCount(id, r),
      score: normalize(cumulativeThrough(id, r), event.direction),
    }));
    const ranks = assignGolfRanks(entries);
    // One tie, all tie: everyone ranked within the target advances
    eligibleByRound.push(current.filter((id) => ranks.get(id)! <= target));
  }

  const eligibleThrough = new Map<string, number>();
  for (const c of contenders) eligibleThrough.set(c.id, 1);
  eligibleByRound.forEach((ids, i) => {
    for (const id of ids) eligibleThrough.set(id, i + 1);
  });

  // Final ranking: stratum = round reached; finalists ranked on finals
  // (reset) or full cumulative; the cut rank on their last eligible round
  // otherwise. Pending competitors (zero attempts) sink via completeness 0.
  const entries: RankEntry[] = contenders.map((c) => {
    const through = eligibleThrough.get(c.id)!;
    const isFinalist = hasCuts && through === nRounds;
    if (isFinalist && plan.finalsReset) {
      const finals = roundScoresById.get(c.id)![nRounds - 1];
      return {
        competitorId: c.id,
        stratum: through,
        completeness: finals !== null ? 1 : 0,
        score: normalize(finals ?? 0, event.direction),
      };
    }
    return {
      competitorId: c.id,
      stratum: through,
      completeness: scoredCount(c.id, through),
      score: normalize(cumulativeThrough(c.id, through), event.direction),
    };
  });
  const ranks = assignGolfRanks(entries);

  const results: EventResult[] = field.map((c) => {
    if (skippedIds.has(c.id)) {
      return {
        competitorId: c.id,
        participated: false,
        skipped: true,
        eligibleThrough: 0,
        isFinalist: false,
        roundScores: Array(nRounds).fill(null),
        roundAttempts: Array(nRounds).fill(0),
        roundComplete: Array(nRounds).fill(false),
        cumulative: 0,
        finalsScore: null,
        rank: null,
        points: started ? field.length + 1 : null,
      };
    }
    const rs = roundScoresById.get(c.id)!;
    const through = eligibleThrough.get(c.id)!;
    const isFinalist = hasCuts && through === nRounds;
    const participated = rs.some((v) => v !== null);
    return {
      competitorId: c.id,
      participated,
      skipped: false,
      eligibleThrough: through,
      isFinalist,
      roundScores: rs,
      roundAttempts: roundAttemptsById.get(c.id)!,
      roundComplete: roundCompleteById.get(c.id)!,
      cumulative: cumulativeThrough(c.id, plan.finalsReset ? nRounds - 1 : nRounds),
      finalsScore: plan.finalsReset ? rs[nRounds - 1] : null,
      rank: ranks.get(c.id) ?? null,
      points: started ? (ranks.get(c.id) ?? null) : null,
    };
  });

  results.sort(sortResults);
  return {
    eventId: event.id,
    divisionId: division.id,
    started,
    fieldSize: field.length,
    results,
    byCompetitor: new Map(results.map((r) => [r.competitorId, r])),
    hasCuts,
    eligibleByRound,
    attemptsPlanned: plan.rounds.map((r) => r.attempts),
    currentRound,
  };
}

// ─── Ladder-format events (Keg Toss) ───────────────────────

export interface KegCompetitorState {
  competitorId: string;
  highestCleared: number;
  /** Two misses at a height with no clear → out of the ladder. */
  out: boolean;
  /** Misses recorded at the given height. */
  missesAt: (height: number) => number;
  attempts: KegAttempt[];
}

export function kegCompetitorState(
  competitorId: string,
  allAttempts: KegAttempt[],
  attemptsPerHeight: number
): KegCompetitorState {
  const attempts = allAttempts.filter((a) => a.competitorId === competitorId);
  const heights = new Map<number, KegAttempt[]>();
  for (const a of attempts) {
    if (!heights.has(a.heightFt)) heights.set(a.heightFt, []);
    heights.get(a.heightFt)!.push(a);
  }
  let highestCleared = 0;
  let out = false;
  for (const [h, rows] of heights) {
    if (rows.some((r) => r.result === "clear")) highestCleared = Math.max(highestCleared, h);
    else if (rows.filter((r) => r.result === "miss").length >= attemptsPerHeight) out = true;
  }
  return {
    competitorId,
    highestCleared,
    out,
    missesAt: (h) => (heights.get(h) ?? []).filter((r) => r.result === "miss").length,
    attempts,
  };
}

function computeLadderEvent(
  event: EventConfig,
  division: Division,
  field: Competitor[],
  kegAttempts: KegAttempt[]
): EventResults {
  const ladder = event.ladder!;
  const skippedIds = new Set(
    field.filter((c) => c.eventSkips.includes(event.id)).map((c) => c.id)
  );
  const fieldIds = new Set(field.map((c) => c.id));
  const attempts = kegAttempts.filter(
    (a) => fieldIds.has(a.competitorId) && !skippedIds.has(a.competitorId)
  );
  const started = attempts.length > 0;

  const states = new Map(
    field
      .filter((c) => !skippedIds.has(c.id))
      .map((c) => [c.id, kegCompetitorState(c.id, attempts, ladder.attemptsPerHeight)])
  );

  // Current bar height + how much of the surviving field has resolved it.
  // "Remaining" = contenders not eliminated below the bar; "done" = cleared,
  // passed, or missed out at the current height.
  const barHeight = attempts.reduce((m, a) => Math.max(m, a.heightFt), ladder.startHeight);
  let remaining = 0;
  let done = 0;
  const pending: string[] = [];
  for (const st of states.values()) {
    const heights = new Map<number, KegAttempt[]>();
    for (const a of st.attempts) {
      if (!heights.has(a.heightFt)) heights.set(a.heightFt, []);
      heights.get(a.heightFt)!.push(a);
    }
    const outBelow = [...heights.entries()].some(
      ([h, rows]) =>
        h < barHeight &&
        !rows.some((r) => r.result === "clear") &&
        rows.filter((r) => r.result === "miss").length >= ladder.attemptsPerHeight
    );
    if (outBelow) continue;
    remaining++;
    const atBar = heights.get(barHeight) ?? [];
    const resolved =
      atBar.some((r) => r.result === "clear" || r.result === "pass") ||
      atBar.filter((r) => r.result === "miss").length >= ladder.attemptsPerHeight;
    if (resolved) done++;
    else pending.push(st.competitorId);
  }

  const entries: RankEntry[] = [...states.values()].map((st) => ({
    competitorId: st.competitorId,
    stratum: 0,
    // Participants rank above competitors with no attempts yet
    completeness: st.attempts.length > 0 ? 1 : 0,
    score: st.highestCleared,
  }));
  const ranks = assignGolfRanks(entries);

  const results: EventResult[] = field.map((c) => {
    if (skippedIds.has(c.id)) {
      return {
        competitorId: c.id,
        participated: false,
        skipped: true,
        eligibleThrough: 0,
        isFinalist: false,
        roundScores: [],
        roundAttempts: [],
        roundComplete: [],
        cumulative: 0,
        finalsScore: null,
        rank: null,
        points: started ? field.length + 1 : null,
      };
    }
    const st = states.get(c.id)!;
    return {
      competitorId: c.id,
      participated: st.attempts.length > 0,
      skipped: false,
      eligibleThrough: 0,
      isFinalist: false,
      roundScores: [],
        roundAttempts: [],
        roundComplete: [],
      cumulative: st.highestCleared,
      finalsScore: null,
      rank: ranks.get(c.id) ?? null,
      points: started ? (ranks.get(c.id) ?? null) : null,
    };
  });

  results.sort(sortResults);
  return {
    eventId: event.id,
    divisionId: division.id,
    started,
    fieldSize: field.length,
    results,
    byCompetitor: new Map(results.map((r) => [r.competitorId, r])),
    hasCuts: false,
    eligibleByRound: [],
    attemptsPlanned: [],
    currentRound: 0,
    ladderStatus: { height: barHeight, done, remaining, pending },
  };
}

function sortResults(a: EventResult, b: EventResult): number {
  if (a.skipped !== b.skipped) return a.skipped ? 1 : -1;
  if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
  return 0;
}

// ─── Event progress (shared by scoreboard + admin) ─────────

export interface EventProgress {
  /** 0–100 across the WHOLE event (every round / the full ladder). */
  pct: number;
  label: string;
  detail?: string;
  complete: boolean;
  started: boolean;
}

export function eventProgress(res: EventResults): EventProgress {
  if (!res.started) return { pct: 0, label: "not started", complete: false, started: false };

  if (res.ladderStatus) {
    const { height, done, remaining } = res.ladderStatus;
    // Ladder is decided once at most one contender is still in the hunt
    const complete = remaining <= 1;
    return {
      pct: complete ? 100 : remaining > 0 ? Math.round((done / remaining) * 100) : 100,
      label: `${height} ft`,
      detail: `${done}/${remaining}`,
      complete,
      started: true,
    };
  }

  // Rounds: average per-round completion (attempt-weighted — sets land one
  // at a time on the field), complete only when the final round's eligible
  // field has every planned attempt in — round 1 finishing must never read
  // as "Done" on a 4-round event.
  const nRounds = res.eligibleByRound.length;
  let fractions = 0;
  // "Complete" must agree with pendingScorers: EVERY round's eligible field
  // fully scored — one round-1 straggler keeps the event out of "Done" even
  // if the finals finished (they belong in the chase list or marked skipped).
  let allRoundsComplete = nRounds > 0;
  for (let r = 1; r <= nRounds; r++) {
    const eligible = res.eligibleByRound[r - 1] ?? [];
    if (eligible.length === 0) {
      allRoundsComplete = false;
      continue;
    }
    const planned = res.attemptsPlanned[r - 1] || 1;
    const done = eligible.reduce(
      (sum, id) => sum + Math.min((res.byCompetitor.get(id)?.roundAttempts[r - 1] ?? 0) / planned, 1),
      0
    );
    fractions += done / eligible.length;
    if (!eligible.every((id) => res.byCompetitor.get(id)?.roundComplete[r - 1])) {
      allRoundsComplete = false;
    }
  }
  const complete = allRoundsComplete;
  const pct = nRounds > 0 ? Math.round((fractions / nRounds) * 100) : 0;
  // Detail = the current round's headcount ("4/75") — far more tangible on
  // the board than a whole-event percentage
  const r = Math.max(1, res.currentRound);
  const currentEligible = res.eligibleByRound[r - 1] ?? [];
  const currentDone = currentEligible.filter(
    (id) => res.byCompetitor.get(id)?.roundComplete[r - 1]
  ).length;
  return {
    pct: complete ? 100 : Math.min(pct, 99),
    label: `Rd ${r}/${nRounds}`,
    detail: `${currentDone}/${currentEligible.length}`,
    complete,
    started: true,
  };
}

// ─── Mission Control: who's blocking, what's ready ─────────

export interface PendingScorers {
  /** Round the ids owe a score for (null for ladder events). */
  round: number | null;
  /** "Rd 2" or "14 ft". */
  label: string;
  competitorIds: string[];
  /** How complete the blocking round is (0–1) — higher = these people are the stragglers. */
  roundFraction: number;
}

/** Who the event is waiting on RIGHT NOW. Null when nothing is owed. */
export function pendingScorers(res: EventResults): PendingScorers | null {
  if (!res.started) return null; // don't chase an event that hasn't begun
  if (res.ladderStatus) {
    const { height, done, remaining, pending } = res.ladderStatus;
    if (pending.length === 0) return null;
    return {
      round: null,
      label: `${height} ft`,
      competitorIds: pending,
      roundFraction: remaining > 0 ? done / remaining : 1,
    };
  }
  // The first round that isn't fully scored is what's holding the event up.
  // "Fully scored" = every planned attempt in — someone missing their second
  // set/flip owes it just as much as someone who hasn't thrown at all.
  for (let r = 1; r <= res.eligibleByRound.length; r++) {
    const eligible = res.eligibleByRound[r - 1] ?? [];
    if (eligible.length === 0) continue;
    const missing = eligible.filter((id) => !res.byCompetitor.get(id)?.roundComplete[r - 1]);
    if (missing.length > 0) {
      return {
        round: r,
        label: `Rd ${r}`,
        competitorIds: missing,
        roundFraction: (eligible.length - missing.length) / eligible.length,
      };
    }
  }
  return null; // event complete
}

export interface RoundReadiness {
  completedRound: number;
  nextRound: number;
  /** The cut: who advances into nextRound. */
  advancerIds: string[];
  isFinals: boolean;
}

/**
 * "Ready to move on": the current round is fully scored and the next round
 * hasn't started — the cut is locked and can be announced.
 */
export function roundReadiness(res: EventResults): RoundReadiness | null {
  if (!res.started || res.eligibleByRound.length === 0) return null; // ladder has no rounds
  const n = res.eligibleByRound.length;
  for (let r = 1; r < n; r++) {
    const eligible = res.eligibleByRound[r - 1] ?? [];
    const complete =
      eligible.length > 0 &&
      eligible.every((id) => res.byCompetitor.get(id)?.roundComplete[r - 1]);
    if (!complete) return null; // this round is still running (sets included)
    const nextEligible = res.eligibleByRound[r] ?? [];
    const nextStarted = nextEligible.some(
      (id) => (res.byCompetitor.get(id)?.roundAttempts[r] ?? 0) > 0
    );
    if (!nextStarted) {
      return {
        completedRound: r,
        nextRound: r + 1,
        advancerIds: nextEligible,
        // A "finals" only exists where cuts do — Mentors just moves to the
        // next round with the whole field
        isFinals: res.hasCuts && r + 1 === n,
      };
    }
  }
  return null;
}

// ─── Public API ────────────────────────────────────────────

export function computeEventResults(opts: {
  event: EventConfig;
  division: Division;
  /** Division members excluding day no-shows. */
  field: Competitor[];
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
}): EventResults {
  const { event, division, field, scores, kegAttempts } = opts;
  if (event.format === "ladder") {
    return computeLadderEvent(event, division, field, kegAttempts);
  }
  return computeRoundsEvent(event, division, field, scores);
}

/** The division field: checked-in-or-not members, minus day no-shows. */
export function divisionField(divisionId: string, competitors: Competitor[]): Competitor[] {
  return competitors.filter((c) => c.divisionId === divisionId && !c.noShow);
}

export function computeStandings(opts: {
  division: Division;
  field: Competitor[];
  events: EventConfig[]; // only events this division competes in
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
  /** Recorded arrow-off winner for a tied title (competitor id). */
  titleTiebreakWinner?: string | null;
}): { standings: Standing[]; eventResults: Map<EventId, EventResults> } {
  const { division, field, events, scores, kegAttempts, titleTiebreakWinner } = opts;

  const eventResults = new Map<EventId, EventResults>();
  for (const event of events) {
    eventResults.set(
      event.id,
      computeEventResults({ event, division, field, scores, kegAttempts })
    );
  }

  const rows = field.map((c) => {
    const eventPoints: Partial<Record<EventId, number>> = {};
    const eventRanks: Partial<Record<EventId, number | null>> = {};
    let total = 0;
    for (const [eventId, res] of eventResults) {
      if (!res.started) continue; // unstarted events don't count yet
      const r = res.byCompetitor.get(c.id)!;
      eventPoints[eventId] = r.points!;
      eventRanks[eventId] = r.rank;
      total += r.points!;
    }
    return { competitorId: c.id, eventPoints, eventRanks, total };
  });

  const anyStarted = [...eventResults.values()].some((r) => r.started);
  const entries: RankEntry[] = rows.map((r) => ({
    competitorId: r.competitorId,
    stratum: 0,
    completeness: 0,
    score: -r.total, // lowest total wins
  }));
  const ranks = assignGolfRanks(entries);

  // A tied title resolved by the recorded arrow-off: winner takes rank 1
  // alone, the rest of the tie group drops to 2. A stale winner (scores
  // changed and the tie shifted) is ignored — the flag re-raises instead.
  const firstIds = rows
    .filter((r) => ranks.get(r.competitorId) === 1)
    .map((r) => r.competitorId);
  const resolved =
    anyStarted &&
    firstIds.length > 1 &&
    titleTiebreakWinner != null &&
    firstIds.includes(titleTiebreakWinner);
  if (resolved) {
    for (const id of firstIds) {
      if (id !== titleTiebreakWinner) ranks.set(id, 2);
    }
  }
  const stillTied = !resolved && firstIds.length > 1;

  const standings: Standing[] = rows.map((r) => ({
    ...r,
    rank: anyStarted ? ranks.get(r.competitorId)! : 1,
    tiebreakRequired: anyStarted && stillTied && ranks.get(r.competitorId) === 1,
    wonTiebreak: resolved && r.competitorId === titleTiebreakWinner,
  }));
  standings.sort((a, b) => a.rank - b.rank || a.total - b.total);
  return { standings, eventResults };
}

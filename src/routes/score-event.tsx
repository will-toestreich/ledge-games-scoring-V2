import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronUp, ChevronDown, Undo2, Check, X, FastForward } from "lucide-react";
import { useParams } from "@tanstack/react-router";
import { divisions, getEvent, roundLabel } from "@/data/competition-config";
import type { Competitor, DivisionId, EventConfig, KegAttempt } from "@/lib/types";
import {
  computeEventResults,
  divisionField,
  kegCompetitorState,
  type KegCompetitorState,
} from "@/lib/scoring";
import {
  useActiveCompetition,
  useActiveDivisions,
  useCompetitors,
  useKegAttempts,
  useRecordKegAttempt,
  useScores,
  useUndoLastKegAttempt,
} from "@/data/hooks";
import { ScorerGate } from "./score";

export function ScoreEventPage() {
  const { eventId } = useParams({ from: "/score/$eventId" });
  const event = getEvent(eventId);

  if (!event) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <p className="text-text-secondary">Event not found.</p>
      </div>
    );
  }
  return (
    <ScorerGate>
      <EventScoring event={event} />
    </ScorerGate>
  );
}

function EventScoring({ event }: { event: EventConfig }) {
  const { data: activeComp } = useActiveCompetition();
  const activeDivisions = useActiveDivisions();
  const eventDivisions = activeDivisions.filter((d) => event.divisions[d.id]);
  const [divisionId, setDivisionId] = useState<DivisionId>(eventDivisions[0].id);
  // The selected division can go inactive live (mentors toggled off mid-event)
  const division = eventDivisions.find((d) => d.id === divisionId) ?? eventDivisions[0];
  const activeDivisionId = division.id;

  const competitors = useCompetitors();
  const scores = useScores();
  const kegAttempts = useKegAttempts();

  const ready = competitors.data && scores.data && kegAttempts.data;
  const field = useMemo(
    () => (competitors.data ? divisionField(activeDivisionId, competitors.data) : []),
    [competitors.data, activeDivisionId]
  );
  const results = useMemo(() => {
    if (!ready) return null;
    return computeEventResults({
      event,
      division,
      field,
      scores: scores.data!,
      kegAttempts: kegAttempts.data!,
    });
  }, [ready, event, division, field, scores.data, kegAttempts.data]);

  return (
    <div className="max-w-lg mx-auto px-4 py-8 animate-slide-up">
      <div className="mb-6">
        <Link
          to="/score"
          className="btn-ghost text-sm text-text-tertiary mb-3 -ml-3 inline-flex items-center gap-1 hover:text-text-primary"
        >
          <ChevronLeft size={16} />
          All Events
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
      </div>

      {/* Division pills */}
      <div className="flex gap-2 mb-6">
        {eventDivisions.map((div) => {
          const isActive = activeDivisionId === div.id;
          return (
            <button
              key={div.id}
              onClick={() => setDivisionId(div.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? "text-white"
                  : "text-text-secondary bg-surface-raised border border-border-subtle hover:border-border-default"
              }`}
              style={isActive ? { backgroundColor: div.color, boxShadow: `0 4px 16px ${div.color}40` } : undefined}
            >
              {div.name}
            </button>
          );
        })}
      </div>

      {!results ? (
        <p className="text-text-tertiary text-sm">Loading…</p>
      ) : event.format === "ladder" ? (
        // Keyed by competition AND division: bar height and round state must
        // never leak between divisions or across a season switch
        <KegConsole key={`${activeComp?.id}:${activeDivisionId}`} field={field} attempts={kegAttempts.data!} event={event} color={division.color} />
      ) : (
        <RoundsScoring key={`${activeComp?.id}:${activeDivisionId}`} event={event} divisionColor={division.color} field={field} results={results} divisionId={activeDivisionId} />
      )}
    </div>
  );
}

// ─── Rounds format ─────────────────────────────────────────

function RoundsScoring({
  event,
  divisionColor,
  field,
  results,
  divisionId,
}: {
  event: EventConfig;
  divisionColor: string;
  field: Competitor[];
  results: NonNullable<ReturnType<typeof computeEventResults>>;
  divisionId: DivisionId;
}) {
  const division = divisions.find((d) => d.id === divisionId)!;
  const plan = event.divisions[divisionId]!;
  const nRounds = plan.rounds.length;
  const [rawRound, setRound] = useState(() => Math.min(Math.max(results.currentRound, 1), nRounds));
  // Belt-and-braces: never index past this division's plan even if state leaks
  const round = Math.min(rawRound, nRounds);

  const byId = new Map(field.map((c) => [c.id, c]));
  const eligibleIds = results.eligibleByRound[round - 1] ?? [];
  const eligible = eligibleIds.map((id) => byId.get(id)!).filter(Boolean);

  // A round is done for a competitor once EVERY set/flip is in — someone
  // with only set 1 recorded stays in the queue for set 2
  const stateOf = (id: string) => results.byCompetitor.get(id)!;
  const unscored = eligible.filter((c) => !stateOf(c.id).roundComplete[round - 1]);
  const scored = eligible.filter((c) => stateOf(c.id).roundComplete[round - 1]);
  const cut = field.filter(
    (c) => !results.byCompetitor.get(c.id)!.skipped && !eligibleIds.includes(c.id)
  );
  const progress = eligible.length > 0 ? Math.round((scored.length / eligible.length) * 100) : 0;

  return (
    <>
      {/* Round tabs */}
      <div className="flex gap-1.5 mb-4">
        {plan.rounds.map((_, i) => {
          const r = i + 1;
          const active = round === r;
          return (
            <button
              key={r}
              onClick={() => setRound(r)}
              className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
                active
                  ? "bg-surface-overlay text-text-primary border border-border-default"
                  : "text-text-tertiary bg-surface-raised border border-border-subtle hover:text-text-secondary"
              }`}
            >
              <div>Rd {r}</div>
              <div className="text-[10px] font-normal mt-0.5 opacity-80">{roundLabel(division, r)}</div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-text-tertiary mb-2">{plan.rounds[round - 1].attemptLabel}</p>

      {/* Progress */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: divisionColor, boxShadow: `0 0 8px ${divisionColor}60` }}
          />
        </div>
        <span className="text-xs text-text-tertiary font-mono">
          {scored.length}/{eligible.length}
        </span>
      </div>

      {unscored.length > 0 && (
        <div className="mb-8">
          <p className="section-label mb-3">Needs Scoring — Round {round} ({unscored.length})</p>
          <div className="space-y-1.5">
            {unscored.map((c) => {
              const st = stateOf(c.id);
              const attempts = st.roundAttempts[round - 1];
              const planned = plan.rounds[round - 1].attempts;
              return (
                <CompetitorRow
                  key={c.id}
                  competitor={c}
                  eventId={event.id}
                  round={round}
                  divisionColor={divisionColor}
                  subLabel={
                    attempts > 0
                      ? `${st.roundScores[round - 1]} ${event.unit} so far · ${attempts}/${planned} in`
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {scored.length > 0 && (
        <div className="mb-8">
          <p className="section-label mb-3">Scored ({scored.length})</p>
          <div className="space-y-1.5">
            {scored.map((c) => {
              const r = results.byCompetitor.get(c.id)!;
              return (
                <CompetitorRow
                  key={c.id}
                  competitor={c}
                  eventId={event.id}
                  round={round}
                  divisionColor={divisionColor}
                  scoreLabel={`${r.roundScores[round - 1]} ${event.unit}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {round > 1 && cut.length > 0 && (
        <div>
          <p className="section-label mb-3 opacity-60">Cut before this round ({cut.length})</p>
          <div className="flex flex-wrap gap-1">
            {cut.map((c) => (
              <span key={c.id} className="text-[11px] px-2 py-0.5 rounded bg-surface-overlay text-text-tertiary">
                {c.bibNumber} {c.firstName} {c.lastName}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CompetitorRow({
  competitor,
  eventId,
  round,
  divisionColor,
  scoreLabel,
  subLabel,
}: {
  competitor: Competitor;
  eventId: string;
  round: number;
  divisionColor: string;
  scoreLabel?: string;
  /** Partial-round state, e.g. "9 pts so far · 1/2 in". */
  subLabel?: string;
}) {
  const scored = scoreLabel !== undefined;
  return (
    <Link
      to="/score/$eventId/$competitorId"
      params={{ eventId, competitorId: competitor.id }}
      search={{ round }}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 group ${
        scored
          ? "bg-surface-raised/40 hover:bg-surface-raised"
          : "bg-surface-raised border border-border-subtle hover:border-border-default hover:shadow-lg"
      }`}
    >
      <span className="bib-badge" style={{ backgroundColor: scored ? `${divisionColor}80` : divisionColor }}>
        {competitor.bibNumber}
      </span>
      <span className={`flex-1 font-medium ${scored ? "text-text-tertiary" : "text-text-primary"}`}>
        {competitor.firstName} {competitor.lastName}
        {subLabel && <span className="block text-[11px] font-normal text-amber-400/90">{subLabel}</span>}
      </span>
      {scored && <span className="text-sm text-text-tertiary font-mono">{scoreLabel}</span>}
      <span className="text-text-tertiary group-hover:text-text-secondary group-hover:translate-x-0.5 transition-all text-sm">
        {scored ? "edit" : "›"}
      </span>
    </Link>
  );
}

// ─── Keg ladder console ────────────────────────────────────

function KegConsole({
  field,
  attempts,
  event,
  color,
}: {
  field: Competitor[];
  attempts: KegAttempt[];
  event: EventConfig;
  color: string;
}) {
  const ladder = event.ladder!;
  const record = useRecordKegAttempt();
  const undo = useUndoLastKegAttempt();

  const maxHeightInPlay = attempts
    .filter((a) => field.some((c) => c.id === a.competitorId))
    .reduce((m, a) => Math.max(m, a.heightFt), ladder.startHeight);
  const [height, setHeight] = useState(maxHeightInPlay);

  const contenders = field.filter((c) => !c.eventSkips.includes(event.id));
  const states = contenders.map((c) => ({
    competitor: c,
    state: kegCompetitorState(c.id, attempts, ladder.attemptsPerHeight),
  }));

  // Just-recorded rows HOLD their spot briefly with a confirmation flash so
  // the scorer sees the tap land before the row reorders away
  const [holds, setHolds] = useState<Record<string, KegAttempt["result"]>>({});
  const isHeld = (id: string) => holds[id] !== undefined;

  const byBib = (a: { competitor: Competitor }, b: { competitor: Competitor }) =>
    a.competitor.bibNumber - b.competitor.bibNumber;
  const resolvedAtBar = (st: ReturnType<typeof kegCompetitorState>) =>
    st.attempts.some((a) => a.heightFt === height && (a.result === "clear" || a.result === "pass"));
  const alive = states.filter(({ competitor: c, state }) => !state.out || isHeld(c.id));
  // Whoever still owes an outcome at this bar stays on top; resolved
  // competitors drop below — bib order within each group
  const stillToToss = alive
    .filter(({ competitor: c, state }) => !resolvedAtBar(state) || isHeld(c.id))
    .sort(byBib);
  const doneAtBar = alive
    .filter(({ competitor: c, state }) => resolvedAtBar(state) && !isHeld(c.id))
    .sort(byBib);
  const orderedAlive = [...stillToToss, ...doneAtBar];
  const out = states
    .filter(({ competitor: c, state }) => state.out && !isHeld(c.id))
    .sort((a, b) => b.state.highestCleared - a.state.highestCleared);

  function act(competitorId: string, result: KegAttempt["result"], attemptNo: number) {
    record.mutate({
      id: `${competitorId}:keg:h${height}:a${attemptNo}`,
      competitorId,
      heightFt: height,
      attempt: attemptNo,
      result,
    });
    // Flash the confirmation in place, then let the row reorder
    setHolds((h) => ({ ...h, [competitorId]: result }));
    setTimeout(() => {
      setHolds((h) => {
        const { [competitorId]: _gone, ...rest } = h;
        return rest;
      });
    }, 1400);
  }

  return (
    <>
      {/* Bar height stepper */}
      <div className="card rounded-xl p-4 mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs text-text-tertiary uppercase tracking-wider">Bar Height</div>
          <div className="text-3xl font-bold font-mono text-text-primary">
            {height} <span className="text-base font-normal text-text-tertiary">{event.unit}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setHeight((h) => h + ladder.increment)}
            className="numpad-key px-4 py-1.5"
            aria-label="Raise bar"
          >
            <ChevronUp size={18} />
          </button>
          <button
            onClick={() => setHeight((h) => Math.max(ladder.startHeight, h - ladder.increment))}
            className="numpad-key px-4 py-1.5"
            aria-label="Lower bar"
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      {/* Alive competitors — still-to-toss first, resolved below */}
      <p className="section-label mb-3">
        In the Hunt ({alive.length})
        {stillToToss.length > 0 && (
          <span className="normal-case font-normal text-text-tertiary"> — {stillToToss.length} to toss at {height} {event.unit}</span>
        )}
      </p>
      <div className="space-y-1.5 mb-8">
        {orderedAlive.map(({ competitor: c, state }, idx) => {
          const firstResolved = idx === stillToToss.length && doneAtBar.length > 0 && stillToToss.length > 0;
          return (
            <div key={c.id}>
              {firstResolved && (
                <div className="border-t border-border-subtle/60 mt-3 mb-2 pt-1">
                  <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    Done at {height} {event.unit} ({doneAtBar.length})
                  </span>
                </div>
              )}
              <KegRow c={c} state={state} height={height} event={event} color={color} act={act} undo={undo} heldResult={holds[c.id]} />
            </div>
          );
        })}
      </div>
      {/* Out */}
      {out.length > 0 && (
        <>
          <p className="section-label mb-3">Out ({out.length})</p>
          <div className="space-y-1">
            {out.map(({ competitor: c, state }) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-raised/40">
                <span className="bib-badge opacity-60" style={{ backgroundColor: color }}>{c.bibNumber}</span>
                <span className="flex-1 text-sm text-text-tertiary">
                  {c.firstName} {c.lastName}
                </span>
                <span className="text-sm font-mono text-text-secondary">
                  {state.highestCleared || 0} {event.unit}
                </span>
                <button
                  onClick={() => undo.mutate(c.id)}
                  className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
                  title="Undo last"
                >
                  <Undo2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function KegRow({
  c,
  state,
  height,
  event,
  color,
  act,
  undo,
  heldResult,
}: {
  c: Competitor;
  state: KegCompetitorState;
  height: number;
  event: EventConfig;
  color: string;
  act: (competitorId: string, result: KegAttempt["result"], attemptNo: number) => void;
  undo: { mutate: (competitorId: string) => void };
  /** Just-tapped result: show a confirmation flash before the row reorders. */
  heldResult?: KegAttempt["result"];
}) {
  const cleared = state.attempts.some((a) => a.heightFt === height && a.result === "clear");
  const passed = state.attempts.some((a) => a.heightFt === height && a.result === "pass");
  const misses = state.missesAt(height);
  const attemptNo = state.attempts.filter((a) => a.heightFt === height).length + 1;
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
      cleared || passed
        ? "bg-surface-raised/40 border-transparent"
        : "bg-surface-raised border-border-subtle"
    }`}>
      <span className="bib-badge" style={{ backgroundColor: cleared || passed ? `${color}80` : color }}>{c.bibNumber}</span>
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-sm truncate ${cleared || passed ? "text-text-tertiary" : "text-text-primary"}`}>
          {c.firstName} {c.lastName}
        </div>
        <div className="text-[11px] text-text-tertiary font-mono">
          best {state.highestCleared || "—"} {state.highestCleared ? event.unit : ""}
          {misses > 0 && ` · ${misses} miss${misses > 1 ? "es" : ""} @ ${height}`}
          {passed && ` · passed ${height}`}
        </div>
      </div>
      {heldResult ? (
        <span
          className={`animate-scale-in inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full text-white ${
            heldResult === "clear" ? "bg-emerald-500" : heldResult === "miss" ? "bg-red-500" : "bg-amber-500"
          }`}
        >
          {heldResult === "clear" ? <Check size={13} /> : heldResult === "miss" ? <X size={13} /> : <FastForward size={13} />}
          {heldResult === "clear"
            ? `Cleared ${height} ${event.unit}`
            : heldResult === "miss"
              ? state.out
                ? "Miss — OUT"
                : "Miss recorded"
              : `Passed ${height} ${event.unit}`}
        </span>
      ) : cleared || passed ? (
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${cleared ? "bg-emerald-500/15 text-emerald-400" : "bg-surface-overlay text-text-tertiary"}`}>
          {cleared ? "cleared" : "passed"}
        </span>
      ) : (
        <div className="flex gap-1">
          <button
            onClick={() => act(c.id, "clear", attemptNo)}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
            title={`Cleared ${height}`}
          >
            <Check size={15} />
          </button>
          <button
            onClick={() => act(c.id, "miss", attemptNo)}
            className="px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
            title={`Missed ${height}`}
          >
            <X size={15} />
          </button>
          {misses === 0 && (
            <button
              onClick={() => act(c.id, "pass", 1)}
              className="px-2.5 py-1.5 rounded-lg bg-surface-overlay text-text-tertiary hover:text-text-primary transition-colors"
              title={`Pass at ${height}`}
            >
              <FastForward size={15} />
            </button>
          )}
        </div>
      )}
      {state.attempts.length > 0 && (
        <button
          onClick={() => undo.mutate(c.id)}
          className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors"
          title="Undo last"
        >
          <Undo2 size={14} />
        </button>
      )}
    </div>
  );
}

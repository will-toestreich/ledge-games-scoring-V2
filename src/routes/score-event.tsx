import { useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronUp, ChevronDown, Undo2, Check, X, FastForward, Scissors } from "lucide-react";
import { useParams } from "@tanstack/react-router";
import { divisions, getEvent, roundLabel } from "@/data/competition-config";
import type { AttemptScore, Competitor, Division, DivisionId, EventConfig, KegAttempt } from "@/lib/types";
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
  // View comes from the URL (single source of truth). Default is "all" —
  // the merged queue across divisions; saving a score returns to whichever
  // view the scorer was working.
  const search = useSearch({ from: "/score/$eventId" }) as { division?: DivisionId | "all" };
  const navigate = useNavigate();
  const view: "all" | DivisionId =
    search.division !== "all" && eventDivisions.some((d) => d.id === search.division)
      ? (search.division as DivisionId)
      : "all";
  const setView = (id: "all" | DivisionId) =>
    navigate({
      to: "/score/$eventId",
      params: { eventId: event.id },
      search: { division: id },
      replace: true,
    });
  const division = view === "all" ? null : eventDivisions.find((d) => d.id === view)!;

  const competitors = useCompetitors();
  const scores = useScores();
  const kegAttempts = useKegAttempts();

  // Computed inline, no manual useMemo: renders here are driven by actual
  // data changes (structural sharing keeps identities stable across polls),
  // the engine is cheap at this field size, and the React Compiler couldn't
  // preserve the manual memoization anyway.
  const ready = competitors.data && scores.data && kegAttempts.data;
  const field = division && competitors.data ? divisionField(division.id, competitors.data) : [];
  const results =
    ready && division
      ? computeEventResults({
          event,
          division,
          field,
          scores: scores.data!,
          kegAttempts: kegAttempts.data!,
        })
      : null;

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

      {/* View pills: the merged queue, or one division's full view */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setView("all")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
            view === "all"
              ? "bg-surface-overlay text-text-primary border border-border-default"
              : "text-text-secondary bg-surface-raised border border-border-subtle hover:border-border-default"
          }`}
        >
          All
        </button>
        {eventDivisions.map((div) => {
          const isActive = view === div.id;
          return (
            <button
              key={div.id}
              onClick={() => setView(div.id)}
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

      {!ready ? (
        <p className="text-text-tertiary text-sm">Loading…</p>
      ) : view === "all" ? (
        event.format === "ladder" ? (
          // All + ladder: both consoles stacked, each its own bar
          <div className="space-y-8">
            {eventDivisions.map((div) => (
              <div key={div.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: div.color }} />
                  <h2 className="font-bold text-text-primary">{div.name}</h2>
                </div>
                <KegConsole
                  key={`${activeComp?.id}:${div.id}`}
                  field={divisionField(div.id, competitors.data!)}
                  attempts={kegAttempts.data!}
                  event={event}
                  color={div.color}
                />
              </div>
            ))}
          </div>
        ) : (
          <AllDivisionsQueue
            event={event}
            eventDivisions={eventDivisions}
            competitors={competitors.data!}
            scores={scores.data!}
            kegAttempts={kegAttempts.data!}
          />
        )
      ) : event.format === "ladder" ? (
        // Keyed by competition AND division: bar height and round state must
        // never leak between divisions or across a season switch
        <KegConsole key={`${activeComp?.id}:${view}`} field={field} attempts={kegAttempts.data!} event={event} color={division!.color} />
      ) : (
        <RoundsScoring key={`${activeComp?.id}:${view}`} event={event} divisionColor={division!.color} field={field} results={results!} divisionId={view} />
      )}
    </div>
  );
}

/**
 * The merged "who's up" queue across every division in this event — the
 * default view: a scorer serves whoever steps to the line, any division.
 * Each division is worked at its own current round; partial rounds float
 * to the top; the per-division full views (round tabs, cut line, scored
 * list) live behind the division pills.
 */
function AllDivisionsQueue({
  event,
  eventDivisions,
  competitors,
  scores,
  kegAttempts,
}: {
  event: EventConfig;
  eventDivisions: Division[];
  competitors: Competitor[];
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
}) {
  const sections = eventDivisions.map((division) => {
    const field = divisionField(division.id, competitors);
    const res = computeEventResults({ event, division, field, scores, kegAttempts });
    const plan = event.divisions[division.id]!;
    const nRounds = plan.rounds.length;
    let round = nRounds;
    for (let r = 1; r <= nRounds; r++) {
      const eligible = res.eligibleByRound[r - 1] ?? [];
      if (eligible.some((id) => !res.byCompetitor.get(id)!.roundComplete[r - 1])) {
        round = r;
        break;
      }
    }
    const byId = new Map(field.map((c) => [c.id, c]));
    const eligible = res.eligibleByRound[round - 1] ?? [];
    const pending = eligible
      .filter((id) => !res.byCompetitor.get(id)!.roundComplete[round - 1])
      .map((id) => byId.get(id)!)
      .filter(Boolean);
    return {
      division,
      res,
      plan,
      round,
      pending,
      doneCount: eligible.length - pending.length,
      eligibleCount: eligible.length,
    };
  });

  const rows = sections
    .flatMap((s) => s.pending.map((c) => ({ c, s })))
    .sort((a, b) => {
      const aStarted = a.s.res.byCompetitor.get(a.c.id)!.roundAttempts[a.s.round - 1] > 0 ? 0 : 1;
      const bStarted = b.s.res.byCompetitor.get(b.c.id)!.roundAttempts[b.s.round - 1] > 0 ? 0 : 1;
      return aStarted - bStarted || a.c.bibNumber - b.c.bibNumber;
    });

  return (
    <>
      {/* Per-division state at a glance */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {sections.map(({ division, round, plan, doneCount, eligibleCount, pending }) => (
          <span
            key={division.id}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-surface-raised border border-border-subtle text-text-secondary"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: division.color }} />
            {division.name.replace("'s", "")} · Rd {round}/{plan.rounds.length} ·{" "}
            <span className={`font-mono ${pending.length === 0 ? "text-emerald-400" : ""}`}>
              {doneCount}/{eligibleCount}
            </span>
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card rounded-xl px-4 py-6 text-center text-sm text-emerald-400">
          Nobody owes a score in this event right now.
        </div>
      ) : (
        <div>
          <p className="section-label mb-3">Needs Scoring ({rows.length})</p>
          <div className="space-y-1.5">
            {rows.map(({ c, s }) => {
              const st = s.res.byCompetitor.get(c.id)!;
              const attempts = st.roundAttempts[s.round - 1];
              const planned = s.plan.rounds[s.round - 1].attempts;
              return (
                <CompetitorRow
                  key={c.id}
                  competitor={c}
                  eventId={event.id}
                  round={s.round}
                  divisionColor={s.division.color}
                  backView="all"
                  tag={`${s.division.name.replace("'s", "")} · Rd ${s.round}`}
                  subLabel={
                    attempts > 0
                      ? `${st.roundScores[s.round - 1]} ${event.unit} so far · ${attempts}/${planned} in`
                      : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      )}
    </>
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
  const [rawRound, setRound] = useState(() => {
    // Default to the round the field is actually working: the first round
    // whose eligible list isn't fully scored. Once a round completes and its
    // cut locks, scorers land on the NEXT round automatically.
    for (let r = 1; r <= nRounds; r++) {
      const eligible = results.eligibleByRound[r - 1] ?? [];
      if (eligible.some((id) => !results.byCompetitor.get(id)!.roundComplete[r - 1])) return r;
    }
    return nRounds; // event complete — show the finals
  });
  // Belt-and-braces: never index past this division's plan even if state leaks
  const round = Math.min(rawRound, nRounds);

  const byId = new Map(field.map((c) => [c.id, c]));
  const eligibleIds = results.eligibleByRound[round - 1] ?? [];
  const eligible = eligibleIds.map((id) => byId.get(id)!).filter(Boolean);

  // A round is done for a competitor once EVERY set/flip is in — someone
  // with only set 1 recorded stays in the queue for set 2. Partials float
  // to the top (finish what's started); bib order within each group.
  const stateOf = (id: string) => results.byCompetitor.get(id)!;
  const unscored = eligible
    .filter((c) => !stateOf(c.id).roundComplete[round - 1])
    .sort((a, b) => {
      const aStarted = stateOf(a.id).roundAttempts[round - 1] > 0 ? 0 : 1;
      const bStarted = stateOf(b.id).roundAttempts[round - 1] > 0 ? 0 : 1;
      return aStarted - bStarted || a.bibNumber - b.bibNumber;
    });
  const scored = eligible.filter((c) => stateOf(c.id).roundComplete[round - 1]);
  const cut = field.filter(
    (c) => !results.byCompetitor.get(c.id)!.skipped && !eligibleIds.includes(c.id)
  );
  const progress = eligible.length > 0 ? Math.round((scored.length / eligible.length) * 100) : 0;

  // Cut after the round being viewed (if this division cuts here)
  const cutLine = results.cuts.find((c) => c.afterRound === round);
  const cutProjectionReady =
    cutLine !== undefined &&
    cutLine.eligibleCount > 0 &&
    cutLine.scoredCount / cutLine.eligibleCount >= 0.5 &&
    cutLine.bubbleScore !== null;
  const cutTies = cutLine !== undefined && cutLine.advancerIds.length > cutLine.target
    ? ` (+${cutLine.advancerIds.length - cutLine.target} on ties)`
    : "";

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

      {/* Cut line: locked → final; else a projection once half the round is in */}
      {cutLine && (
        <div
          className={`mb-3 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
            cutLine.locked
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/40 bg-amber-500/10 text-amber-400"
          }`}
        >
          <Scissors size={12} className="shrink-0" />
          {cutLine.locked
            ? cutLine.bubbleScore !== null
              ? `top ${cutLine.target}${cutTies} · Cut @ ${cutLine.bubbleScore.toFixed(event.decimals)} ${event.unit} — ${cutLine.advancerIds.length} advance to Rd ${cutLine.afterRound + 1}`
              : `Cut locked — ${cutLine.advancerIds.length} advance to Rd ${cutLine.afterRound + 1}`
            : cutProjectionReady
              ? `top ${cutLine.target}${cutTies} · Projected Cut @ ${cutLine.bubbleScore!.toFixed(event.decimals)} ${event.unit}`
              : `Cut after this round: top ${cutLine.target} — projection appears once half the round is in`}
        </div>
      )}

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
                  backView={divisionId}
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
                  backView={divisionId}
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
  backView,
  tag,
  scoreLabel,
  subLabel,
}: {
  competitor: Competitor;
  eventId: string;
  round: number;
  divisionColor: string;
  /** Which queue view saving should return to ("all" or a division id). */
  backView: "all" | DivisionId;
  /** Small context tag on the right, e.g. "Men · Rd 2" in the merged queue. */
  tag?: string;
  scoreLabel?: string;
  /** Partial-round state, e.g. "9 pts so far · 1/2 in". */
  subLabel?: string;
}) {
  const scored = scoreLabel !== undefined;
  return (
    <Link
      to="/score/$eventId/$competitorId"
      params={{ eventId, competitorId: competitor.id }}
      search={{ round, division: backView }}
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
      {tag && <span className="text-[10px] text-text-tertiary font-medium shrink-0">{tag}</span>}
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
        const rest = { ...h };
        delete rest[competitorId];
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

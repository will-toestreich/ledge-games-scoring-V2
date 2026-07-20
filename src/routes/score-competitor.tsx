import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ChevronLeft, Check, Delete, Ban } from "lucide-react";
import { divisions, getEvent, roundLabel } from "@/data/competition-config";
import type { AttemptScore, EventConfig, RoundPlan } from "@/lib/types";
import {
  useCompetitors,
  useDeleteRoundAttempts,
  useSaveRoundAttempts,
  useScores,
  useUpdateCompetitor,
} from "@/data/hooks";
import { ScorerGate } from "./score";

export function ScoreCompetitorPage() {
  const { eventId, competitorId } = useParams({ from: "/score/$eventId/$competitorId" });
  const search = useSearch({ from: "/score/$eventId/$competitorId" }) as { round?: number };
  const event = getEvent(eventId);
  const { data: competitors } = useCompetitors();
  const { data: scores } = useScores();
  const competitor = competitors?.find((c) => c.id === competitorId);

  if (!event || (competitors && !competitor)) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <p className="text-text-secondary">Not found.</p>
      </div>
    );
  }
  // ScoreEntry seeds its draft state from existing scores in useState
  // initializers — it must never mount before scores are loaded, or a
  // deep-link/reload shows a scored round as blank and invites an overwrite
  if (!competitor || !scores) return null;

  return (
    <ScorerGate>
      <ScoreEntry event={event} competitorId={competitor.id} round={search.round ?? 1} />
    </ScorerGate>
  );
}

function ScoreEntry({
  event,
  competitorId,
  round,
}: {
  event: EventConfig;
  competitorId: string;
  round: number;
}) {
  const navigate = useNavigate();
  const { data: competitors } = useCompetitors();
  const { data: scores } = useScores();
  const save = useSaveRoundAttempts();
  const remove = useDeleteRoundAttempts();
  const updateCompetitor = useUpdateCompetitor();

  const competitor = competitors!.find((c) => c.id === competitorId)!;
  const division = divisions.find((d) => d.id === competitor.divisionId)!;
  const plan = event.divisions[competitor.divisionId];
  const roundPlan: RoundPlan | undefined = plan?.rounds[round - 1];

  const existing = useMemo(
    () =>
      (scores ?? []).filter(
        (s) => s.competitorId === competitorId && s.eventId === event.id && s.round === round
      ),
    [scores, competitorId, event.id, round]
  );
  // Snapshot what this form was seeded from: on save, only attempts the
  // scorer SAW and cleared get deleted — an attempt recorded by another
  // device after mount is never silently removed
  const [seededFrom] = useState(existing);

  const [values, setValues] = useState<string[]>(() => {
    const n = roundPlan?.attempts ?? 1;
    return Array.from({ length: n }, (_, i) => {
      const a = existing.find((s) => s.attempt === i + 1);
      if (a === undefined) return "";
      return a.declined ? "pass" : String(a.value);
    });
  });
  const [penalties, setPenalties] = useState<number[]>(() => {
    const n = roundPlan?.attempts ?? 1;
    return Array.from({ length: n }, (_, i) => existing.find((s) => s.attempt === i + 1)?.penalty ?? 0);
  });
  const [activeAttempt, setActiveAttempt] = useState(() => {
    // Focus the first attempt that hasn't been recorded (set 2 workflow)
    for (let i = 0; i < (roundPlan?.attempts ?? 1); i++) {
      if (!existing.some((s) => s.attempt === i + 1)) return i;
    }
    return 0;
  });
  const [submitted, setSubmitted] = useState(false);
  const isSkipped = competitor.eventSkips.includes(event.id);

  if (!plan || !roundPlan) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <p className="text-text-secondary">
          {division.name} doesn't compete in {event.name}.
        </p>
      </div>
    );
  }

  const filled = values.filter((v) => v !== "" && v !== ".");
  const parsed = filled.filter((v) => v !== "pass").map(Number);
  const maxPer = roundPlan.maxPerAttempt;
  const outOfRange = maxPer !== undefined && parsed.some((v) => v > maxPer);
  // Partial saves are the normal field workflow: everyone throws set/flip 1,
  // scores get recorded, then the line throws set 2
  const canSubmit = filled.length > 0 && !parsed.some(Number.isNaN) && !outOfRange;
  const partial = filled.length < roundPlan.attempts;

  function setDigit(update: (prev: string) => string) {
    setValues((vs) => {
      const next = [...vs];
      next[activeAttempt] = update(next[activeAttempt]);
      return next;
    });
  }

  function handleSubmit() {
    const attempts: AttemptScore[] = values
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v !== "" && v !== ".")
      .map(({ v, i }) => ({
        id: `${competitorId}:${event.id}:r${round}:a${i + 1}`,
        competitorId,
        eventId: event.id,
        round,
        attempt: i + 1,
        value: v === "pass" ? 0 : Number(v),
        penalty: penalties[i],
        declined: v === "pass" ? true : undefined,
      }));
    const removeIds = seededFrom
      .filter((s) => values[s.attempt - 1] === "")
      .map((s) => s.id);
    save.mutate({ attempts, removeIds }, {
      onSuccess: () => {
        setSubmitted(true);
        setTimeout(() => navigate({ to: "/score/$eventId", params: { eventId: event.id } }), 700);
      },
    });
  }

  const caber = event.allowedValues !== undefined;

  return (
    <div className="max-w-md mx-auto px-4 py-8 animate-slide-up">
      <Link
        to="/score/$eventId"
        params={{ eventId: event.id }}
        className="btn-ghost text-sm text-text-tertiary mb-4 -ml-3 inline-flex items-center gap-1 hover:text-text-primary"
      >
        <ChevronLeft size={16} />
        Back to queue
      </Link>

      <div className="card rounded-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-5 text-center" style={{ borderTop: `3px solid ${division.color}` }}>
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="bib-badge text-sm" style={{ backgroundColor: division.color }}>
              {competitor.bibNumber}
            </span>
            <span className="text-xs text-text-tertiary">{division.name}</span>
          </div>
          <h2 className="text-2xl font-bold text-text-primary">
            {competitor.firstName} {competitor.lastName}
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            {event.name} — Round {round} <span className="text-text-tertiary">({roundLabel(division, round)})</span>
          </p>
          <p className="text-xs text-text-tertiary mt-1">{roundPlan.attemptLabel}</p>
        </div>

        <div className="px-6 pb-6">
          {submitted ? (
            <div className="text-center py-10 animate-scale-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-ledge-green/20 flex items-center justify-center">
                <Check size={32} className="text-emerald-400" strokeWidth={2.5} />
              </div>
              <p className="text-lg font-semibold text-emerald-400">Score saved!</p>
            </div>
          ) : caber ? (
            <CaberEntry
              values={values}
              setValues={setValues}
              allowed={event.allowedValues!}
              onSubmit={handleSubmit}
              canSubmit={canSubmit}
              existing={existing.length > 0}
            />
          ) : (
            <>
              {/* Attempt fields */}
              <div className="mb-5">
                <div className="flex gap-2">
                  {values.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveAttempt(i)}
                      className={`flex-1 rounded-xl border-2 px-3 py-4 text-center transition-all ${
                        activeAttempt === i
                          ? "border-ledge-red bg-ledge-red/5"
                          : "border-border-subtle bg-surface-overlay"
                      }`}
                    >
                      {roundPlan.attempts > 1 && (
                        <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                          Attempt {i + 1}
                        </div>
                      )}
                      <div className="text-3xl font-mono text-text-primary min-h-[1.2em]">
                        {v || <span className="text-text-tertiary">0</span>}
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-1">
                        {event.unit}
                        {maxPer !== undefined && ` · max ${maxPer}`}
                      </div>
                    </button>
                  ))}
                </div>
                {outOfRange && (
                  <p className="text-xs text-red-400 mt-2">
                    Value over the max of {maxPer} {event.unit} for this round.
                  </p>
                )}
              </div>

              {/* Chop penalty */}
              {event.penaltySeconds !== undefined && (
                <div className="mb-5 flex items-center justify-between rounded-xl bg-surface-overlay border border-border-subtle px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary">Axe-placement penalty</div>
                    <div className="text-[11px] text-text-tertiary">
                      +{event.penaltySeconds}s each · applied to attempt {activeAttempt + 1}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setPenalties((ps) => {
                          const next = [...ps];
                          next[activeAttempt] = Math.max(0, next[activeAttempt] - event.penaltySeconds!);
                          return next;
                        })
                      }
                      className="numpad-key px-3 py-1 text-sm"
                    >
                      −
                    </button>
                    <span className="font-mono text-sm text-text-primary w-10 text-center">
                      +{penalties[activeAttempt]}s
                    </span>
                    <button
                      onClick={() =>
                        setPenalties((ps) => {
                          const next = [...ps];
                          next[activeAttempt] += event.penaltySeconds!;
                          return next;
                        })
                      }
                      className="numpad-key px-3 py-1 text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} onClick={() => setDigit((p) => p + n)} className="numpad-key py-4">
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => {
                    if (event.decimals > 0) setDigit((p) => (p.includes(".") ? p : p + "."));
                  }}
                  className={`numpad-key py-4 ${event.decimals > 0 ? "text-text-secondary" : "text-text-tertiary/30 cursor-not-allowed"}`}
                >
                  .
                </button>
                <button onClick={() => setDigit((p) => p + "0")} className="numpad-key py-4">
                  0
                </button>
                <button onClick={() => setDigit((p) => p.slice(0, -1))} className="numpad-key py-4 text-text-tertiary">
                  <Delete size={22} className="mx-auto" />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setValues(values.map(() => ""));
                    setPenalties(penalties.map(() => 0));
                    setActiveAttempt(0);
                  }}
                  className="btn-secondary flex-1 py-3"
                >
                  Clear
                </button>
                <button onClick={handleSubmit} disabled={!canSubmit} className="btn-primary flex-[2] py-3 text-base">
                  {existing.length > 0 ? "Update Round" : partial && canSubmit ? `Save ${filled.length} of ${roundPlan.attempts}` : "Save Round"}
                </button>
              </div>
              {roundPlan.attempts > 1 && (
                <p className="text-[11px] text-text-tertiary mt-3 text-center">
                  Saving one attempt at a time is fine — record set 1 for the line, come back for set 2.
                </p>
              )}
            </>
          )}

          {/* Secondary actions */}
          {!submitted && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-border-subtle">
              {existing.length > 0 ? (
                <button
                  onClick={() =>
                    remove.mutate(
                      { competitorId, eventId: event.id, round },
                      { onSuccess: () => navigate({ to: "/score/$eventId", params: { eventId: event.id } }) }
                    )
                  }
                  className="text-xs text-red-400/80 hover:text-red-400 transition-colors"
                >
                  Remove this round's score
                </button>
              ) : (
                <span />
              )}
              <button
                onClick={() =>
                  updateCompetitor.mutate({
                    id: competitorId,
                    patch: {
                      eventSkips: isSkipped
                        ? competitor.eventSkips.filter((e) => e !== event.id)
                        : [...competitor.eventSkips, event.id],
                    },
                  })
                }
                className={`text-xs inline-flex items-center gap-1 transition-colors ${
                  isSkipped ? "text-amber-400" : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <Ban size={12} />
                {isSkipped ? "Skipped — undo" : "Mark skipped for event"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Caber clock-face entry ────────────────────────────────

function CaberEntry({
  values,
  setValues,
  allowed,
  onSubmit,
  canSubmit,
  existing,
}: {
  values: string[];
  setValues: React.Dispatch<React.SetStateAction<string[]>>;
  allowed: number[];
  onSubmit: () => void;
  canSubmit: boolean;
  existing: boolean;
}) {
  const labels: Record<string, string> = {
    "10": "12 o'clock",
    "9": "11 & 1",
    "8": "10 & 2",
    "7": "9 & 3",
    "6": "outside 9–3",
    "0": "no flip",
    pass: "declined — keeping the other flip",
  };
  return (
    <>
      <div className="space-y-4 mb-5">
        {values.map((v, i) => (
          <div key={i}>
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1.5">
              Flip {i + 1}{" "}
              {v !== "" && (
                <span className="text-text-secondary normal-case">
                  — {v === "pass" ? "PASS" : `${v} pts`} ({labels[v]})
                </span>
              )}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {allowed.map((val) => (
                <button
                  key={val}
                  onClick={() =>
                    setValues((vs) => {
                      const next = [...vs];
                      next[i] = String(val);
                      return next;
                    })
                  }
                  className={`numpad-key py-3 text-base ${v === String(val) ? "!bg-ledge-red !text-white !border-ledge-red" : ""}`}
                  title={labels[String(val)]}
                >
                  {val}
                </button>
              ))}
              <button
                onClick={() =>
                  setValues((vs) => {
                    const next = [...vs];
                    next[i] = "pass";
                    return next;
                  })
                }
                className={`numpad-key py-3 text-xs ${v === "pass" ? "!bg-amber-500 !text-white !border-amber-500" : "text-text-secondary"}`}
                title={labels.pass}
              >
                Pass
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-text-tertiary mb-4">
        Clock scoring: 12:00 = 10 · 11&1 = 9 · 10&2 = 8 · 9&3 = 7 · flipped outside 9–3 = 6 · failed flip = 0.
        Round score counts the better flip. <span className="text-amber-400/90">Pass</span> = competitor
        declines this flip (keeps their other score, nobody waits on them).
      </p>
      <div className="flex gap-2">
        <button onClick={() => setValues(values.map(() => ""))} className="btn-secondary flex-1 py-3">
          Clear
        </button>
        <button onClick={onSubmit} disabled={!canSubmit} className="btn-primary flex-[2] py-3 text-base">
          {existing ? "Update Round" : "Save Round"}
        </button>
      </div>
    </>
  );
}

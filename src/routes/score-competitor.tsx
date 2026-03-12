import { useState } from "react";
import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Check, Delete } from "lucide-react";
import { getCompetitor, getEvent, scores, divisions } from "@/data/mock";

export function ScoreCompetitorPage() {
  const { eventId, competitorId } = useParams({
    from: "/score/$eventId/$competitorId",
  });
  const navigate = useNavigate();
  const event = getEvent(eventId);
  const competitor = getCompetitor(competitorId);
  const division = competitor ? divisions.find((d) => d.id === competitor.divisionId) : null;

  const existingScore = scores.find(
    (s) => s.competitorId === competitorId && s.eventId === eventId
  );

  const [value, setValue] = useState(existingScore?.rawScore.toString() ?? "");
  const [submitted, setSubmitted] = useState(false);

  if (!event || !competitor) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <p className="text-text-secondary">Not found.</p>
      </div>
    );
  }

  function handleSubmit() {
    setSubmitted(true);
    setTimeout(() => {
      navigate({ to: "/score/$eventId", params: { eventId } });
    }, 800);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 animate-slide-up">
      <Link
        to="/score/$eventId"
        params={{ eventId }}
        className="btn-ghost text-sm text-text-tertiary mb-4 -ml-3 inline-flex items-center gap-1 hover:text-text-primary"
      >
        <ChevronLeft size={16} />
        Back to queue
      </Link>

      <div className="card rounded-2xl overflow-hidden">
        {/* Competitor header with division color accent */}
        <div
          className="px-6 pt-6 pb-5 text-center relative"
          style={{ borderTop: `3px solid ${division?.color ?? "#666"}` }}
        >
          <div className="flex items-center justify-center gap-3 mb-2">
            <span
              className="bib-badge text-sm"
              style={{ backgroundColor: division?.color }}
            >
              {competitor.bibNumber}
            </span>
            <span className="text-xs text-text-tertiary">{division?.name}</span>
          </div>
          <h2 className="text-2xl font-bold text-text-primary">
            {competitor.firstName} {competitor.lastName}
          </h2>
          <p className="text-sm text-text-secondary mt-1">{event.name}</p>
        </div>

        <div className="px-6 pb-6">
          {submitted ? (
            <div className="text-center py-10 animate-scale-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-ledge-green/20 flex items-center justify-center">
                <Check size={32} className="text-emerald-400" strokeWidth={2.5} />
              </div>
              <p className="text-lg font-semibold text-emerald-400">Score saved!</p>
            </div>
          ) : (
            <>
              {/* Score display */}
              <div className="mb-5">
                <label className="section-label block mb-2">Score</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    readOnly
                    className="w-full bg-surface-overlay border-2 border-border-subtle rounded-xl px-4 py-5 text-center text-4xl font-mono text-text-primary tracking-wide focus:border-ledge-red focus:shadow-[0_0_0_3px_rgba(153,0,0,0.15)] outline-none transition-all"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    onClick={() => setValue((p) => p + n)}
                    className="numpad-key py-4"
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => {
                    if (!value.includes(".")) setValue((p) => p + ".");
                  }}
                  className="numpad-key py-4 text-text-secondary"
                >
                  .
                </button>
                <button
                  onClick={() => setValue((p) => p + "0")}
                  className="numpad-key py-4"
                >
                  0
                </button>
                <button
                  onClick={() => setValue((p) => p.slice(0, -1))}
                  className="numpad-key py-4 text-text-tertiary"
                >
                  <Delete size={22} className="mx-auto" />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => setValue("")}
                  className="btn-secondary flex-1 py-3"
                >
                  Clear
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!value}
                  className="btn-primary flex-[2] py-3 text-base"
                >
                  {existingScore ? "Update Score" : "Submit Score"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

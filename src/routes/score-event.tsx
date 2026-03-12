import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { EventIcon } from "@/components/event-icons";
import {
  divisions,
  getEvent,
  getDivisionCompetitors,
  scores,
  type Competitor,
} from "@/data/mock";

export function ScoreEventPage() {
  const { eventId } = useParams({ from: "/score/$eventId" });
  const event = getEvent(eventId);
  const [selectedDivision, setSelectedDivision] = useState(divisions[0].id);

  if (!event) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <p className="text-text-secondary">Event not found.</p>
      </div>
    );
  }

  const divCompetitors = getDivisionCompetitors(selectedDivision);
  const activeDivision = divisions.find((d) => d.id === selectedDivision)!;

  const scoredIds = new Set(
    scores.filter((s) => s.eventId === eventId).map((s) => s.competitorId)
  );

  const unscored = divCompetitors.filter((c) => !scoredIds.has(c.id));
  const alreadyScored = divCompetitors.filter((c) => scoredIds.has(c.id));
  const progress = divCompetitors.length > 0
    ? Math.round((alreadyScored.length / divCompetitors.length) * 100)
    : 0;

  return (
    <div className="max-w-lg mx-auto px-4 py-8 animate-slide-up">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/score"
          className="btn-ghost text-sm text-text-tertiary mb-3 -ml-3 inline-flex items-center gap-1 hover:text-text-primary"
        >
          <ChevronLeft size={16} />
          All Events
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-surface-overlay overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progress}%`,
                backgroundColor: activeDivision.color,
                boxShadow: `0 0 8px ${activeDivision.color}60`,
              }}
            />
          </div>
          <span className="text-xs text-text-tertiary font-mono">
            {alreadyScored.length}/{divCompetitors.length}
          </span>
        </div>
      </div>

      {/* Division pills */}
      <div className="flex gap-2 mb-6">
        {divisions.map((div) => {
          const isActive = selectedDivision === div.id;
          return (
            <button
              key={div.id}
              onClick={() => setSelectedDivision(div.id)}
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

      {/* Unscored */}
      {unscored.length > 0 && (
        <div className="mb-8">
          <p className="section-label mb-3">Needs Scoring ({unscored.length})</p>
          <div className="space-y-1.5">
            {unscored.map((c) => (
              <CompetitorRow
                key={c.id}
                competitor={c}
                eventId={eventId}
                divisionColor={activeDivision.color}
                scored={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Already scored */}
      {alreadyScored.length > 0 && (
        <div>
          <p className="section-label mb-3">Scored ({alreadyScored.length})</p>
          <div className="space-y-1.5">
            {alreadyScored.map((c) => {
              const score = scores.find(
                (s) => s.competitorId === c.id && s.eventId === eventId
              );
              return (
                <CompetitorRow
                  key={c.id}
                  competitor={c}
                  eventId={eventId}
                  divisionColor={activeDivision.color}
                  scored={true}
                  scoreValue={score?.rawScore}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CompetitorRow({
  competitor,
  eventId,
  divisionColor,
  scored,
  scoreValue,
}: {
  competitor: Competitor;
  eventId: string;
  divisionColor: string;
  scored: boolean;
  scoreValue?: number;
}) {
  return (
    <Link
      to="/score/$eventId/$competitorId"
      params={{ eventId, competitorId: competitor.id }}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-150 group ${
        scored
          ? "bg-surface-raised/40 hover:bg-surface-raised"
          : "bg-surface-raised border border-border-subtle hover:border-border-default hover:shadow-lg"
      }`}
    >
      <span
        className="bib-badge"
        style={{ backgroundColor: scored ? `${divisionColor}80` : divisionColor }}
      >
        {competitor.bibNumber}
      </span>
      <span className={`flex-1 font-medium ${scored ? "text-text-tertiary" : "text-text-primary"}`}>
        {competitor.firstName} {competitor.lastName}
      </span>
      {scored && scoreValue !== undefined && (
        <span className="text-sm text-text-tertiary font-mono">{scoreValue}</span>
      )}
      <span className="text-text-tertiary group-hover:text-text-secondary group-hover:translate-x-0.5 transition-all text-sm">
        {scored ? "edit" : "\u203A"}
      </span>
    </Link>
  );
}

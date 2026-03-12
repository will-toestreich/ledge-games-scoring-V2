import { useState } from "react";
import { Calendar, Users, Layers, Settings, ChevronRight, KeyRound } from "lucide-react";
import { EventIcon } from "@/components/event-icons";
import {
  competition,
  divisions,
  events,
  competitors,
  getDivisionCompetitors,
} from "@/data/mock";

type Tab = "events" | "competitors" | "divisions" | "settings";

const tabs: { key: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
  { key: "events", label: "Events", count: events.length, icon: <Calendar size={14} /> },
  { key: "competitors", label: "Competitors", count: competitors.length, icon: <Users size={14} /> },
  { key: "divisions", label: "Divisions", count: divisions.length, icon: <Layers size={14} /> },
  { key: "settings", label: "Settings", icon: <Settings size={14} /> },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("events");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-slide-up">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-tight">Competition Dashboard</h1>
          <span className="badge badge-success">{competition.status}</span>
        </div>
        <p className="text-text-secondary text-sm">
          {competition.name} {competition.year}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-8 p-1 rounded-xl bg-surface-raised border border-border-subtle w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === tab.key
                ? "bg-surface-overlay text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span className={activeTab === tab.key ? "text-text-primary" : "text-text-tertiary"}>{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && (
              <span className={`ml-1.5 text-xs ${
                activeTab === tab.key ? "text-text-secondary" : "text-text-tertiary"
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {activeTab === "events" && <EventsTab />}
        {activeTab === "competitors" && <CompetitorsTab />}
        {activeTab === "divisions" && <DivisionsTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

// ─── Events Tab ─────────────────────────────────────────

function EventsTab() {
  return (
    <div className="grid gap-3">
      {events.map((event, i) => (
        <div
          key={event.id}
          className="card card-interactive rounded-xl p-5 flex items-center gap-5 group"
        >
          {/* Event icon */}
          <div className="w-10 h-10 rounded-lg bg-surface-overlay border border-border-subtle flex items-center justify-center shrink-0">
            <EventIcon eventId={event.id} size={20} className="text-text-secondary" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary group-hover:text-white transition-colors">
              {event.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-text-tertiary px-2 py-0.5 rounded-md bg-surface-overlay">
                {event.scoringType}
              </span>
              <span className="text-xs text-text-tertiary">
                {event.higherIsBetter ? "Higher wins" : "Lower wins"}
              </span>
              <span className="text-xs text-text-tertiary">&middot;</span>
              <span className="text-xs text-text-tertiary">{event.rounds} rounds</span>
            </div>
          </div>

          <ChevronRight size={16} className="text-text-tertiary group-hover:text-text-secondary transition-colors" />
        </div>
      ))}
    </div>
  );
}

// ─── Competitors Tab ────────────────────────────────────

function CompetitorsTab() {
  const [selectedDivision, setSelectedDivision] = useState(divisions[0].id);
  const divCompetitors = getDivisionCompetitors(selectedDivision);
  const activeDivision = divisions.find((d) => d.id === selectedDivision)!;

  return (
    <div>
      {/* Division pills */}
      <div className="flex gap-2 mb-5">
        {divisions.map((div) => {
          const count = getDivisionCompetitors(div.id).length;
          const isActive = selectedDivision === div.id;
          return (
            <button
              key={div.id}
              onClick={() => setSelectedDivision(div.id)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                isActive
                  ? "text-white shadow-lg"
                  : "text-text-secondary bg-surface-raised border border-border-subtle hover:border-border-default hover:text-text-primary"
              }`}
              style={
                isActive
                  ? {
                      backgroundColor: div.color,
                      boxShadow: `0 4px 20px ${div.color}40`,
                    }
                  : undefined
              }
            >
              {div.name}
              <span className={`ml-1.5 text-xs ${isActive ? "opacity-70" : "text-text-tertiary"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Competitor table */}
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider w-16">Bib</th>
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider">Hometown</th>
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {divCompetitors.map((c, i) => (
              <tr
                key={c.id}
                className={`border-b border-border-subtle/50 transition-colors hover:bg-surface-overlay/50 ${
                  i % 2 === 0 ? "" : "bg-surface-raised/30"
                }`}
              >
                <td className="px-4 py-2.5">
                  <span
                    className="bib-badge"
                    style={{ backgroundColor: activeDivision.color }}
                  >
                    {c.bibNumber}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-text-primary">
                  {c.firstName} {c.lastName}
                  {c.nickname && (
                    <span className="text-text-tertiary ml-2 text-xs">{c.nickname}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">{c.hometown ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span className="badge badge-success">{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Divisions Tab ──────────────────────────────────────

function DivisionsTab() {
  return (
    <div className="grid gap-3">
      {divisions.map((div) => {
        const count = getDivisionCompetitors(div.id).length;
        return (
          <div key={div.id} className="card rounded-xl p-5 flex items-center gap-4">
            <div
              className="w-3 h-12 rounded-full shrink-0"
              style={{ backgroundColor: div.color, boxShadow: `0 0 12px ${div.color}50` }}
            />
            <div className="flex-1">
              <h3 className="font-semibold text-text-primary">{div.name}</h3>
              <p className="text-sm text-text-secondary">{count} competitors</p>
            </div>
            <span className="text-3xl font-bold text-text-tertiary font-mono">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────

function SettingsTab() {
  return (
    <div className="space-y-5 max-w-2xl">
      <div className="card rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-text-primary">Competition</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-text-secondary text-xs font-medium block mb-1.5">Name</label>
            <input type="text" defaultValue={competition.name} className="input" />
          </div>
          <div>
            <label className="text-text-secondary text-xs font-medium block mb-1.5">Year</label>
            <input type="number" defaultValue={competition.year} className="input" />
          </div>
        </div>
      </div>

      <div className="card rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <KeyRound size={16} className="text-text-tertiary" />
          Scorer PIN
        </h3>
        <p className="text-sm text-text-secondary">
          Scorers enter this PIN on event day to access the scoring interface.
        </p>
        <input
          type="text"
          defaultValue="1234"
          className="input w-48 font-mono text-xl tracking-[0.3em] text-center"
        />
      </div>

      <div className="card rounded-xl p-6">
        <h3 className="font-semibold text-text-primary mb-1">Field Size</h3>
        <p className="text-sm text-text-secondary">
          {competitors.length} total competitors across {divisions.length} divisions
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  Calendar,
  Users,
  Layers,
  Settings,
  ChevronRight,
  KeyRound,
  ClipboardCheck,
  Radar,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  Trophy,
} from "lucide-react";
import { EventIcon } from "@/components/event-icons";
import {
  competition,
  divisions,
  events,
  competitors,
  getDivisionCompetitors,
  getEventScoringProgress,
  getEventLeader,
  getTotalScoringProgress,
  getDivisionStandings,
} from "@/data/mock";

type Tab = "mission-control" | "events" | "competitors" | "registration" | "divisions" | "settings";

const tabs: { key: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
  { key: "mission-control", label: "Mission Control", icon: <Radar size={14} /> },
  { key: "events", label: "Events", count: events.length, icon: <Calendar size={14} /> },
  { key: "competitors", label: "Competitors", count: competitors.length, icon: <Users size={14} /> },
  { key: "registration", label: "Registration", icon: <ClipboardCheck size={14} /> },
  { key: "divisions", label: "Divisions", count: divisions.length, icon: <Layers size={14} /> },
  { key: "settings", label: "Settings", icon: <Settings size={14} /> },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("mission-control");

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
        {activeTab === "mission-control" && <MissionControlTab />}
        {activeTab === "events" && <EventsTab />}
        {activeTab === "competitors" && <CompetitorsTab />}
        {activeTab === "registration" && <RegistrationTab />}
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
      {events.map((event) => (
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
  const [compName, setCompName] = useState(competition.name);
  const [pin, setPin] = useState("1234");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    // In Phase 2 this will persist to Supabase
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="card rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-text-primary">Competition</h3>
        <div>
          <label className="text-text-secondary text-xs font-medium block mb-1.5">Name</label>
          <input
            type="text"
            value={compName}
            onChange={(e) => setCompName(e.target.value)}
            className="input max-w-md"
          />
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
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="input w-48 font-mono text-xl tracking-[0.3em] text-center"
        />
      </div>

      <div className="card rounded-xl p-6">
        <h3 className="font-semibold text-text-primary mb-1">Field Size</h3>
        <p className="text-sm text-text-secondary">
          {competitors.length} total competitors across {divisions.length} divisions
        </p>
      </div>

      <button onClick={handleSave} className="btn-primary">
        {saved ? (
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 size={16} /> Saved
          </span>
        ) : (
          "Save Settings"
        )}
      </button>
    </div>
  );
}

// ─── Mission Control Tab ──────────────────────────────────

function MissionControlTab() {
  const totalProgress = getTotalScoringProgress();
  const totalPct = totalProgress.total > 0 ? Math.round((totalProgress.scored / totalProgress.total) * 100) : 0;

  // Build event status cards
  const eventStatuses = events.map((event) => {
    let totalScored = 0;
    let totalCompetitors = 0;
    const divDetails: { name: string; color: string; scored: number; total: number }[] = [];

    for (const div of divisions) {
      const p = getEventScoringProgress(event.id, div.id);
      totalScored += p.scored;
      totalCompetitors += p.total;
      divDetails.push({ name: div.name, color: div.color, scored: p.scored, total: p.total });
    }

    const pct = totalCompetitors > 0 ? Math.round((totalScored / totalCompetitors) * 100) : 0;
    const status = pct === 100 ? "complete" : pct > 0 ? "in-progress" : "not-started";
    const leader = getEventLeader(event.id, divisions[0].id);

    return { event, totalScored, totalCompetitors, pct, status, leader, divDetails };
  });

  const completedEvents = eventStatuses.filter((e) => e.status === "complete").length;
  const inProgressEvents = eventStatuses.filter((e) => e.status === "in-progress").length;
  const activeCompetitors = competitors.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-6">
      {/* Top-line stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Overall Progress"
          value={`${totalPct}%`}
          detail={`${totalProgress.scored} / ${totalProgress.total} scores`}
          icon={<Zap size={16} />}
          accent={totalPct === 100 ? "#059848" : "#cc1a1a"}
        />
        <StatCard
          label="Events Complete"
          value={`${completedEvents} / ${events.length}`}
          detail={inProgressEvents > 0 ? `${inProgressEvents} in progress` : "All done"}
          icon={<Trophy size={16} />}
          accent="#D97706"
        />
        <StatCard
          label="Active Competitors"
          value={String(activeCompetitors)}
          detail={`of ${competitors.length} registered`}
          icon={<Users size={16} />}
          accent="#0A4366"
        />
        <StatCard
          label="Competition Status"
          value={competition.status}
          detail={competition.name}
          icon={<Radar size={16} />}
          accent="#059848"
        />
      </div>

      {/* Event grid */}
      <div>
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Event Status
        </h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {eventStatuses.map(({ event, totalScored, totalCompetitors, pct, status, divDetails }) => (
            <div key={event.id} className="card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-surface-overlay border border-border-subtle flex items-center justify-center">
                    <EventIcon eventId={event.id} size={16} className="text-text-secondary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-text-primary text-sm">{event.name}</h4>
                    <p className="text-xs text-text-tertiary">
                      {totalScored} / {totalCompetitors} scored
                    </p>
                  </div>
                </div>
                <StatusBadge status={status} />
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: status === "complete" ? "#059848" : "#cc1a1a",
                  }}
                />
              </div>

              {/* Per-division breakdown */}
              <div className="flex gap-2">
                {divDetails.map((d) => {
                  const dpct = d.total > 0 ? Math.round((d.scored / d.total) * 100) : 0;
                  return (
                    <div key={d.name} className="flex-1 text-center">
                      <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
                        {d.name.slice(0, 3)}
                      </div>
                      <div
                        className="h-1 rounded-full bg-surface-overlay overflow-hidden"
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${dpct}%`, backgroundColor: d.color }}
                        />
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-0.5 font-mono">{dpct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Division leaderboard snapshot */}
      <div>
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Division Leaders
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          {divisions.map((div) => {
            const standings = getDivisionStandings(div.id);
            const top3 = standings.slice(0, 3);
            return (
              <div key={div.id} className="card rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2.5 flex items-center justify-between"
                  style={{ background: `${div.color}20` }}
                >
                  <span className="font-semibold text-sm text-text-primary">{div.name}</span>
                  <span className="text-xs text-text-tertiary font-mono">{standings.length}</span>
                </div>
                <div className="p-3 space-y-1.5">
                  {top3.map((s, i) => (
                    <div key={s.competitorId} className="flex items-center gap-2.5 text-sm">
                      <span className="w-5 text-right font-mono text-text-tertiary text-xs">{i + 1}</span>
                      <span
                        className="bib-badge text-[10px] py-0.5 px-1.5"
                        style={{ backgroundColor: div.color, minWidth: "1.75rem" }}
                      >
                        {s.bibNumber}
                      </span>
                      <span className={`flex-1 truncate ${i === 0 ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                        {s.firstName} {s.lastName}
                      </span>
                      <span className="font-mono text-xs text-text-tertiary">{Math.round(s.totalPoints)} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: accent }}>{icon}</span>
        <span className="text-xs text-text-tertiary font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      <p className="text-xs text-text-secondary mt-0.5">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
        <CheckCircle2 size={10} /> Done
      </span>
    );
  }
  if (status === "in-progress") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
        <Clock size={10} /> Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-overlay text-text-tertiary">
      <Clock size={10} /> Pending
    </span>
  );
}

// ─── Registration Tab ──────────────────────────────────────

function RegistrationTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<Set<string>>(() => {
    // Mock: about 80% checked in
    const set = new Set<string>();
    competitors.forEach((c, i) => {
      if (i % 5 !== 0) set.add(c.id);
    });
    return set;
  });

  const filteredCompetitors = competitors.filter((c) => {
    if (filter && c.divisionId !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        String(c.bibNumber).includes(q)
      );
    }
    return true;
  });

  const totalCheckedIn = competitors.filter((c) => checkedIn.has(c.id)).length;

  function toggleCheckIn(id: string) {
    setCheckedIn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {/* Headcount cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card rounded-xl p-4">
          <div className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1">Total Check-ins</div>
          <div className="text-2xl font-bold text-text-primary">
            {totalCheckedIn} <span className="text-sm font-normal text-text-tertiary">/ {competitors.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.round((totalCheckedIn / competitors.length) * 100)}%` }}
            />
          </div>
        </div>
        {divisions.map((div) => {
          const divComps = getDivisionCompetitors(div.id);
          const divCheckedIn = divComps.filter((c) => checkedIn.has(c.id)).length;
          return (
            <div key={div.id} className="card rounded-xl p-4" style={{ borderTop: `3px solid ${div.color}` }}>
              <div className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1">{div.name}</div>
              <div className="text-2xl font-bold text-text-primary">
                {divCheckedIn} <span className="text-sm font-normal text-text-tertiary">/ {divComps.length}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden mt-2">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.round((divCheckedIn / divComps.length) * 100)}%`, backgroundColor: div.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Search + filter + add walk-on */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by name or bib..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 py-2 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
              !filter ? "bg-surface-overlay text-text-primary border border-border-default" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            All
          </button>
          {divisions.map((div) => (
            <button
              key={div.id}
              onClick={() => setFilter(filter === div.id ? null : div.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                filter === div.id ? "text-white" : "text-text-secondary hover:text-text-primary"
              }`}
              style={filter === div.id ? { backgroundColor: div.color } : undefined}
            >
              {div.name}
            </button>
          ))}
        </div>
        <button className="btn-secondary text-sm py-2 ml-auto inline-flex items-center gap-1.5">
          <UserPlus size={14} /> Walk-on
        </button>
      </div>

      {/* Registration table */}
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider w-12"></th>
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider w-16">Bib</th>
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider">Division</th>
              <th className="px-4 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider">Hometown</th>
              <th className="px-4 py-3 text-center text-text-tertiary font-medium text-xs uppercase tracking-wider w-28">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredCompetitors.map((c, i) => {
              const div = divisions.find((d) => d.id === c.divisionId)!;
              const isIn = checkedIn.has(c.id);
              return (
                <tr
                  key={c.id}
                  className={`border-b border-border-subtle/50 transition-colors hover:bg-surface-overlay/50 ${
                    i % 2 === 0 ? "" : "bg-surface-raised/30"
                  }`}
                >
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleCheckIn(c.id)}
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                        isIn
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-border-strong hover:border-text-secondary"
                      }`}
                    >
                      {isIn && <CheckCircle2 size={14} />}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <span className="bib-badge text-[10px]" style={{ backgroundColor: div.color }}>
                      {c.bibNumber}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-medium text-text-primary">
                    {c.firstName} {c.lastName}
                    {c.nickname && <span className="text-text-tertiary ml-2 text-xs">{c.nickname}</span>}
                  </td>
                  <td className="px-4 py-2 text-text-secondary text-xs">{div.name}</td>
                  <td className="px-4 py-2 text-text-secondary">{c.hometown ?? "—"}</td>
                  <td className="px-4 py-2 text-center">
                    {isIn ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                        <CheckCircle2 size={12} /> Checked In
                      </span>
                    ) : c.status === "withdrawn" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
                        <XCircle size={12} /> Withdrawn
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-text-tertiary">
                        <AlertTriangle size={12} /> Not Here
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

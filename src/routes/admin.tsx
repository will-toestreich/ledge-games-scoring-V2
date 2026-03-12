import { useState, useRef } from "react";
import {
  Calendar,
  Users,
  Layers,
  Settings,
  KeyRound,
  Radar,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  Trophy,
  ChevronDown,
  Plus,
  Trash2,
  GripVertical,
  Download,
  Upload,
  FileSpreadsheet,
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

type Tab = "mission-control" | "competitors" | "settings";

const tabs: { key: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
  { key: "mission-control", label: "Mission Control", icon: <Radar size={14} /> },
  { key: "competitors", label: "Competitors", count: competitors.length, icon: <Users size={14} /> },
  { key: "settings", label: "Settings", icon: <Settings size={14} /> },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("mission-control");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 animate-slide-up">
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
        {activeTab === "competitors" && <CompetitorsTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}


// ─── Competitors Tab (Registration Dashboard) ─────────────

function CompetitorsTab() {
  const [filter, setFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredCompetitors = competitors.filter((c) => {
    if (filter && c.divisionId !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        String(c.bibNumber).includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const totalCheckedIn = competitors.filter((c) => c.checkedIn).length;
  const totalRegistered = competitors.filter((c) => c.registered).length;

  function downloadTemplate() {
    const headers = ["Bib", "First Name", "Last Name", "Email", "Division (mens/womens/mentors)", "Nickname", "Hometown", "Shirt Size"];
    const csvContent = headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "competitor-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Phase 2: parse CSV and import competitors
    console.log("CSV import:", file.name);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-5">
      {/* Headcount cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card rounded-xl p-4">
          <div className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1">Total</div>
          <div className="text-2xl font-bold text-text-primary">{competitors.length}</div>
          <div className="text-xs text-text-secondary mt-0.5">competitors</div>
        </div>
        <div className="card rounded-xl p-4">
          <div className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1">Registered</div>
          <div className="text-2xl font-bold text-text-primary">
            {totalRegistered} <span className="text-sm font-normal text-text-tertiary">/ {competitors.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${Math.round((totalRegistered / competitors.length) * 100)}%` }}
            />
          </div>
        </div>
        <div className="card rounded-xl p-4">
          <div className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1">Checked In</div>
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
          const divCheckedIn = divComps.filter((c) => c.checkedIn).length;
          return (
            <div key={div.id} className="card rounded-xl p-4" style={{ borderTop: `3px solid ${div.color}` }}>
              <div className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1">{div.name}</div>
              <div className="text-2xl font-bold text-text-primary">
                {divCheckedIn} <span className="text-sm font-normal text-text-tertiary">/ {divComps.length}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search + filter + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by name, bib, or email..."
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
        <div className="flex gap-2 ml-auto">
          <button onClick={downloadTemplate} className="btn-ghost text-xs py-1.5 inline-flex items-center gap-1.5">
            <Download size={13} /> Template
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs py-1.5 inline-flex items-center gap-1.5">
            <Upload size={13} /> Import CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvImport} className="hidden" />
          <button className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5">
            <UserPlus size={13} /> Add Walk-on
          </button>
        </div>
      </div>

      {/* Competitor table */}
      <div className="card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-3 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider w-14">Bib</th>
                <th className="px-3 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider">Name</th>
                <th className="px-3 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider">Email</th>
                <th className="px-3 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider w-20">Division</th>
                <th className="px-3 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider w-20">Nickname</th>
                <th className="px-3 py-3 text-left text-text-tertiary font-medium text-xs uppercase tracking-wider">Hometown</th>
                <th className="px-3 py-3 text-center text-text-tertiary font-medium text-xs uppercase tracking-wider w-20">Shirt</th>
                <th className="px-3 py-3 text-center text-text-tertiary font-medium text-xs uppercase tracking-wider w-16">Reg</th>
                <th className="px-3 py-3 text-center text-text-tertiary font-medium text-xs uppercase tracking-wider w-24">Check-in</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompetitors.map((c, i) => {
                const div = divisions.find((d) => d.id === c.divisionId)!;
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-border-subtle/50 transition-colors hover:bg-surface-overlay/50 ${
                      i % 2 === 0 ? "" : "bg-surface-raised/30"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className="bib-badge text-[10px]" style={{ backgroundColor: div.color }}>
                        {c.bibNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-text-primary whitespace-nowrap">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-3 py-2 text-text-secondary text-xs truncate max-w-[180px]">{c.email ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs font-medium" style={{ color: div.color }}>{div.name}</span>
                    </td>
                    <td className="px-3 py-2 text-text-tertiary text-xs">{c.nickname ?? "—"}</td>
                    <td className="px-3 py-2 text-text-secondary text-xs">{c.hometown ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-text-secondary text-xs">{c.shirtSize ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      {c.registered ? (
                        <CheckCircle2 size={14} className="text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle size={14} className="text-text-tertiary mx-auto" />
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {c.checkedIn && c.waiverSigned ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 size={12} /> Ready
                        </span>
                      ) : c.checkedIn ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400">
                          <AlertTriangle size={12} /> No Waiver
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-tertiary">
                          <Clock size={12} /> Pending
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-border-subtle flex items-center justify-between text-xs text-text-tertiary">
          <span>{filteredCompetitors.length} competitor{filteredCompetitors.length !== 1 ? "s" : ""}</span>
          <span className="inline-flex items-center gap-1.5">
            <FileSpreadsheet size={12} /> CSV import available
          </span>
        </div>
      </div>
    </div>
  );
}


// ─── Settings Tab ───────────────────────────────────────

function SettingsField({
  label,
  description,
  icon,
  children,
  onSave,
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSave: () => void;
}) {
  const [saved, setSaved] = useState(false);

  function handleSave() {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="card rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            {icon}
            {label}
          </h3>
          {description && <p className="text-sm text-text-secondary mt-0.5">{description}</p>}
        </div>
        <button
          onClick={handleSave}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
            saved
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-surface-overlay text-text-secondary hover:text-text-primary border border-border-subtle hover:border-border-default"
          }`}
        >
          {saved ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={12} /> Saved
            </span>
          ) : (
            "Save"
          )}
        </button>
      </div>
      {children}
    </div>
  );
}

function SettingsSection({
  label,
  icon,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-surface-overlay/30 transition-colors"
      >
        <span className="text-text-tertiary">{icon}</span>
        <span className="font-semibold text-text-primary flex-1">{label}</span>
        {count !== undefined && (
          <span className="text-xs text-text-tertiary font-mono bg-surface-overlay px-2 py-0.5 rounded-md">{count}</span>
        )}
        <ChevronDown
          size={16}
          className={`text-text-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-6 pb-5 pt-1 border-t border-border-subtle">{children}</div>}
    </div>
  );
}

function SettingsTab() {
  const [compName, setCompName] = useState(competition.name);
  const [pin, setPin] = useState("1234");

  return (
    <div className="space-y-4 max-w-4xl">
      {/* General */}
      <SettingsField
        label="Competition Name"
        onSave={() => { /* Phase 2: persist to Supabase */ }}
      >
        <input
          type="text"
          value={compName}
          onChange={(e) => setCompName(e.target.value)}
          className="input max-w-md"
        />
      </SettingsField>

      <SettingsField
        label="Scorer PIN"
        description="Scorers enter this PIN on event day to access the scoring interface."
        icon={<KeyRound size={16} className="text-text-tertiary" />}
        onSave={() => { /* Phase 2: persist to Supabase */ }}
      >
        <input
          type="text"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="input w-48 font-mono text-xl tracking-[0.3em] text-center"
        />
      </SettingsField>

      {/* Events Configuration */}
      <SettingsSection
        label="Events"
        icon={<Calendar size={16} />}
        count={events.length}
      >
        <div className="space-y-2 mt-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-surface-overlay/50 border border-border-subtle group"
            >
              <GripVertical size={14} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity cursor-grab shrink-0" />
              <div className="w-8 h-8 rounded-lg bg-surface border border-border-subtle flex items-center justify-center shrink-0">
                <EventIcon eventId={event.id} size={16} className="text-text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-text-primary">{event.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-surface border border-border-subtle">
                    {event.scoringType}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {event.higherIsBetter ? "Higher wins" : "Lower wins"}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {event.rounds} rounds
                  </span>
                </div>
              </div>
              <button className="text-text-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover:bg-red-500/10">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border-default text-text-tertiary hover:text-text-primary hover:border-border-strong transition-colors text-sm">
            <Plus size={14} /> Add Event
          </button>
        </div>
      </SettingsSection>

      {/* Divisions Configuration */}
      <SettingsSection
        label="Divisions"
        icon={<Layers size={16} />}
        count={divisions.length}
      >
        <div className="space-y-2 mt-3">
          {divisions.map((div) => {
            const count = getDivisionCompetitors(div.id).length;
            return (
              <div
                key={div.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-overlay/50 border border-border-subtle group"
              >
                <div
                  className="w-3 h-8 rounded-full shrink-0"
                  style={{ backgroundColor: div.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-text-primary">{div.name}</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    {count} competitors &middot; {div.slug}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    defaultValue={div.color}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    title="Division color"
                  />
                  <button className="text-text-tertiary hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover:bg-red-500/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border-default text-text-tertiary hover:text-text-primary hover:border-border-strong transition-colors text-sm">
            <Plus size={14} /> Add Division
          </button>
        </div>
      </SettingsSection>
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


import { Fragment, useEffect, useMemo, useState } from "react";
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
  Clock,
  Zap,
  Trophy,
  ChevronDown,
  Download,
  Upload,
  FileSpreadsheet,
  ClipboardEdit,
  Database,
  RotateCcw,
  Ban,
  X,
  Pencil,
  ChevronUp,
  ChevronsUpDown,
  Megaphone,
  Swords,
  TrendingUp,
  TrendingDown,
  Minus,
  Flag,
  Scissors,
} from "lucide-react";
import { useRef } from "react";
import { EventIcon } from "@/components/event-icons";
import { CompetitorFormModal } from "@/components/competitor-form";
import { SHIRT_SIZES } from "@/lib/roster";
import { CsvImportModal } from "@/components/csv-import";
import { divisions, events, getDivision, roundLabel } from "@/data/competition-config";
import type { AttemptScore, Competitor, DivisionId, EventConfig, EventId } from "@/lib/types";
import {
  computeEventResults,
  divisionField,
  eventProgress,
  pendingScorers,
  roundReadiness,
  type CutInfo,
  type EventResults,
} from "@/lib/scoring";
import {
  useActivateCompetition,
  useActiveCompetition,
  useActiveDivisions,
  useCompetitions,
  useCompetitors,
  useCreateCompetition,
  useDeleteCompetition,
  useDivisionScoring,
  useKegAttempts,
  useRenameCompetition,
  useResetDemoData,
  useSaveRoundAttempts,
  useDeleteRoundAttempts,
  useSaveSettings,
  useScores,
  useSettings,
  useUpdateCompetitor,
} from "@/data/hooks";
import * as db from "@/data/db";
import { useQueryClient } from "@tanstack/react-query";

type Tab = "mission-control" | "competitors" | "scores" | "settings";

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("mission-control");
  const { data: settings } = useSettings();
  const { data: competitors } = useCompetitors();
  const { data: activeComp } = useActiveCompetition();

  const tabs: { key: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
    { key: "mission-control", label: "Mission Control", icon: <Radar size={14} /> },
    { key: "competitors", label: "Competitors", count: competitors?.length, icon: <Users size={14} /> },
    { key: "scores", label: "Scores", icon: <ClipboardEdit size={14} /> },
    { key: "settings", label: "Settings", icon: <Settings size={14} /> },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 animate-slide-up">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-tight">Competition Dashboard</h1>
          {activeComp && (
            <span className={`badge ${activeComp.status === "active" ? "badge-success" : "badge-warning"}`}>
              {activeComp.status === "active" ? "active" : "completed season"}
            </span>
          )}
        </div>
        <p className="text-text-secondary text-sm">
          {settings?.competitionName ?? "The Ledge Games"} {settings?.year ?? ""}
        </p>
      </div>

      <div className="flex gap-1 mb-8 p-1 rounded-xl bg-surface-raised border border-border-subtle w-fit max-w-full flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 inline-flex items-center gap-1.5 ${
              activeTab === tab.key
                ? "bg-surface-overlay text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span className={activeTab === tab.key ? "text-text-primary" : "text-text-tertiary"}>{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-xs ${activeTab === tab.key ? "text-text-secondary" : "text-text-tertiary"}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="animate-fade-in">
        {activeTab === "mission-control" && <MissionControlTab />}
        {activeTab === "competitors" && <CompetitorsTab />}
        {activeTab === "scores" && <ScoresTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

// ─── Shared bits ───────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  activeColor,
  children,
}: {
  active: boolean;
  onClick: () => void;
  activeColor?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
        active
          ? activeColor
            ? "text-white"
            : "bg-surface-overlay text-text-primary border border-border-default"
          : "text-text-secondary hover:text-text-primary border border-transparent"
      }`}
      style={active && activeColor ? { backgroundColor: activeColor } : undefined}
    >
      {children}
    </button>
  );
}

function Checkbox({
  checked,
  onToggle,
  color = "emerald",
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  color?: "emerald" | "red";
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={label}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all mx-auto ${
        checked
          ? color === "red"
            ? "bg-red-500 border-red-500 text-white"
            : "bg-emerald-500 border-emerald-500 text-white"
          : "border-border-strong hover:border-text-secondary"
      }`}
    >
      {checked && <CheckCircle2 size={12} />}
    </button>
  );
}

// ─── Competitors Tab ───────────────────────────────────────

type SortKey =
  | "bib" | "name" | "email" | "division" | "nickname" | "hometown"
  | "shirt" | "reg" | "paid" | "checkedIn" | "noShow";

interface SortState {
  key: SortKey;
  dir: 1 | -1;
}

/** Accessor per column; null sorts last regardless of direction. */
const sortValue: Record<SortKey, (c: Competitor) => string | number | boolean | null> = {
  bib: (c) => c.bibNumber,
  name: (c) => `${c.firstName} ${c.lastName}`.toLowerCase(),
  email: (c) => c.email?.toLowerCase() ?? null,
  division: (c) => getDivision(c.divisionId)?.displayOrder ?? null,
  nickname: (c) => c.nickname?.toLowerCase() ?? null,
  hometown: (c) => c.hometown?.toLowerCase() ?? null,
  shirt: (c) => (c.shirtSize ? SHIRT_SIZES.indexOf(c.shirtSize) : null),
  reg: (c) => c.registration ?? null,
  paid: (c) => !c.paid, // checked first on ascending
  checkedIn: (c) => !c.checkedIn,
  noShow: (c) => !c.noShow,
};

/** Sortable table header — shared by the Competitors and Scores tables. */
function SortableTh<K extends string>({
  label,
  sortKey,
  align = "left",
  sub,
  sort,
  onSort,
}: {
  label: string;
  sortKey: K;
  align?: "left" | "center";
  /** Optional second line under the label (e.g. a round's cut label). */
  sub?: string;
  sort: { key: K; dir: 1 | -1 };
  onSort: (key: K) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-3 py-3 text-${align} text-text-tertiary font-medium text-xs uppercase tracking-wider`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-text-primary ${
          active ? "text-text-primary" : ""
        }`}
      >
        {label}
        {active ? (
          sort.dir === 1 ? <ChevronUp size={11} /> : <ChevronDown size={11} />
        ) : (
          <ChevronsUpDown size={11} className="opacity-40" />
        )}
      </button>
      {sub && <div className="text-[9px] normal-case font-normal">{sub}</div>}
    </th>
  );
}

function CompetitorsTab() {
  const { data: competitors } = useCompetitors();
  const update = useUpdateCompetitor();
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
  const [regFilter, setRegFilter] = useState<string | null>(null);
  const [shirtFilter, setShirtFilter] = useState<string | null>(null);
  const [paidFilter, setPaidFilter] = useState<boolean | null>(null);
  const [checkinFilter, setCheckinFilter] = useState<string | null>(null);
  const [noShowFilter, setNoShowFilter] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<{ kind: "add" } | { kind: "edit"; competitor: Competitor } | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "bib", dir: 1 });

  if (!competitors) return null;

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  const filtered = competitors.filter((c) => {
    if (divisionFilter && c.divisionId !== divisionFilter) return false;
    if (regFilter && c.registration !== regFilter) return false;
    if (shirtFilter && c.shirtSize !== shirtFilter) return false;
    if (paidFilter !== null && c.paid !== paidFilter) return false;
    if (checkinFilter === "ready" && !c.checkedIn) return false;
    if (checkinFilter === "pending" && c.checkedIn) return false;
    if (noShowFilter !== null && c.noShow !== noShowFilter) return false;
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

  const sorted = [...filtered].sort((a, b) => {
    const va = sortValue[sort.key](a);
    const vb = sortValue[sort.key](b);
    if (va !== vb) {
      if (va === null) return 1; // empty cells always sink to the bottom
      if (vb === null) return -1;
      if (va < vb) return -sort.dir;
      if (va > vb) return sort.dir;
    }
    return a.bibNumber - b.bibNumber; // stable fallback
  });

  const totalCheckedIn = competitors.filter((c) => c.checkedIn).length;
  const totalRegistered = competitors.filter((c) => c.registration !== null).length;
  // A brand-new season has zero competitors — never divide by it
  const rosterPct = (n: number) =>
    competitors.length > 0 ? Math.round((n / competitors.length) * 100) : 0;

  function downloadTemplate() {
    const headers = ["Bib", "First Name", "Last Name", "Email", "Division (mens/womens/mentors)", "Nickname", "Hometown", "Shirt Size"];
    const blob = new Blob([headers.join(",") + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "competitor-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
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
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${rosterPct(totalRegistered)}%` }} />
          </div>
        </div>
        <div className="card rounded-xl p-4">
          <div className="text-xs text-text-tertiary font-medium uppercase tracking-wider mb-1">Checked In</div>
          <div className="text-2xl font-bold text-text-primary">
            {totalCheckedIn} <span className="text-sm font-normal text-text-tertiary">/ {competitors.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-overlay overflow-hidden mt-2">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rosterPct(totalCheckedIn)}%` }} />
          </div>
        </div>
        {divisions.map((div) => {
          const divComps = competitors.filter((c) => c.divisionId === div.id);
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

      {/* Search + actions */}
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
        <div className="flex gap-2 ml-auto">
          <button onClick={downloadTemplate} className="btn-ghost text-xs py-1.5 inline-flex items-center gap-1.5">
            <Download size={13} /> Template
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs py-1.5 inline-flex items-center gap-1.5">
            <Upload size={13} /> Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCsvFile(f);
              e.target.value = "";
            }}
          />
          <button onClick={() => setModal({ kind: "add" })} className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5">
            <UserPlus size={13} /> Add Walk-on
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mr-1">Division</span>
          <FilterPill active={!divisionFilter} onClick={() => setDivisionFilter(null)}>All</FilterPill>
          {divisions.map((div) => (
            <FilterPill
              key={div.id}
              active={divisionFilter === div.id}
              onClick={() => setDivisionFilter(divisionFilter === div.id ? null : div.id)}
              activeColor={div.color}
            >
              {div.name}
            </FilterPill>
          ))}
        </div>
        <div className="w-px h-5 bg-border-subtle" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mr-1">Reg</span>
          <FilterPill active={regFilter === null} onClick={() => setRegFilter(null)}>All</FilterPill>
          {["paid", "cash", "sponsor"].map((r) => (
            <FilterPill key={r} active={regFilter === r} onClick={() => setRegFilter(regFilter === r ? null : r)}>
              {r[0].toUpperCase() + r.slice(1)}
            </FilterPill>
          ))}
        </div>
        <div className="w-px h-5 bg-border-subtle" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mr-1">Shirt</span>
          <FilterPill active={!shirtFilter} onClick={() => setShirtFilter(null)}>All</FilterPill>
          {SHIRT_SIZES.map((size) => (
            <FilterPill key={size} active={shirtFilter === size} onClick={() => setShirtFilter(shirtFilter === size ? null : size)}>
              {size}
            </FilterPill>
          ))}
        </div>
        <div className="w-px h-5 bg-border-subtle" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mr-1">Paid</span>
          <FilterPill active={paidFilter === null} onClick={() => setPaidFilter(null)}>All</FilterPill>
          <FilterPill active={paidFilter === true} onClick={() => setPaidFilter(paidFilter === true ? null : true)} activeColor="#059848">Yes</FilterPill>
          <FilterPill active={paidFilter === false} onClick={() => setPaidFilter(paidFilter === false ? null : false)} activeColor="#ef4444">No</FilterPill>
        </div>
        <div className="w-px h-5 bg-border-subtle" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mr-1">Check-in</span>
          <FilterPill active={!checkinFilter} onClick={() => setCheckinFilter(null)}>All</FilterPill>
          <FilterPill active={checkinFilter === "ready"} onClick={() => setCheckinFilter(checkinFilter === "ready" ? null : "ready")} activeColor="#059848">Yes</FilterPill>
          <FilterPill active={checkinFilter === "pending"} onClick={() => setCheckinFilter(checkinFilter === "pending" ? null : "pending")}>No</FilterPill>
        </div>
        <div className="w-px h-5 bg-border-subtle" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mr-1">No-show</span>
          <FilterPill active={noShowFilter === null} onClick={() => setNoShowFilter(null)}>All</FilterPill>
          <FilterPill active={noShowFilter === true} onClick={() => setNoShowFilter(noShowFilter === true ? null : true)} activeColor="#ef4444">Yes</FilterPill>
          <FilterPill active={noShowFilter === false} onClick={() => setNoShowFilter(noShowFilter === false ? null : false)} activeColor="#059848">No</FilterPill>
        </div>
      </div>

      {/* Table */}
      <div className="card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                {(
                  [
                    { label: "Bib", key: "bib" },
                    { label: "Name", key: "name" },
                    { label: "Email", key: "email" },
                    { label: "Division", key: "division" },
                    { label: "Nickname", key: "nickname" },
                    { label: "Hometown", key: "hometown" },
                  ] as { label: string; key: SortKey }[]
                ).map((col) => (
                  <SortableTh key={col.key} label={col.label} sortKey={col.key} sort={sort} onSort={toggleSort} />
                ))}
                {(
                  [
                    { label: "Shirt", key: "shirt" },
                    { label: "Reg", key: "reg" },
                    { label: "Paid", key: "paid" },
                    { label: "Check-in", key: "checkedIn" },
                    { label: "No-show", key: "noShow" },
                  ] as { label: string; key: SortKey }[]
                ).map((col) => (
                  <SortableTh key={col.key} label={col.label} sortKey={col.key} align="center" sort={sort} onSort={toggleSort} />
                ))}
                <th className="px-1 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const div = getDivision(c.divisionId)!;
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-border-subtle/50 transition-colors hover:bg-surface-overlay/50 ${
                      i % 2 === 0 ? "" : "bg-surface-raised/30"
                    } ${c.noShow ? "opacity-40" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <span className="bib-badge text-[10px]" style={{ backgroundColor: div.color }}>{c.bibNumber}</span>
                    </td>
                    <td className="px-3 py-2 font-medium text-text-primary whitespace-nowrap">{c.firstName} {c.lastName}</td>
                    <td className="px-3 py-2 text-text-secondary text-xs">{c.email ?? "—"}</td>
                    <td className="px-3 py-2"><span className="text-xs font-medium" style={{ color: div.color }}>{div.name}</span></td>
                    <td className="px-3 py-2 text-text-tertiary text-xs">{c.nickname ?? "—"}</td>
                    <td className="px-3 py-2 text-text-secondary text-xs">{c.hometown ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-text-secondary text-xs">{c.shirtSize ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-medium uppercase ${c.registration ? "text-text-primary" : "text-text-tertiary"}`}>
                        {c.registration ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Checkbox checked={c.paid} label={`Paid: ${c.firstName} ${c.lastName}`} onToggle={() => update.mutate({ id: c.id, patch: { paid: !c.paid } })} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Checkbox checked={c.checkedIn} label={`Checked in: ${c.firstName} ${c.lastName}`} onToggle={() => update.mutate({ id: c.id, patch: { checkedIn: !c.checkedIn } })} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Checkbox checked={c.noShow} color="red" label={`No-show: ${c.firstName} ${c.lastName}`} onToggle={() => update.mutate({ id: c.id, patch: { noShow: !c.noShow } })} />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => setModal({ kind: "edit", competitor: c })}
                        className="p-1.5 rounded-md bg-surface-overlay border border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-default transition-all"
                        title={`Edit ${c.firstName} ${c.lastName}`}
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-border-subtle flex items-center justify-between text-xs text-text-tertiary">
          <span>{filtered.length} competitor{filtered.length !== 1 ? "s" : ""}</span>
          <span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={12} /> CSV import ready</span>
        </div>
      </div>

      {modal && (
        <CompetitorFormModal
          competitor={modal.kind === "edit" ? modal.competitor : undefined}
          competitors={competitors}
          onClose={() => setModal(null)}
        />
      )}
      {csvFile && <CsvImportModal file={csvFile} competitors={competitors} onClose={() => setCsvFile(null)} />}
    </div>
  );
}

// ─── Scores Tab (override / correction editor) ─────────────

function ScoresTab() {
  const [eventId, setEventId] = useState<EventId>("axe");
  const activeDivisions = useActiveDivisions();
  const event = events.find((e) => e.id === eventId)!;
  const eventDivs = activeDivisions.filter((d) => event.divisions[d.id]);
  const [divisionId, setDivisionId] = useState<DivisionId>(eventDivs[0].id);
  const activeDivId = eventDivs.some((d) => d.id === divisionId) ? divisionId : eventDivs[0].id;
  // Quick filter — kept across event/division switches so you can chase one
  // competitor's corrections through every event
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary max-w-2xl">
        Direct score corrections — anything entered here recalculates standings instantly.
        Use it for missed entries, scorer mistakes, or judge-ordered adjustments.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {events.map((e) => (
          <button
            key={e.id}
            onClick={() => setEventId(e.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-all ${
              e.id === eventId
                ? "bg-surface-overlay text-text-primary border border-border-default"
                : "text-text-secondary bg-surface-raised border border-border-subtle hover:text-text-primary"
            }`}
          >
            <EventIcon eventId={e.id} size={14} />
            {e.name}
          </button>
        ))}
        <div className="w-px h-5 bg-border-subtle" />
        {eventDivs.map((d) => (
          <FilterPill key={d.id} active={activeDivId === d.id} activeColor={d.color} onClick={() => setDivisionId(d.id)}>
            {d.name}
          </FilterPill>
        ))}
        {event.format !== "ladder" && (
          <div className="relative ml-auto w-full sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search name or bib..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 py-2 text-sm"
            />
          </div>
        )}
      </div>

      {event.format === "ladder" ? (
        <div className="card rounded-xl p-6 text-sm text-text-secondary">
          Keg Toss corrections happen in the scoring console (Scoring → Keg Toss), which has
          per-competitor undo for every bar attempt. Ladder history is attempt-by-attempt, so
          it's safer to replay there than to edit raw cells here.
        </div>
      ) : (
        <ScoreGrid event={event} divisionId={activeDivId} search={search} />
      )}
    </div>
  );
}

function ScoreGrid({
  event,
  divisionId,
  search,
}: {
  event: EventConfig;
  divisionId: DivisionId;
  search: string;
}) {
  const division = getDivision(divisionId)!;
  const plan = event.divisions[divisionId]!;
  const { data: competitors } = useCompetitors();
  const { data: scores } = useScores();
  const { data: kegAttempts } = useKegAttempts();
  const [editing, setEditing] = useState<{ competitorId: string; round: number } | null>(null);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "rank", dir: 1 });

  function toggleSort(key: string) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  const field = useMemo(
    () => (competitors ? divisionField(divisionId, competitors) : []),
    [competitors, divisionId]
  );
  const results: EventResults | null = useMemo(() => {
    if (!competitors || !scores || !kegAttempts) return null;
    return computeEventResults({ event, division, field, scores, kegAttempts });
  }, [competitors, scores, kegAttempts, event, division, field]);

  if (!results || !scores) return null;

  const byId = new Map(field.map((c) => [c.id, c]));
  const q = search.trim().toLowerCase();

  // Column sort: "rank" | "name" | "pts" | "r1".."rN"; nulls sink regardless
  // of direction (an unscored round is never "lowest")
  const sortVal = (r: EventResults["results"][number]): number | string | null => {
    if (sort.key === "name") {
      const c = byId.get(r.competitorId)!;
      return `${c.firstName} ${c.lastName}`.toLowerCase();
    }
    if (sort.key === "pts") return r.points;
    if (sort.key.startsWith("r") && sort.key !== "rank") return r.roundScores[Number(sort.key.slice(1)) - 1];
    return r.rank;
  };
  const ordered = results.results
    .filter((r) => {
      if (!q) return true;
      const c = byId.get(r.competitorId)!;
      return (
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        String(c.bibNumber).includes(q)
      );
    })
    .sort((a, b) => {
      const va = sortVal(a);
      const vb = sortVal(b);
      if (va !== vb) {
        if (va === null) return 1;
        if (vb === null) return -1;
        if (va < vb) return -sort.dir;
        if (va > vb) return sort.dir;
      }
      return (a.rank ?? 9999) - (b.rank ?? 9999); // stable fallback
    });

  // Cut lines: drawn only over the full field in rank order — a "line"
  // inside a filtered or re-sorted list would be a lie. Locked cuts always
  // show (the permanent record of where the line fell); the live projection
  // shows once half the round is in, so it isn't just noise.
  const cutAtIndex = new Map<number, CutInfo>();
  if (!q && sort.key === "rank" && sort.dir === 1 && results.started) {
    const firstUnlocked = results.cuts.find((c) => !c.locked);
    for (const cut of results.cuts) {
      if (!cut.locked && (cut !== firstUnlocked || cut.scoredCount / cut.eligibleCount < 0.5)) continue;
      const advancing = new Set(cut.advancerIds);
      const idx = ordered.findIndex((r) => !r.skipped && !advancing.has(r.competitorId));
      if (idx > 0) cutAtIndex.set(idx, cut);
    }
  }

  return (
    <div className="card rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle">
              <SortableTh label="Rank" sortKey="rank" sort={sort} onSort={toggleSort} />
              <SortableTh label="Competitor" sortKey="name" sort={sort} onSort={toggleSort} />
              {plan.rounds.map((_, i) => (
                <SortableTh
                  key={i}
                  label={`Rd ${i + 1}`}
                  sortKey={`r${i + 1}`}
                  align="center"
                  sub={roundLabel(division, i + 1)}
                  sort={sort}
                  onSort={toggleSort}
                />
              ))}
              <SortableTh label="Pts" sortKey="pts" align="center" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-3 text-center text-text-tertiary font-medium text-xs uppercase tracking-wider">Skip</th>
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 && (
              <tr>
                <td colSpan={plan.rounds.length + 4} className="px-4 py-6 text-center text-sm text-text-tertiary">
                  No competitors match “{search.trim()}”
                </td>
              </tr>
            )}
            {ordered.map((r, i) => {
              const c = byId.get(r.competitorId)!;
              const cutHere = cutAtIndex.get(i);
              return (
                <Fragment key={r.competitorId}>
                  {cutHere && <CutLineRow cut={cutHere} colSpan={plan.rounds.length + 4} />}
                  <ScoreGridRow
                    event={event}
                    competitor={c}
                    result={r}
                    plan={plan}
                    scores={scores}
                    color={division.color}
                    editing={editing?.competitorId === r.competitorId ? editing.round : null}
                    onEdit={(round) => setEditing(round === null ? null : { competitorId: r.competitorId, round })}
                  />
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The cut line: dashed amber while projected, solid green once locked. */
function CutLineRow({ cut, colSpan }: { cut: CutInfo; colSpan: number }) {
  const tieExtra = cut.advancerIds.length - cut.target;
  const ties = tieExtra > 0 ? ` (+${tieExtra} on ties)` : "";
  const label = cut.locked
    ? `Cut after Rd ${cut.afterRound} — top ${cut.target}${ties} advanced`
    : `Projected cut — top ${cut.target}${ties} advance · ${cut.scoredCount}/${cut.eligibleCount} scored`;
  const tone = cut.locked
    ? { text: "text-emerald-400/90", line: "border-emerald-500/40" }
    : { text: "text-amber-400", line: "border-dashed border-amber-500/50" };
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-1">
        <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider ${tone.text}`}>
          <span className={`flex-1 border-t ${tone.line}`} />
          <Scissors size={11} className="shrink-0" />
          <span className="whitespace-nowrap">{label}</span>
          <span className={`flex-1 border-t ${tone.line}`} />
        </div>
      </td>
    </tr>
  );
}

function ScoreGridRow({
  event,
  competitor: c,
  result: r,
  plan,
  scores,
  color,
  editing,
  onEdit,
}: {
  event: EventConfig;
  competitor: Competitor;
  result: EventResults["results"][number];
  plan: NonNullable<EventConfig["divisions"][DivisionId]>;
  scores: AttemptScore[];
  color: string;
  editing: number | null;
  onEdit: (round: number | null) => void;
}) {
  const update = useUpdateCompetitor();
  return (
    <>
      <tr className={`border-b border-border-subtle/40 hover:bg-surface-overlay/30 ${r.skipped ? "opacity-40" : ""}`}>
        <td className="px-3 py-2 font-mono text-xs text-text-secondary">{r.rank ?? "—"}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          <span className="bib-badge text-[10px] mr-2" style={{ backgroundColor: color }}>{c.bibNumber}</span>
          <span className="font-medium text-text-primary">{c.firstName} {c.lastName}</span>
          {r.isFinalist && <span className="ml-2 text-[9px] uppercase tracking-wider text-amber-400">finalist</span>}
        </td>
        {plan.rounds.map((_, i) => {
          const round = i + 1;
          const eligible = round <= r.eligibleThrough;
          const v = r.roundScores[i];
          return (
            <td key={i} className="px-2 py-1 text-center">
              <button
                onClick={() => onEdit(editing === round ? null : round)}
                disabled={r.skipped}
                className={`min-w-[3.5rem] px-2 py-1 rounded-md font-mono text-xs transition-all ${
                  editing === round
                    ? "bg-ledge-red/20 text-text-primary border border-ledge-red"
                    : v !== null
                      ? "bg-surface-overlay text-text-primary hover:border-border-default border border-transparent"
                      : eligible
                        ? "text-text-tertiary hover:bg-surface-overlay border border-dashed border-border-default"
                        : "text-text-tertiary/40 cursor-default border border-transparent"
                }`}
              >
                {v !== null ? `${v}` : eligible ? "+" : "·"}
              </button>
            </td>
          );
        })}
        <td className="px-3 py-2 text-center font-mono text-xs font-semibold text-text-primary">{r.points ?? "—"}</td>
        <td className="px-3 py-2 text-center">
          <button
            onClick={() =>
              update.mutate({
                id: c.id,
                patch: {
                  eventSkips: r.skipped
                    ? c.eventSkips.filter((e) => e !== event.id)
                    : [...c.eventSkips, event.id],
                },
              })
            }
            className={`p-1 rounded transition-colors ${r.skipped ? "text-amber-400" : "text-text-tertiary hover:text-text-secondary"}`}
            title={r.skipped ? "Un-skip" : "Mark skipped (field+1)"}
          >
            <Ban size={13} />
          </button>
        </td>
      </tr>
      {editing !== null && (
        <tr className="bg-surface-overlay/40">
          <td colSpan={plan.rounds.length + 4} className="px-4 py-3">
            {/* Keyed by round: draft state must never survive switching
                between rounds and land in the wrong one */}
            <RoundEditor
              key={`${c.id}:r${editing}`}
              event={event}
              competitorId={c.id}
              round={editing}
              plan={plan.rounds[editing - 1]}
              scores={scores}
              onDone={() => onEdit(null)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function RoundEditor({
  event,
  competitorId,
  round,
  plan,
  scores,
  onDone,
}: {
  event: EventConfig;
  competitorId: string;
  round: number;
  plan: { attempts: number; attemptLabel: string; maxPerAttempt?: number };
  scores: AttemptScore[];
  onDone: () => void;
}) {
  const save = useSaveRoundAttempts();
  const remove = useDeleteRoundAttempts();
  const existing = scores.filter(
    (s) => s.competitorId === competitorId && s.eventId === event.id && s.round === round
  );
  // Snapshot the seed: only attempts this editor SAW and cleared are removed
  // on save — a field scorer's write after the editor opened is never deleted
  const [seededFrom] = useState(existing);
  const [values, setValues] = useState<string[]>(() =>
    Array.from({ length: plan.attempts }, (_, i) => {
      const a = existing.find((s) => s.attempt === i + 1);
      if (a === undefined) return "";
      return a.declined ? "pass" : String(a.value);
    })
  );
  const [penalties, setPenalties] = useState<number[]>(() =>
    Array.from({ length: plan.attempts }, (_, i) => existing.find((s) => s.attempt === i + 1)?.penalty ?? 0)
  );

  const filled = values.filter((v) => v !== "");
  const parsed = filled.filter((v) => v !== "pass").map(Number);
  // Partial rounds are legal (set 1 recorded before set 2 is thrown)
  const complete = filled.length > 0 && !parsed.some(Number.isNaN);
  const overMax = plan.maxPerAttempt !== undefined && parsed.some((v) => v > plan.maxPerAttempt!);
  // Restricted-value events (caber clock scoring) must hold in the
  // correction path too, not just the scorer's clock-face UI
  const invalidValue =
    event.allowedValues !== undefined &&
    values.some((v) => v !== "" && v !== "pass" && !event.allowedValues!.includes(Number(v)));

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <span className="text-xs text-text-tertiary self-center">{plan.attemptLabel}:</span>
      {values.map((v, i) => (
        <label key={i} className="flex flex-col gap-1">
          <span className="text-[10px] text-text-tertiary uppercase">Attempt {i + 1} ({event.unit})</span>
          {event.allowedValues ? (
            <select
              value={v}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
              className="input w-24 py-1.5 text-sm font-mono"
            >
              <option value="">—</option>
              {event.allowedValues.map((av) => (
                <option key={av} value={av}>{av}</option>
              ))}
              <option value="pass">Pass</option>
            </select>
          ) : (
            <input
              type="number"
              step={event.decimals > 0 ? "0.1" : "1"}
              min={0}
              max={plan.maxPerAttempt}
              value={v}
              onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
              className="input w-24 py-1.5 text-sm font-mono"
            />
          )}
        </label>
      ))}
      {event.penaltySeconds !== undefined &&
        penalties.map((p, i) => (
          <label key={`p${i}`} className="flex flex-col gap-1">
            <span className="text-[10px] text-text-tertiary uppercase">Penalty {i + 1} (s)</span>
            <input
              type="number"
              step={event.penaltySeconds}
              min={0}
              value={p}
              onChange={(e) => setPenalties((ps) => ps.map((x, j) => (j === i ? Number(e.target.value) : x)))}
              className="input w-20 py-1.5 text-sm font-mono"
            />
          </label>
        ))}
      {overMax && <span className="text-xs text-red-400 self-center">max {plan.maxPerAttempt} {event.unit}</span>}
      {invalidValue && (
        <span className="text-xs text-red-400 self-center">
          allowed: {event.allowedValues!.join(" / ")}
        </span>
      )}
      <div className="flex gap-2 ml-auto">
        {existing.length > 0 && (
          <button
            onClick={() => remove.mutate({ competitorId, eventId: event.id, round }, { onSuccess: onDone })}
            className="btn-ghost text-xs text-red-400/80 hover:text-red-400"
          >
            Delete round
          </button>
        )}
        <button onClick={onDone} className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1">
          <X size={12} /> Cancel
        </button>
        <button
          disabled={!complete || overMax || invalidValue}
          onClick={() =>
            save.mutate(
              {
                attempts: values
                  .map((v, i) => ({ v, i }))
                  .filter(({ v }) => v !== "")
                  .map(({ v, i }) => ({
                    id: `${competitorId}:${event.id}:r${round}:a${i + 1}`,
                    competitorId,
                    eventId: event.id,
                    round,
                    attempt: i + 1,
                    value: v === "pass" ? 0 : Number(v),
                    penalty: penalties[i],
                    declined: v === "pass" ? true : undefined,
                  })),
                removeIds: seededFrom
                  .filter((s) => values[s.attempt - 1] === "")
                  .map((s) => s.id),
              },
              { onSuccess: onDone }
            )
          }
          className="btn-primary text-xs py-1.5 px-4"
        >
          Save
        </button>
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
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Saved</span>
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
  children,
}: {
  label: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
        <ChevronDown size={16} className={`text-text-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-6 pb-5 pt-1 border-t border-border-subtle">{children}</div>}
    </div>
  );
}

function SettingsTab() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const resetDemo = useResetDemoData();
  const qc = useQueryClient();
  const [pin, setPin] = useState<string | null>(null);
  const { data: competitors } = useCompetitors();
  const [confirmData, setConfirmData] = useState<"demo" | "2025" | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<{ name: string; raw: string; seasons: string[] } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  function dataAction(kind: "demo" | "2025", run: () => void) {
    if (confirmData !== kind) {
      setConfirmData(kind);
      setTimeout(() => setConfirmData(null), 4000);
      return;
    }
    setConfirmData(null);
    run();
  }

  async function downloadBackup(label = "backup") {
    const json = await db.exportBackup();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const stamp = `${d.toISOString().slice(0, 10)}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    a.href = url;
    a.download = `ledge-games-${label}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function pickRestoreFile(file: File) {
    setRestoreError(null);
    setRestoreFile(null);
    const raw = await file.text();
    try {
      const parsed = JSON.parse(raw) as { competitions?: { settings?: { competitionName?: string; year?: number }; competitors?: unknown[] }[] };
      if (!Array.isArray(parsed.competitions) || parsed.competitions.length === 0) {
        throw new Error("No competitions found — is this a Ledge Games backup file?");
      }
      const seasons = parsed.competitions.map(
        (c) => `${c.settings?.competitionName ?? "?"} ${c.settings?.year ?? "?"} (${c.competitors?.length ?? 0} competitors)`
      );
      setRestoreFile({ name: file.name, raw, seasons });
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : String(e));
    }
  }

  async function applyRestore() {
    if (!restoreFile) return;
    try {
      // Safety net: snapshot EVERYTHING to a download before replacing it,
      // so a bad backup file or a mid-restore failure is always recoverable
      await downloadBackup("pre-restore");
      await db.importBackup(restoreFile.raw);
      qc.invalidateQueries();
      setRestoreFile(null);
    } catch (e) {
      setRestoreError(e instanceof Error ? e.message : String(e));
      setRestoreFile(null);
    }
  }

  if (!settings) return null;
  const pinValue = pin ?? settings.scorerPin;

  return (
    <div className="space-y-4 max-w-4xl">
      <SeasonsSection />

      <SettingsField
        label="Scorer PIN"
        description="Scorers enter this PIN on event day to access the scoring interface."
        icon={<KeyRound size={16} className="text-text-tertiary" />}
        onSave={() => saveSettings.mutate({ scorerPin: pinValue })}
      >
        <input
          type="text"
          value={pinValue}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="input w-48 font-mono text-xl tracking-[0.3em] text-center"
        />
      </SettingsField>

      <SettingsSection label="Events" icon={<Calendar size={16} />} count={events.length}>
        <div className="space-y-2 mt-3">
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-overlay/50 border border-border-subtle">
              <div className="w-8 h-8 rounded-lg bg-surface border border-border-subtle flex items-center justify-center shrink-0">
                <EventIcon eventId={event.id} size={16} className="text-text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-text-primary">{event.name}</div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-surface border border-border-subtle">
                    {event.format === "ladder" ? "height ladder" : `${event.unit} · ${event.direction === "asc" ? "lower wins" : "higher wins"}`}
                  </span>
                  {divisions.filter((d) => event.divisions[d.id]).map((d) => (
                    <span key={d.id} className="text-[10px]" style={{ color: d.color }}>
                      {d.name}{event.format !== "ladder" && ` ${event.divisions[d.id]!.rounds.length} rds`}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-text-tertiary">rules-locked</span>
            </div>
          ))}
          <p className="text-[11px] text-text-tertiary pt-1">
            Event formats, rounds, and cuts implement the official rules (docs/RULES.md) and are
            deliberately not editable here — change the rules doc and config together.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection label="Divisions" icon={<Layers size={16} />} count={divisions.length}>
        <div className="space-y-2 mt-3">
          {divisions.map((div) => {
            const count = competitors?.filter((c) => c.divisionId === div.id).length ?? 0;
            const isMentors = div.id === "mentors";
            const enabled = !isMentors || settings.mentorsEnabled;
            return (
              <div
                key={div.id}
                className={`flex items-center gap-3 p-3 rounded-lg bg-surface-overlay/50 border border-border-subtle ${enabled ? "" : "opacity-60"}`}
              >
                <div className="w-3 h-8 rounded-full shrink-0" style={{ backgroundColor: div.color }} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-text-primary">
                    {div.name}
                    {!enabled && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">not running this year</span>}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    {count} competitors · {div.rounds} rounds ·{" "}
                    {Object.entries(div.cutsAfterRound).map(([r, cut]) => `R${r}→${cut === "half" ? "½" : `top ${cut}`}`).join(" · ") || "no cuts"}
                  </div>
                </div>
                {isMentors && (
                  <button
                    onClick={() => saveSettings.mutate({ mentorsEnabled: !settings.mentorsEnabled })}
                    role="switch"
                    aria-checked={settings.mentorsEnabled}
                    aria-label="Mentors division enabled"
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                      settings.mentorsEnabled ? "bg-emerald-500" : "bg-surface-overlay border border-border-strong"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                        settings.mentorsEnabled ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-text-tertiary pt-1">
            Mentors runs only in years with enough sign-ups. Turning it off hides the division
            from the scoreboard, scoring, and standings — roster data is kept and nothing is deleted.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection label="Data" icon={<Database size={16} />}>
        <div className="space-y-3 mt-3">
          {/* Backup — everything lives in this browser until Supabase; a
              downloaded file is the only off-device copy */}
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-border-subtle">
            <div>
              <div className="font-medium text-sm text-text-primary">Download backup</div>
              <p className="text-xs text-text-secondary">
                Every season, roster, and score as one JSON file. Do this often — all data lives
                in this browser until the cloud backend exists.
              </p>
            </div>
            <button onClick={() => downloadBackup()} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 shrink-0">
              <Download size={13} /> Download
            </button>
          </div>
          <div className="pb-3 border-b border-border-subtle">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium text-sm text-text-primary">Restore from backup</div>
                <p className="text-xs text-text-secondary">Replaces ALL current data with the backup file's contents.</p>
              </div>
              <button
                onClick={() => restoreInputRef.current?.click()}
                className="btn-secondary text-xs py-1.5 inline-flex items-center gap-1.5 shrink-0"
              >
                <Upload size={13} /> Choose file
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickRestoreFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            {restoreError && <p className="text-xs text-red-400 mt-2">{restoreError}</p>}
            {restoreFile && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-400 font-medium mb-1.5">
                  {restoreFile.name} contains {restoreFile.seasons.length} season{restoreFile.seasons.length !== 1 ? "s" : ""}:
                </p>
                <ul className="text-xs text-text-secondary mb-2.5 space-y-0.5">
                  {restoreFile.seasons.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button onClick={applyRestore} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500 text-white">
                    Replace everything with this backup
                  </button>
                  <button onClick={() => setRestoreFile(null)} className="btn-secondary text-xs py-1.5 px-3">
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] text-text-tertiary mt-2">
                  A snapshot of the current data downloads first, so this is always undoable.
                </p>
              </div>
            )}
          </div>
          <p className="text-xs text-amber-400/90">
            Both tools OVERWRITE the currently active season's data in place. To browse last
            year, use Seasons → Make Active instead.
          </p>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-sm text-text-primary">Reload 2025 season</div>
              <p className="text-xs text-text-secondary">Real roster + full scoring from last year's sheets. Overwrites the active season.</p>
            </div>
            <button
              onClick={() =>
                dataAction("2025", async () => {
                  await db.loadSeason2025();
                  qc.invalidateQueries();
                })
              }
              className={`text-xs py-1.5 px-3 rounded-lg inline-flex items-center gap-1.5 shrink-0 transition-all ${
                confirmData === "2025" ? "bg-red-500 text-white" : "btn-secondary"
              }`}
            >
              <Upload size={13} /> {confirmData === "2025" ? "Really overwrite active season?" : "Load 2025"}
            </button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-medium text-sm text-text-primary">Reset to demo data</div>
              <p className="text-xs text-text-secondary">Synthetic mid-competition dataset for testing. Overwrites the active season.</p>
            </div>
            <button
              onClick={() => dataAction("demo", () => resetDemo.mutate())}
              className={`text-xs py-1.5 px-3 rounded-lg inline-flex items-center gap-1.5 shrink-0 transition-all ${
                confirmData === "demo" ? "bg-red-500 text-white" : "btn-secondary"
              }`}
            >
              <RotateCcw size={13} /> {confirmData === "demo" ? "Really overwrite active season?" : "Reset demo"}
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

// ─── Seasons ──────────────────────────────────────────────

function SeasonsSection() {
  const { data: competitions, error } = useCompetitions();
  const create = useCreateCompetition();
  const activate = useActivateCompetition();
  const rename = useRenameCompetition();
  const remove = useDeleteCompetition();
  const [showNew, setShowNew] = useState(false);
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [newName, setNewName] = useState("The Ledge Games");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  function commitRename(id: string) {
    const name = renameDraft.trim();
    if (name) rename.mutate({ id, name });
    setRenamingId(null);
  }

  // Never vanish silently — a failed seasons query must be visible
  if (error) {
    return (
      <div className="card rounded-xl p-6 text-sm text-red-400">
        Couldn't load seasons: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }
  if (!competitions) return null;
  const yearNum = Number(newYear);
  const canCreate = newName.trim() !== "" && Number.isInteger(yearNum) && yearNum >= 2000;

  return (
    <div className="card rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Trophy size={16} className="text-text-tertiary" />
            Seasons
          </h3>
          <p className="text-sm text-text-secondary mt-0.5">
            One competition runs at a time. Starting a new season archives the current one —
            past seasons stay browsable by making them active.
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="btn-primary text-xs py-2 px-4 shrink-0"
        >
          Start New Season
        </button>
      </div>

      {showNew && (
        <div className="flex items-end gap-3 p-4 rounded-lg bg-surface-overlay/50 border border-border-subtle">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Year</span>
            <input
              type="number"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              className="input w-24 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Name</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="input py-1.5 text-sm" />
          </label>
          <button
            disabled={!canCreate || create.isPending}
            onClick={() =>
              create.mutate(
                { name: newName.trim(), year: yearNum },
                { onSuccess: () => setShowNew(false) }
              )
            }
            className="btn-primary text-xs py-2 px-4"
          >
            Create &amp; Activate
          </button>
        </div>
      )}

      <div className="space-y-2">
        {competitions.map((c) => (
          <div
            key={c.id}
            className={`flex items-center gap-3 p-3 rounded-lg border ${
              c.isActive ? "bg-surface-overlay/70 border-border-default" : "bg-surface-overlay/30 border-border-subtle"
            }`}
          >
            <div className="flex-1 min-w-0">
              {renamingId === c.id ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(c.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="input py-1 text-sm max-w-xs"
                  />
                  <span className="text-sm text-text-tertiary">{c.year}</span>
                  <button onClick={() => commitRename(c.id)} disabled={!renameDraft.trim()} className="btn-primary text-xs py-1 px-3">
                    Save
                  </button>
                  <button onClick={() => setRenamingId(null)} className="btn-ghost text-xs py-1 px-2">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="font-medium text-sm text-text-primary flex items-center gap-2">
                  {c.name} {c.year}
                  <button
                    onClick={() => {
                      setRenamingId(c.id);
                      setRenameDraft(c.name);
                    }}
                    className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
                    title={`Rename ${c.name} ${c.year}`}
                  >
                    <Pencil size={12} />
                  </button>
                  {c.isActive && <span className="badge badge-success text-[10px]">viewing</span>}
                  <span className={`text-[10px] uppercase tracking-wider ${c.status === "active" ? "text-emerald-400" : "text-text-tertiary"}`}>
                    {c.status}
                  </span>
                </div>
              )}
              <div className="text-[10px] text-text-tertiary mt-0.5">{c.competitorCount} competitors</div>
            </div>
            {!c.isActive && (
              <button onClick={() => activate.mutate(c.id)} className="btn-secondary text-xs py-1.5 px-3">
                Make Active
              </button>
            )}
            {/* An active season can't be deleted — neither the one being
                viewed nor a live (non-archived) competition */}
            {!c.isActive && c.status !== "active" && competitions.length > 1 && (
              <button
                onClick={() => {
                  if (confirmDeleteId !== c.id) {
                    setConfirmDeleteId(c.id);
                    setTimeout(() => setConfirmDeleteId(null), 3000);
                    return;
                  }
                  remove.mutate(c.id, { onSuccess: () => setConfirmDeleteId(null) });
                }}
                className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                  confirmDeleteId === c.id
                    ? "bg-red-500 text-white"
                    : "text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                }`}
              >
                {confirmDeleteId === c.id ? "Really delete?" : "Delete"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mission Control ──────────────────────────────────────

function MissionControlTab() {
  const { data: competitors } = useCompetitors();
  const { data: scores } = useScores();
  const { data: kegAttempts } = useKegAttempts();
  const { data: settings } = useSettings();
  const { data: activeComp } = useActiveCompetition();
  const saveSettings = useSaveSettings();
  const activeDivisions = useActiveDivisions();
  // An archived season is a final record, not a live operation: nothing is
  // "owed", nothing advances, nothing stalls — those sections switch off
  const isLive = activeComp?.status === "active";
  const mens = useDivisionScoring("mens");
  const womens = useDivisionScoring("womens");
  const mentors = useDivisionScoring("mentors");
  const byDiv = { mens, womens, mentors } as const;

  const [chaseDiv, setChaseDiv] = useState<DivisionId | null>(null);
  const [chaseEvent, setChaseEvent] = useState<EventId | null>(null);
  // The stall clock compares against wall time: without a ticking re-render,
  // "last score 1m ago" would freeze exactly when scoring stops
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!competitors || !scores || !kegAttempts || !mens.data || !womens.data || !mentors.data) return null;

  // A filter pointing at a division that was toggled off must not silently
  // hide everything
  const effectiveChaseDiv = activeDivisions.some((d) => d.id === chaseDiv) ? chaseDiv : null;

  const allResults = activeDivisions.flatMap((d) =>
    [...byDiv[d.id].data!.eventResults.values()].map((res) => ({ division: d, res }))
  );
  const started = allResults.filter(({ res }) => res.started);

  // ── Who are we waiting on right now, across every live event ──
  const chase = new Map<
    string,
    { competitor: Competitor; division: (typeof divisions)[number]; items: { eventId: EventId; eventName: string; label: string; fraction: number }[] }
  >();
  for (const d of activeDivisions) {
    const data = byDiv[d.id].data!;
    const byId = new Map(data.field.map((c) => [c.id, c]));
    for (const [eventId, res] of data.eventResults) {
      const p = pendingScorers(res);
      if (!p) continue;
      const eventName = events.find((e) => e.id === eventId)!.name;
      for (const id of p.competitorIds) {
        const c = byId.get(id);
        if (!c) continue;
        if (!chase.has(id)) chase.set(id, { competitor: c, division: d, items: [] });
        chase.get(id)!.items.push({ eventId, eventName, label: p.label, fraction: p.roundFraction });
      }
    }
  }
  const chaseRows = [...chase.values()].sort((a, b) => {
    const fa = Math.max(...a.items.map((i) => i.fraction));
    const fb = Math.max(...b.items.map((i) => i.fraction));
    return fb - fa || b.items.length - a.items.length || a.competitor.bibNumber - b.competitor.bibNumber;
  });
  // Focus filters: pare the list down to one event and/or division
  const chaseView = chaseRows
    .filter((r) => !effectiveChaseDiv || r.division.id === effectiveChaseDiv)
    .map((r) => ({ ...r, items: r.items.filter((i) => !chaseEvent || i.eventId === chaseEvent) }))
    .filter((r) => r.items.length > 0);

  // ── Ready to move on: locked cuts waiting to be announced ──
  const readiness = activeDivisions.flatMap((d) => {
    const data = byDiv[d.id].data!;
    const byId = new Map(data.field.map((c) => [c.id, c]));
    return [...data.eventResults.entries()]
      .map(([eventId, res]) => {
        const r = roundReadiness(res);
        if (!r) return null;
        return {
          division: d,
          event: events.find((e) => e.id === eventId)!,
          r,
          hasCuts: res.hasCuts,
          advancers: r.advancerIds.map((id) => byId.get(id)!).filter(Boolean),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  });

  // ── Title ties: unresolved need the arrow-off; resolved show the champion ──
  const titleTies = activeDivisions
    .map((d) => {
      const data = byDiv[d.id].data!;
      const byId = new Map(data.field.map((c) => [c.id, c]));
      const tied = data.standings.filter((s) => s.tiebreakRequired);
      const winner = data.standings.find((s) => s.wonTiebreak);
      if (tied.length === 0 && !winner) return null;
      return {
        division: d,
        tied: tied.map((s) => byId.get(s.competitorId)!),
        winner: winner ? byId.get(winner.competitorId)! : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  function recordArrowOff(divisionId: DivisionId, competitorId: string | null) {
    const next = { ...(settings?.titleTiebreakWinners ?? {}) };
    if (competitorId === null) delete next[divisionId];
    else next[divisionId] = competitorId;
    saveSettings.mutate({ titleTiebreakWinners: next });
  }

  // ── Pace: each event's whole-event completion vs the median live event ──
  const lastActivity = new Map<EventId, number>();
  for (const s of scores) {
    if (s.recordedAt) lastActivity.set(s.eventId, Math.max(lastActivity.get(s.eventId) ?? 0, s.recordedAt));
  }
  for (const a of kegAttempts) {
    if (a.recordedAt) lastActivity.set("keg", Math.max(lastActivity.get("keg") ?? 0, a.recordedAt));
  }
  const eventPcts = new Map<EventId, { pct: number; started: boolean; complete: boolean }>();
  for (const event of events) {
    const divs = activeDivisions.filter((d) => event.divisions[d.id]);
    if (divs.length === 0) continue;
    const ps = divs.map((d) => eventProgress(byDiv[d.id].data!.eventResults.get(event.id)!));
    eventPcts.set(event.id, {
      pct: Math.round(ps.reduce((s, p) => s + p.pct, 0) / ps.length),
      started: ps.some((p) => p.started),
      complete: ps.every((p) => p.complete),
    });
  }
  const livePcts = [...eventPcts.values()].filter((e) => e.started && !e.complete).map((e) => e.pct).sort((a, b) => a - b);
  // True median (average the middle pair when even) — with 2 live events the
  // upper-middle shortcut would compare everything against the leader
  const median =
    livePcts.length === 0
      ? 0
      : livePcts.length % 2 === 1
        ? livePcts[(livePcts.length - 1) / 2]
        : (livePcts[livePcts.length / 2 - 1] + livePcts[livePcts.length / 2]) / 2;
  const paceFor = (eventId: EventId): Pace => {
    const e = eventPcts.get(eventId);
    if (!e || !e.started) return "not-started";
    if (e.complete) return "done";
    if (livePcts.length < 2) return "on-pace"; // nothing to compare against
    if (e.pct - median >= 12) return "ahead";
    if (e.pct - median <= -12) return "behind";
    return "on-pace";
  };

  return (
    <div className="space-y-6">
      {!isLive && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
          <Clock size={16} className="shrink-0" />
          Archived season — this is the final record. Unscored rounds are permanent gaps in
          the data (a competitor who never threw), not scores waiting to be chased.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Events Underway"
          value={`${new Set(started.map(({ res }) => res.eventId)).size} / ${events.length}`}
          detail={`${started.length} of ${allResults.length} event-division pairs started`}
          icon={<Zap size={16} />}
          accent="#cc1a1a"
        />
        {isLive ? (
          <StatCard
            label="Waiting On"
            value={String(chaseRows.length)}
            detail="competitors owe a score right now"
            icon={<Megaphone size={16} />}
            accent="#D97706"
          />
        ) : (
          <StatCard
            label="Record Gaps"
            value={String(chaseRows.length)}
            detail="competitors with unscored rounds (final)"
            icon={<Megaphone size={16} />}
            accent="#55556a"
          />
        )}
        {isLive && (
          <StatCard
            label="Ready to Advance"
            value={String(readiness.length)}
            detail={readiness.some((r) => r.r.isFinals) ? "includes a finals cut" : "locked cuts to announce"}
            icon={<Flag size={16} />}
            accent="#059848"
          />
        )}
        <StatCard
          label="Checked In"
          value={String(competitors.filter((c) => c.checkedIn).length)}
          detail={`of ${competitors.length} registered`}
          icon={<CheckCircle2 size={16} />}
          accent="#0A4366"
        />
      </div>

      {titleTies.map(({ division: d, tied, winner }) =>
        winner ? (
          <div
            key={d.id}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm"
          >
            <Trophy size={16} className="shrink-0 text-emerald-400" />
            <span className="text-emerald-400 flex-1">
              <span style={{ color: d.color }} className="font-semibold">{d.name}</span> title decided by
              arrow-off: <span className="font-semibold">{winner.firstName} {winner.lastName}</span> (bib {winner.bibNumber})
            </span>
            <button
              onClick={() => recordArrowOff(d.id, null)}
              className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
            >
              undo
            </button>
          </div>
        ) : (
          <div
            key={d.id}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
          >
            <div className="flex items-center gap-2 text-amber-400 mb-2">
              <Swords size={16} className="shrink-0" />
              <span>
                <span style={{ color: d.color }} className="font-semibold">{d.name}</span> title is tied —
                run the arrow-off (1 arrow each, closest to bullseye), then record the winner:
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {tied.map((c) => (
                <button
                  key={c.id}
                  onClick={() => recordArrowOff(d.id, c.id)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  <Trophy size={12} />
                  <span className="font-mono font-bold">{c.bibNumber}</span>
                  {c.firstName} {c.lastName} won
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {isLive && readiness.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Ready to Move On
          </h3>
          <div className="space-y-2">
            {readiness.map(({ division: d, event, r, hasCuts, advancers }) => (
              <div
                key={`${event.id}-${d.id}`}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                  r.isFinals ? "border-emerald-500/40 bg-emerald-500/10" : "border-border-default bg-surface-raised"
                }`}
              >
                <EventIcon eventId={event.id} size={16} className={r.isFinals ? "text-emerald-400" : "text-text-secondary"} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-text-primary">
                    {event.name} · <span style={{ color: d.color }}>{d.name}</span> — Rd {r.completedRound} complete,{" "}
                    {r.isFinals ? (
                      <span className="text-emerald-400 font-semibold">READY FOR FINALS</span>
                    ) : (
                      <>ready for Rd {r.nextRound} ({roundLabel(d, r.nextRound)})</>
                    )}
                  </span>
                  {/* Advancer chips only make sense where a cut happened —
                      no-cut divisions carry the whole field forward */}
                  {hasCuts && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(r.isFinals ? advancers : advancers.slice(0, 12)).map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-white font-medium"
                          style={{ backgroundColor: d.color }}
                        >
                          <span className="font-mono font-bold">{c.bibNumber}</span>
                          {c.firstName} {c.lastName}
                        </span>
                      ))}
                      {!r.isFinals && advancers.length > 12 && (
                        <span className="text-[10px] text-text-tertiary self-center">
                          +{advancers.length - 12} more advance
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLive && chaseRows.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Needs to Score <span className="text-text-tertiary normal-case">— most blocking first</span>
          </h3>
          <div className="flex items-center gap-4 flex-wrap mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mr-1">Division</span>
              <FilterPill active={!effectiveChaseDiv} onClick={() => setChaseDiv(null)}>All</FilterPill>
              {activeDivisions.map((d) => (
                <FilterPill
                  key={d.id}
                  active={effectiveChaseDiv === d.id}
                  activeColor={d.color}
                  onClick={() => setChaseDiv(effectiveChaseDiv === d.id ? null : d.id)}
                >
                  {d.name}
                </FilterPill>
              ))}
            </div>
            <div className="w-px h-5 bg-border-subtle" />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-text-tertiary uppercase tracking-wider font-medium mr-1">Event</span>
              <FilterPill active={!chaseEvent} onClick={() => setChaseEvent(null)}>All</FilterPill>
              {events.map((e) => (
                <FilterPill
                  key={e.id}
                  active={chaseEvent === e.id}
                  onClick={() => setChaseEvent(chaseEvent === e.id ? null : e.id)}
                >
                  {e.name}
                </FilterPill>
              ))}
            </div>
            {(effectiveChaseDiv || chaseEvent) && (
              <span className="text-xs text-text-tertiary">
                {chaseView.length} of {chaseRows.length} shown
              </span>
            )}
          </div>
          <div className="card rounded-xl divide-y divide-border-subtle/50 max-h-96 overflow-y-auto">
            {chaseView.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-emerald-400">
                Nobody owes a score here — this event/division is all caught up.
              </div>
            )}
            {chaseView.map(({ competitor: c, division: d, items }) => (
              <div key={c.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 flex-wrap">
                <span className="bib-badge text-[10px]" style={{ backgroundColor: d.color }}>{c.bibNumber}</span>
                <span className="font-medium text-sm text-text-primary w-28 sm:w-44 truncate">
                  {c.firstName} {c.lastName}
                </span>
                {/* A chased competitor who never checked in is usually a day
                    no-show nobody scratched yet — surface it so the director
                    marks them instead of chasing a ghost */}
                {!c.checkedIn && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400"
                    title="Not checked in — if they're a day no-show, mark No-show in Competitors to remove them from the field"
                  >
                    not checked in
                  </span>
                )}
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {items
                    .sort((a, b) => b.fraction - a.fraction)
                    .map((it) => (
                      <span
                        key={`${it.eventName}${it.label}`}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          it.fraction >= 0.8
                            ? "border-red-500/40 bg-red-500/10 text-red-400"
                            : it.fraction >= 0.5
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                              : "border-border-subtle bg-surface-overlay text-text-secondary"
                        }`}
                        title={`${Math.round(it.fraction * 100)}% of this round is already scored`}
                      >
                        {it.eventName} {it.label}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Event Status</h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventStatusCard
              key={event.id}
              event={event}
              byDiv={byDiv}
              pace={paceFor(event.id)}
              lastActivity={lastActivity.get(event.id)}
              now={now}
              live={isLive}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Division Leaders</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {activeDivisions.map((div) => {
            const data = byDiv[div.id].data!;
            const top3 = data.standings.slice(0, 3);
            const byId = new Map(data.field.map((c) => [c.id, c]));
            return (
              <div key={div.id} className="card rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: `${div.color}20` }}>
                  <span className="font-semibold text-sm text-text-primary">{div.name}</span>
                  <span className="text-xs text-text-tertiary font-mono">{data.standings.length}</span>
                </div>
                <div className="p-3 space-y-1.5">
                  {top3.map((s, i) => {
                    const c = byId.get(s.competitorId)!;
                    return (
                      <div key={s.competitorId} className="flex items-center gap-2.5 text-sm">
                        <span className="w-5 text-right font-mono text-text-tertiary text-xs">{s.rank}</span>
                        <span className="bib-badge text-[10px] py-0.5 px-1.5" style={{ backgroundColor: div.color, minWidth: "1.75rem" }}>
                          {c.bibNumber}
                        </span>
                        <span className={`flex-1 truncate ${i === 0 ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                          {c.firstName} {c.lastName}
                        </span>
                        <span className="font-mono text-xs text-text-tertiary">{s.total} pts</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Pace = "ahead" | "on-pace" | "behind" | "done" | "not-started";

function PaceChip({ pace }: { pace: Pace }) {
  if (pace === "done" || pace === "not-started") return null;
  const cfg = {
    ahead: { icon: <TrendingUp size={11} />, cls: "bg-emerald-500/15 text-emerald-400", label: "Ahead" },
    "on-pace": { icon: <Minus size={11} />, cls: "bg-surface-overlay text-text-secondary", label: "On pace" },
    behind: { icon: <TrendingDown size={11} />, cls: "bg-red-500/15 text-red-400", label: "Behind" },
  }[pace];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

const STALL_MINUTES = 20;

function EventStatusCard({
  event,
  byDiv,
  pace,
  lastActivity,
  now,
  live,
}: {
  event: EventConfig;
  byDiv: Record<DivisionId, ReturnType<typeof useDivisionScoring>>;
  pace: Pace;
  lastActivity?: number;
  /** Wall clock from the ticking parent — keeps this component pure. */
  now: number;
  /** Archived seasons suppress pace/stall — a final record can't be behind. */
  live: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeDivisions = useActiveDivisions();
  const eventDivs = activeDivisions.filter((d) => event.divisions[d.id]);

  const details = eventDivs.map((d) => {
    const data = byDiv[d.id].data!;
    const res = data.eventResults.get(event.id)!;
    const p = eventProgress(res);
    const owed = pendingScorers(res);
    const byId = new Map(data.field.map((c) => [c.id, c]));
    return {
      division: d,
      res,
      pct: p.pct,
      label: p.detail ? `${p.label} · ${p.detail}` : p.label,
      complete: p.complete,
      owedLabel: owed?.label,
      owed: owed ? owed.competitorIds.map((id) => byId.get(id)!).filter(Boolean) : [],
    };
  });

  const anyStarted = details.some(({ res }) => res.started);
  const allDone = details.every(({ complete }) => complete);
  const totalOwed = details.reduce((n, d) => n + d.owed.length, 0);
  const minsAgo = live && lastActivity ? Math.round((now - lastActivity) / 60_000) : null;
  const stalled = anyStarted && !allDone && minsAgo !== null && minsAgo >= STALL_MINUTES;

  return (
    <div className={`card rounded-xl p-4 space-y-3 ${stalled ? "!border-amber-500/50" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-overlay border border-border-subtle flex items-center justify-center">
            <EventIcon eventId={event.id} size={16} className="text-text-secondary" />
          </div>
          <div>
            <h4 className="font-semibold text-text-primary text-sm">{event.name}</h4>
            <p className={`text-xs ${stalled ? "text-amber-400" : "text-text-tertiary"}`}>
              {minsAgo === null
                ? eventDivs.map((d) => d.name).join(" · ")
                : stalled
                  ? `stalled — last score ${minsAgo}m ago`
                  : `last score ${minsAgo < 1 ? "<1" : minsAgo}m ago`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {live && <PaceChip pace={pace} />}
          <StatusBadge
            status={
              allDone && anyStarted
                ? "complete"
                : anyStarted
                  ? live
                    ? "in-progress"
                    : "incomplete" // archived: gaps are final, nothing is "live"
                  : "not-started"
            }
          />
        </div>
      </div>

      <div className="flex gap-2">
        {details.map(({ division: d, pct, label }) => (
          <div key={d.id} className="flex-1 text-center">
            <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">{d.name.slice(0, 3)}</div>
            <div className="h-1 rounded-full bg-surface-overlay overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.color }} />
            </div>
            <div className="text-[10px] text-text-tertiary mt-0.5 font-mono">{pct}%</div>
            <div className="text-[9px] text-text-tertiary mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {totalOwed > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between text-xs text-text-secondary hover:text-text-primary transition-colors pt-1"
          >
            <span className="font-medium">
              {live ? `waiting on ${totalOwed} right now` : `${totalOwed} unscored in the final record`}
            </span>
            <ChevronDown size={14} className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && (
            <div className="space-y-2 pt-1">
              {details.map(({ division: d, owed, owedLabel }) => {
                if (owed.length === 0) return null;
                return (
                  <div key={d.id}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: d.color }}>
                      {d.name} — needs {owedLabel} ({owed.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {owed.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-white font-medium"
                          style={{ backgroundColor: d.color }}
                        >
                          <span className="font-mono font-bold">{c.bibNumber}</span>
                          <span>{c.firstName} {c.lastName}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
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
      <div className="text-xl font-bold text-text-primary truncate">{value}</div>
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
  if (status === "incomplete") {
    // Archived season with gaps: neutral, no "live" pulse implied
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-overlay text-text-tertiary">
        <Minus size={10} /> Incomplete
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

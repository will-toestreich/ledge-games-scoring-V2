// Announcer (MC) view — a phone-first, read-only roster tuned for talking:
// bib, name with the nickname loud, hometown, live overall standing, and a
// line of announcer color (division leader, events they're leading, keg
// height, arrow-off drama). Un-PIN'd on purpose: everything here is
// public-announcement material by definition.

import { useMemo, useState } from "react";
import { Mic, Search } from "lucide-react";
import { divisionEvents } from "@/data/competition-config";
import { useActiveDivisions, useDivisionScoring, useSettings } from "@/data/hooks";
import type { DivisionId } from "@/lib/types";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function AnnouncerPage() {
  const { data: settings } = useSettings();
  const activeDivisions = useActiveDivisions();
  const [divisionId, setDivisionId] = useState<DivisionId>("mens");
  const division = activeDivisions.find((d) => d.id === divisionId) ?? activeDivisions[0];
  const [sort, setSort] = useState<"entry" | "standings">("entry");
  const [search, setSearch] = useState("");
  const { data } = useDivisionScoring(division.id);

  const rows = useMemo(() => {
    if (!data) return [];
    const events = divisionEvents(division.id);
    const anyStarted = [...data.eventResults.values()].some((r) => r.started);
    // Shared ranks announce as "T-3rd"
    const rankCounts = new Map<number, number>();
    for (const s of data.standings) rankCounts.set(s.rank, (rankCounts.get(s.rank) ?? 0) + 1);
    const byId = new Map(data.field.map((c) => [c.id, c]));

    return data.standings.map((s) => {
      const c = byId.get(s.competitorId)!;
      const hints: string[] = [];
      if (anyStarted && s.rank === 1) {
        hints.push(s.tiebreakRequired ? "tied for the division lead — arrow-off pending" : "division leader");
      }
      const leading = events
        .filter((e) => {
          const res = data.eventResults.get(e.id);
          const r = res?.started ? res.byCompetitor.get(c.id) : undefined;
          return r?.rank === 1 && r.participated;
        })
        .map((e) => e.name);
      if (leading.length > 0) hints.push(`leading ${leading.join(" & ")}`);
      const keg = data.eventResults.get("keg");
      const kegRes = keg?.started ? keg.byCompetitor.get(c.id) : undefined;
      if (kegRes?.participated && kegRes.cumulative > 0) {
        hints.push(`cleared ${kegRes.cumulative} ft in Keg Toss`);
      }
      return {
        c,
        s,
        anyStarted,
        tie: (rankCounts.get(s.rank) ?? 0) > 1,
        hints: hints.slice(0, 2),
        nickname: c.nickname?.replace(/^"+|"+$/g, "").trim() || null,
      };
    });
  }, [data, division.id]);

  const q = search.trim().toLowerCase();
  const shown = rows
    .filter(
      ({ c }) =>
        !q ||
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        (c.nickname ?? "").toLowerCase().includes(q) ||
        String(c.bibNumber).includes(q)
    )
    .sort((a, b) => (sort === "entry" ? a.c.bibNumber - b.c.bibNumber : 0)); // standings order is the natural order

  return (
    <div className="max-w-lg mx-auto px-4 py-8 animate-slide-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <Mic size={22} className="text-ledge-red-light" /> Announcer
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {settings ? `${settings.competitionName} · ${settings.year}` : ""} — live standings for the mic
        </p>
      </div>

      {/* Division pills */}
      <div className="flex gap-2 mb-4">
        {activeDivisions.map((div) => {
          const isActive = division.id === div.id;
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

      {/* Search + sort */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Name, nickname, or bib…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 py-2 text-sm"
          />
        </div>
        <div className="flex rounded-lg border border-border-subtle overflow-hidden shrink-0">
          {(
            [
              ["entry", "Entry list"],
              ["standings", "Standings"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                sort === key ? "bg-surface-overlay text-text-primary" : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* The list */}
      {!data ? (
        <p className="text-text-tertiary text-sm">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-text-tertiary text-sm">
          {rows.length === 0 ? "No competitors in this division yet." : `Nobody matches “${search.trim()}”.`}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map(({ c, s, anyStarted, tie, hints, nickname }) => (
            <div key={c.id} className="card rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="bib-badge text-sm shrink-0" style={{ backgroundColor: division.color }}>
                {c.bibNumber}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold text-text-primary leading-tight">
                  {c.firstName}
                  {nickname && <span className="text-amber-400 font-bold"> “{nickname}”</span>} {c.lastName}
                </div>
                {c.hometown && <div className="text-sm text-text-secondary mt-0.5">{c.hometown}</div>}
                {hints.length > 0 && (
                  <div className="text-xs text-amber-400/90 mt-1">{hints.join(" · ")}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold font-mono text-text-primary">
                  {anyStarted ? `${tie ? "T-" : ""}${ordinal(s.rank)}` : "—"}
                </div>
                {anyStarted && <div className="text-xs text-text-tertiary font-mono">{s.total} pts</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

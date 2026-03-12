import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Shield, Crosshair, Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { EventIcon } from "@/components/event-icons";
import {
  competition,
  divisions,
  events,
  competitors,
  getDivisionStandings,
  getEventScoringProgress,
  getDivisionRound,
  type Standing,
} from "@/data/mock";

function ScoreboardThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="text-text-tertiary hover:text-text-primary transition-colors"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
    </button>
  );
}

// ─── SVG Progress Ring ────────────────────────────────────

function ProgressRing({
  percent,
  size = 40,
  stroke = 3,
  color,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--color-border-subtle)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
      />
    </svg>
  );
}

// ─── Scoreboard page ──────────────────────────────────────

type View = "overview" | "mens" | "womens" | "mentors";

export function ScoreboardPage() {
  const [view, setView] = useState<View>("overview");

  const divisionData = divisions.map((div) => ({
    division: div,
    standings: getDivisionStandings(div.id),
    competitors: competitors.filter((c) => c.divisionId === div.id).length,
  }));

  return (
    <div className="h-screen flex flex-col bg-surface-base overflow-hidden">
      {/* ── View tabs + status ─────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 border-b border-border-subtle relative" style={{ padding: "clamp(4px, 0.4vh, 8px) clamp(12px, 1vw, 20px)" }}>
        <span className="font-semibold text-text-primary" style={{ fontSize: "clamp(10px, 0.6vw, 13px)", marginRight: "clamp(4px, 0.4vw, 8px)" }}>
          {competition.name} {competition.year}
        </span>
        <div className="h-3 w-px bg-border-subtle" style={{ marginRight: "clamp(2px, 0.2vw, 4px)" }} />
        <ViewTab label="Overview" active={view === "overview"} onClick={() => setView("overview")} />
        {divisions.map((div) => (
          <ViewTab
            key={div.id}
            label={div.name}
            color={div.color}
            active={view === div.slug as View}
            onClick={() => setView(div.slug as View)}
          />
        ))}

        {/* Centered logo — absolutely positioned to center on page */}
        <Link to="/" className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
          <img
            src="/brand/The-Ledge-Games-Logo-4.png"
            alt="The Ledge Games"
            style={{ height: "clamp(20px, 2.5vh, 32px)" }}
          />
        </Link>

        {/* Right side: nav links + live indicator */}
        <div className="ml-auto flex items-center" style={{ gap: "clamp(6px, 0.6vw, 12px)" }}>
          <Link to="/admin" className="text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center" style={{ gap: "clamp(2px, 0.2vw, 4px)", fontSize: "clamp(8px, 0.5vw, 10px)" }}>
            <Shield size={12} /> Admin
          </Link>
          <Link to="/score" className="text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center" style={{ gap: "clamp(2px, 0.2vw, 4px)", fontSize: "clamp(8px, 0.5vw, 10px)" }}>
            <Crosshair size={12} /> Scoring
          </Link>
          <ScoreboardThemeToggle />
          <div className="h-3 w-px bg-border-subtle" />
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-medium text-emerald-400 uppercase tracking-wider" style={{ fontSize: "clamp(8px, 0.5vw, 10px)" }}>Live</span>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === "overview" ? (
          <OverviewDashboard divisionData={divisionData} />
        ) : (
          <DivisionDetail
            division={divisionData.find((d) => d.division.slug === view)!}
          />
        )}
      </div>
    </div>
  );
}

// ─── Status bar metric ────────────────────────────────────

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] text-text-tertiary uppercase tracking-wider leading-none mb-0.5">{label}</div>
      <div className={`text-sm font-mono font-semibold leading-none ${accent ? "text-emerald-400" : "text-text-primary"}`}>
        {value}
      </div>
    </div>
  );
}

// ─── View tab ─────────────────────────────────────────────

function ViewTab({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`font-medium rounded-md transition-all duration-150 ${
        active
          ? "text-text-primary bg-surface-overlay border border-border-default"
          : "text-text-tertiary hover:text-text-secondary hover:bg-surface-raised"
      }`}
      style={{ fontSize: "clamp(10px, 0.6vw, 12px)", padding: "clamp(4px, 0.3vh, 6px) clamp(8px, 0.7vw, 14px)" }}
    >
      {color && (
        <span
          className="inline-block rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: color, width: "clamp(6px, 0.4vw, 8px)", height: "clamp(6px, 0.4vw, 8px)" }}
        />
      )}
      {label}
    </button>
  );
}

// ─── Auto-scroll hook ────────────────────────────────────

/** Continuously scrolls down, pauses at bottom, snaps back to top, and repeats */
function useAutoScroll(speed = 0.5, pauseMs = 3000) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let pauseUntil = Date.now() + pauseMs;
    let waitingToReset = false;
    let accumulated = 0;

    function tick() {
      const el = ref.current;
      if (!el) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const now = Date.now();
      if (now < pauseUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      // Accumulate sub-pixel amounts since scrollTop rounds to integers
      accumulated += speed;
      if (accumulated >= 1) {
        const px = Math.floor(accumulated);
        el.scrollTop += px;
        accumulated -= px;
      }

      // Hit bottom — pause then reset to top
      if (el.scrollTop >= maxScroll && !waitingToReset) {
        el.scrollTop = maxScroll;
        waitingToReset = true;
        pauseUntil = now + pauseMs;
        setTimeout(() => {
          if (ref.current) {
            ref.current.scrollTop = 0;
          }
          accumulated = 0;
          waitingToReset = false;
          pauseUntil = Date.now() + pauseMs;
        }, pauseMs);
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speed, pauseMs]);

  return ref;
}

// ─── Helpers ─────────────────────────────────────────────

/** Compute per-event rank for each competitor in a standings list */
function computeEventRanks(standings: Standing[]): Map<string, Record<string, number>> {
  const ranks = new Map<string, Record<string, number>>();

  for (const event of events) {
    // Sort competitors by this event's score
    const sorted = [...standings]
      .filter((s) => s.eventPoints[event.id] > 0)
      .sort((a, b) => {
        const aScore = a.eventPoints[event.id] ?? 0;
        const bScore = b.eventPoints[event.id] ?? 0;
        return event.higherIsBetter ? bScore - aScore : aScore - bScore;
      });

    sorted.forEach((s, i) => {
      if (!ranks.has(s.competitorId)) ranks.set(s.competitorId, {});
      ranks.get(s.competitorId)![event.id] = i + 1;
    });
  }

  return ranks;
}

// ─── Overview dashboard ───────────────────────────────────

function OverviewDashboard({
  divisionData,
}: {
  divisionData: { division: typeof divisions[0]; standings: Standing[]; competitors: number }[];
}) {
  return (
    <div className="flex flex-col h-full animate-fade-in" style={{ padding: "clamp(8px, 1vh, 20px) clamp(12px, 1.5vw, 20px)" }}>
      {/* ── Event status cards — compact top strip ──── */}
      <div className="shrink-0" style={{ marginBottom: "clamp(8px, 1vh, 20px)" }}>
        <div className="grid grid-cols-6" style={{ gap: "clamp(6px, 0.5vw, 12px)" }}>
          {events.map((event) => (
            <div key={event.id} className="card rounded-lg" style={{ padding: "clamp(6px, 0.6vw, 16px)" }}>
              <div className="flex items-center mb-1" style={{ gap: "clamp(4px, 0.4vw, 10px)" }}>
                <EventIcon eventId={event.id} size={16} className="text-text-secondary shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-text-primary leading-tight" style={{ fontSize: "clamp(10px, 0.7vw, 14px)" }}>{event.name}</h3>
                </div>
              </div>

              {/* Per-division progress rows */}
              <div style={{ marginTop: "clamp(4px, 0.4vh, 12px)" }} className="space-y-1">
                {divisions.map((div) => {
                  const p = getEventScoringProgress(event.id, div.id);
                  const divPct = p.total > 0 ? Math.round((p.scored / p.total) * 100) : 0;
                  const round = getDivisionRound(div.id);
                  const isComplete = divPct === 100;

                  return (
                    <div key={div.id} className="flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: div.color }}
                      />
                      <span className="font-medium text-text-primary shrink-0 truncate" style={{ fontSize: "clamp(8px, 0.5vw, 10px)", width: "clamp(28px, 3vw, 48px)" }}>
                        {div.name}
                      </span>
                      {round && (
                        <span className="font-mono text-text-secondary shrink-0" style={{ fontSize: "clamp(7px, 0.45vw, 9px)" }}>
                          R{round.currentRound}/{round.totalRounds}
                        </span>
                      )}
                      <div className="flex-1 h-1 rounded-full bg-surface-overlay overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${divPct}%`,
                            backgroundColor: isComplete ? "#34d399" : div.color,
                            boxShadow: divPct > 0 ? `0 0 6px ${isComplete ? "#34d39960" : div.color + "60"}` : "none",
                          }}
                        />
                      </div>
                      <span className={`font-mono text-right shrink-0 ${
                        isComplete ? "text-emerald-400" : "text-text-secondary"
                      }`} style={{ fontSize: "clamp(7px, 0.45vw, 10px)", width: "clamp(20px, 2vw, 28px)" }}>
                        {divPct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Division leaderboards — side-by-side, auto-scrolling ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden" style={{ gap: "clamp(6px, 0.5vw, 16px)" }}>
        {divisionData.map(({ division: div, standings }) => (
          <DivisionLeaderboard key={div.id} division={div} standings={standings} />
        ))}
      </div>
    </div>
  );
}

// ─── Division leaderboard (auto-scrolling) ───────────────

function StandingRow({ s, i, color, showEvents, eventRanks }: { s: Standing; i: number; color: string; showEvents?: boolean; eventRanks?: Map<string, Record<string, number>> }) {
  return (
    <div
      className="flex items-center rounded"
      style={{
        background: i < 3
          ? (i % 2 === 0 ? "var(--color-row-strong)" : "var(--color-row-subtle)")
          : (i % 2 === 0 ? "var(--color-row-even)" : "transparent"),
        padding: "clamp(2px, 0.2vh, 4px) clamp(4px, 0.4vw, 10px)",
        fontSize: "clamp(11px, 0.85vw, 16px)",
        lineHeight: 1.4,
      }}
    >
      <span className={`font-mono shrink-0 text-right ${
        i === 0 ? "font-bold" : i < 3 ? "text-text-primary font-bold" : "text-text-secondary"
      }`} style={{ width: "1.6em", marginRight: "0.3em", ...(i === 0 ? { color: "#FFD700" } : {}) }}>
        {s.rank}
      </span>
      <span
        className="text-center rounded font-bold text-white shrink-0"
        style={{
          backgroundColor: color,
          width: "2em",
          marginRight: "0.3em",
          fontSize: "0.75em",
        }}
      >
        {s.bibNumber}
      </span>
      <span className={`truncate ${
        i === 0 ? "font-semibold" : i < 3 ? "text-text-primary font-medium" : "text-text-primary"
      }`} style={{ flex: showEvents ? "1.5 1 0" : "1 1 0", minWidth: 0, ...(i === 0 ? { color: "#FFD700" } : {}) }}>
        {s.firstName} {s.lastName[0]}.
      </span>
      {showEvents && events.map((e) => {
        const rank = eventRanks?.get(s.competitorId)?.[e.id];
        const isFirst = rank === 1;
        return (
          <span
            key={e.id}
            className={`font-mono text-center ${isFirst ? "font-semibold" : "text-text-secondary"}`}
            style={{ flex: "1 1 0", minWidth: 0, fontSize: "0.85em", ...(isFirst ? { color: "#FFD700" } : {}) }}
          >
            {rank ?? "\u2014"}
          </span>
        );
      })}
      <span className={`font-mono text-center font-semibold ${i === 0 ? "" : i < 3 ? "text-text-primary" : "text-text-secondary"}`} style={{ flex: "1 1 0", minWidth: 0, fontSize: "0.9em", ...(i === 0 ? { color: "#FFD700" } : {}) }}>
        {(() => {
          if (!eventRanks) return s.totalPoints ? Math.round(s.totalPoints) : "\u2014";
          const ranks = eventRanks.get(s.competitorId);
          if (!ranks) return "\u2014";
          const sum = Object.values(ranks).reduce((a, b) => a + b, 0);
          return sum || "\u2014";
        })()}
      </span>
    </div>
  );
}

function DivisionLeaderboard({
  division: div,
  standings,
}: {
  division: typeof divisions[0];
  standings: Standing[];
}) {
  const scrollRef = useAutoScroll(0.3, 4000);
  const eventRanks = computeEventRanks(standings);

  // Sort by sum of event ranks (lowest = best, golf-style)
  const sorted = [...standings].sort((a, b) => {
    const aRanks = eventRanks.get(a.competitorId);
    const bRanks = eventRanks.get(b.competitorId);
    const aSum = aRanks ? Object.values(aRanks).reduce((x, y) => x + y, 0) : Infinity;
    const bSum = bRanks ? Object.values(bRanks).reduce((x, y) => x + y, 0) : Infinity;
    return aSum - bSum;
  });

  const TOP_N = 10;
  const pinned = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);

  return (
    <div
      className="card rounded-lg overflow-hidden flex flex-col min-w-0 flex-1"
      style={{ background: `linear-gradient(180deg, ${div.color}12 0%, ${div.color}08 100%)` }}
    >
      {/* Division header */}
      <div
        className="shrink-0 flex items-center justify-between border-b border-border-subtle"
        style={{
          padding: "clamp(3px, 0.3vh, 8px) clamp(6px, 0.5vw, 12px)",
          background: `${div.color}28`,
        }}
      >
        <div className="flex items-center" style={{ gap: "clamp(4px, 0.3vw, 8px)" }}>
          <span
            className="rounded-full"
            style={{ width: "clamp(6px, 0.4vw, 10px)", height: "clamp(6px, 0.4vw, 10px)", backgroundColor: div.color, boxShadow: `0 0 8px ${div.color}60` }}
          />
          <h3 className="font-bold uppercase tracking-wider text-text-primary" style={{ fontSize: "clamp(10px, 0.7vw, 14px)" }}>
            {div.name}
          </h3>
        </div>
        <span className="text-text-tertiary font-mono" style={{ fontSize: "clamp(10px, 0.7vw, 14px)" }}>{standings.length} Entries</span>
      </div>

      {/* Column headers */}
      <div
        className="shrink-0 flex items-center text-text-tertiary uppercase tracking-wider"
        style={{
          padding: "clamp(1px, 0.1vh, 2px) clamp(4px, 0.4vw, 10px)",
          fontSize: "clamp(10px, 0.7vw, 14px)",
          borderBottom: "1px solid var(--color-border-subtle)",
        }}
      >
        <span style={{ width: "1.6em", marginRight: "0.3em" }} className="text-right shrink-0">#</span>
        <span style={{ width: "2em", marginRight: "0.3em", fontSize: "0.75em" }} className="shrink-0" />
        <span style={{ flex: "1.5 1 0", minWidth: 0 }} className="truncate">Name</span>
        {events.map((e) => (
          <span key={e.id} style={{ flex: "1 1 0", minWidth: 0, fontSize: "0.85em", textAlign: "center", display: "block" }}>
            {e.name.split(" ")[0].slice(0, 3)}
          </span>
        ))}
        <span style={{ flex: "1 1 0", minWidth: 0, fontSize: "0.9em", textAlign: "center", display: "block" }}>Tot</span>
      </div>

      {/* Pinned top 10 — always visible */}
      <div
        className="shrink-0"
        style={{ padding: "clamp(2px, 0.2vh, 4px) clamp(3px, 0.3vw, 8px)" }}
      >
        {pinned.map((s, i) => (
          <StandingRow key={s.competitorId} s={s} i={i} color={div.color} showEvents eventRanks={eventRanks} />
        ))}
      </div>

      {/* Rest of field — auto-scrolls when overflowing */}
      {rest.length > 0 && (
        <>
          <div
            className="shrink-0 border-t border-border-subtle/50"
            style={{ margin: "0 clamp(3px, 0.3vw, 8px)", padding: "clamp(1px, 0.1vh, 3px) 0" }}
          >
            <span className="text-text-tertiary uppercase font-medium tracking-wider" style={{ fontSize: "clamp(10px, 0.7vw, 14px)" }}>
              Rest of field
            </span>
          </div>
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 scrollbar-hide"
            style={{
              padding: "0 clamp(3px, 0.3vw, 8px) clamp(2px, 0.2vh, 4px)",
              overflowY: "auto",
            }}
          >
            {rest.map((s, i) => (
              <StandingRow key={s.competitorId} s={s} i={i + TOP_N} color={div.color} showEvents eventRanks={eventRanks} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Division detail view ─────────────────────────────────

function DivisionDetail({
  division: { division: div, standings },
}: {
  division: { division: typeof divisions[0]; standings: Standing[]; competitors: number };
}) {
  return (
    <div className="p-5 space-y-5 animate-fade-in">
      {/* Division header metrics */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <span
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: div.color, boxShadow: `0 0 12px ${div.color}60` }}
          />
          <div>
            <h2 className="text-xl font-bold text-text-primary">{div.name}</h2>
            {(() => { const round = getDivisionRound(div.id); return round ? (
              <p className="text-xs text-text-tertiary">{round.roundLabel}</p>
            ) : null; })()}
          </div>
        </div>
        <div className="ml-auto flex gap-6">
          <Metric label="Competitors" value={standings.length.toString()} />
          <Metric label="Leader" value={standings[0]?.firstName ?? "—"} accent />
          <Metric label="Top Score" value={standings[0]?.totalPoints.toString() ?? "—"} />
        </div>
      </div>

      {/* Event breakdown cards */}
      <div>
        <h3 className="section-label mb-3">Event Breakdown</h3>
        <div className="grid grid-cols-6 gap-3">
          {events.map((event) => {
            const p = getEventScoringProgress(event.id, div.id);
            const pct = p.total > 0 ? Math.round((p.scored / p.total) * 100) : 0;

            // Find leader for this event in this division
            let bestName = "—";
            let bestScore = 0;
            for (const s of standings) {
              const pts = s.eventPoints[event.id];
              if (pts && pts > bestScore) {
                bestScore = pts;
                bestName = `${s.firstName} ${s.lastName[0]}.`;
              }
            }

            return (
              <div key={event.id} className="card rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <EventIcon eventId={event.id} size={20} className="text-text-tertiary shrink-0" />
                    <h4 className="text-xs font-semibold text-text-primary truncate">{event.name}</h4>
                  </div>
                  <ProgressRing percent={pct} size={28} stroke={2.5} color={div.color} />
                </div>
                <div className="text-[10px] text-text-tertiary mb-1">Leader</div>
                <div className="text-xs font-medium text-text-primary truncate">{bestName}</div>
                <div className="text-[10px] font-mono text-text-tertiary mt-0.5">
                  {bestScore > 0 ? bestScore : "—"} &middot; {p.scored}/{p.total} scored
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full standings table */}
      <div>
        <h3 className="section-label mb-3">Full Standings</h3>
        <div className="card rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-2.5 text-left text-text-tertiary font-medium text-[10px] uppercase tracking-wider w-12">Rank</th>
                <th className="px-3 py-2.5 text-left text-text-tertiary font-medium text-[10px] uppercase tracking-wider w-14">Bib</th>
                <th className="px-3 py-2.5 text-left text-text-tertiary font-medium text-[10px] uppercase tracking-wider">Competitor</th>
                {events.map((e) => (
                  <th key={e.id} className="px-2 py-2.5 text-right text-text-tertiary font-medium text-[10px] uppercase tracking-wider">
                    {e.name.split(" ")[0]}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right text-text-tertiary font-medium text-[10px] uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={s.competitorId}
                  className={`border-b border-border-subtle/30 transition-colors hover:bg-surface-overlay/30 ${
                    i < 3 ? "bg-surface-overlay/20" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <span className={`font-mono text-xs ${
                      i === 0 ? "text-amber-400 font-bold" : i < 3 ? "text-text-primary font-semibold" : "text-text-tertiary"
                    }`}>
                      {s.rank}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="bib-badge text-[10px]" style={{ backgroundColor: div.color }}>
                      {s.bibNumber}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs ${i < 3 ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                      {s.firstName} {s.lastName}
                    </span>
                  </td>
                  {events.map((e) => {
                    const pts = s.eventPoints[e.id];
                    const formatted = pts ? (e.id === "evt-chop" ? pts.toFixed(2) : Math.round(pts)) : null;
                    return (
                      <td key={e.id} className="px-2 py-2 text-center">
                        <span className={`text-[11px] font-mono ${pts ? "text-text-secondary" : "text-text-tertiary"}`}>
                          {formatted ?? "\u2014"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right">
                    <span className={`text-xs font-mono font-semibold ${
                      i < 3 ? "text-text-primary" : "text-text-secondary"
                    }`}>
                      {s.totalPoints ? Math.round(s.totalPoints) : "\u2014"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

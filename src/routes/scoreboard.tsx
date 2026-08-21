import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shield, Crosshair, Sun, Moon, Swords } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { EventIcon } from "@/components/event-icons";
import { BrandLogo } from "@/components/brand-logo";
import { divisionEvents } from "@/data/competition-config";
import { useActiveCompetition, useActiveDivisions, useDivisionScoring, useSettings } from "@/data/hooks";
import type { Division, DivisionId, EventId } from "@/lib/types";
import { eventProgress, type Standing } from "@/lib/scoring";

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

// ─── Responsive mode ──────────────────────────────────────

/**
 * The scoreboard has two audiences: the TV (fixed full-screen grid, rows
 * sized to fill, auto-scroll) and phones/tablets via the public URL
 * (stacked boards, natural height, normal page scrolling).
 */
function useIsCompact(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}

// ─── Page ─────────────────────────────────────────────────

type View = "overview" | DivisionId;

export function ScoreboardPage() {
  const [view, setView] = useState<View>("overview");
  const { data: settings } = useSettings();
  const { data: activeComp } = useActiveCompetition();
  const isLive = activeComp?.status === "active";
  const activeDivisions = useActiveDivisions();
  const compact = useIsCompact();
  // A disabled division can't be viewed (e.g. Mentors toggled off mid-view)
  const effectiveView: View =
    view !== "overview" && !activeDivisions.some((d) => d.id === view) ? "overview" : view;

  return (
    <div className={`bg-surface-base ${compact ? "min-h-screen flex flex-col" : "h-screen flex flex-col overflow-hidden"}`}>
      <div
        className="shrink-0 flex items-center gap-1 flex-wrap border-b border-border-subtle relative"
        style={{ padding: "clamp(4px, 0.4vh, 8px) clamp(12px, 1vw, 20px)" }}
      >
        <span className="font-semibold text-text-primary" style={{ fontSize: "clamp(10px, 0.6vw, 13px)", marginRight: "clamp(4px, 0.4vw, 8px)" }}>
          {settings?.competitionName ?? "The Ledge Games"} {settings?.year ?? ""}
        </span>
        <div className="h-3 w-px bg-border-subtle" style={{ marginRight: "clamp(2px, 0.2vw, 4px)" }} />
        <ViewTab label="Overview" active={effectiveView === "overview"} onClick={() => setView("overview")} />
        {activeDivisions.map((div) => (
          <ViewTab
            key={div.id}
            label={div.name}
            color={div.color}
            active={effectiveView === div.id}
            onClick={() => setView(div.id)}
          />
        ))}

        {/* Centered logo overlaps the wrapped tab row on small screens */}
        <Link to="/" className="absolute left-1/2 -translate-x-1/2 hidden lg:flex items-center justify-center">
          <BrandLogo style={{ height: "clamp(20px, 2.5vh, 32px)" }} />
        </Link>

        <div className="ml-auto flex items-center" style={{ gap: "clamp(6px, 0.6vw, 12px)" }}>
          <Link to="/admin" className="text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center" style={{ gap: "clamp(2px, 0.2vw, 4px)", fontSize: "clamp(8px, 0.5vw, 10px)" }}>
            <Shield size={12} /> Admin
          </Link>
          <Link to="/score" className="text-text-tertiary hover:text-text-primary transition-colors inline-flex items-center" style={{ gap: "clamp(2px, 0.2vw, 4px)", fontSize: "clamp(8px, 0.5vw, 10px)" }}>
            <Crosshair size={12} /> Scoring
          </Link>
          <ScoreboardThemeToggle />
          <div className="h-3 w-px bg-border-subtle" />
          {isLive ? (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="font-medium text-emerald-400 uppercase tracking-wider" style={{ fontSize: "clamp(8px, 0.5vw, 10px)" }}>Live</span>
            </div>
          ) : (
            // Archived seasons must never masquerade as a live competition
            <span className="font-medium text-amber-400 uppercase tracking-wider" style={{ fontSize: "clamp(8px, 0.5vw, 10px)" }}>
              Final — archived season
            </span>
          )}
        </div>
      </div>

      <div className={compact ? "flex-1" : "flex-1 min-h-0 overflow-hidden"}>
        {effectiveView === "overview" ? (
          <OverviewDashboard compact={compact} />
        ) : (
          <DivisionDetail divisionId={effectiveView} />
        )}
      </div>
    </div>
  );
}

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

function useAutoScroll(speed = 0.5, pauseMs = 3000, interactPauseMs = 8000) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let pauseUntil = Date.now() + pauseMs;
    let waitingToReset = false;
    let accumulated = 0;
    let attached: HTMLElement | null = null;

    // A human scrolling by hand (laptop trackpad, phone touch) wins: back off
    // and resume from wherever they left it. The TV never fires these events.
    const onInteract = () => {
      pauseUntil = Date.now() + interactPauseMs;
      accumulated = 0;
    };
    const interactEvents = ["wheel", "touchstart", "pointerdown"] as const;

    function tick() {
      const el = ref.current;
      // The element mounts/swaps across layout changes — (re)attach listeners
      if (el !== attached) {
        if (attached) for (const e of interactEvents) attached.removeEventListener(e, onInteract);
        if (el) for (const e of interactEvents) el.addEventListener(e, onInteract, { passive: true });
        attached = el;
      }
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
      accumulated += speed;
      if (accumulated >= 1) {
        const px = Math.floor(accumulated);
        el.scrollTop += px;
        accumulated -= px;
      }
      if (el.scrollTop >= maxScroll && !waitingToReset) {
        el.scrollTop = maxScroll;
        waitingToReset = true;
        pauseUntil = now + pauseMs;
        setTimeout(() => {
          if (ref.current) ref.current.scrollTop = 0;
          accumulated = 0;
          waitingToReset = false;
          pauseUntil = Date.now() + pauseMs;
        }, pauseMs);
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (attached) for (const e of interactEvents) attached.removeEventListener(e, onInteract);
    };
  }, [speed, pauseMs, interactPauseMs]);

  return ref;
}

// ─── Overview ─────────────────────────────────────────────

function OverviewDashboard({ compact }: { compact: boolean }) {
  const activeDivisions = useActiveDivisions();
  const mens = activeDivisions.find((d) => d.id === "mens");
  const sideDivisions = activeDivisions.filter((d) => d.id !== "mens");

  if (compact) {
    // Phones/tablets: every board stacked full-width at natural height,
    // fixed readable rows, event columns dropped — the page scrolls
    return (
      <div className="flex flex-col gap-3 p-3 animate-fade-in">
        <EventStrip compact />
        {activeDivisions.map((div) => (
          <DivisionLeaderboard key={div.id} division={div} mobile />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in" style={{ padding: "clamp(8px, 1vh, 20px) clamp(12px, 1.5vw, 20px)" }}>
      <EventStrip />
      {/* Men's field is ~2.5× the others: give it two columns of the grid and
          render its standings split into side-by-side halves; the smaller
          divisions stack in the third column, sized to their content. */}
      <div
        className="flex-1 min-h-0 grid overflow-hidden"
        style={{ gap: "clamp(6px, 0.5vw, 16px)", gridTemplateColumns: "2fr 1fr" }}
      >
        {mens && <DivisionLeaderboard division={mens} split />}
        {/* Each board sizes to its content so the lower one tucks up under the
            one above; if the stack overflows the column they shrink + scroll */}
        <div className="flex flex-col min-w-0 min-h-0" style={{ gap: "clamp(6px, 0.5vw, 16px)" }}>
          {sideDivisions.map((div) => (
            <DivisionLeaderboard key={div.id} division={div} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventStrip({ compact = false }: { compact?: boolean }) {
  const scoring = {
    mens: useDivisionScoring("mens"),
    womens: useDivisionScoring("womens"),
    mentors: useDivisionScoring("mentors"),
  };
  const activeDivisions = useActiveDivisions();
  const allEvents = [...new Set(activeDivisions.flatMap((d) => divisionEvents(d.id).map((e) => e.id)))];

  return (
    <div className="shrink-0" style={compact ? undefined : { marginBottom: "clamp(8px, 1vh, 20px)" }}>
      <div className={compact ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "grid grid-cols-6"} style={compact ? undefined : { gap: "clamp(6px, 0.5vw, 12px)" }}>
        {allEvents.map((eventId) => (
          <div key={eventId} className="card rounded-lg" style={{ padding: "clamp(6px, 0.6vw, 16px)" }}>
            <div className="flex items-center mb-1" style={{ gap: "clamp(4px, 0.4vw, 10px)" }}>
              <EventIcon eventId={eventId} size={16} className="text-text-secondary shrink-0" />
              <h3 className="font-semibold text-text-primary leading-tight" style={{ fontSize: "clamp(10px, 0.7vw, 14px)" }}>
                {divisionEvents("mens").find((e) => e.id === eventId)?.name ?? eventId}
              </h3>
            </div>
            <div style={{ marginTop: "clamp(4px, 0.4vh, 12px)" }} className="space-y-1">
              {activeDivisions.map((div) => {
                const data = scoring[div.id].data;
                const res = data?.eventResults.get(eventId as EventId);
                if (!res) {
                  return (
                    <div key={div.id} className="flex items-center gap-1 opacity-30">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: div.color }} />
                      <span className="text-text-tertiary" style={{ fontSize: "clamp(8px, 0.5vw, 10px)" }}>—</span>
                    </div>
                  );
                }
                const p = eventProgress(res);
                const isComplete = p.complete;
                return (
                  <div key={div.id} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: div.color }} />
                    <span className="font-medium text-text-primary shrink-0 truncate" style={{ fontSize: "clamp(8px, 0.5vw, 10px)", width: "clamp(28px, 3vw, 48px)" }}>
                      {div.name}
                    </span>
                    <span className="font-mono text-text-secondary shrink-0" style={{ fontSize: "clamp(7px, 0.45vw, 9px)" }}>
                      {p.label}
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-surface-overlay overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${p.pct}%`,
                          backgroundColor: isComplete ? "#34d399" : div.color,
                          boxShadow: p.pct > 0 ? `0 0 6px ${isComplete ? "#34d39960" : div.color + "60"}` : "none",
                        }}
                      />
                    </div>
                    <span
                      className={`font-mono text-right shrink-0 ${isComplete ? "text-emerald-400" : "text-text-secondary"}`}
                      style={{ fontSize: "clamp(7px, 0.45vw, 10px)", width: "clamp(26px, 2.6vw, 44px)" }}
                    >
                      {p.detail ?? `${p.pct}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Division leaderboard column ──────────────────────────

function StandingRow({
  s,
  i,
  color,
  events,
  name,
  rowHeight,
}: {
  s: Standing;
  i: number;
  color: string;
  events: { id: EventId }[];
  name: string;
  /** Dynamic sizing: exact row height in px, font scales with it. */
  rowHeight?: number;
}) {
  const gold = i === 0 ? { color: "var(--color-gold)" } : {};
  const sizing = rowHeight
    ? {
        height: rowHeight,
        padding: "0 clamp(4px, 0.4vw, 10px)",
        fontSize: Math.max(10, Math.min(rowHeight * 0.52, 20)),
      }
    : {
        padding: "clamp(2px, 0.2vh, 4px) clamp(4px, 0.4vw, 10px)",
        fontSize: "clamp(11px, 0.85vw, 16px)",
      };
  return (
    <div
      className="flex items-center rounded"
      style={{
        background:
          i < 3
            ? i % 2 === 0
              ? "var(--color-row-strong)"
              : "var(--color-row-subtle)"
            : i % 2 === 0
              ? "var(--color-row-even)"
              : "transparent",
        ...sizing,
        lineHeight: 1.4,
      }}
    >
      <span
        className={`font-mono shrink-0 text-right ${i < 3 ? "font-bold text-text-primary" : "text-text-secondary"}`}
        style={{ width: "1.6em", marginRight: "0.3em", ...gold }}
      >
        {s.rank}
      </span>
      <span
        className="text-center rounded font-bold text-white shrink-0"
        style={{ backgroundColor: color, width: "2em", marginRight: "0.3em", fontSize: "0.75em" }}
      >
        {name.split("|")[0]}
      </span>
      <span
        className={`truncate ${i < 3 ? "text-text-primary font-medium" : "text-text-primary"}`}
        style={{ flex: "1.5 1 0", minWidth: 0, ...gold }}
      >
        {name.split("|")[1]}
        {s.tiebreakRequired && <Swords size={11} className="inline ml-1 text-amber-400" aria-label="Tiebreaker required" />}
      </span>
      {events.map((e) => {
        const pts = s.eventPoints[e.id];
        const isFirst = pts === 1;
        return (
          <span
            key={e.id}
            className={`font-mono text-center ${isFirst ? "font-semibold" : "text-text-secondary"}`}
            style={{ flex: "1 1 0", minWidth: 0, fontSize: "0.85em", ...(isFirst ? { color: "var(--color-gold)" } : {}) }}
          >
            {pts ?? "—"}
          </span>
        );
      })}
      <span
        className={`font-mono text-center font-semibold ${i < 3 ? "text-text-primary" : "text-text-secondary"}`}
        style={{ flex: "1 1 0", minWidth: 0, fontSize: "0.9em", ...gold }}
      >
        {s.total || "—"}
      </span>
    </div>
  );
}

function ColumnHeaders({ events }: { events: { id: EventId; name: string }[] }) {
  return (
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
  );
}

function DivisionLeaderboard({
  division: div,
  split = false,
  mobile = false,
}: {
  division: Division;
  /** Render the standings in two side-by-side halves (large fields). */
  split?: boolean;
  /** Phone layout: natural height, fixed readable rows, no event columns. */
  mobile?: boolean;
}) {
  const scrollRef = useAutoScroll(0.3, 4000);
  const scrollRefB = useAutoScroll(0.3, 4000);
  const { data } = useDivisionScoring(div.id);

  // Measure the rows viewport so row height scales to exactly fill it
  const [rowsAreaH, setRowsAreaH] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (el) {
      const ro = new ResizeObserver(() => setRowsAreaH(el.clientHeight));
      ro.observe(el);
      roRef.current = ro;
      setRowsAreaH(el.clientHeight);
    }
  }, []);

  if (!data) return <div className="card rounded-lg" style={{ flex: "1 1 0%" }} />;

  const events = divisionEvents(div.id);
  const byId = new Map(data.field.map((c) => [c.id, c]));
  const rows = data.standings.map((s) => {
    const c = byId.get(s.competitorId)!;
    return { s, name: `${c.bibNumber}|${c.firstName} ${c.lastName}` };
  });

  const half = Math.ceil(rows.length / 2);
  const halves = [rows.slice(0, half), rows.slice(half)];
  const rowCount = split ? half : rows.length;
  const rowHeight = mobile
    ? 30 // fixed, readable on a phone; the page scrolls instead
    : rowsAreaH > 0 && rowCount > 0
      ? Math.max(14, Math.min(44, Math.floor(rowsAreaH / rowCount)))
      : undefined;
  // Per-event rank columns don't fit a phone — rank/bib/name/total only
  const shownEvents = mobile ? [] : events;

  return (
    <div
      className="card rounded-lg overflow-hidden flex flex-col min-w-0"
      style={{
        // Split boards fill their grid cell; stacked boards share the side
        // column proportionally to their row counts (basis ≈ header block)
        // so per-row heights come out roughly equal across boards.
        ...(mobile ? {} : split ? { width: "100%" } : { flex: `${rows.length} 1 3.5rem` }),
        minHeight: 0,
        background: `linear-gradient(180deg, ${div.color}12 0%, ${div.color}08 100%)`,
      }}
    >
      <div
        className="shrink-0 flex items-center justify-between border-b border-border-subtle"
        style={{ padding: "clamp(3px, 0.3vh, 8px) clamp(6px, 0.5vw, 12px)", background: `${div.color}28` }}
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
        <span className="text-text-tertiary font-mono" style={{ fontSize: "clamp(10px, 0.7vw, 14px)" }}>
          {rows.length} Entries
        </span>
      </div>

      {mobile ? (
        <>
          <ColumnHeaders events={shownEvents} />
          <div style={{ padding: "2px 6px 4px" }}>
            {rows.map(({ s, name }, i) => (
              <StandingRow key={s.competitorId} s={s} i={i} color={div.color} events={shownEvents} name={name} rowHeight={rowHeight} />
            ))}
          </div>
        </>
      ) : split ? (
        /* Two side-by-side halves, each with its own headers; whole field visible */
        <div className="flex-1 min-h-0 flex" style={{ gap: "clamp(4px, 0.4vw, 12px)", padding: "clamp(2px, 0.2vh, 4px) clamp(3px, 0.3vw, 8px)" }}>
          {halves.map((hrows, hi) => (
            <div
              key={hi}
              className="flex-1 min-w-0 flex flex-col min-h-0"
              style={hi === 0 ? { borderRight: "1px solid var(--color-border-subtle)", paddingRight: "clamp(4px, 0.4vw, 12px)" } : undefined}
            >
              <ColumnHeaders events={events} />
              <div
                ref={(el) => {
                  (hi === 0 ? scrollRef : scrollRefB).current = el;
                  if (hi === 0) measure(el);
                }}
                className="flex-1 min-h-0 scrollbar-hide"
                style={{ overflowY: "auto" }}
              >
                {hrows.map(({ s, name }, i) => (
                  <StandingRow key={s.competitorId} s={s} i={hi * half + i} color={div.color} events={events} name={name} rowHeight={rowHeight} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <ColumnHeaders events={events} />
          <div
            ref={(el) => {
              scrollRef.current = el;
              measure(el);
            }}
            className="flex-1 min-h-0 scrollbar-hide"
            // Horizontal padding only: vertical padding would count into the
            // measured clientHeight, oversizing rows by a few px and making
            // the auto-scroll jiggle forever on a board that actually fits
            style={{ padding: "0 clamp(3px, 0.3vw, 8px)", overflowY: "auto" }}
          >
            {rows.map(({ s, name }, i) => (
              <StandingRow key={s.competitorId} s={s} i={i} color={div.color} events={events} name={name} rowHeight={rowHeight} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Division detail ──────────────────────────────────────

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

function DivisionDetail({ divisionId }: { divisionId: DivisionId }) {
  const { data } = useDivisionScoring(divisionId);
  if (!data) return null;
  const div = data.division;
  const events = divisionEvents(divisionId);
  const byId = new Map(data.field.map((c) => [c.id, c]));
  const leader = data.standings[0] && byId.get(data.standings[0].competitorId);

  return (
    <div className="p-3 sm:p-5 space-y-5 animate-fade-in overflow-y-auto h-full">
      <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: div.color, boxShadow: `0 0 12px ${div.color}60` }} />
          <h2 className="text-xl font-bold text-text-primary">{div.name}</h2>
        </div>
        <div className="ml-auto flex gap-4 sm:gap-6 flex-wrap">
          <Metric label="Competitors" value={String(data.field.length)} />
          <Metric label="Leader" value={leader ? `${leader.firstName} ${leader.lastName}` : "—"} accent />
          <Metric label="Total Points" value={data.standings[0] ? String(data.standings[0].total) : "—"} />
        </div>
      </div>

      {data.standings[0]?.tiebreakRequired && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-amber-400 text-sm">
          <Swords size={16} />
          Tied for the division title — archery arrow-off required (1 arrow each, closest to bullseye).
        </div>
      )}

      {/* Event cards */}
      <div>
        <h3 className="section-label mb-3">Event Breakdown</h3>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          {events.map((event) => {
            const res = data.eventResults.get(event.id)!;
            const p = eventProgress(res);
            const first = res.results.find((r) => r.rank === 1 && r.participated);
            const firstComp = first && byId.get(first.competitorId);
            const display = first
              ? event.format === "ladder"
                ? `${first.cumulative} ${event.unit}`
                : first.isFinalist && first.finalsScore !== null
                  ? `${first.finalsScore} ${event.unit} (finals)`
                  : `${first.cumulative} ${event.unit}`
              : "—";
            return (
              <div key={event.id} className="card rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <EventIcon eventId={event.id} size={20} className="text-text-tertiary shrink-0" />
                    <h4 className="text-xs font-semibold text-text-primary truncate">{event.name}</h4>
                  </div>
                  <span className="text-[10px] font-mono text-text-tertiary">
                    {p.label}
                    {p.detail ? ` · ${p.detail} thrown` : ""}
                  </span>
                </div>
                <div className="text-[10px] text-text-tertiary mb-1">Leader</div>
                <div className="text-xs font-medium text-text-primary truncate">
                  {firstComp ? `${firstComp.firstName} ${firstComp.lastName}` : "—"}
                </div>
                <div className="text-[10px] font-mono text-text-tertiary mt-0.5">{display}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full standings */}
      <div>
        <h3 className="section-label mb-3">Full Standings</h3>
        <div className="card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="px-4 py-2.5 text-left text-text-tertiary font-medium text-[10px] uppercase tracking-wider w-12">Rank</th>
                <th className="px-3 py-2.5 text-left text-text-tertiary font-medium text-[10px] uppercase tracking-wider w-14">Bib</th>
                <th className="px-3 py-2.5 text-left text-text-tertiary font-medium text-[10px] uppercase tracking-wider">Competitor</th>
                {events.map((e) => (
                  <th key={e.id} className="px-2 py-2.5 text-center text-text-tertiary font-medium text-[10px] uppercase tracking-wider">
                    {e.name.split(" ")[0]}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right text-text-tertiary font-medium text-[10px] uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.standings.map((s, i) => {
                const c = byId.get(s.competitorId)!;
                return (
                  <tr
                    key={s.competitorId}
                    className={`border-b border-border-subtle/30 transition-colors hover:bg-surface-overlay/30 ${i < 3 ? "bg-surface-overlay/20" : ""}`}
                  >
                    <td className="px-4 py-2">
                      <span className={`font-mono text-xs ${i === 0 ? "text-amber-400 font-bold" : i < 3 ? "text-text-primary font-semibold" : "text-text-tertiary"}`}>
                        {s.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="bib-badge text-[10px]" style={{ backgroundColor: div.color }}>{c.bibNumber}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs ${i < 3 ? "font-semibold text-text-primary" : "text-text-secondary"}`}>
                        {c.firstName} {c.lastName}
                        {s.tiebreakRequired && <Swords size={11} className="inline ml-1.5 text-amber-400" />}
                      </span>
                    </td>
                    {events.map((e) => {
                      const pts = s.eventPoints[e.id];
                      return (
                        <td key={e.id} className="px-2 py-2 text-center">
                          <span className={`text-[11px] font-mono ${pts !== undefined ? "text-text-secondary" : "text-text-tertiary"}`}>
                            {pts ?? "—"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right">
                      <span className={`text-xs font-mono font-semibold ${i < 3 ? "text-text-primary" : "text-text-secondary"}`}>
                        {s.total || "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}

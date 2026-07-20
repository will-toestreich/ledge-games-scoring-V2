import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  Link,
  useMatchRoute,
} from "@tanstack/react-router";
import { Shield, Crosshair, BarChart3, Sun, Moon, CloudUpload } from "lucide-react";
import { useTheme } from "./lib/theme";
import { useCompetitors, useDbSync, useOutboxCount, useSettings } from "./data/hooks";
import { AdminPage } from "./routes/admin";
import { ScorePage } from "./routes/score";
import { ScoreEventPage } from "./routes/score-event";
import { ScoreCompetitorPage } from "./routes/score-competitor";
import { ScoreboardPage } from "./routes/scoreboard";

// ─── Root layout ──────────────────────────────────────────

function RootLayout() {
  useDbSync();
  const matchRoute = useMatchRoute();
  const isHome = matchRoute({ to: "/" });
  const isAdmin = matchRoute({ to: "/admin", fuzzy: true });
  const isScore = matchRoute({ to: "/score", fuzzy: true });
  const isScoreboard = matchRoute({ to: "/scoreboard", fuzzy: true });

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      <DataErrorBanner />
      {/* Glass nav bar — hidden on scoreboard for full-screen display */}
      {!isScoreboard && (
        <nav className="glass sticky top-0 z-50 border-b border-border-subtle">
          <div className="px-3 sm:px-6 lg:px-8 flex items-center h-14 gap-3 sm:gap-8">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <img
                src={`${import.meta.env.BASE_URL}brand/The-Ledge-Games-Logo-4.png`}
                alt="The Ledge Games"
                className="h-7"
              />
            </Link>

            <div className="flex items-center gap-1 ml-auto">
              <OutboxBadge />
              <NavPill to="/admin" active={!!isAdmin} icon={<Shield size={14} />}>Admin</NavPill>
              <NavPill to="/score" active={!!isScore} icon={<Crosshair size={14} />}>Scoring</NavPill>
              <NavPill to="/scoreboard" active={!!isScoreboard} icon={<BarChart3 size={14} />}>Scoreboard</NavPill>
              <ThemeToggle />
            </div>
          </div>
        </nav>
      )}

      {/* Page content */}
      <main className={`flex-1 ${isHome ? "" : "animate-fade-in"}`}>
        <Outlet />
      </main>
    </div>
  );
}

function NavPill({
  to,
  active,
  icon,
  children,
}: {
  to: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`relative px-3 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 inline-flex items-center gap-1.5 ${
        active
          ? "text-white bg-ledge-red shadow-[0_0_16px_rgba(153,0,0,0.3)]"
          : "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
      }`}
    >
      {icon}
      {/* Icon-only on phones — three labeled pills don't fit beside the logo */}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}

function DataErrorBanner() {
  const { error } = useCompetitors();
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  const schemaMissing = /could not find the table|schema cache/i.test(msg);
  return (
    <div className="bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs px-4 py-2 text-center">
      {schemaMissing
        ? "Cloud database not initialized — run supabase/migrations/001_init.sql in the Supabase SQL Editor, then reload."
        : `Data error: ${msg}`}
    </div>
  );
}

function OutboxBadge() {
  const pending = useOutboxCount();
  if (pending === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 mr-1"
      title="Scores saved on this device that haven't reached the cloud yet — they'll sync automatically when the connection returns"
    >
      <CloudUpload size={13} />
      {pending} queued
    </span>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="ml-2 p-2 rounded-full text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-colors"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

// ─── Landing page ─────────────────────────────────────────

function LandingPage() {
  const { data: settings } = useSettings();
  return (
    <div className="relative flex items-center justify-center min-h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="ambient-glow -top-40 left-1/2 -translate-x-1/2"
        style={{ background: "rgba(153, 0, 0, 0.12)" }}
      />
      <div
        className="ambient-glow top-1/3 -left-20"
        style={{ background: "rgba(10, 67, 102, 0.08)" }}
      />

      <div className="relative text-center space-y-8 sm:space-y-10 px-6 animate-slide-up w-full">
        {/* Stacked logo — scaled to the screen, never edge-to-edge */}
        <img
          src={`${import.meta.env.BASE_URL}brand/The-Ledge-Games-Logo-4.png`}
          alt="The Ledge Games"
          className="h-auto w-full max-w-[300px] sm:max-w-[420px] md:max-w-[520px] mx-auto drop-shadow-2xl"
        />

        <div className="space-y-2 sm:space-y-3">
          <p className="text-text-secondary text-lg tracking-wide">
            {settings ? `${settings.year} Competition Scoring` : "Competition Scoring"}
          </p>
          <p className="text-text-tertiary text-sm">Pick your weapon.</p>
        </div>

        {/* Phones: one clean full-width stack, primary action first */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center max-w-xs sm:max-w-none mx-auto">
          <Link
            to="/score"
            className="btn-primary text-base px-8 py-3 inline-flex items-center justify-center gap-2 sm:order-2"
          >
            <Crosshair size={18} />
            Start Scoring
          </Link>
          <Link
            to="/admin"
            className="btn-secondary text-base px-8 py-3 inline-flex items-center justify-center gap-2 sm:order-1"
          >
            <Shield size={18} />
            Admin
          </Link>
          <Link
            to="/scoreboard"
            className="btn-secondary text-base px-8 py-3 inline-flex items-center justify-center gap-2 sm:order-3"
          >
            <BarChart3 size={18} />
            Scoreboard
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Route tree ───────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminPage,
});

const scoreRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/score",
  component: ScorePage,
});

const scoreEventRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/score/$eventId",
  component: ScoreEventPage,
});

const scoreCompetitorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/score/$eventId/$competitorId",
  component: ScoreCompetitorPage,
  validateSearch: (search: Record<string, unknown>): { round?: number } => {
    const round = Number(search.round);
    return Number.isInteger(round) && round >= 1 ? { round } : {};
  },
});

const scoreboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/scoreboard",
  component: ScoreboardPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  adminRoute,
  scoreRoute,
  scoreEventRoute,
  scoreCompetitorRoute,
  scoreboardRoute,
]);

export const router = createRouter({ routeTree, basepath: import.meta.env.BASE_URL });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  Link,
  useMatchRoute,
} from "@tanstack/react-router";
import { Shield, Crosshair, BarChart3, Sun, Moon } from "lucide-react";
import { useTheme } from "./lib/theme";
import { AdminPage } from "./routes/admin";
import { ScorePage } from "./routes/score";
import { ScoreEventPage } from "./routes/score-event";
import { ScoreCompetitorPage } from "./routes/score-competitor";
import { ScoreboardPage } from "./routes/scoreboard";

// ─── Root layout ──────────────────────────────────────────

function RootLayout() {
  const matchRoute = useMatchRoute();
  const isHome = matchRoute({ to: "/" });
  const isAdmin = matchRoute({ to: "/admin", fuzzy: true });
  const isScore = matchRoute({ to: "/score", fuzzy: true });
  const isScoreboard = matchRoute({ to: "/scoreboard", fuzzy: true });

  return (
    <div className="min-h-screen flex flex-col bg-surface-base">
      {/* Glass nav bar — hidden on scoreboard for full-screen display */}
      {!isScoreboard && (
        <nav className="glass sticky top-0 z-50 border-b border-border-subtle">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-8">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <img
                src="/brand/The-Ledge-Games-Logo-4.png"
                alt="The Ledge Games"
                className="h-7"
              />
            </Link>

            <div className="flex items-center gap-1 ml-auto">
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
      className={`relative px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 inline-flex items-center gap-1.5 ${
        active
          ? "text-white bg-ledge-red shadow-[0_0_16px_rgba(153,0,0,0.3)]"
          : "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
      }`}
    >
      {icon}
      {children}
    </Link>
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

      <div className="relative text-center space-y-10 px-4 animate-slide-up">
        {/* Stacked logo */}
        <img
          src="/brand/The-Ledge-Games-Logo-4.png"
          alt="The Ledge Games"
          className="h-48 mx-auto drop-shadow-2xl"
        />

        <div className="space-y-3">
          <p className="text-text-secondary text-lg tracking-wide">
            2026 Competition Scoring
          </p>
          <p className="text-text-tertiary text-sm">Pick your weapon.</p>
        </div>

        <div className="flex gap-4 justify-center">
          <Link to="/admin" className="btn-secondary text-base px-8 py-3 inline-flex items-center gap-2">
            <Shield size={18} />
            Admin
          </Link>
          <Link to="/score" className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
            <Crosshair size={18} />
            Start Scoring
          </Link>
          <Link to="/scoreboard" className="btn-secondary text-base px-8 py-3 inline-flex items-center gap-2">
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

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

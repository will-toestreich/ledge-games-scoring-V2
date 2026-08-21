// TanStack Query data layer. Components talk to these hooks only —
// never to db.ts directly — so the Supabase swap stays invisible.

import { useEffect, useMemo, useState } from "react";
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AttemptScore, Competitor, Division, DivisionId, KegAttempt, Settings } from "@/lib/types";
import { divisionEvents, divisions, getDivision } from "./competition-config";
import { computeStandings, divisionField } from "@/lib/scoring";
import * as db from "./db";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      // Scoreboard TVs and phones self-heal by polling; localStorage is
      // cheap, and this carries over unchanged to Supabase later.
      refetchInterval: 5_000,
    },
  },
});

/** Invalidate everything whenever the db announces a write (same or other tab). */
export function useDbSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const onUpdate = () => qc.invalidateQueries();
    window.addEventListener(db.DB_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(db.DB_UPDATED_EVENT, onUpdate);
  }, [qc]);
}

/**
 * Database health for the admin status pill: pings every 30s with a hard
 * timeout, so a paused cloud project reads as "unreachable" within seconds
 * instead of silently stalling every query.
 */
export function useDbStatus() {
  return useQuery({
    queryKey: ["dbStatus"],
    queryFn: db.pingDatabase,
    refetchInterval: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

/** Writes queued offline, waiting to sync (cloud adapter only). */
export function useOutboxCount(): number {
  const [count, setCount] = useState(() => db.getPendingWrites());
  useEffect(() => {
    const update = () => setCount(db.getPendingWrites());
    window.addEventListener(db.OUTBOX_UPDATED_EVENT, update);
    return () => window.removeEventListener(db.OUTBOX_UPDATED_EVENT, update);
  }, []);
  return count;
}

// ─── Reads ─────────────────────────────────────────────────

export function useCompetitors() {
  return useQuery({ queryKey: ["competitors"], queryFn: db.fetchCompetitors });
}

export function useScores() {
  return useQuery({ queryKey: ["scores"], queryFn: db.fetchScores });
}

export function useKegAttempts() {
  return useQuery({ queryKey: ["kegAttempts"], queryFn: db.fetchKegAttempts });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: db.fetchSettings });
}

export function useCompetitions() {
  return useQuery({ queryKey: ["competitions"], queryFn: db.fetchCompetitions });
}

export function useActiveCompetition() {
  return useQuery({ queryKey: ["activeCompetition"], queryFn: db.fetchActiveCompetition });
}

// ─── Writes ────────────────────────────────────────────────

export function useSaveRoundAttempts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { attempts: AttemptScore[]; removeIds?: string[] }) =>
      db.saveRoundAttempts(args.attempts, args.removeIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scores"] }),
  });
}

export function useDeleteRoundAttempts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { competitorId: string; eventId: string; round: number }) =>
      db.deleteRoundAttempts(args.competitorId, args.eventId, args.round),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scores"] }),
  });
}

export function useRecordKegAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attempt: KegAttempt) => db.recordKegAttempt(attempt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kegAttempts"] }),
  });
}

export function useUndoLastKegAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (competitorId: string) => db.undoLastKegAttempt(competitorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kegAttempts"] }),
  });
}

export function useUpdateCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<Competitor> }) =>
      db.updateCompetitor(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors"] }),
  });
}

export function useAddCompetitors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (comps: Competitor[]) => db.addCompetitors(comps),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competitors"] }),
  });
}

export function useDeleteCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteCompetitor(id),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteCompetitorScores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteCompetitorScores(id),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => db.saveSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useResetActiveSeasonScores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => db.resetActiveSeasonScores(),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useResetDemoData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => db.resetDemoData(),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCreateCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { name: string; year: number }) => db.createCompetition(opts),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRenameCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; name: string }) => db.renameCompetition(args.id, args.name),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useReopenCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.reopenCompetition(id),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useArchiveCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.archiveCompetition(id),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useActivateCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.activateCompetition(id),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteCompetition(id),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * Divisions running this year. Mentors only fields in years with enough
 * sign-ups (Settings → Divisions toggle); when off, Mentors disappears from
 * the scoreboard, scoring flow, and Mission Control — roster data is kept.
 */
export function useActiveDivisions(): Division[] {
  const { data: settings } = useSettings();
  const mentorsEnabled = settings?.mentorsEnabled ?? true;
  return useMemo(
    () => divisions.filter((d) => d.id !== "mentors" || mentorsEnabled),
    [mentorsEnabled]
  );
}

// ─── Derived: engine outputs ───────────────────────────────

/**
 * Live standings + per-event results for one division, recomputed whenever
 * the underlying data changes. Everything every view shows comes from here.
 */
export function useDivisionScoring(divisionId: DivisionId) {
  const competitors = useCompetitors();
  const scores = useScores();
  const kegAttempts = useKegAttempts();
  const { data: settings } = useSettings();

  const ready =
    competitors.data !== undefined &&
    scores.data !== undefined &&
    kegAttempts.data !== undefined;
  const titleTiebreakWinner = settings?.titleTiebreakWinners?.[divisionId] ?? null;

  const value = useMemo(() => {
    if (!ready) return null;
    const division = getDivision(divisionId)!;
    const field = divisionField(divisionId, competitors.data!);
    return {
      division,
      field,
      ...computeStandings({
        division,
        field,
        events: divisionEvents(divisionId),
        scores: scores.data!,
        kegAttempts: kegAttempts.data!,
        titleTiebreakWinner,
      }),
    };
  }, [ready, divisionId, competitors.data, scores.data, kegAttempts.data, titleTiebreakWinner]);

  return { data: value, isLoading: !ready };
}

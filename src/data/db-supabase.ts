// Supabase adapter — same API surface as db-local.ts, backed by Postgres.
// Chosen by src/data/db.ts when VITE_SUPABASE_* env vars are present.
//
// Design notes:
// - One competition (season) is "active" via the single-row app_state table.
// - Field-scoring writes go through an offline OUTBOX: on network failure
//   they queue in localStorage and replay in order when connectivity returns.
//   Desk operations (roster edits, seasons, backup) fail loudly instead.
// - Realtime changes on any table dispatch DB_UPDATED_EVENT, which the query
//   layer already listens to; 5s polling remains as the fallback.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AttemptScore, Competitor, DivisionId, KegAttempt, Settings } from "@/lib/types";
import { buildSeed } from "./seed";
import { DB_UPDATED_EVENT, OUTBOX_UPDATED_EVENT } from "./db-events";
import type { CompetitionMeta, CompetitionStatus } from "./db-local";
import season2025Json from "./season-2025.json";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    if (!isConfigured) throw new Error("Supabase env vars missing");
    client = createClient(url!, key!);
    if (typeof window !== "undefined") {
      client
        .channel("tlg-db")
        .on("postgres_changes", { event: "*", schema: "public" }, () => {
          activeIdCache = null;
          window.dispatchEvent(new Event(DB_UPDATED_EVENT));
        })
        .subscribe();
    }
  }
  return client;
}

function emitUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(DB_UPDATED_EVENT));
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ─── Row mappers (snake_case ↔ app types) ──────────────────

interface CompetitionRow {
  id: string;
  status: CompetitionStatus;
  name: string;
  year: number;
  scorer_pin: string;
  mentors_enabled: boolean;
  title_tiebreak_winners: Partial<Record<DivisionId, string>> | null;
}

function rowToSettings(r: CompetitionRow): Settings {
  return {
    competitionName: r.name,
    year: r.year,
    scorerPin: r.scorer_pin,
    mentorsEnabled: r.mentors_enabled,
    titleTiebreakWinners: r.title_tiebreak_winners ?? {},
  };
}

function rowToCompetitor(r: Record<string, unknown>): Competitor {
  return {
    id: r.id as string,
    divisionId: r.division_id as Competitor["divisionId"],
    bibNumber: r.bib_number as number,
    firstName: r.first_name as string,
    lastName: (r.last_name as string) ?? "",
    nickname: (r.nickname as string | null) ?? null,
    hometown: (r.hometown as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    shirtSize: (r.shirt_size as string | null) ?? null,
    registration: (r.registration as Competitor["registration"]) ?? null,
    paid: Boolean(r.paid),
    checkedIn: Boolean(r.checked_in),
    noShow: Boolean(r.no_show),
    eventSkips: (r.event_skips as Competitor["eventSkips"]) ?? [],
  };
}

function competitorToRow(competitionId: string, c: Competitor) {
  return {
    competition_id: competitionId,
    id: c.id,
    division_id: c.divisionId,
    bib_number: c.bibNumber,
    first_name: c.firstName,
    last_name: c.lastName,
    nickname: c.nickname,
    hometown: c.hometown,
    email: c.email,
    shirt_size: c.shirtSize,
    registration: c.registration,
    paid: c.paid,
    checked_in: c.checkedIn,
    no_show: c.noShow,
    event_skips: c.eventSkips,
  };
}

function rowToScore(r: Record<string, unknown>): AttemptScore {
  return {
    id: r.id as string,
    competitorId: r.competitor_id as string,
    eventId: r.event_id as AttemptScore["eventId"],
    round: r.round as number,
    attempt: r.attempt as number,
    value: Number(r.value),
    penalty: Number(r.penalty ?? 0),
    declined: r.declined ? true : undefined,
    recordedAt: r.recorded_at ? Date.parse(r.recorded_at as string) : undefined,
  };
}

function scoreToRow(competitionId: string, s: AttemptScore) {
  return {
    competition_id: competitionId,
    id: s.id,
    competitor_id: s.competitorId,
    event_id: s.eventId,
    round: s.round,
    attempt: s.attempt,
    value: s.value,
    penalty: s.penalty,
    declined: s.declined ?? false,
    recorded_at: new Date(s.recordedAt ?? Date.now()).toISOString(),
  };
}

function rowToKeg(r: Record<string, unknown>): KegAttempt {
  return {
    id: r.id as string,
    competitorId: r.competitor_id as string,
    heightFt: r.height_ft as number,
    attempt: r.attempt as number,
    result: r.result as KegAttempt["result"],
    recordedAt: r.recorded_at ? Date.parse(r.recorded_at as string) : undefined,
  };
}

function kegToRow(competitionId: string, a: KegAttempt) {
  return {
    competition_id: competitionId,
    id: a.id,
    competitor_id: a.competitorId,
    height_ft: a.heightFt,
    attempt: a.attempt,
    result: a.result,
    recorded_at: new Date(a.recordedAt ?? Date.now()).toISOString(),
  };
}

// ─── Seeding & active-competition pointer ──────────────────

interface SeasonData {
  competitors: Competitor[];
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
  settings: Settings;
}

async function insertSeasonChildren(competitionId: string, data: SeasonData) {
  const chunk = <T,>(rows: T[], n = 500): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += n) out.push(rows.slice(i, i + n));
    return out;
  };
  for (const rows of chunk(data.competitors.map((c) => competitorToRow(competitionId, c)))) {
    fail((await sb().from("v2_competitors").upsert(rows, { onConflict: "competition_id,id" })).error);
  }
  for (const rows of chunk(data.scores.map((s) => scoreToRow(competitionId, s)))) {
    fail((await sb().from("v2_scores").upsert(rows, { onConflict: "competition_id,id" })).error);
  }
  for (const rows of chunk(data.kegAttempts.map((a) => kegToRow(competitionId, a)))) {
    fail((await sb().from("v2_keg_attempts").upsert(rows, { onConflict: "competition_id,id" })).error);
  }
}

function settingsToCompetitionRow(id: string, status: CompetitionStatus, s: Settings) {
  return {
    id,
    status,
    name: s.competitionName,
    year: s.year,
    scorer_pin: s.scorerPin,
    mentors_enabled: s.mentorsEnabled,
    title_tiebreak_winners: s.titleTiebreakWinners ?? {},
  };
}

let seedPromise: Promise<void> | null = null;
function ensureSeeded(): Promise<void> {
  seedPromise ??= (async () => {
    const { count, error } = await sb()
      .from("v2_competitions")
      .select("id", { count: "exact", head: true });
    fail(error);
    if ((count ?? 0) > 0) return;
    // Fresh database: ship last season as a browsable archive
    const season = season2025Json as unknown as SeasonData;
    const row = settingsToCompetitionRow("season-2025", "completed", {
      ...season.settings,
      mentorsEnabled: true,
    });
    fail((await sb().from("v2_competitions").upsert([row], { onConflict: "id", ignoreDuplicates: true })).error);
    await insertSeasonChildren("season-2025", season);
    await sb().from("v2_app_state").update({ active_competition_id: "season-2025" }).eq("id", 1);
  })().catch((e) => {
    seedPromise = null; // allow retry after a transient failure
    throw e;
  });
  return seedPromise;
}

let activeIdCache: { id: string; at: number } | null = null;

async function getActiveId(): Promise<string> {
  if (activeIdCache && Date.now() - activeIdCache.at < 4_000) return activeIdCache.id;
  await ensureSeeded();
  const { data, error } = await sb().from("v2_app_state").select("active_competition_id").eq("id", 1).single();
  fail(error);
  let id = data!.active_competition_id as string | null;
  if (!id) {
    const { data: comps, error: e2 } = await sb()
      .from("v2_competitions")
      .select("id")
      .order("year", { ascending: false })
      .limit(1);
    fail(e2);
    id = comps![0].id as string;
    await sb().from("v2_app_state").update({ active_competition_id: id }).eq("id", 1);
  }
  activeIdCache = { id, at: Date.now() };
  return id;
}

// ─── Offline outbox for field-scoring writes ───────────────

const OUTBOX_KEY = "tlg:outbox";

interface QueuedWrite {
  fn: string;
  args: unknown[];
}

function readOutbox(): QueuedWrite[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]") as QueuedWrite[];
  } catch {
    return [];
  }
}

function writeOutbox(queue: QueuedWrite[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_UPDATED_EVENT));
}

export function getPendingWrites(): number {
  return readOutbox().length;
}

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /fetch|network|Failed to|ECONN|timeout/i.test(msg);
}

const replayable = new Map<string, (...args: never[]) => Promise<void>>();
let flushing = false;

async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    let queue = readOutbox();
    while (queue.length > 0) {
      const next = queue[0];
      const fn = replayable.get(next.fn);
      if (!fn) {
        queue = queue.slice(1); // unknown op from an old version — drop it
        writeOutbox(queue);
        continue;
      }
      try {
        await fn(...(next.args as never[]));
      } catch (e) {
        if (isNetworkError(e)) return; // still offline — try again later
        // Non-network failure (e.g. validation): drop so the queue can't jam
        console.error("Outbox write failed permanently:", next.fn, e);
      }
      queue = queue.slice(1);
      writeOutbox(queue);
      emitUpdated();
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined" && isConfigured) {
  window.addEventListener("online", () => void flushOutbox());
  setInterval(() => void flushOutbox(), 15_000);
}

/**
 * Wrap a field-scoring write: replays queue first (ordering), queues the
 * call on network failure instead of losing the score.
 */
function withOutbox<A extends unknown[]>(
  name: string,
  fn: (...args: A) => Promise<void>
): (...args: A) => Promise<void> {
  replayable.set(name, fn as unknown as (...args: never[]) => Promise<void>);
  return async (...args: A) => {
    if (readOutbox().length > 0) {
      // Preserve write order: append behind whatever is already queued
      writeOutbox([...readOutbox(), { fn: name, args }]);
      void flushOutbox();
      return;
    }
    try {
      await fn(...args);
      emitUpdated();
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      writeOutbox([...readOutbox(), { fn: name, args }]);
    }
  };
}

// ─── Competition (season) management ───────────────────────

export async function fetchCompetitions(): Promise<CompetitionMeta[]> {
  await ensureSeeded();
  const activeId = await getActiveId();
  const { data, error } = await sb()
    .from("v2_competitions")
    .select("id, status, name, year, v2_competitors(count)")
    .order("year", { ascending: false });
  fail(error);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    year: r.year as number,
    status: r.status as CompetitionStatus,
    competitorCount: (r.v2_competitors as unknown as { count: number }[])[0]?.count ?? 0,
    isActive: r.id === activeId,
  }));
}

export async function fetchActiveCompetition(): Promise<CompetitionMeta> {
  const all = await fetchCompetitions();
  return all.find((c) => c.isActive) ?? all[0];
}

export async function createCompetition(opts: { name: string; year: number }): Promise<void> {
  const activeId = await getActiveId();
  const { data: prev, error } = await sb()
    .from("v2_competitions")
    .select("*")
    .eq("id", activeId)
    .single();
  fail(error);
  const prevRow = prev as CompetitionRow;
  fail((await sb().from("v2_competitions").update({ status: "completed" }).eq("id", activeId)).error);
  let id = `season-${opts.year}`;
  const { data: clash } = await sb().from("v2_competitions").select("id").like("id", `season-${opts.year}%`);
  const taken = new Set((clash ?? []).map((r) => r.id as string));
  let n = 2;
  while (taken.has(id)) id = `season-${opts.year}-${n++}`;
  fail(
    (
      await sb().from("v2_competitions").insert(
        settingsToCompetitionRow(id, "active", {
          competitionName: opts.name,
          year: opts.year,
          scorerPin: prevRow.scorer_pin,
          mentorsEnabled: prevRow.mentors_enabled,
          titleTiebreakWinners: {},
        })
      )
    ).error
  );
  fail((await sb().from("v2_app_state").update({ active_competition_id: id }).eq("id", 1)).error);
  activeIdCache = null;
  emitUpdated();
}

export async function activateCompetition(id: string): Promise<void> {
  fail((await sb().from("v2_app_state").update({ active_competition_id: id }).eq("id", 1)).error);
  activeIdCache = null;
  emitUpdated();
}

export async function renameCompetition(id: string, name: string): Promise<void> {
  fail((await sb().from("v2_competitions").update({ name }).eq("id", id)).error);
  emitUpdated();
}

export async function deleteCompetition(id: string): Promise<void> {
  const all = await fetchCompetitions();
  if (all.length <= 1) throw new Error("Can't delete the only competition");
  const target = all.find((c) => c.id === id);
  if (target?.isActive) throw new Error("Can't delete the active season — switch to another season first");
  if (target?.status === "active") throw new Error("Can't delete a live season — archive it by starting a new one first");
  fail((await sb().from("v2_competitions").delete().eq("id", id)).error);
  activeIdCache = null;
  emitUpdated();
}

// ─── Reads (active competition) ────────────────────────────

export async function fetchCompetitors(): Promise<Competitor[]> {
  const id = await getActiveId();
  const { data, error } = await sb().from("v2_competitors").select("*").eq("competition_id", id).order("bib_number");
  fail(error);
  return (data ?? []).map(rowToCompetitor);
}

export async function fetchScores(): Promise<AttemptScore[]> {
  const id = await getActiveId();
  const { data, error } = await sb().from("v2_scores").select("*").eq("competition_id", id);
  fail(error);
  return (data ?? []).map(rowToScore);
}

export async function fetchKegAttempts(): Promise<KegAttempt[]> {
  const id = await getActiveId();
  const { data, error } = await sb().from("v2_keg_attempts").select("*").eq("competition_id", id);
  fail(error);
  return (data ?? []).map(rowToKeg);
}

export async function fetchSettings(): Promise<Settings> {
  const id = await getActiveId();
  const { data, error } = await sb().from("v2_competitions").select("*").eq("id", id).single();
  fail(error);
  return rowToSettings(data as CompetitionRow);
}

// ─── Field-scoring writes (offline-queued) ─────────────────

export const saveRoundAttempts = withOutbox(
  "saveRoundAttempts",
  async (attempts: AttemptScore[], removeIds: string[] = []) => {
    if (attempts.length === 0 && removeIds.length === 0) return;
    const id = await getActiveId();
    if (removeIds.length > 0) {
      fail((await sb().from("v2_scores").delete().eq("competition_id", id).in("id", removeIds)).error);
    }
    if (attempts.length > 0) {
      fail(
        (
          await sb()
            .from("v2_scores")
            .upsert(attempts.map((a) => scoreToRow(id, { ...a, recordedAt: Date.now() })), {
              onConflict: "competition_id,id",
            })
        ).error
      );
    }
  }
);

export const deleteRoundAttempts = withOutbox(
  "deleteRoundAttempts",
  async (competitorId: string, eventId: string, round: number) => {
    const id = await getActiveId();
    fail(
      (
        await sb()
          .from("v2_scores")
          .delete()
          .eq("competition_id", id)
          .eq("competitor_id", competitorId)
          .eq("event_id", eventId)
          .eq("round", round)
      ).error
    );
  }
);

export const recordKegAttempt = withOutbox("recordKegAttempt", async (attempt: KegAttempt) => {
  const id = await getActiveId();
  fail(
    (
      await sb()
        .from("v2_keg_attempts")
        .upsert([kegToRow(id, { ...attempt, recordedAt: Date.now() })], { onConflict: "competition_id,id" })
    ).error
  );
});

export const undoLastKegAttempt = withOutbox("undoLastKegAttempt", async (competitorId: string) => {
  const id = await getActiveId();
  const { data, error } = await sb()
    .from("v2_keg_attempts")
    .select("id")
    .eq("competition_id", id)
    .eq("competitor_id", competitorId)
    .order("recorded_at", { ascending: false })
    .limit(1);
  fail(error);
  if (!data || data.length === 0) return;
  fail((await sb().from("v2_keg_attempts").delete().eq("competition_id", id).eq("id", data[0].id as string)).error);
});

export const updateCompetitor = withOutbox(
  "updateCompetitor",
  async (id: string, patch: Partial<Competitor>) => {
    const compId = await getActiveId();
    const row: Record<string, unknown> = {};
    if (patch.divisionId !== undefined) row.division_id = patch.divisionId;
    if (patch.bibNumber !== undefined) row.bib_number = patch.bibNumber;
    if (patch.firstName !== undefined) row.first_name = patch.firstName;
    if (patch.lastName !== undefined) row.last_name = patch.lastName;
    if (patch.nickname !== undefined) row.nickname = patch.nickname;
    if (patch.hometown !== undefined) row.hometown = patch.hometown;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.shirtSize !== undefined) row.shirt_size = patch.shirtSize;
    if (patch.registration !== undefined) row.registration = patch.registration;
    if (patch.paid !== undefined) row.paid = patch.paid;
    if (patch.checkedIn !== undefined) row.checked_in = patch.checkedIn;
    if (patch.noShow !== undefined) row.no_show = patch.noShow;
    if (patch.eventSkips !== undefined) row.event_skips = patch.eventSkips;
    fail((await sb().from("v2_competitors").update(row).eq("competition_id", compId).eq("id", id)).error);
  }
);

// ─── Desk writes (fail loudly — connectivity expected) ─────

export async function addCompetitors(newComps: Competitor[]): Promise<void> {
  const id = await getActiveId();
  fail((await sb().from("v2_competitors").insert(newComps.map((c) => competitorToRow(id, c)))).error);
  emitUpdated();
}

export async function deleteCompetitorScores(competitorId: string): Promise<void> {
  const id = await getActiveId();
  fail((await sb().from("v2_scores").delete().eq("competition_id", id).eq("competitor_id", competitorId)).error);
  fail((await sb().from("v2_keg_attempts").delete().eq("competition_id", id).eq("competitor_id", competitorId)).error);
  emitUpdated();
}

export async function deleteCompetitor(competitorId: string): Promise<void> {
  await deleteCompetitorScores(competitorId);
  const id = await getActiveId();
  fail((await sb().from("v2_competitors").delete().eq("competition_id", id).eq("id", competitorId)).error);
  emitUpdated();
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const id = await getActiveId();
  const row: Record<string, unknown> = {};
  if (patch.competitionName !== undefined) row.name = patch.competitionName;
  if (patch.year !== undefined) row.year = patch.year;
  if (patch.scorerPin !== undefined) row.scorer_pin = patch.scorerPin;
  if (patch.mentorsEnabled !== undefined) row.mentors_enabled = patch.mentorsEnabled;
  if (patch.titleTiebreakWinners !== undefined) row.title_tiebreak_winners = patch.titleTiebreakWinners;
  fail((await sb().from("v2_competitions").update(row).eq("id", id)).error);
  emitUpdated();
}

// ─── Dataset tools ─────────────────────────────────────────

async function replaceActiveData(data: SeasonData, keepPin: boolean): Promise<void> {
  const id = await getActiveId();
  fail((await sb().from("v2_scores").delete().eq("competition_id", id)).error);
  fail((await sb().from("v2_keg_attempts").delete().eq("competition_id", id)).error);
  fail((await sb().from("v2_competitors").delete().eq("competition_id", id)).error);
  await insertSeasonChildren(id, data);
  const patch: Partial<Settings> = { ...data.settings };
  if (keepPin) delete patch.scorerPin;
  await saveSettings(patch);
  emitUpdated();
}

export async function resetDemoData(): Promise<void> {
  const seed = buildSeed();
  await replaceActiveData(seed as SeasonData, true);
}

export async function loadSeason2025(): Promise<void> {
  await replaceActiveData(season2025Json as unknown as SeasonData, true);
}

// ─── Backup / restore ──────────────────────────────────────

interface BackupCompetition extends SeasonData {
  id: string;
  status: CompetitionStatus;
}

export async function exportBackup(): Promise<string> {
  await ensureSeeded();
  const activeId = await getActiveId();
  const { data: comps, error } = await sb().from("v2_competitions").select("*").order("year");
  fail(error);
  const competitions: BackupCompetition[] = [];
  for (const raw of comps ?? []) {
    const row = raw as CompetitionRow;
    const [c, s, k] = await Promise.all([
      sb().from("v2_competitors").select("*").eq("competition_id", row.id),
      sb().from("v2_scores").select("*").eq("competition_id", row.id),
      sb().from("v2_keg_attempts").select("*").eq("competition_id", row.id),
    ]);
    fail(c.error);
    fail(s.error);
    fail(k.error);
    competitions.push({
      id: row.id,
      status: row.status,
      settings: rowToSettings(row),
      competitors: (c.data ?? []).map(rowToCompetitor),
      scores: (s.data ?? []).map(rowToScore),
      kegAttempts: (k.data ?? []).map(rowToKeg),
    });
  }
  return JSON.stringify({ competitions, activeId }, null, 1);
}

/** Wipe every competition and rebuild from the given list. NOT transactional. */
async function wipeAndRebuild(comps: BackupCompetition[], preferredActiveId?: string): Promise<void> {
  fail((await sb().from("v2_app_state").update({ active_competition_id: null }).eq("id", 1)).error);
  fail((await sb().from("v2_competitions").delete().neq("id", "")).error); // cascade-deletes children
  for (const c of comps) {
    fail(
      (
        await sb()
          .from("v2_competitions")
          .insert(settingsToCompetitionRow(c.id, c.status === "active" ? "active" : "completed", {
            ...c.settings,
            mentorsEnabled: c.settings.mentorsEnabled ?? true,
          }))
      ).error
    );
    await insertSeasonChildren(c.id, c);
  }
  const activeId = comps.some((c) => c.id === preferredActiveId)
    ? preferredActiveId!
    : comps[comps.length - 1].id;
  fail((await sb().from("v2_app_state").update({ active_competition_id: activeId }).eq("id", 1)).error);
}

export async function importBackup(raw: string): Promise<{ competitions: number }> {
  let parsed: { competitions?: BackupCompetition[]; activeId?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const comps = parsed.competitions;
  if (!Array.isArray(comps) || comps.length === 0) {
    throw new Error("No competitions found — is this a Ledge Games backup file?");
  }
  for (const c of comps) {
    if (
      !c ||
      typeof c.id !== "string" ||
      typeof c.settings?.competitionName !== "string" ||
      !Array.isArray(c.competitors) ||
      !Array.isArray(c.scores) ||
      !Array.isArray(c.kegAttempts)
    ) {
      throw new Error("Backup format not recognized — a season record is malformed.");
    }
  }
  // Snapshot-first: the wipe+rebuild isn't transactional, so hold the current
  // database in memory and roll back to it if the restore fails partway
  const snapshot = JSON.parse(await exportBackup()) as {
    competitions: BackupCompetition[];
    activeId?: string;
  };
  try {
    await wipeAndRebuild(comps, parsed.activeId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let rolledBack = false;
    try {
      await wipeAndRebuild(snapshot.competitions, snapshot.activeId);
      rolledBack = true;
    } catch {
      // keep the original error — the admin also holds the pre-restore download
    }
    activeIdCache = null;
    emitUpdated();
    throw new Error(
      rolledBack
        ? `Restore failed — the previous data was put back. (${msg})`
        : `Restore failed AND rollback failed — recover using the pre-restore snapshot file. (${msg})`
    );
  }
  activeIdCache = null;
  emitUpdated();
  return { competitions: comps.length };
}

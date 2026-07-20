// Local persistence adapter — the "backend" until Supabase lands (Phase 2).
//
// Data model: a list of competitions (seasons), exactly one of which is
// "active" and is what every read/write below operates on. Past seasons stay
// archived and browsable by switching the active competition. This maps 1:1
// onto the future Supabase schema (competitions table + competition_id FKs).
//
// Everything goes through async functions returning Promises so the calling
// code (TanStack Query hooks) is already shaped for a real backend: swapping
// this file for Supabase queries should not touch any component.

import type { AttemptScore, Competitor, KegAttempt, Settings } from "@/lib/types";
import { buildSeed } from "./seed";
import { DB_UPDATED_EVENT } from "./db-events";
import season2025Json from "./season-2025.json";

const STORAGE_KEY = "tlg:v4";
const LEGACY_V3_KEY = "tlg:v3";

export type CompetitionStatus = "active" | "completed";

export interface CompetitionRecord {
  id: string;
  status: CompetitionStatus;
  competitors: Competitor[];
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
  settings: Settings;
}

export interface CompetitionMeta {
  id: string;
  name: string;
  year: number;
  status: CompetitionStatus;
  competitorCount: number;
  isActive: boolean;
}

interface DbShape {
  competitions: CompetitionRecord[];
  activeId: string;
}

interface LegacyV3Shape {
  competitors: Competitor[];
  scores: AttemptScore[];
  kegAttempts: KegAttempt[];
  settings: Settings;
}

let cache: DbShape | null = null;

/** Fill in fields added after a dataset was stored/exported. */
function migrate(db: DbShape): DbShape {
  for (const c of db.competitions) c.settings.mentorsEnabled ??= true;
  if (!db.competitions.some((c) => c.id === db.activeId) && db.competitions.length > 0) {
    db.activeId = db.competitions[db.competitions.length - 1].id;
  }
  return db;
}

function competitionId(year: number, existing: CompetitionRecord[]): string {
  let id = `season-${year}`;
  let n = 2;
  while (existing.some((c) => c.id === id)) id = `season-${year}-${n++}`;
  return id;
}

function season2025Record(): CompetitionRecord {
  const data = structuredClone(season2025Json) as unknown as LegacyV3Shape;
  return {
    id: "season-2025",
    // Historical data is an archive, never presented as a live competition
    status: "completed",
    competitors: data.competitors,
    scores: data.scores,
    kegAttempts: data.kegAttempts,
    settings: { ...data.settings, mentorsEnabled: true },
  };
}

function load(): DbShape {
  if (cache) return cache;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      cache = migrate(JSON.parse(raw) as DbShape);
      return cache;
    } catch {
      // Corrupted — NEVER overwrite the raw blob; stash it for manual
      // recovery before falling through to a fresh seed
      try {
        localStorage.setItem(`${STORAGE_KEY}:corrupt-${Date.now()}`, raw);
      } catch {
        // storage full — nothing more we can do, but don't crash the app
      }
    }
  }
  // One-time migration from the single-competition v3 shape
  const legacy = localStorage.getItem(LEGACY_V3_KEY);
  if (legacy) {
    try {
      const old = JSON.parse(legacy) as LegacyV3Shape;
      old.settings.mentorsEnabled ??= true;
      const rec: CompetitionRecord = {
        id: `season-${old.settings.year}`,
        status: "active",
        competitors: old.competitors,
        scores: old.scores,
        kegAttempts: old.kegAttempts,
        settings: old.settings,
      };
      cache = { competitions: [rec], activeId: rec.id };
      persist();
      localStorage.removeItem(LEGACY_V3_KEY);
      return cache;
    } catch {
      // ignore and seed fresh
    }
  }
  // Fresh install: last season ships as a browsable ARCHIVE — clearly marked
  // completed, never mistakable for live data
  const archive = season2025Record();
  cache = { competitions: [archive], activeId: archive.id };
  persist();
  return cache;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  window.dispatchEvent(new Event(DB_UPDATED_EVENT));
}

// Cross-tab: another tab wrote → drop cache, notify listeners
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      window.dispatchEvent(new Event(DB_UPDATED_EVENT));
    }
  });
}

function active(): CompetitionRecord {
  const db = load();
  return db.competitions.find((c) => c.id === db.activeId) ?? db.competitions[0];
}

const resolve = <T,>(value: T): Promise<T> => Promise.resolve(structuredClone(value));

// ─── Competition (season) management ───────────────────────

export async function fetchCompetitions(): Promise<CompetitionMeta[]> {
  const db = load();
  return db.competitions
    .map((c) => ({
      id: c.id,
      name: c.settings.competitionName,
      year: c.settings.year,
      status: c.status,
      competitorCount: c.competitors.length,
      isActive: c.id === db.activeId,
    }))
    .sort((a, b) => b.year - a.year);
}

export async function fetchActiveCompetition(): Promise<CompetitionMeta> {
  const db = load();
  const a = active();
  return {
    id: a.id,
    name: a.settings.competitionName,
    year: a.settings.year,
    status: a.status,
    competitorCount: a.competitors.length,
    isActive: a.id === db.activeId,
  };
}

/** Start a new season: archives the current active competition. */
export async function createCompetition(opts: { name: string; year: number }): Promise<void> {
  const db = load();
  const prev = active();
  prev.status = "completed";
  const rec: CompetitionRecord = {
    id: competitionId(opts.year, db.competitions),
    status: "active",
    competitors: [],
    scores: [],
    kegAttempts: [],
    settings: {
      competitionName: opts.name,
      year: opts.year,
      scorerPin: prev.settings.scorerPin,
      mentorsEnabled: prev.settings.mentorsEnabled,
    },
  };
  db.competitions.push(rec);
  db.activeId = rec.id;
  persist();
}

/** Rename any competition (active or archived). */
export async function renameCompetition(id: string, name: string): Promise<void> {
  const db = load();
  const comp = db.competitions.find((c) => c.id === id);
  if (!comp) throw new Error(`Unknown competition: ${id}`);
  comp.settings.competitionName = name;
  persist();
}

/** Switch which competition the whole app is looking at. */
export async function activateCompetition(id: string): Promise<void> {
  const db = load();
  if (!db.competitions.some((c) => c.id === id)) throw new Error(`Unknown competition: ${id}`);
  db.activeId = id;
  persist();
}

export async function deleteCompetition(id: string): Promise<void> {
  const db = load();
  if (db.competitions.length <= 1) throw new Error("Can't delete the only competition");
  if (db.activeId === id) throw new Error("Can't delete the active season — switch to another season first");
  const target = db.competitions.find((c) => c.id === id);
  if (target?.status === "active") throw new Error("Can't delete a live season — archive it by starting a new one first");
  db.competitions = db.competitions.filter((c) => c.id !== id);
  persist();
}

// ─── Reads (active competition) ────────────────────────────

export const fetchCompetitors = () => resolve(active().competitors);
export const fetchScores = () => resolve(active().scores);
export const fetchKegAttempts = () => resolve(active().kegAttempts);
export const fetchSettings = () => resolve(active().settings);

// ─── Writes (active competition) ───────────────────────────

/**
 * Upsert the given attempts and delete the explicitly removed ids. Partial
 * saves are normal on the field (set 1 recorded before set 2 is thrown).
 * Only ids the caller saw and cleared are removed — attempts recorded by
 * another device after the caller's form mounted are left alone.
 */
export async function saveRoundAttempts(
  attempts: AttemptScore[],
  removeIds: string[] = []
): Promise<void> {
  if (attempts.length === 0 && removeIds.length === 0) return;
  const comp = active();
  const recordedAt = Date.now();
  const gone = new Set([...removeIds, ...attempts.map((a) => a.id)]);
  comp.scores = comp.scores.filter((s) => !gone.has(s.id));
  comp.scores.push(...attempts.map((a) => ({ ...a, recordedAt })));
  persist();
}

/** Remove a round's attempts (scorer clearing a mistaken entry). */
export async function deleteRoundAttempts(
  competitorId: string,
  eventId: string,
  round: number
): Promise<void> {
  const comp = active();
  comp.scores = comp.scores.filter(
    (s) => !(s.competitorId === competitorId && s.eventId === eventId && s.round === round)
  );
  persist();
}

export async function recordKegAttempt(attempt: KegAttempt): Promise<void> {
  const comp = active();
  const stamped = { ...attempt, recordedAt: Date.now() };
  const i = comp.kegAttempts.findIndex((a) => a.id === attempt.id);
  if (i >= 0) comp.kegAttempts[i] = stamped;
  else comp.kegAttempts.push(stamped);
  persist();
}

/** Undo the most recent keg attempt for a competitor (fat-finger recovery). */
export async function undoLastKegAttempt(competitorId: string): Promise<void> {
  const comp = active();
  for (let i = comp.kegAttempts.length - 1; i >= 0; i--) {
    if (comp.kegAttempts[i].competitorId === competitorId) {
      comp.kegAttempts.splice(i, 1);
      break;
    }
  }
  persist();
}

export async function updateCompetitor(id: string, patch: Partial<Competitor>): Promise<void> {
  const comp = active();
  const i = comp.competitors.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`Unknown competitor: ${id}`);
  comp.competitors[i] = { ...comp.competitors[i], ...patch, id: comp.competitors[i].id };
  persist();
}

/** Add competitors (walk-ons or CSV import). Rejects duplicate bib numbers. */
export async function addCompetitors(newComps: Competitor[]): Promise<void> {
  const comp = active();
  const taken = new Set(comp.competitors.map((c) => c.bibNumber));
  for (const c of newComps) {
    if (taken.has(c.bibNumber)) throw new Error(`Bib ${c.bibNumber} is already taken`);
    taken.add(c.bibNumber);
  }
  comp.competitors.push(...structuredClone(newComps));
  comp.competitors.sort((a, b) => a.bibNumber - b.bibNumber);
  persist();
}

/** Remove every score a competitor owns (division moves invalidate them). */
export async function deleteCompetitorScores(id: string): Promise<void> {
  const comp = active();
  comp.scores = comp.scores.filter((s) => s.competitorId !== id);
  comp.kegAttempts = comp.kegAttempts.filter((a) => a.competitorId !== id);
  persist();
}

/** Remove a competitor and every score they own. */
export async function deleteCompetitor(id: string): Promise<void> {
  const comp = active();
  comp.competitors = comp.competitors.filter((c) => c.id !== id);
  comp.scores = comp.scores.filter((s) => s.competitorId !== id);
  comp.kegAttempts = comp.kegAttempts.filter((a) => a.competitorId !== id);
  persist();
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const comp = active();
  comp.settings = { ...comp.settings, ...patch };
  persist();
}

// ─── Backup / restore ──────────────────────────────────────

/** Full-database snapshot (every season + active pointer) as a JSON string. */
export async function exportBackup(): Promise<string> {
  return JSON.stringify(load(), null, 1);
}

/** Local adapter never queues writes. */
export function getPendingWrites(): number {
  return 0;
}

/** Replace EVERYTHING with a backup file's contents. Validates first. */
export async function importBackup(raw: string): Promise<{ competitions: number }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const db = parsed as DbShape;
  if (!Array.isArray(db.competitions) || db.competitions.length === 0) {
    throw new Error("No competitions found — is this a Ledge Games backup file?");
  }
  for (const c of db.competitions) {
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
  cache = migrate(structuredClone(db));
  persist();
  return { competitions: db.competitions.length };
}

// ─── Dataset tools (operate on the ACTIVE competition) ─────

/** Replace the active competition's data with the synthetic demo dataset. */
export async function resetDemoData(): Promise<void> {
  const comp = active();
  const seed = buildSeed();
  comp.competitors = seed.competitors;
  comp.scores = seed.scores;
  comp.kegAttempts = seed.kegAttempts;
  comp.settings = { ...seed.settings, scorerPin: comp.settings.scorerPin };
  persist();
}

/** Replace the active competition's data with the imported 2025 season. */
export async function loadSeason2025(): Promise<void> {
  const comp = active();
  const season = season2025Record();
  comp.competitors = season.competitors;
  comp.scores = season.scores;
  comp.kegAttempts = season.kegAttempts;
  comp.settings = { ...season.settings, scorerPin: comp.settings.scorerPin };
  persist();
}

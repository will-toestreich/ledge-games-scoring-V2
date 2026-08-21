// Data-layer facade: Supabase when configured (VITE_SUPABASE_* env vars),
// localStorage otherwise (offline dev / demo). Both adapters expose the
// identical API, so everything above this file is adapter-agnostic.

import * as local from "./db-local";
import * as cloud from "./db-supabase";

export { DB_UPDATED_EVENT, OUTBOX_UPDATED_EVENT } from "./db-events";
export type { CompetitionMeta, CompetitionStatus, DbStatus } from "./db-local";

/** True when the app is running against Supabase. */
export const usingCloud = cloud.isConfigured;

const impl = cloud.isConfigured ? cloud : local;

export const fetchCompetitions = impl.fetchCompetitions;
export const fetchActiveCompetition = impl.fetchActiveCompetition;
export const createCompetition = impl.createCompetition;
export const activateCompetition = impl.activateCompetition;
export const renameCompetition = impl.renameCompetition;
export const deleteCompetition = impl.deleteCompetition;

export const fetchCompetitors = impl.fetchCompetitors;
export const fetchScores = impl.fetchScores;
export const fetchKegAttempts = impl.fetchKegAttempts;
export const fetchSettings = impl.fetchSettings;

export const saveRoundAttempts = impl.saveRoundAttempts;
export const deleteRoundAttempts = impl.deleteRoundAttempts;
export const recordKegAttempt = impl.recordKegAttempt;
export const undoLastKegAttempt = impl.undoLastKegAttempt;
export const updateCompetitor = impl.updateCompetitor;
export const addCompetitors = impl.addCompetitors;
export const deleteCompetitorScores = impl.deleteCompetitorScores;
export const deleteCompetitor = impl.deleteCompetitor;
export const saveSettings = impl.saveSettings;

export const pingDatabase = impl.pingDatabase;
export const resetDemoData = impl.resetDemoData;
export const loadSeason2025 = impl.loadSeason2025;
export const exportBackup = impl.exportBackup;
export const importBackup = impl.importBackup;
export const getPendingWrites = impl.getPendingWrites;

// Scorer session: PIN checked once per browser session, held in
// sessionStorage so deep links and page reloads stay unlocked but a closed
// tab re-locks. Real auth arrives with the backend phase.

const KEY = "tlg-scorer-ok";

export function isScorerAuthed(): boolean {
  return sessionStorage.getItem(KEY) === "1";
}

export function markScorerAuthed(): void {
  sessionStorage.setItem(KEY, "1");
}

export function clearScorerAuth(): void {
  sessionStorage.removeItem(KEY);
}

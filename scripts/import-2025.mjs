// One-off importer: converts the 2025 Google Sheets exports (scripts/data-2025/*.csv)
// into src/data/season-2025.json in the app's native schema.
//
// Column layouts were reverse-engineered from the 2025 scoring sheet:
//  - rounds events: [name, bib, ...round columns..., TOTAL, ranks...]
//  - the "RD 3 Final (W)" / "RD 4 Final (M)" columns were used loosely on the
//    day — women's and mentors' finals sometimes landed in the RD 4 column —
//    so non-men divisions take the first non-empty of the late columns.
//  - value 1000 is the sheet's DNF/no-show sentinel → imported as "no score".
//  - keg: one column per bar height (10–25); 1 = clear, 0 = fail, X = pass.
//
// Run: node scripts/import-2025.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => join(here, "data-2025", f);

// Minimal CSV parser (handles quoted fields with commas)
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s) => {
  const t = (s ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n >= 999) return null; // 1000 = DNF sentinel
  return n;
};

const divisionForBib = (bib) => (bib <= 90 ? "mens" : bib <= 100 ? "mentors" : "womens");

// ─── Roster ────────────────────────────────────────────────

const shirtMap = {
  "Shirt - Small": "S", "Shirt - Medium": "M", "Shirt - M": "M",
  "Shirt - Large": "L", "Shirt - XL": "XL", "Shirt - XXL": "2XL",
  "Shirt - XXXL": "3XL",
};

const rosterRows = parseCsv(readFileSync(src("roster.csv"), "utf8"));
const competitorsByBib = new Map();

for (const row of rosterRows.slice(1)) {
  const bib = Number(row[0]);
  const name = (row[1] ?? "").trim().replace(/\s+/g, " ");
  if (!bib || !name || name === "#N/A") continue;
  if (competitorsByBib.has(bib)) continue; // roster has a duplicate summary table below the real one
  const [firstName, ...rest] = name.split(" ");
  const registrationRaw = (row[5] ?? "").trim();
  const registration = registrationRaw === "PAID" ? "paid"
    : registrationRaw.includes("Cash") ? "cash"
    : registrationRaw.toLowerCase().includes("sponsor") ? "sponsor"
    : null;
  competitorsByBib.set(bib, {
    id: `b${bib}`,
    divisionId: divisionForBib(bib),
    bibNumber: bib,
    firstName,
    lastName: rest.join(" "),
    nickname: (row[8] ?? "").trim() || null,
    hometown: (row[9] ?? "").trim() || null,
    email: (row[3] ?? "").trim() || null,
    shirtSize: shirtMap[(row[4] ?? "").trim()] ?? null,
    registration,
    paid: registration !== null,
    checkedIn: false, // set true below if they have any score
    noShow: false, // set true below if they have none
    eventSkips: [],
  });
}

// Some competitors only exist in the scoring tabs (walk-ons) — collect names there
function ensureCompetitor(bib, name) {
  if (!bib || competitorsByBib.has(bib)) return;
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return;
  const [firstName, ...rest] = clean.split(" ");
  competitorsByBib.set(bib, {
    id: `b${bib}`,
    divisionId: divisionForBib(bib),
    bibNumber: bib,
    firstName,
    lastName: rest.join(" "),
    nickname: null, hometown: null, email: null, shirtSize: null,
    registration: "cash", paid: true, checkedIn: false, noShow: false,
    eventSkips: [],
  });
}

// ─── Rounds events ─────────────────────────────────────────

const scores = [];
const scored = new Set(); // competitor ids with any score

function push(bib, eventId, round, attempt, value) {
  if (value === null) return;
  const id = `b${bib}`;
  scores.push({
    id: `${id}:${eventId}:r${round}:a${attempt}`,
    competitorId: id, eventId, round, attempt, value, penalty: 0,
  });
  scored.add(id);
}

/**
 * colPlan maps division → array of rounds, each round = array of column
 * indexes for its attempts. `latePick` marks rounds whose value should be the
 * first non-empty among the listed columns (the loosely-used finals columns).
 */
function importRoundsEvent(file, eventId, colPlan) {
  const rows = parseCsv(readFileSync(src(file), "utf8"));
  for (const row of rows) {
    const bib = Number((row[1] ?? "").trim());
    if (!bib || !(row[0] ?? "").trim()) continue;
    ensureCompetitor(bib, row[0]);
    const plan = colPlan[divisionForBib(bib)];
    if (!plan) continue; // division doesn't compete in this event
    plan.forEach((round, rIdx) => {
      if (round.firstNonEmpty) {
        for (const col of round.cols) {
          const v = num(row[col]);
          if (v !== null) { push(bib, eventId, rIdx + 1, 1, v); break; }
        }
      } else {
        round.cols.forEach((col, aIdx) => push(bib, eventId, rIdx + 1, aIdx + 1, num(row[col])));
      }
    });
  }
}

// HAMMER: [name, bib, r1.1, r1.2, r2.1, r2.2, rd3(WFinal/M-R3), rd4(MFinal), ...]
importRoundsEvent("hammer.csv", "hammer", {
  mens: [{ cols: [2, 3] }, { cols: [4, 5] }, { cols: [6] }, { cols: [7] }],
  womens: [{ cols: [2, 3] }, { cols: [4, 5] }, { cols: [6, 7], firstNonEmpty: true }],
  mentors: [{ cols: [2, 3] }, { cols: [4, 5] }, { cols: [6, 7], firstNonEmpty: true }],
});

// SPEED CHOP: [name, bib, rd1, rd2, rd3(WFinal/M-R3), final(M), ...]
importRoundsEvent("chop.csv", "chop", {
  mens: [{ cols: [2] }, { cols: [3] }, { cols: [4] }, { cols: [5] }],
  womens: [{ cols: [2] }, { cols: [3] }, { cols: [4, 5], firstNonEmpty: true }],
  mentors: [{ cols: [2] }, { cols: [3] }, { cols: [4, 5], firstNonEmpty: true }],
});

// ARCHERY: [name, bib, rd1, rd2, rd3(WFinal), rd4(MFinal), ...]
importRoundsEvent("archery.csv", "archery", {
  mens: [{ cols: [2] }, { cols: [3] }, { cols: [4] }, { cols: [5] }],
  womens: [{ cols: [2] }, { cols: [3] }, { cols: [4, 5], firstNonEmpty: true }],
  mentors: [{ cols: [2] }, { cols: [3] }, { cols: [4, 5], firstNonEmpty: true }],
});

// AXE: [name, bib, r1.1, r1.2, r2.1, r2.2, r3.1(WFinal 5axes), r3.2, rd4(MFinal), ...]
importRoundsEvent("axe.csv", "axe", {
  mens: [{ cols: [2, 3] }, { cols: [4, 5] }, { cols: [6, 7] }, { cols: [8] }],
  womens: [{ cols: [2, 3] }, { cols: [4, 5] }, { cols: [6, 8], firstNonEmpty: true }],
  mentors: [{ cols: [2, 3] }, { cols: [4, 5] }, { cols: [6, 7] }],
});

// CABER: [name, bib, r1.1, r1.2, r2.1, r2.2, r3.1, r3.2, rd4, rd5, ...]
// 2025 ran 3 paired rounds + single-flip finals columns (rd4/rd5 = finals flips)
importRoundsEvent("caber.csv", "caber", {
  mens: [{ cols: [2, 3] }, { cols: [4, 5] }, { cols: [6, 7] }, { cols: [8, 9] }],
  womens: [{ cols: [2, 3] }, { cols: [4, 5] }, { cols: [6, 7] }],
  // mentors don't do caber
});

// ─── Keg ladder ────────────────────────────────────────────

const kegAttempts = [];
{
  const rows = parseCsv(readFileSync(src("keg.csv"), "utf8"));
  const HEIGHT_COLS = { 2: 10, 3: 11, 4: 12, 5: 13, 6: 14, 7: 15, 8: 16, 9: 17, 10: 18, 11: 19, 12: 20, 13: 21, 14: 22, 15: 23, 16: 24, 17: 25 };
  for (const row of rows) {
    const bib = Number((row[1] ?? "").trim());
    if (!bib || !(row[0] ?? "").trim()) continue;
    if (divisionForBib(bib) === "mentors") continue; // mentors don't do keg
    ensureCompetitor(bib, row[0]);
    const id = `b${bib}`;
    let sawFail = false;
    for (const [col, height] of Object.entries(HEIGHT_COLS)) {
      const cell = (row[col] ?? "").trim().toUpperCase();
      if (cell === "") continue;
      if (sawFail) break; // trailing zeros after elimination are sheet filler
      if (cell === "1") {
        kegAttempts.push({ id: `${id}:keg:h${height}:a1`, competitorId: id, heightFt: height, attempt: 1, result: "clear" });
        scored.add(id);
      } else if (cell === "X") {
        kegAttempts.push({ id: `${id}:keg:h${height}:a1`, competitorId: id, heightFt: height, attempt: 1, result: "pass" });
        scored.add(id);
      } else if (cell === "0") {
        kegAttempts.push({ id: `${id}:keg:h${height}:a1`, competitorId: id, heightFt: height, attempt: 1, result: "miss" });
        kegAttempts.push({ id: `${id}:keg:h${height}:a2`, competitorId: id, heightFt: height, attempt: 2, result: "miss" });
        scored.add(id);
        sawFail = true;
      }
    }
  }
}

// ─── Finalize ──────────────────────────────────────────────

const competitors = [...competitorsByBib.values()].sort((a, b) => a.bibNumber - b.bibNumber);
for (const c of competitors) {
  if (scored.has(c.id)) c.checkedIn = true;
  else c.noShow = true; // registered but never scored anywhere in 2025
}

const out = {
  competitors,
  scores,
  kegAttempts,
  settings: { competitionName: "The Ledge Games", year: 2025, scorerPin: "1234", mentorsEnabled: true },
};

writeFileSync(join(here, "../src/data/season-2025.json"), JSON.stringify(out, null, 1));

console.log(`competitors: ${competitors.length} (${competitors.filter((c) => !c.noShow).length} active, ${competitors.filter((c) => c.noShow).length} no-show)`);
for (const d of ["mens", "womens", "mentors"]) {
  console.log(`  ${d}: ${competitors.filter((c) => c.divisionId === d && !c.noShow).length} active`);
}
console.log(`attempt scores: ${scores.length}`);
for (const e of ["hammer", "chop", "archery", "axe", "caber"]) {
  console.log(`  ${e}: ${scores.filter((s) => s.eventId === e).length}`);
}
console.log(`keg attempts: ${kegAttempts.length}`);

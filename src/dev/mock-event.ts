// Dev-only live mock event — replays a full competition day through the real
// data layer with human pacing so you can WATCH the app react: registration
// filling in, round-1 scores rolling across every event at once, stragglers
// getting chased, cuts locking, the keg ladder climbing, finals, and a title
// tie left for you to resolve in Mission Control.
//
// Start it by opening any page with ?mockevent in the URL (dev server only),
// or by calling runMockEvent() in the console. Stop with stopMockEvent().
// Best view: /admin (Mission Control) in this tab, /scoreboard in a second.
//
// It archives the current active season and creates a fresh mock season —
// same as starting a new year — so existing data is kept, never overwritten.

import * as db from "@/data/db";
import { computeEventResults, divisionField } from "@/lib/scoring";
import { getDivision, getEvent } from "@/data/competition-config";
import { newCompetitorId } from "@/lib/roster";
import type { AttemptScore, Competitor, DivisionId, EventId } from "@/lib/types";

let running = false;
let aborted = false;

export function stopMockEvent() {
  aborted = true;
}

const sleep = (ms: number) =>
  new Promise<void>((res, rej) =>
    setTimeout(() => (aborted ? rej(new Error("mock event stopped")) : res()), ms)
  );
const jitter = (ms: number) => ms * (0.6 + Math.random() * 0.8);
const say = (msg: string) => console.info(`%c🪓 ${msg}`, "color:#cc4444;font-weight:bold");

// ─── Roster ────────────────────────────────────────────────
const FIRST = {
  mens: ["Jake", "Hank", "Cole", "Wyatt", "Travis", "Cody", "Brett", "Grant", "Shane", "Kyle", "Derek", "Chase", "Blake", "Drew", "Nate", "Luke", "Trent", "Mason", "Hunter", "Colton", "Gavin", "Brock", "Levi", "Tanner", "Clay", "Wade", "Reid", "Zach", "Quinn", "Dean", "Kirk", "Troy", "Mitch", "Kent", "Beau", "Nash", "Cruz", "Dane", "Knox", "Gage", "Wes", "Finn", "Axel", "Boone", "Cal", "Rex", "Ace", "Russ"],
  womens: ["Brooke", "Sierra", "Dana", "Jess", "Kara", "Leah", "Paige", "Shay", "Tori", "Val", "Erin", "Dawn", "Faith", "Jade", "Kate", "Lynn", "Mia", "Nell", "Rae", "Gwen"],
  mentors: ["Big Jim", "Ironwood Ed", "Old Tom", "Sawyer Pete"],
};
const LAST = ["Birch", "Stone", "Creek", "Timber", "Ridge", "Pike", "Wolf", "Marsh", "Pine", "Hawk", "Forge", "Steele", "Grove", "Thorn", "Moss", "Vale", "Storm", "Ash", "Colt", "Drake", "Flint", "Hart", "Lake", "Reed", "Sage", "York", "Hale", "Kane", "Shaw", "Webb", "Rowe", "Dale", "Grey", "Holt", "Kirk", "Mack", "Pace", "Sims", "Tate", "Watt", "Zane", "Cain", "Egan", "Haas", "Kerr", "Lowe", "Muir", "Orr"];

function makeCompetitor(divisionId: DivisionId, bib: number, i: number): Competitor {
  return {
    id: newCompetitorId(bib),
    divisionId,
    bibNumber: bib,
    firstName: FIRST[divisionId][i % FIRST[divisionId].length],
    lastName: LAST[(i * 7 + bib) % LAST.length],
    nickname: null,
    hometown: Math.random() < 0.8 ? "Minocqua, WI" : null,
    email: null,
    shirtSize: ["S", "M", "L", "XL", "2XL"][Math.floor(Math.random() * 5)],
    registration: (["paid", "paid", "paid", "cash", "sponsor"] as const)[Math.floor(Math.random() * 5)],
    paid: true,
    checkedIn: false,
    noShow: false,
    eventSkips: [],
  };
}

// ─── Score generation ──────────────────────────────────────
function genAttempt(eventId: EventId, maxPer: number | undefined): { value: number; penalty: number; declined?: boolean } {
  const r = Math.random;
  switch (eventId) {
    case "caber":
      return { value: [0, 0, 6, 6, 7, 7, 8, 8, 9, 10][Math.floor(r() * 10)], penalty: 0 };
    case "archery":
      return { value: 5 + Math.floor(r() * ((maxPer ?? 25) - 4)), penalty: 0 };
    case "chop":
      return { value: Math.round((20 + r() * 60) * 10) / 10, penalty: r() < 0.07 ? 10 : 0 };
    case "hammer":
      return { value: Math.min([0, 10, 20, 20, 30, 30, 40, 50, 60][Math.floor(r() * 9)], maxPer ?? 60), penalty: 0 };
    default:
      return { value: Math.floor(r() * ((maxPer ?? 9) + 1)), penalty: 0 };
  }
}

function attemptRow(competitorId: string, eventId: EventId, round: number, attempt: number, v: { value: number; penalty: number; declined?: boolean }): AttemptScore {
  return { id: `${competitorId}:${eventId}:r${round}:a${attempt}`, competitorId, eventId, round, attempt, value: v.value, penalty: v.penalty, declined: v.declined };
}

async function view(eventId: EventId, divisionId: DivisionId) {
  const [competitors, scores, kegAttempts] = await Promise.all([
    db.fetchCompetitors(),
    db.fetchScores(),
    db.fetchKegAttempts(),
  ]);
  const division = getDivision(divisionId)!;
  const field = divisionField(divisionId, competitors);
  return { field, res: computeEventResults({ event: getEvent(eventId)!, division, field, scores, kegAttempts }) };
}

/** Build the save-thunks for one round: set 1 down the line, then set 2. */
async function roundThunks(
  eventId: EventId,
  divisionId: DivisionId,
  round: number,
  scripted?: Map<string, number[]>
): Promise<(() => Promise<void>)[]> {
  const plan = getEvent(eventId)!.divisions[divisionId]!;
  const roundPlan = plan.rounds[round - 1];
  const { res } = await view(eventId, divisionId);
  const eligible = (res.eligibleByRound[round - 1] ?? []).filter(
    (id) => !res.byCompetitor.get(id)!.roundComplete[round - 1]
  );
  const values = new Map(
    eligible.map((id) => {
      const s = scripted?.get(id);
      return [
        id,
        Array.from({ length: roundPlan.attempts }, (_, a) => {
          if (s) return { value: s[a] ?? 0, penalty: 0 };
          if (eventId === "caber" && a === 1 && Math.random() < 0.15) return { value: 0, penalty: 0, declined: true };
          return genAttempt(eventId, roundPlan.maxPerAttempt);
        }),
      ] as const;
    })
  );
  const thunks: (() => Promise<void>)[] = [];
  for (let a = 1; a <= roundPlan.attempts; a++) {
    for (const id of eligible) {
      thunks.push(() =>
        db.saveRoundAttempts(
          values.get(id)!.slice(0, a).map((v, i) => attemptRow(id, eventId, round, i + 1, v))
        )
      );
    }
  }
  return thunks;
}

/** Round-robin across queues so every event's progress bar moves together. */
async function runInterleaved(queues: (() => Promise<void>)[][], delayMs: number) {
  let active = queues.filter((q) => q.length > 0);
  while (active.length > 0) {
    for (const q of active) {
      const t = q.shift();
      if (t) {
        await t();
        await sleep(jitter(delayMs));
      }
    }
    active = queues.filter((q) => q.length > 0);
  }
}

async function kegLadder(divisionId: DivisionId, delayMs: number) {
  const { field } = await view("keg", divisionId);
  const contenders = field.filter((c) => !c.eventSkips.includes("keg"));
  let alive = contenders.map((c) => c.id);
  let height = 10;
  say(`Keg Toss (${divisionId}): bar starts at 10 ft, ${alive.length} tossing.`);
  while (alive.length > 1 && height < 22 && !aborted) {
    const next: string[] = [];
    for (const id of alive) {
      const rec = (a: number, result: "clear" | "miss" | "pass") =>
        db.recordKegAttempt({ id: `${id}:keg:h${height}:a${a}`, competitorId: id, heightFt: height, attempt: a, result });
      const pClear = Math.max(0.06, 0.95 - (height - 10) * 0.18);
      const firstClears = Math.random() < pClear;
      const secondClears = Math.random() < pClear; // fresh draw for attempt 2
      if (Math.random() < 0.04) {
        await rec(1, "pass");
        next.push(id);
      } else if (firstClears) {
        await rec(1, "clear");
        next.push(id);
      } else if (secondClears) {
        await rec(1, "miss");
        await sleep(jitter(delayMs));
        await rec(2, "clear");
        next.push(id);
      } else {
        await rec(1, "miss");
        await sleep(jitter(delayMs));
        await rec(2, "miss");
      }
      await sleep(jitter(delayMs));
    }
    alive = next;
    height += 1;
    if (alive.length > 1) {
      say(`Keg ${divisionId}: bar raised to ${height} ft — ${alive.length} still in.`);
      await sleep(800);
    }
  }
  say(`Keg ${divisionId}: decided.`);
}

export async function runMockEvent(): Promise<void> {
  if (running) {
    console.warn("Mock event already running — stopMockEvent() to abort.");
    return;
  }
  if (
    !window.confirm(
      "Run a live mock event? This archives the current active season (kept, browsable under Settings → Seasons) and creates a fresh mock season, then simulates a full day of scoring over ~3 minutes.\n\nWatch Mission Control (/admin) here and open /scoreboard in a second tab."
    )
  ) {
    return;
  }
  running = true;
  aborted = false;
  try {
    say("Morning: starting the mock season…");
    await db.createCompetition({ name: "The Ledge Games (Mock)", year: 2026 });

    // ── Registration desk ──
    const roster: Competitor[] = [
      ...Array.from({ length: 48 }, (_, i) => makeCompetitor("mens", 1 + i, i)),
      ...Array.from({ length: 20 }, (_, i) => makeCompetitor("womens", 101 + i, i)),
      ...Array.from({ length: 4 }, (_, i) => makeCompetitor("mentors", 151 + i, i)),
    ];
    say("Registration desk opens — roster importing…");
    for (let i = 0; i < roster.length; i += 8) {
      await db.addCompetitors(roster.slice(i, i + 8));
      await sleep(250);
    }
    say("Check-in underway…");
    const all = await db.fetchCompetitors();
    for (const c of all) {
      await db.updateCompetitor(c.id, { checkedIn: true });
      await sleep(30);
    }
    const mens = all.filter((c) => c.divisionId === "mens");
    say(`Bib ${mens[7].bibNumber} ${mens[7].firstName} ${mens[7].lastName} is a no-show — scratched.`);
    await db.updateCompetitor(mens[7].id, { noShow: true, checkedIn: false });
    await db.updateCompetitor(mens[3].id, { eventSkips: ["keg", "chop"] });
    await sleep(1200);

    // ── Round 1: four events running at once ──
    say("Round 1 begins — Axe, Archery, Caber, and Speed Chop lines are live.");
    const r1 = await Promise.all([
      roundThunks("axe", "mens", 1),
      roundThunks("axe", "womens", 1),
      roundThunks("archery", "mens", 1),
      roundThunks("archery", "womens", 1),
      roundThunks("caber", "mens", 1),
      roundThunks("caber", "womens", 1),
      roundThunks("chop", "mens", 1),
      roundThunks("chop", "womens", 1),
    ]);
    // Hold a few stragglers back so the chase list has someone to chase
    const stragglers = r1.map((q) => q.splice(q.length - 2, 2));
    await runInterleaved(r1, 45);
    say("Round 1 nearly done — Mission Control is chasing the stragglers…");
    await sleep(2500);
    await runInterleaved(stragglers, 300);
    say("Round 1 complete everywhere — cuts are locked. Check 'Ready to Move On'.");
    await sleep(3000);

    // ── Midday: keg ladders + hammer round 1 + mentors morning ──
    await kegLadder("mens", 35);
    await kegLadder("womens", 35);
    say("Hammer Toss opens; Mentors events underway.");
    // Mentors scripted so the day ends in a title tie (A/B split the events)
    const mentors = (await db.fetchCompetitors()).filter((c) => c.divisionId === "mentors");
    const [A, B, C, D] = mentors.map((c) => c.id);
    const script = (vals: number[][]) => new Map([[A, vals[0]], [B, vals[1]], [C, vals[2]], [D, vals[3]]]);
    const midday: (() => Promise<void>)[][] = await Promise.all([
      roundThunks("hammer", "mens", 1),
      roundThunks("hammer", "womens", 1),
      roundThunks("axe", "mentors", 1, script([[9, 9], [8, 8], [5, 5], [2, 2]])),
      roundThunks("archery", "mentors", 1, script([[24], [20], [15], [10]])),
      roundThunks("chop", "mentors", 1, script([[30], [25], [50], [70]])),
      roundThunks("hammer", "mentors", 1, script([[30, 30], [40, 40], [20, 20], [10, 10]])),
    ]);
    await runInterleaved(midday, 55);

    // ── Afternoon: later rounds, division by division ──
    say("Afternoon rounds — the fields are cut down, finals approaching.");
    const later: [EventId, DivisionId, number][] = [];
    for (const ev of ["axe", "archery", "caber", "chop", "hammer"] as EventId[]) {
      for (const div of ["mens", "womens"] as DivisionId[]) {
        const plan = getEvent(ev)!.divisions[div]!;
        for (let r = 2; r <= plan.rounds.length; r++) later.push([ev, div, r]);
      }
    }
    for (const ev of ["axe", "archery", "chop", "hammer"] as EventId[]) {
      later.push([ev, "mentors", 2], [ev, "mentors", 3]);
    }
    const mentorScripts: Partial<Record<EventId, Map<string, number[]>>> = {
      axe: script([[9, 9], [8, 8], [5, 5], [2, 2]]),
      archery: script([[24], [20], [15], [10]]),
      chop: script([[30], [25], [50], [70]]),
    };
    // Rounds must run in order per event, so process sequentially
    for (const [ev, div, r] of later) {
      if (aborted) throw new Error("stopped");
      const scripted =
        div === "mentors"
          ? ev === "hammer"
            ? r < 3
              ? script([[30, 30], [40, 40], [20, 20], [10, 10]])
              : script([[40], [60], [20], [0]])
            : mentorScripts[ev]
          : undefined;
      const q = await roundThunks(ev, div, r, scripted);
      if (q.length > 0) {
        say(`${getEvent(ev)!.name} ${div} — Round ${r} underway (${q.length} entries).`);
        await runInterleaved([q], 60);
        await sleep(600);
      }
    }

    say("That's the day! Every event is Done — except one thing…");
    await sleep(1000);
    say("🏹 The MENTORS title is TIED. Mission Control is flagging the arrow-off — run it and record the winner yourself.");
    say("Mock event finished. This season stays browsable; switch back to your real season under Settings → Seasons.");
  } catch (e) {
    if (String(e).includes("stopped")) say("Mock event stopped.");
    else throw e;
  } finally {
    running = false;
  }
}

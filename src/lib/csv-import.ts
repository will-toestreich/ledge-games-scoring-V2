// CSV roster import: header auto-detection, per-field column mapping, and
// value parsing tuned to the ordering system's export format
// ("Shirt / Hat" → "Shirt - Medium", "At Event (Cash)", "Mentor Division
// (55+ Years)", full names in one column). Pure functions — the modal drives
// them, the tests feed them the real 2025 export.

import type { Competitor, DivisionId } from "./types";
import { BIB_START, SHIRT_SIZES, newCompetitorId } from "./roster";

/** Loose matcher: "Shirt / Hat", "shirt_hat", "SHIRT-HAT" all normalize alike. */
function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Grid ──────────────────────────────────────────────────

export interface CsvGrid {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Build addressable rows from a raw parsed matrix. Ordering-system exports
 * repeat header names ("Product Form", "Product Form", …) — object-mode CSV
 * parsing silently keeps only the LAST duplicate column, so we parse as a
 * matrix and dedupe headers ourselves ("Product Form (2)"); unnamed columns
 * become "Column N". Every column stays mappable.
 */
export function gridFromMatrix(matrix: string[][]): CsvGrid {
  const rawHeaders = matrix[0] ?? [];
  const headers: string[] = [];
  const seen = new Map<string, number>();
  rawHeaders.forEach((h, i) => {
    let name = (h ?? "").trim() || `Column ${i + 1}`;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    if (n > 1) name = `${name} (${n})`;
    headers.push(name);
  });
  const rows = matrix
    .slice(1)
    .filter((r) => r.some((v) => (v ?? "").trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows };
}

/** First few distinct non-empty values under a header — mapping-UI samples. */
export function sampleValues(grid: CsvGrid, header: string, n = 3): string[] {
  const out: string[] = [];
  for (const row of grid.rows) {
    const v = row[header];
    if (v && !out.includes(v)) {
      out.push(v);
      if (out.length >= n) break;
    }
  }
  return out;
}

// ─── Column mapping ────────────────────────────────────────

export type MappingField =
  | "bib"
  | "fullName"
  | "firstName"
  | "lastName"
  | "division"
  | "nickname"
  | "hometown"
  | "email"
  | "shirtSize"
  | "registration"
  | "paid";

export interface MappingFieldDef {
  key: MappingField;
  label: string;
  required: boolean;
  /** Small reminder under the label, e.g. which export column usually holds this. */
  hint?: string;
}

export const MAPPING_FIELDS: readonly MappingFieldDef[] = [
  { key: "bib", label: "Bib #", required: true },
  { key: "fullName", label: "Full name", required: false },
  { key: "firstName", label: "First name", required: false },
  { key: "lastName", label: "Last name", required: false },
  { key: "division", label: "Division", required: true },
  { key: "nickname", label: "Nickname", required: false },
  { key: "hometown", label: "Hometown", required: false },
  { key: "email", label: "Email", required: false },
  { key: "shirtSize", label: "Shirt size", required: false },
  { key: "registration", label: "Registration", required: false, hint: "payment type: paid / cash / sponsor" },
  { key: "paid", label: "Paid (yes/no)", required: false, hint: "“Lineitem variant” in the export" },
];
/** Field → the CSV header (raw spelling) it reads from. */
export type CsvMapping = Partial<Record<MappingField, string>>;

const HEADER_ALIASES: Record<MappingField, string[]> = {
  bib: ["bib", "bibnumber", "bibno", "number"],
  fullName: ["name", "fullname", "competitor", "competitorname"],
  firstName: ["firstname", "first"],
  lastName: ["lastname", "last"],
  division: ["division", "div", "menswomensmentor", "menswomensmentors", "divisionmenswomensmentors"],
  nickname: ["nickname", "nick"],
  hometown: ["hometown", "city", "town"],
  email: ["email", "emailaddress"],
  shirtSize: ["shirtsize", "shirt", "shirthat", "size", "tshirt", "tshirtsize"],
  // NOT "paid" — a column named Paid is the collected-flag, below
  registration: ["registration", "reg", "registrationpaidcashsponsor", "payment", "paymentstatus", "financialstatus", "paymentmethod"],
  paid: ["paid", "paidyesno", "collected", "paymentcollected"],
};

/**
 * Best-guess mapping — by header name first, then verified against the
 * column's actual VALUES; every guess is overridable in the mapping UI.
 */
export function detectMapping(grid: CsvGrid): CsvMapping {
  const { headers } = grid;
  const mapping: CsvMapping = {};
  const used = new Set<string>();
  for (const field of MAPPING_FIELDS) {
    for (const alias of HEADER_ALIASES[field.key]) {
      const hit = headers.find((h) => !used.has(h) && norm(h) === alias);
      if (hit) {
        mapping[field.key] = hit;
        used.add(hit);
        break;
      }
    }
  }

  const allDivisions = (header: string) => {
    const samples = sampleValues(grid, header, 5);
    return samples.length > 0 && samples.every((v) => parseDivision(v) !== null);
  };

  // Ordering systems name the division column "Registration" — the product
  // someone buys IS their division registration. If the column claimed for
  // Registration actually holds division values, it belongs to Division.
  if (mapping.registration && !mapping.division && allDivisions(mapping.registration)) {
    mapping.division = mapping.registration;
    delete mapping.registration;
  }
  // Still no division? Look for ANY unclaimed column whose values are
  // divisions ("Lineitem name", "Product", whatever the export calls it).
  if (!mapping.division) {
    const hit = headers.find((h) => !used.has(h) && allDivisions(h));
    if (hit) {
      mapping.division = hit;
      used.add(hit);
    }
  }
  return mapping;
}

// ─── Value parsers ─────────────────────────────────────────

const DIVISION_VALUES: Record<string, DivisionId> = {
  mens: "mens", men: "mens", m: "mens", male: "mens", mensdivision: "mens",
  womens: "womens", women: "womens", w: "womens", f: "womens", female: "womens", womensdivision: "womens",
  mentors: "mentors", mentor: "mentors", mentordivision: "mentors",
  mentordivision55years: "mentors", mentordivisionyears: "mentors", "55": "mentors",
};

export function parseDivision(raw: string): DivisionId | null {
  const exact = DIVISION_VALUES[norm(raw)];
  if (exact) return exact;
  // Fuzzy fallback for product-style values ("Men's Division Registration").
  // Word boundaries matter: "payment" must not read as men's.
  const v = raw.toLowerCase();
  if (/\bwomen|\bfemale\b/.test(v)) return "womens";
  if (/\bmentor/.test(v)) return "mentors";
  if (/\bmen\b|\bmen'?s\b|\bmale\b/.test(v)) return "mens";
  return null;
}

/**
 * "Shirt - Medium" → M, "Shirt - XXXL" → 3XL, "XL" → XL;
 * "Knit Stocking Cap" (and any hat/beanie value) → Hat.
 */
export function parseShirt(raw: string): string | null {
  const n = norm(raw);
  if (n.includes("hat") || n.includes("cap") || n.includes("beanie")) return "Hat";
  let v = n.replace(/^shirt/, "");
  const words: Record<string, string> = {
    small: "S", medium: "M", med: "M", large: "L",
    xlarge: "XL", xxlarge: "2XL", xxl: "2XL", xxxl: "3XL",
  };
  v = words[v] ?? v.toUpperCase();
  return SHIRT_SIZES.includes(v) ? v : null;
}

/** Collected flag: yes/y/true/x/1/paid → true; no/n/false/0 → false; else null. */
export function parsePaid(raw: string): boolean | null {
  const v = norm(raw);
  if (["yes", "y", "true", "x", "1", "paid"].includes(v)) return true;
  if (["no", "n", "false", "0", "unpaid"].includes(v)) return false;
  return null;
}

/**
 * "PAID" / "Credit Card" → paid (money already collected online);
 * "At Event (Cash)" → cash (owed at the desk); sponsor comps → sponsor.
 */
export function parseRegistration(raw: string): Competitor["registration"] {
  const v = raw.toLowerCase();
  if (v.includes("paid") || v.includes("credit") || v.includes("card")) return "paid";
  if (v.includes("cash") || v.includes("event")) return "cash";
  if (v.includes("sponsor") || v.includes("comp")) return "sponsor";
  return null;
}

// ─── Row building ──────────────────────────────────────────

export interface ParsedRow {
  line: number;
  competitor: Competitor | null;
  errors: string[];
  /** Division cell was blank and the bib's block filled it in — shown in the preview. */
  inferredDivision?: boolean;
  raw: Record<string, string>;
}

export function buildCompetitors(
  rows: Record<string, string>[],
  mapping: CsvMapping,
  existing: Competitor[]
): ParsedRow[] {
  const takenBibs = new Set(existing.map((c) => c.bibNumber));
  const col = (row: Record<string, string>, field: MappingField): string =>
    mapping[field] !== undefined ? (row[mapping[field]!] ?? "").trim() : "";

  return rows.map((raw, i) => {
    const errors: string[] = [];

    const bibStr = col(raw, "bib");
    const bib = Number(bibStr);
    let first = col(raw, "firstName");
    let last = col(raw, "lastName");
    const full = col(raw, "fullName");
    if (!first && full) {
      const parts = full.replace(/\s+/g, " ").split(" ");
      first = parts[0];
      last = last || parts.slice(1).join(" ");
    }
    const divRaw = col(raw, "division");
    let divisionId = divRaw ? parseDivision(divRaw) : null;
    // The export sometimes leaves the division cell BLANK for a registered
    // competitor. Their bib block answers it (Men's #1+, Women's #101+,
    // Mentors #151+) — inferred only for a truly blank cell (unrecognized
    // text still rejects) and flagged in the preview. Blank rows without a
    // name (reserved bib slots) never reach this.
    let inferredDivision = false;
    if (divisionId === null && divRaw === "" && first && Number.isInteger(bib) && bib > 0) {
      divisionId = bib >= BIB_START.mentors ? "mentors" : bib >= BIB_START.womens ? "womens" : "mens";
      inferredDivision = true;
    }

    if (!bibStr || !Number.isInteger(bib) || bib <= 0) errors.push("bad bib");
    else if (takenBibs.has(bib)) errors.push(`bib ${bib} taken`);
    if (!first) errors.push("missing name");
    if (!divisionId) errors.push(divRaw ? `unknown division "${divRaw}"` : "missing division");

    if (errors.length === 0) takenBibs.add(bib);
    // Money owed at the desk only for cash-at-event (and unknown) rows:
    // online payments AND sponsor comps import as already settled. A mapped
    // Paid column overrides that default where its cell is decisive.
    const registration = parseRegistration(col(raw, "registration"));
    const paid = parsePaid(col(raw, "paid")) ?? (registration === "paid" || registration === "sponsor");
    return {
      line: i + 2, // header is line 1
      errors,
      inferredDivision: inferredDivision && errors.length === 0 ? true : undefined,
      raw,
      competitor:
        errors.length > 0
          ? null
          : {
              id: newCompetitorId(bib),
              divisionId: divisionId!,
              bibNumber: bib,
              firstName: first,
              lastName: last,
              nickname: col(raw, "nickname") || null,
              hometown: col(raw, "hometown") || null,
              email: col(raw, "email") || null,
              shirtSize: parseShirt(col(raw, "shirtSize")),
              registration: registration ?? "cash",
              paid,
              checkedIn: false,
              noShow: false,
              eventSkips: [],
            },
    };
  });
}

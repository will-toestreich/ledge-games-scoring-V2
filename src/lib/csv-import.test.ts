// CSV import against the REAL ordering-system export (the 2025 registration
// sheet), plus the pathological header shapes those exports produce.

import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import {
  buildCompetitors,
  detectMapping,
  gridFromMatrix,
  parseDivision,
  parseRegistration,
  parseShirt,
  sampleValues,
} from "./csv-import";
import { SHIRT_SIZES } from "./roster";

describe("csv import (ordering-system export)", () => {
  const raw = readFileSync("scripts/data-2025/roster.csv", "utf8");
  const parsed = Papa.parse<string[]>(raw, { skipEmptyLines: "greedy" });
  const grid = gridFromMatrix(parsed.data as string[][]);
  const mapping = detectMapping(grid.headers);

  it("auto-detects the ordering system's headers", () => {
    expect(mapping.bib).toBe("Bib");
    expect(mapping.fullName).toBe("Name");
    expect(mapping.division).toBe("Mens / Womens / Mentor");
    expect(mapping.shirtSize).toBe("Shirt / Hat"); // previously dropped silently
    expect(mapping.registration).toBe("Registration");
    expect(mapping.nickname).toBe("Nickname");
    expect(mapping.hometown).toBe("Hometown");
    expect(mapping.email).toBe("Email");
  });

  it("imports the real 2025 export end to end", () => {
    const rows = buildCompetitors(grid.rows, mapping, []);
    const valid = rows.filter((r) => r.competitor !== null);
    expect(valid.length).toBeGreaterThan(100);

    // Reserved bib slots (bib, no name) reject; real people with a BLANK
    // division cell import with the division inferred from their bib block
    expect(rows.some((r) => r.errors.includes("missing name"))).toBe(true);
    const inferred = valid.filter((r) => r.inferredDivision);
    expect(inferred.length).toBeGreaterThan(5);
    for (const r of inferred) expect(r.competitor!.divisionId).toBeDefined();

    // "Mentor Division (55+ Years)" resolves (digits used to be stripped
    // from the normalizer, so this NEVER matched before)
    expect(valid.some((r) => r.competitor!.divisionId === "mentors")).toBe(true);

    // "Shirt - Medium" style values normalize into real sizes; merch that
    // isn't a shirt (Knit Stocking Cap) imports as no shirt, not garbage
    const shirts = valid.map((r) => r.competitor!.shirtSize).filter((s): s is string => s !== null);
    expect(shirts.length).toBeGreaterThan(50);
    for (const s of new Set(shirts)) expect(SHIRT_SIZES).toContain(s);

    // Registration: PAID → paid; "At Event (Cash)" → cash, not yet collected
    const paid = valid.find((r) => r.raw["Registration"] === "PAID")!;
    expect(paid.competitor!.registration).toBe("paid");
    expect(paid.competitor!.paid).toBe(true);
    const cash = valid.find((r) => r.raw["Registration"] === "At Event (Cash)")!;
    expect(cash.competitor!.registration).toBe("cash");
    expect(cash.competitor!.paid).toBe(false);

    // Full names split; day-state starts clean
    for (const r of valid) {
      expect(r.competitor!.firstName).not.toBe("");
      expect(r.competitor!.checkedIn).toBe(false);
      expect(r.competitor!.noShow).toBe(false);
    }
  });

  it("normalizes the export's value formats", () => {
    expect(parseShirt("Shirt - Medium")).toBe("M");
    expect(parseShirt("Shirt - M")).toBe("M");
    expect(parseShirt("Shirt - XXXL")).toBe("3XL");
    expect(parseShirt("Knit Stocking Cap")).toBe("Hat");
    expect(parseShirt("Beanie")).toBe("Hat");
    expect(parseShirt("XL")).toBe("XL");
    expect(parseShirt("")).toBeNull();
    expect(parseDivision("Mentor Division (55+ Years)")).toBe("mentors");
    expect(parseDivision("Men's Division")).toBe("mens");
    expect(parseDivision("Women's Division")).toBe("womens");
    expect(parseRegistration("At Event (Cash)")).toBe("cash"); // → paid: false
    expect(parseRegistration("PAID")).toBe("paid");
    expect(parseRegistration("Credit Card")).toBe("paid"); // → paid: true
    expect(parseRegistration("")).toBeNull();
  });

  it("duplicate and unnamed headers stay individually mappable", () => {
    const g = gridFromMatrix([
      ["Product Form", "Product Form", "", "Lineitem variant"],
      ["Zack Todd", "Men's Division", "14", "Shirt - XL"],
    ]);
    expect(g.headers).toEqual(["Product Form", "Product Form (2)", "Column 3", "Lineitem variant"]);
    expect(sampleValues(g, "Product Form (2)")).toEqual(["Men's Division"]);

    const rows = buildCompetitors(
      g.rows,
      { fullName: "Product Form", division: "Product Form (2)", bib: "Column 3", shirtSize: "Lineitem variant" },
      []
    );
    expect(rows[0].competitor).toMatchObject({
      firstName: "Zack",
      lastName: "Todd",
      divisionId: "mens",
      bibNumber: 14,
      shirtSize: "XL",
    });
  });

  it("rejects bad rows with named reasons; taken bibs are caught", () => {
    const g = gridFromMatrix([
      ["Bib", "Name", "Division"],
      ["", "No Bib", "Men's Division"],
      ["7", "", "Men's Division"],
      ["8", "Bad Division", "Kids"],
      ["9", "Dupe Bib", "Men's Division"],
      ["9", "Dupe Bib Two", "Men's Division"],
    ]);
    const rows = buildCompetitors(g.rows, detectMapping(g.headers), []);
    expect(rows.map((r) => r.errors[0] ?? "ok")).toEqual([
      "bad bib",
      "missing name",
      'unknown division "Kids"', // explicit junk is NOT inferred over
      "ok",
      "bib 9 taken",
    ]);
  });

  it("payment collection status follows registration type", () => {
    const g = gridFromMatrix([
      ["Bib", "Name", "Division", "Registration"],
      ["1", "Online Payer", "Men's Division", "PAID"],
      ["2", "Card Payer", "Men's Division", "Credit Card"],
      ["3", "Cash At Desk", "Men's Division", "At Event (Cash)"],
      ["4", "Comped", "Men's Division", "Sponsor"],
      ["5", "No Info", "Men's Division", ""],
    ]);
    const rows = buildCompetitors(g.rows, detectMapping(g.headers), []);
    expect(rows.map((r) => [r.competitor!.registration, r.competitor!.paid])).toEqual([
      ["paid", true],
      ["paid", true],
      ["cash", false],
      ["sponsor", true],
      ["cash", false],
    ]);
  });

  it("blank division infers from the bib block, flagged", () => {
    const g = gridFromMatrix([
      ["Bib", "Name", "Division"],
      ["62", "Chris Goldbach", ""],
      ["117", "Blank Div Woman", ""],
      ["152", "Blank Div Mentor", ""],
    ]);
    const rows = buildCompetitors(g.rows, detectMapping(g.headers), []);
    expect(rows.map((r) => r.competitor?.divisionId)).toEqual(["mens", "womens", "mentors"]);
    expect(rows.every((r) => r.inferredDivision)).toBe(true);
  });
});

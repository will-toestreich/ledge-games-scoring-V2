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
  parsePaid,
  parseShirt,
  sampleValues,
} from "./csv-import";
import { SHIRT_SIZES } from "./roster";

describe("csv import (ordering-system export)", () => {
  const raw = readFileSync("scripts/data-2025/roster.csv", "utf8");
  const parsed = Papa.parse<string[]>(raw, { skipEmptyLines: "greedy" });
  const grid = gridFromMatrix(parsed.data as string[][]);
  const mapping = detectMapping(grid);

  it("auto-detects the ordering system's headers", () => {
    expect(mapping.bib).toBe("Bib");
    expect(mapping.fullName).toBe("Name");
    expect(mapping.division).toBe("Mens / Womens / Mentor");
    expect(mapping.shirtSize).toBe("Shirt / Hat"); // previously dropped silently
    expect(mapping.nickname).toBe("Nickname");
    expect(mapping.hometown).toBe("Hometown");
    expect(mapping.email).toBe("Email");
  });

  it("imports the real 2025 export end to end", () => {
    // The 2025 sheet's "Registration" column holds payment types — map it
    // to Paid, which understands them
    const rows = buildCompetitors(grid.rows, { ...mapping, paid: "Registration" }, []);
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

    // Payment types resolve to the collected flag: PAID → yes; cash → owed
    const paid = valid.find((r) => r.raw["Registration"] === "PAID")!;
    expect(paid.competitor!.paid).toBe(true);
    const cash = valid.find((r) => r.raw["Registration"] === "At Event (Cash)")!;
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
    // parsePaid speaks yes/no, payment types, and amounts (Lineitem price)
    expect(parsePaid("yes")).toBe(true);
    expect(parsePaid("No")).toBe(false);
    expect(parsePaid("PAID")).toBe(true);
    expect(parsePaid("Credit Card")).toBe(true);
    expect(parsePaid("Sponsor")).toBe(true);
    expect(parsePaid("At Event (Cash)")).toBe(false);
    expect(parsePaid("40")).toBe(true);
    expect(parsePaid("$75.00")).toBe(true);
    expect(parsePaid("0")).toBe(false);
    expect(parsePaid("")).toBeNull();
    expect(parsePaid("maybe")).toBeNull();
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
    const rows = buildCompetitors(g.rows, detectMapping(g), []);
    expect(rows.map((r) => r.errors[0] ?? "ok")).toEqual([
      "bad bib",
      "missing name",
      'unknown division "Kids"', // explicit junk is NOT inferred over
      "ok",
      "bib 9 taken",
    ]);
  });

  it("the ordering system's real export headers auto-map completely", () => {
    // Exactly the header set from the live orders.csv export
    const g = gridFromMatrix([
      [
        "Bib", "Product Form: Competitor Name", "Product Form: Select Your Division",
        "Product Form: Nickname", "Product Form: Hometown", "Email",
        "Product Form: Shirt Size / Stocking Cap", "Lineitem price",
      ],
      ["2", "Elliot Lewis", "Men's Division", "Craig", "Milwaukee, WI", "e@example.com", "Shirt - Large", "40"],
      ["3", "Marvin Ingram", "Women's Division", "", "West bend wi", "", "Knit Stocking Cap", "0"],
    ]);
    const m = detectMapping(g);
    expect(m.bib).toBe("Bib");
    expect(m.fullName).toBe("Product Form: Competitor Name");
    expect(m.division).toBe("Product Form: Select Your Division");
    expect(m.nickname).toBe("Product Form: Nickname");
    expect(m.hometown).toBe("Product Form: Hometown");
    expect(m.email).toBe("Email");
    expect(m.shirtSize).toBe("Product Form: Shirt Size / Stocking Cap");
    expect(m.paid).toBe("Lineitem price");
    const rows = buildCompetitors(g.rows, m, []);
    expect(rows[0].competitor).toMatchObject({ firstName: "Elliot", divisionId: "mens", shirtSize: "L", paid: true });
    expect(rows[1].competitor).toMatchObject({ divisionId: "womens", shirtSize: "Hat", paid: false });
  });

  it("the downloadable template auto-detects completely", () => {
    const g = gridFromMatrix([
      [
        "Bib", "First Name", "Last Name", "Division (mens/womens/mentors)", "Nickname",
        "Hometown", "Email", "Shirt Size", "Paid (yes/no)",
      ],
      ["1", "Paul", "Bunyan", "mens", "The Axe", "Brainerd, MN", "paul@example.com", "XL", "no"],
      ["2", "Babe", "Blue", "womens", "", "", "", "M", "yes"],
      ["3", "Card", "Payer", "mens", "", "", "", "", ""], // blank Paid → owed
    ]);
    const m = detectMapping(g);
    expect(m.paid).toBe("Paid (yes/no)");
    expect(m.firstName).toBe("First Name");
    expect(m.division).toBe("Division (mens/womens/mentors)");
    expect(m.shirtSize).toBe("Shirt Size");
    const rows = buildCompetitors(g.rows, m, []);
    expect(rows.map((r) => r.competitor!.paid)).toEqual([false, true, false]);
  });

  it("a column NAMED Registration holding division values maps to Division", () => {
    // The ordering system's "Registration" column contains the product the
    // person bought — which IS their division. Detection checks values, not
    // just header names.
    const g = gridFromMatrix([
      ["Bib", "Name", "Registration", "Lineitem variant"],
      ["1", "Zack Todd", "Men's Division Registration", "Paid"],
      ["101", "Willa Birch", "Women's Division Registration", "No"],
    ]);
    const m = detectMapping(g);
    expect(m.division).toBe("Registration"); // claimed by its VALUES
    const rows = buildCompetitors(g.rows, { ...m, paid: "Lineitem variant" }, []);
    expect(rows.map((r) => [r.competitor!.divisionId, r.competitor!.paid])).toEqual([
      ["mens", true],
      ["womens", false],
    ]);
  });

  it("division hiding under ANY header name is found by its values", () => {
    const g = gridFromMatrix([
      ["Bib", "Name", "Lineitem name"],
      ["1", "Zack Todd", "Mentor Division (55+ Years)"],
    ]);
    expect(detectMapping(g).division).toBe("Lineitem name");
    // Fuzzy value parsing — word boundaries keep "Payment" from reading as men's
    expect(parseDivision("Men's Division Registration")).toBe("mens");
    expect(parseDivision("Women's Division Registration")).toBe("womens");
    expect(parseDivision("Payment")).toBeNull();
    expect(parseDivision("Kids")).toBeNull();
  });

  it("blank division infers from the bib block, flagged", () => {
    const g = gridFromMatrix([
      ["Bib", "Name", "Division"],
      ["62", "Chris Goldbach", ""],
      ["117", "Blank Div Woman", ""],
      ["152", "Blank Div Mentor", ""],
    ]);
    const rows = buildCompetitors(g.rows, detectMapping(g), []);
    expect(rows.map((r) => r.competitor?.divisionId)).toEqual(["mens", "womens", "mentors"]);
    expect(rows.every((r) => r.inferredDivision)).toBe(true);
  });
});

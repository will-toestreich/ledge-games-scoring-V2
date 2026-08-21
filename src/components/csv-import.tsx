import { useEffect, useState } from "react";
import Papa from "papaparse";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { getDivision } from "@/data/competition-config";
import type { Competitor, DivisionId } from "@/lib/types";
import { useAddCompetitors } from "@/data/hooks";
import { SHIRT_SIZES, newCompetitorId } from "@/lib/roster";
import { Modal } from "./competitor-form";

interface ParsedRow {
  line: number;
  competitor: Competitor | null;
  errors: string[];
  raw: Record<string, string>;
}

/** Loose header matching: "First Name", "first_name", "FIRSTNAME" all hit. */
function headerKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, "");
}

const DIVISION_ALIASES: Record<string, DivisionId> = {
  mens: "mens", men: "mens", mensdivision: "mens", m: "mens",
  womens: "womens", women: "womens", womensdivision: "womens", w: "womens",
  mentors: "mentors", mentor: "mentors", mentordivision: "mentors",
  mentordivision55years: "mentors",
};

function parseRows(file: File, existing: Competitor[]): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: headerKey,
      complete: (res) => {
        const takenBibs = new Set(existing.map((c) => c.bibNumber));
        const rows: ParsedRow[] = [];
        res.data.forEach((raw, i) => {
          const get = (...keys: string[]) => {
            for (const k of keys) {
              const v = raw[k]?.trim();
              if (v) return v;
            }
            return "";
          };
          const errors: string[] = [];
          const bibStr = get("bib", "bibnumber", "bibno");
          const bib = Number(bibStr);
          const firstName = get("firstname", "first");
          let lastName = get("lastname", "last");
          const fullName = get("name", "competitor");
          let first = firstName;
          if (!first && fullName) {
            const parts = fullName.replace(/\s+/g, " ").split(" ");
            first = parts[0];
            lastName = lastName || parts.slice(1).join(" ");
          }
          const divRaw = get("division", "divisionmenswomensmentors", "menswomensmentor", "div");
          const divisionId = DIVISION_ALIASES[headerKey(divRaw)];

          if (!bibStr || !Number.isInteger(bib) || bib <= 0) errors.push("bad bib");
          else if (takenBibs.has(bib)) errors.push(`bib ${bib} taken`);
          if (!first) errors.push("missing name");
          if (!divisionId) errors.push(`unknown division "${divRaw}"`);

          const shirtRaw = get("shirtsize", "shirt").toUpperCase().replace("XXXL", "3XL").replace("XXL", "2XL");
          const shirtSize = SHIRT_SIZES.includes(shirtRaw) ? shirtRaw : null;
          const regRaw = get("registration", "reg").toLowerCase();
          const registration: Competitor["registration"] =
            regRaw.includes("paid") ? "paid" : regRaw.includes("cash") ? "cash" : regRaw.includes("sponsor") ? "sponsor" : null;

          if (errors.length === 0) takenBibs.add(bib);
          rows.push({
            line: i + 2, // header is line 1
            errors,
            raw,
            competitor:
              errors.length > 0
                ? null
                : {
                    id: newCompetitorId(bib),
                    divisionId: divisionId!,
                    bibNumber: bib,
                    firstName: first,
                    lastName,
                    nickname: get("nickname") || null,
                    hometown: get("hometown") || null,
                    email: get("email") || null,
                    shirtSize,
                    // No registration info → assume cash at the event, not
                    // yet collected; only online-"paid" rows import as paid
                    registration: registration ?? "cash",
                    paid: registration === "paid",
                    checkedIn: false,
                    noShow: false,
                    eventSkips: [],
                  },
          });
        });
        resolve(rows);
      },
      error: reject,
    });
  });
}

export function CsvImportModal({
  file,
  competitors,
  onClose,
}: {
  file: File;
  competitors: Competitor[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const add = useAddCompetitors();

  useEffect(() => {
    parseRows(file, competitors)
      .then(setRows)
      .catch((e) => setParseError(String(e)));
    // Re-parsing on competitor change mid-preview would shuffle rows under the user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const valid = rows?.filter((r) => r.competitor !== null) ?? [];
  const invalid = rows?.filter((r) => r.competitor === null) ?? [];

  return (
    <Modal title={`Import ${file.name}`} onClose={onClose}>
      {parseError ? (
        <p className="text-sm text-red-400">Couldn't parse the file: {parseError}</p>
      ) : rows === null ? (
        <p className="text-sm text-text-tertiary">Parsing…</p>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={14} /> {valid.length} ready
            </span>
            {invalid.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-amber-400">
                <AlertTriangle size={14} /> {invalid.length} skipped
              </span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border-subtle mb-4">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-overlay">
                <tr>
                  {["", "Bib", "Name", "Division", "Issue"].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-left text-text-tertiary font-medium uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = r.competitor;
                  const div = c && getDivision(c.divisionId);
                  return (
                    <tr key={r.line} className={`border-t border-border-subtle/40 ${c ? "" : "opacity-60"}`}>
                      <td className="px-2 py-1.5">
                        {c ? <CheckCircle2 size={12} className="text-emerald-400" /> : <AlertTriangle size={12} className="text-amber-400" />}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{c?.bibNumber ?? r.raw.bib ?? "—"}</td>
                      <td className="px-2 py-1.5 text-text-primary">
                        {c ? `${c.firstName} ${c.lastName}` : `${r.raw.firstname ?? r.raw.name ?? ""} ${r.raw.lastname ?? ""}`}
                      </td>
                      <td className="px-2 py-1.5" style={div ? { color: div.color } : undefined}>{div?.name ?? "—"}</td>
                      <td className="px-2 py-1.5 text-amber-400">{r.errors.join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button
              disabled={valid.length === 0 || add.isPending}
              onClick={() =>
                add.mutate(valid.map((r) => r.competitor!), { onSuccess: onClose })
              }
              className="btn-primary text-sm py-2 px-6"
            >
              Import {valid.length} competitor{valid.length !== 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

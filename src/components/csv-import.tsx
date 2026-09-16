import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { CheckCircle2, AlertTriangle, ChevronLeft } from "lucide-react";
import { getDivision } from "@/data/competition-config";
import type { Competitor } from "@/lib/types";
import { useAddCompetitors } from "@/data/hooks";
import {
  MAPPING_FIELDS,
  buildCompetitors,
  detectMapping,
  gridFromMatrix,
  sampleValues,
  type CsvGrid,
  type CsvMapping,
  type MappingField,
} from "@/lib/csv-import";
import { Modal } from "./competitor-form";

/**
 * Two-step import: MAP (match the file's columns to competitor fields —
 * auto-detected where headers are recognizable, chosen by sample values
 * where they aren't, e.g. an ordering system's repeated "Product Form"
 * columns) → PREVIEW (per-row validation, then import the clean rows).
 */
export function CsvImportModal({
  file,
  competitors,
  onClose,
}: {
  file: File;
  competitors: Competitor[];
  onClose: () => void;
}) {
  const [grid, setGrid] = useState<CsvGrid | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [step, setStep] = useState<"map" | "preview">("map");
  const add = useAddCompetitors();

  useEffect(() => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: "greedy",
      complete: (res) => {
        const g = gridFromMatrix(res.data as string[][]);
        setGrid(g);
        setMapping(detectMapping(g.headers));
      },
      error: (e) => setParseError(String(e)),
    });
  }, [file]);

  const canContinue =
    grid !== null &&
    mapping.bib !== undefined &&
    mapping.division !== undefined &&
    (mapping.fullName !== undefined || mapping.firstName !== undefined);

  // Rows are built once per entry into the preview step, so the ids the
  // preview shows are the ids that import
  const rows = useMemo(
    () => (grid && step === "preview" ? buildCompetitors(grid.rows, mapping, competitors) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid, step]
  );
  const valid = rows.filter((r) => r.competitor !== null);
  const invalid = rows.filter((r) => r.competitor === null);

  function setField(field: MappingField, header: string) {
    setMapping((m) => {
      const next = { ...m };
      if (header === "") delete next[field];
      else next[field] = header;
      return next;
    });
  }

  return (
    <Modal title={`Import ${file.name}`} onClose={onClose}>
      {parseError ? (
        <p className="text-sm text-red-400">Couldn't parse the file: {parseError}</p>
      ) : grid === null ? (
        <p className="text-sm text-text-tertiary">Parsing…</p>
      ) : step === "map" ? (
        <>
          <p className="text-sm text-text-secondary mb-4">
            Match your file's columns to competitor fields — recognized headers are pre-filled;
            pick the rest by their sample values. {grid.rows.length} data row
            {grid.rows.length !== 1 ? "s" : ""} found.
          </p>
          <div className="space-y-2.5 mb-2">
            {MAPPING_FIELDS.map((f) => {
              const chosen = mapping[f.key];
              const samples = chosen ? sampleValues(grid, chosen).join(" · ") : "";
              return (
                <div key={f.key} className="grid grid-cols-[7.5rem_1fr] gap-3 items-start">
                  <span className="text-xs font-medium text-text-primary pt-2">
                    {f.label}
                    {f.required && <span className="text-red-400"> *</span>}
                  </span>
                  <div className="min-w-0">
                    <select
                      value={chosen ?? ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className={`input py-1.5 text-sm ${chosen ? "" : "text-text-tertiary"}`}
                    >
                      <option value="">— not in this file —</option>
                      {grid.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <div className="text-[10px] text-text-tertiary truncate mt-0.5 min-h-[1em]">
                      {samples ? `e.g. ${samples}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-text-tertiary mb-4">
            * Bib and Division are required, plus a name — either Full name (split
            automatically) or First/Last.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-sm py-2 px-4">
              Cancel
            </button>
            <button
              disabled={!canContinue}
              onClick={() => setStep("preview")}
              className="btn-primary text-sm py-2 px-6"
            >
              Preview import
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-4 text-sm">
            <button
              onClick={() => setStep("map")}
              className="btn-ghost text-xs -ml-2 inline-flex items-center gap-1 text-text-tertiary hover:text-text-primary"
            >
              <ChevronLeft size={14} /> Mapping
            </button>
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
                  {["", "Bib", "Name", "Division", "Shirt", "Reg", "Issue"].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-1.5 text-left text-text-tertiary font-medium uppercase tracking-wider text-[10px]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = r.competitor;
                  const div = c && getDivision(c.divisionId);
                  const rawName =
                    (mapping.fullName && r.raw[mapping.fullName]) ||
                    `${(mapping.firstName && r.raw[mapping.firstName]) ?? ""} ${(mapping.lastName && r.raw[mapping.lastName]) ?? ""}`;
                  return (
                    <tr key={r.line} className={`border-t border-border-subtle/40 ${c ? "" : "opacity-60"}`}>
                      <td className="px-2 py-1.5">
                        {c ? (
                          <CheckCircle2 size={12} className="text-emerald-400" />
                        ) : (
                          <AlertTriangle size={12} className="text-amber-400" />
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono">
                        {c?.bibNumber ?? (mapping.bib ? r.raw[mapping.bib] : "") ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-text-primary">
                        {c ? `${c.firstName} ${c.lastName}` : rawName}
                      </td>
                      <td className="px-2 py-1.5" style={div ? { color: div.color } : undefined}>
                        {div?.name ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 text-text-secondary">{c?.shirtSize ?? "—"}</td>
                      <td className="px-2 py-1.5 text-text-secondary">{c?.registration ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {r.errors.length > 0 ? (
                          <span className="text-amber-400">{r.errors.join(", ")}</span>
                        ) : r.inferredDivision ? (
                          <span className="text-text-tertiary">division from bib</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-secondary text-sm py-2 px-4">
              Cancel
            </button>
            <button
              disabled={valid.length === 0 || add.isPending}
              onClick={() => add.mutate(valid.map((r) => r.competitor!), { onSuccess: onClose })}
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

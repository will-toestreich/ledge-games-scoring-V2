import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { getDivision } from "@/data/competition-config";
import type { Competitor, DivisionId } from "@/lib/types";
import {
  useActiveDivisions,
  useAddCompetitors,
  useDeleteCompetitor,
  useDeleteCompetitorScores,
  useKegAttempts,
  useScores,
  useUpdateCompetitor,
} from "@/data/hooks";

export const SHIRT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];

/** Bib blocks per the rules: Men's from #1, Women's from #101, Mentors from #151. */
const BIB_START: Record<DivisionId, number> = { mens: 1, womens: 101, mentors: 151 };

export function nextFreeBib(divisionId: DivisionId, competitors: Competitor[]): number {
  const taken = new Set(competitors.map((c) => c.bibNumber));
  let bib = BIB_START[divisionId];
  while (taken.has(bib)) bib++;
  return bib;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle sticky top-0 bg-surface-raised z-10">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          <button onClick={onClose} className="p-1.5 text-text-tertiary hover:text-text-primary transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${span2 ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] text-text-tertiary uppercase tracking-wider font-medium">{label}</span>
      {children}
    </label>
  );
}

export function CompetitorFormModal({
  competitor,
  competitors,
  onClose,
}: {
  /** Present = edit mode; absent = walk-on add. */
  competitor?: Competitor;
  competitors: Competitor[];
  onClose: () => void;
}) {
  const add = useAddCompetitors();
  const update = useUpdateCompetitor();
  const remove = useDeleteCompetitor();
  const clearScores = useDeleteCompetitorScores();
  const { data: scores } = useScores();
  const { data: kegAttempts } = useKegAttempts();
  const editing = competitor !== undefined;
  // Scores are shaped by the division's round plan — moving divisions with
  // scores attached would corrupt results, so the move clears them (with
  // explicit confirmation).
  const hasScores =
    editing &&
    ((scores ?? []).some((s) => s.competitorId === competitor.id) ||
      (kegAttempts ?? []).some((a) => a.competitorId === competitor.id));
  const activeDivisions = useActiveDivisions();
  // Editing someone in a disabled division still shows their division
  const divisionOptions =
    editing && !activeDivisions.some((d) => d.id === competitor.divisionId)
      ? [...activeDivisions, getDivision(competitor.divisionId)!]
      : activeDivisions;

  const [divisionId, setDivisionId] = useState<DivisionId>(competitor?.divisionId ?? "mens");
  const [bib, setBib] = useState<string>(
    String(competitor?.bibNumber ?? nextFreeBib("mens", competitors))
  );
  const [firstName, setFirstName] = useState(competitor?.firstName ?? "");
  const [lastName, setLastName] = useState(competitor?.lastName ?? "");
  const [nickname, setNickname] = useState(competitor?.nickname ?? "");
  const [hometown, setHometown] = useState(competitor?.hometown ?? "");
  const [email, setEmail] = useState(competitor?.email ?? "");
  const [shirtSize, setShirtSize] = useState(competitor?.shirtSize ?? "");
  const [registration, setRegistration] = useState<string>(competitor?.registration ?? "cash");
  const [paid, setPaid] = useState(competitor?.paid ?? true);
  const [checkedIn, setCheckedIn] = useState(competitor?.checkedIn ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDivisionMove, setConfirmDivisionMove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const divisionChanged = editing && divisionId !== competitor.divisionId;

  function pickDivision(d: DivisionId) {
    setDivisionId(d);
    setConfirmDivisionMove(false);
    if (!editing) setBib(String(nextFreeBib(d, competitors)));
  }

  const bibNum = Number(bib);
  const bibTaken = competitors.some((c) => c.bibNumber === bibNum && c.id !== competitor?.id);
  const valid = firstName.trim() !== "" && lastName.trim() !== "" && Number.isInteger(bibNum) && bibNum > 0 && !bibTaken;

  function save() {
    const patch = {
      divisionId,
      bibNumber: bibNum,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nickname: nickname.trim() || null,
      hometown: hometown.trim() || null,
      email: email.trim() || null,
      shirtSize: shirtSize || null,
      registration: (registration || null) as Competitor["registration"],
      paid,
      checkedIn,
    };
    if (editing) {
      if (divisionChanged && hasScores && !confirmDivisionMove) {
        setConfirmDivisionMove(true);
        return;
      }
      const finish = () =>
        update.mutate({ id: competitor.id, patch }, { onSuccess: onClose, onError: (e) => setError(String(e)) });
      if (divisionChanged && hasScores) {
        clearScores.mutate(competitor.id, { onSuccess: finish, onError: (e) => setError(String(e)) });
      } else {
        finish();
      }
    } else {
      add.mutate(
        [{ id: `b${bibNum}`, noShow: false, eventSkips: [], ...patch }],
        { onSuccess: onClose, onError: (e) => setError(String(e)) }
      );
    }
  }

  return (
    <Modal title={editing ? `Edit ${competitor.firstName} ${competitor.lastName}` : "Add Walk-on"} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Division" span2>
          <div className="flex gap-2">
            {divisionOptions.map((d) => (
              <button
                key={d.id}
                onClick={() => pickDivision(d.id)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  divisionId === d.id ? "text-white" : "text-text-secondary bg-surface-overlay border border-border-subtle"
                }`}
                style={divisionId === d.id ? { backgroundColor: d.color } : undefined}
              >
                {d.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Bib #">
          <input type="number" min={1} value={bib} onChange={(e) => setBib(e.target.value)} className="input py-2 font-mono" />
        </Field>
        <Field label="Shirt Size">
          <select value={shirtSize} onChange={(e) => setShirtSize(e.target.value)} className="input py-2">
            <option value="">—</option>
            {SHIRT_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="First Name">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input py-2" autoFocus={!editing} />
        </Field>
        <Field label="Last Name">
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="input py-2" />
        </Field>
        <Field label="Nickname">
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="input py-2" />
        </Field>
        <Field label="Hometown">
          <input value={hometown} onChange={(e) => setHometown(e.target.value)} className="input py-2" />
        </Field>
        <Field label="Email" span2>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input py-2" />
        </Field>
        <Field label="Registration">
          <select value={registration} onChange={(e) => setRegistration(e.target.value)} className="input py-2">
            <option value="paid">Paid (online)</option>
            <option value="cash">Cash at event</option>
            <option value="sponsor">Sponsor</option>
            <option value="">Not registered</option>
          </select>
        </Field>
        <div className="flex items-end gap-4 pb-1">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="accent-emerald-500" />
            Paid
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={checkedIn} onChange={(e) => setCheckedIn(e.target.checked)} className="accent-emerald-500" />
            Checked in
          </label>
        </div>
      </div>

      {bibTaken && <p className="text-xs text-red-400 mt-3">Bib {bibNum} is already taken.</p>}
      {divisionChanged && hasScores && (
        <p className={`text-xs mt-3 ${confirmDivisionMove ? "text-red-400 font-medium" : "text-amber-400"}`}>
          {confirmDivisionMove
            ? "Confirmed: saving will DELETE all of their recorded scores. Click Save again to proceed."
            : "This competitor has recorded scores. Scores are shaped by the division's rounds, so moving divisions will delete them."}
        </p>
      )}
      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      <div className="flex items-center gap-2 mt-6">
        {editing && (
          <button
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 3000);
                return;
              }
              remove.mutate(competitor.id, { onSuccess: onClose });
            }}
            className={`text-xs inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
              confirmDelete ? "bg-red-500 text-white" : "text-red-400/80 hover:text-red-400 hover:bg-red-500/10"
            }`}
          >
            <Trash2 size={13} />
            {confirmDelete ? "Really delete? (removes their scores)" : "Delete"}
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button onClick={save} disabled={!valid} className="btn-primary text-sm py-2 px-6">
            {editing ? "Save Changes" : "Add Competitor"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Delete, ChevronRight } from "lucide-react";
import { EventIcon } from "@/components/event-icons";
import { events } from "@/data/mock";

export function ScorePage() {
  const [pinEntry, setPinEntry] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [shake, setShake] = useState(false);

  function handlePinSubmit() {
    if (pinEntry === "1234") {
      setAuthenticated(true);
    } else {
      setShake(true);
      setPinEntry("");
      setTimeout(() => setShake(false), 500);
    }
  }

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div
          className={`card rounded-2xl p-8 w-80 text-center animate-scale-in ${
            shake ? "animate-[shake_0.4s_ease-in-out]" : ""
          }`}
          style={shake ? { animation: "shake 0.4s ease-in-out" } : undefined}
        >
          <div className="mb-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-surface-overlay border border-border-subtle flex items-center justify-center">
              <Lock size={24} className="text-text-secondary" />
            </div>
            <h2 className="text-xl font-bold text-text-primary">Scorer Login</h2>
            <p className="text-sm text-text-secondary mt-1">Enter the event PIN</p>
          </div>

          {/* PIN display */}
          <div className="mb-5">
            <div className="flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all duration-200 ${
                    pinEntry[i]
                      ? "border-ledge-red bg-ledge-red/10 text-white"
                      : "border-border-default bg-surface-overlay text-text-tertiary"
                  }`}
                >
                  {pinEntry[i] ? "\u2022" : ""}
                </div>
              ))}
            </div>
          </div>

          {/* Numpad grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => setPinEntry((p) => (p.length < 6 ? p + n : p))}
                className="numpad-key py-3.5"
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPinEntry("")}
              className="numpad-key py-3.5 text-sm text-text-tertiary"
            >
              Clear
            </button>
            <button
              onClick={() => setPinEntry((p) => (p.length < 6 ? p + "0" : p))}
              className="numpad-key py-3.5"
            >
              0
            </button>
            <button
              onClick={() => setPinEntry((p) => p.slice(0, -1))}
              className="numpad-key py-3.5 text-text-tertiary"
            >
              <Delete size={20} className="mx-auto" />
            </button>
          </div>

          <button
            onClick={handlePinSubmit}
            disabled={pinEntry.length < 4}
            className="btn-primary w-full py-3.5 text-base"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  // ─── Event picker (post-auth) ─────────────────────────

  return (
    <div className="max-w-lg mx-auto px-4 py-8 animate-slide-up">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Pick an Event</h1>
        <p className="text-text-secondary text-sm mt-1">Which event are you scoring today?</p>
      </div>

      <div className="grid gap-3">
        {events.map((event) => (
          <Link
            key={event.id}
            to="/score/$eventId"
            params={{ eventId: event.id }}
            className="card card-interactive rounded-xl p-5 flex items-center gap-4 group"
          >
            <div className="w-10 h-10 rounded-lg bg-surface-overlay border border-border-subtle flex items-center justify-center shrink-0 group-hover:border-border-default transition-colors">
              <EventIcon eventId={event.id} size={20} className="text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg text-text-primary group-hover:text-white transition-colors">
                {event.name}
              </h3>
              <p className="text-sm text-text-tertiary mt-0.5">
                {event.scoringType} &middot; {event.rounds} rounds
              </p>
            </div>
            <ChevronRight size={18} className="text-text-tertiary group-hover:text-text-secondary group-hover:translate-x-1 transition-all" />
          </Link>
        ))}
      </div>
    </div>
  );
}

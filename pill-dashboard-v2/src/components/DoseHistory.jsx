import { useState } from "react";
import { DAYS, SESSIONS, SESSION_ICONS } from "../hooks/useWebSocket";

export default function DoseHistory({ history, onClear }) {
  const [filter, setFilter] = useState("all"); // all | dispensed | missed

  const filtered = history.filter(e => filter === "all" || e.kind === filter);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-indigo-950">📋 Dose History</h2>
        <div className="flex items-center gap-2">
          {/* Filter tabs */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {[["all","All"], ["dispensed","✅"], ["missed","⚠️"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilter(val)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors
                  ${filter === val ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>
          {history.length > 0 && (
            <button onClick={onClear}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 italic text-center py-6">
          {history.length === 0 ? "No dose events recorded yet." : "No events match this filter."}
        </p>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {filtered.map(entry => (
            <div key={entry.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm
                ${entry.kind === "dispensed"
                  ? "bg-emerald-50 border-emerald-100"
                  : "bg-amber-50 border-amber-100"}`}>

              {/* Icon */}
              <span className="text-base flex-shrink-0">
                {entry.kind === "dispensed" ? "✅" : "⚠️"}
              </span>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${entry.kind === "dispensed" ? "text-emerald-800" : "text-amber-800"}`}>
                  {entry.kind === "dispensed" ? "Dispensed" : "Missed"} — {DAYS[entry.day]}
                </p>
                <p className="text-xs opacity-70">
                  {SESSION_ICONS[entry.session]} {SESSIONS[entry.session]}
                </p>
              </div>

              {/* Timestamp */}
              <div className="text-right text-xs opacity-60 flex-shrink-0">
                <p>{entry.timestamp}</p>
                <p>{entry.date}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary stats */}
      {history.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3 text-center">
          {[
            ["Total",    history.length,                               "text-gray-600",   "bg-gray-50"],
            ["Taken",    history.filter(e => e.kind==="dispensed").length, "text-emerald-600","bg-emerald-50"],
            ["Missed",   history.filter(e => e.kind==="missed").length,    "text-amber-600",  "bg-amber-50"],
          ].map(([label, val, tc, bg]) => (
            <div key={label} className={`${bg} rounded-xl py-2`}>
              <p className={`text-lg font-bold ${tc}`}>{val}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

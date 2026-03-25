import { useState, useEffect } from "react";
import { SESSIONS, SESSION_ICONS, fmt, parse } from "../hooks/useWebSocket";

export default function ScheduleEditor({ schedule, onSave, disabled }) {
  const [draft, setDraft] = useState(["09:00", "12:00", "20:00"]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (schedule) setDraft(schedule.map(fmt));
  }, [JSON.stringify(schedule)]);

  const handleChange = (i, val) => {
    const next = [...draft];
    next[i] = val;
    setDraft(next);
    setError("");
  };

  const handleSave = () => {
    const parsed = draft.map(parse);
    for (const { hour, minute } of parsed) {
      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        setError("Please enter valid times (HH:MM).");
        return;
      }
    }
    const mins = parsed.map(t => t.hour * 60 + t.minute);
    if (mins[0] >= mins[1] || mins[1] >= mins[2]) {
      setError("Times must be in order: Morning < Midday < Night.");
      return;
    }
    onSave(parsed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-indigo-950">⏰ Dispense Times</h2>
        {saved && (
          <span className="text-xs font-medium text-emerald-600 animate-pulse">
            ✓ Saved to ESP32
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        {SESSIONS.map((session, i) => (
          <div key={session} className="flex-1 min-w-[130px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              {SESSION_ICONS[i]} {session}
            </label>
            <input
              type="time"
              value={draft[i]}
              onChange={e => handleChange(i, e.target.value)}
              disabled={disabled}
              className={`w-full px-3 py-2 rounded-xl border text-sm font-medium text-gray-700
                focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400
                transition-colors
                ${disabled
                  ? "bg-gray-50 border-gray-200 cursor-not-allowed text-gray-400"
                  : "bg-white border-gray-200 hover:border-gray-300"}`}
            />
          </div>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-3">⚠️ {error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={disabled}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors
            ${disabled
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}>
          Save Times
        </button>
        <p className="text-xs text-gray-400">Changes take effect immediately on the ESP32.</p>
      </div>
    </div>
  );
}

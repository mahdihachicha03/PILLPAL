import { useState } from "react";
import { DAYS, SESSIONS, SESSION_ICONS, fmt } from "../hooks/useWebSocket";

function ConfirmModal({ confirming, onConfirm, onCancel, schedule }) {
  if (!confirming) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-7 max-w-sm w-[90%] shadow-2xl">
        <h3 className="text-lg font-bold text-indigo-950 mb-2">Confirm Dispense</h3>
        <p className="text-sm text-gray-500 mb-5">
          Manually dispense{" "}
          <span className="font-semibold text-gray-700">{DAYS[confirming.day]}</span>{" — "}
          <span className="font-semibold text-gray-700">{SESSIONS[confirming.session]}</span>
          {schedule && (
            <> at <span className="font-semibold text-indigo-600">{fmt(schedule[confirming.session])}</span></>
          )}?
        </p>
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors">
            Yes, Dispense
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScheduleGrid({ dispensed, dispensing, onDispense, onReset, schedule, currentDay }) {
  const [confirming, setConfirming] = useState(null);

  const handleConfirm = () => {
    onDispense(confirming.day, confirming.session);
    setConfirming(null);
  };

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-indigo-950">Weekly Schedule</h2>
          <button
            onClick={onReset}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
            Reset Week
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-xs text-gray-400 font-medium px-2 py-1">Day</th>
                {SESSIONS.map((s, i) => (
                  <th key={s} className="text-center text-xs text-gray-400 font-medium px-2 py-1">
                    <div>{SESSION_ICONS[i]} {s}</div>
                    <div className="text-[10px] opacity-70">
                      {schedule ? fmt(schedule[i]) : "—"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, d) => (
                <tr key={day} className={d === currentDay ? "bg-indigo-200 rounded-lg" : ""}>
                  <td className="px-2 py-1 text-sm whitespace-nowrap">
                    {d === currentDay && (
                      <span className="mr-1.5 text-[10px] bg-indigo-600 text-white rounded px-1 py-0.5">
                        TODAY
                      </span>
                    )}
                    <span className={`${d === currentDay ? "font-semibold text-indigo-600" : "text-gray-600"}`}>
                      {day}
                    </span>
                  </td>
                  {SESSIONS.map((_, s) => {
                    const done = dispensed?.[d]?.[s];
                    return (
                      <td key={s} className="text-center px-1 py-1">
                        <button
                          disabled={dispensing}
                          onClick={() => setConfirming({ day: d, session: s })}
                          title={`Dispense ${day} ${SESSIONS[s]}`}
                          className={`w-10 h-10 rounded-xl text-lg border-[1.5px] transition-all mx-auto flex items-center justify-center
                            disabled:cursor-not-allowed
                            ${done
                              ? "bg-emerald-50 border-emerald-300"
                              : d === currentDay
                                ? "bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
                                : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}>
                          {done ? "✅" : "💊"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-gray-400">
          Click 💊 to manually trigger that dose · ✅ = already dispensed
        </p>
      </div>

      <ConfirmModal
        confirming={confirming}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(null)}
        schedule={schedule}
      />
    </>
  );
}

import { SESSIONS, SESSION_ICONS, fmt } from "../hooks/useWebSocket";

function InfoPill({ icon, value }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm">
      <span>{icon}</span>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  );
}

function CountdownBadge({ minutesUntilNext, nextSession, schedule }) {
  const h = Math.floor(minutesUntilNext / 60);
  const m = minutesUntilNext % 60;
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  const timeStr = schedule ? fmt(schedule[nextSession]) : "";

  return (
    <div className="inline-flex items-center gap-2 bg-sky-50 border border-sky-200 text-sky-700 rounded-full px-4 py-2 text-sm">
      <span className="text-base">{SESSION_ICONS[nextSession ?? 0]}</span>
      <span>
        Next dose in <span className="font-bold">{label}</span>
        {timeStr && (
          <> — {SESSIONS[nextSession]} at <span className="font-bold">{timeStr}</span></>
        )}
      </span>
    </div>
  );
}

export default function StatusBar({ status }) {
  if (!status) return null;

  return (
    <div className="mb-5 space-y-3">
      {/* Info pills */}
      <div className="flex flex-wrap gap-2">
        <InfoPill icon="🕐" value={status.time} />
        <InfoPill icon="📡" value={status.ip} />
        <InfoPill icon="🎯" value={`Slot ${status.currentSlot} / 21`} />
      </div>

      {/* Countdown */}
      {status.minutesUntilNext != null && (
        <CountdownBadge
          minutesUntilNext={status.minutesUntilNext}
          nextSession={status.nextSession}
          schedule={status.schedule}
        />
      )}

      {/* Dispensing indicator */}
      {status.dispensing && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm">
          <span className="animate-spin text-lg">⚙️</span>
          <span className="font-semibold">Dispensing in progress…</span>
        </div>
      )}
    </div>
  );
}

import useWebSocket from "./hooks/useWebSocket";
import Header        from "./components/Header";
import StatusBar     from "./components/StatusBar";
import AlertList     from "./components/AlertList";
import ScheduleEditor from "./components/ScheduleEditor";
import ScheduleGrid  from "./components/ScheduleGrid";
import PatientProfile from "./components/PatientProfile";
import DoseHistory   from "./components/DoseHistory";

const ESP32_IP = "192.168.1.38"; // ← Change to your ESP32's IP
const WS_URL   = `ws://${ESP32_IP}:81`;

export default function App() {
  const { connected, status, alerts, history, send, dismissAlert, clearHistory } = useWebSocket(WS_URL);

  const currentDay = status?.wday != null
    ? (status.wday === 0 ? 6 : status.wday - 1)
    : (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 px-4 py-6">
      <div className="max-w-2xl mx-auto">

        <Header connected={connected} />

        <StatusBar status={status} />

        <AlertList alerts={alerts} onDismiss={dismissAlert} />

        <PatientProfile />

        <ScheduleEditor
          schedule={status?.schedule}
          onSave={(parsed) => send({ action: "setschedule", schedule: parsed })}
          disabled={!connected}
        />

        <ScheduleGrid
          dispensed={status?.dispensed}
          dispensing={status?.dispensing}
          onDispense={(day, session) => send({ action: "dispense", day, session })}
          onReset={() => send({ action: "reset" })}
          schedule={status?.schedule}
          currentDay={currentDay}
        />

        <DoseHistory history={history} onClear={clearHistory} />

        {/* Offline banner */}
        {!connected && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-5 py-4 text-sm text-orange-800">
            <p className="font-semibold mb-1">Cannot reach ESP32</p>
            <p className="text-orange-700">
              Make sure it's powered on and on the same WiFi network.
              Update <code className="bg-orange-100 px-1 rounded text-xs">ESP32_IP</code> in{" "}
              <code className="bg-orange-100 px-1 rounded text-xs">App.jsx</code> if needed.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

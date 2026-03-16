import { useState, useEffect, useRef, useCallback } from "react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SESSIONS = ["Morning", "Midday", "Night"];
const SESSION_TIMES = ["9:00 AM", "12:00 PM", "8:00 PM"];
const SESSION_ICONS = ["🌅", "☀️", "🌙"];

const ESP32_IP = "192.168.1.100"; // ← Change to your ESP32's IP
const WS_URL   = `ws://${ESP32_IP}:81`;

function useWebSocket(url) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus]       = useState(null);
  const [alerts, setAlerts]       = useState([]);
  const reconnectTimer            = useRef(null);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        setConnected(true);
        ws.current.send(JSON.stringify({ action: "ping" }));
      };

      ws.current.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.current.onerror = () => {
        ws.current?.close();
      };

      ws.current.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "status") setStatus(msg);
          else if (msg.type === "dispensed") {
            setAlerts(a => [{
              id: Date.now(),
              kind: "success",
              text: `✅ Dispensed: ${DAYS[msg.day]} ${SESSIONS[msg.session]}`
            }, ...a].slice(0, 5));
          } else if (msg.type === "missed") {
            setAlerts(a => [{
              id: Date.now(),
              kind: "warning",
              text: `⚠️ Missed dose: ${DAYS[msg.day]} ${SESSIONS[msg.session]}`
            }, ...a].slice(0, 5));
          }
        } catch {}
      };
    } catch {}
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((obj) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(obj));
    }
  }, []);

  return { connected, status, alerts, send, setAlerts };
}

function Alert({ alert, onDismiss }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px",
      borderRadius: 10,
      marginBottom: 8,
      background: alert.kind === "success" ? "#ecfdf5" : "#fffbeb",
      border: `1px solid ${alert.kind === "success" ? "#6ee7b7" : "#fcd34d"}`,
      fontSize: 13,
      color: alert.kind === "success" ? "#065f46" : "#92400e",
      animation: "slideIn 0.3s ease",
    }}>
      <span>{alert.text}</span>
      <button onClick={() => onDismiss(alert.id)} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "inherit", fontSize: 16, lineHeight: 1, marginLeft: 10, opacity: 0.6
      }}>×</button>
    </div>
  );
}

function CountdownBadge({ minutesUntilNext, nextSession }) {
  const h = Math.floor(minutesUntilNext / 60);
  const m = minutesUntilNext % 60;
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "#f0f9ff", border: "1px solid #bae6fd",
      borderRadius: 24, padding: "6px 14px", fontSize: 13, color: "#0369a1"
    }}>
      <span style={{ fontSize: 16 }}>{SESSION_ICONS[nextSession ?? 0]}</span>
      <span>Next dose in <strong>{label}</strong> — {SESSION_TIMES[nextSession ?? 0]}</span>
    </div>
  );
}

function ScheduleGrid({ dispensed, onManualDispense, dispensing, currentDay }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "4px" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 12,
              color: "#6b7280", fontWeight: 500 }}>Day</th>
            {SESSIONS.map((s, i) => (
              <th key={s} style={{ textAlign: "center", padding: "6px 8px",
                fontSize: 12, color: "#6b7280", fontWeight: 500 }}>
                {SESSION_ICONS[i]} {s}<br/>
                <span style={{ fontSize: 11, opacity: 0.7 }}>{SESSION_TIMES[i]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, d) => (
            <tr key={day}>
              <td style={{
                padding: "6px 8px", fontSize: 13, fontWeight: d === currentDay ? 600 : 400,
                color: d === currentDay ? "#4f46e5" : "#374151",
                whiteSpace: "nowrap"
              }}>
                {d === currentDay && <span style={{ marginRight: 4, fontSize: 10,
                  background: "#4f46e5", color: "#fff", borderRadius: 4,
                  padding: "1px 5px" }}>TODAY</span>}
                {day}
              </td>
              {SESSIONS.map((_, s) => {
                const done = dispensed?.[d]?.[s];
                return (
                  <td key={s} style={{ textAlign: "center", padding: 4 }}>
                    <button
                      disabled={dispensing}
                      onClick={() => onManualDispense(d, s)}
                      title={`Dispense ${day} ${SESSIONS[s]}`}
                      style={{
                        width: 40, height: 40, borderRadius: 10,
                        border: done
                          ? "1.5px solid #6ee7b7"
                          : d === currentDay
                            ? "1.5px solid #a5b4fc"
                            : "1.5px solid #e5e7eb",
                        background: done
                          ? "#d1fae5"
                          : d === currentDay
                            ? "#eef2ff"
                            : "#f9fafb",
                        cursor: dispensing ? "not-allowed" : "pointer",
                        fontSize: 18,
                        transition: "all 0.15s",
                        display: "flex", alignItems: "center",
                        justifyContent: "center", margin: "0 auto",
                      }}
                    >
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
  );
}

export default function App() {
  const { connected, status, alerts, send, setAlerts } = useWebSocket(WS_URL);
  const [confirming, setConfirming] = useState(null); // {day, session}

  const handleManualDispense = (day, session) => {
    setConfirming({ day, session });
  };

  const confirmDispense = () => {
    if (!confirming) return;
    send({ action: "dispense", day: confirming.day, session: confirming.session });
    setConfirming(null);
  };

  const currentDay = status?.wday != null
    ? (status.wday === 0 ? 6 : status.wday - 1)
    : new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: "24px 16px",
    }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        button:hover:not(:disabled) { opacity: 0.85; transform: scale(1.03); }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#1e1b4b" }}>
              💊 Pill Dispenser
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
              Weekly medication schedule
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8,
            background: connected ? "#d1fae5" : "#fee2e2",
            border: `1px solid ${connected ? "#6ee7b7" : "#fca5a5"}`,
            borderRadius: 20, padding: "6px 14px", fontSize: 13,
            color: connected ? "#065f46" : "#991b1b" }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: connected ? "#10b981" : "#ef4444",
              display: "inline-block",
              animation: connected ? "none" : "pulse 1.5s infinite"
            }} />
            {connected ? `ESP32 Online` : "ESP32 Offline"}
          </div>
        </div>

        {/* Live clock + IP */}
        {status && (
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 12, padding: "10px 16px", fontSize: 13, color: "#374151" }}>
              🕐 <strong>{status.time}</strong>
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 12, padding: "10px 16px", fontSize: 13, color: "#374151" }}>
              📡 <strong>{status.ip}</strong>
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 12, padding: "10px 16px", fontSize: 13, color: "#374151" }}>
              🎯 Slot <strong>{status.currentSlot}</strong> / 21
            </div>
          </div>
        )}

        {/* Next dose countdown */}
        {status?.minutesUntilNext != null && (
          <div style={{ marginBottom: 20 }}>
            <CountdownBadge
              minutesUntilNext={status.minutesUntilNext}
              nextSession={status.nextSession}
            />
          </div>
        )}

        {/* Dispensing indicator */}
        {status?.dispensing && (
          <div style={{
            background: "#eff6ff", border: "1px solid #93c5fd",
            borderRadius: 10, padding: "12px 16px", marginBottom: 16,
            fontSize: 13, color: "#1d4ed8", display: "flex",
            alignItems: "center", gap: 10
          }}>
            <span style={{ animation: "pulse 0.8s infinite", fontSize: 18 }}>⚙️</span>
            <strong>Dispensing in progress…</strong>
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {alerts.map(a => (
              <Alert key={a.id} alert={a}
                onDismiss={id => setAlerts(prev => prev.filter(x => x.id !== id))} />
            ))}
          </div>
        )}

        {/* Schedule grid */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb",
          borderRadius: 16, padding: 20, marginBottom: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1e1b4b" }}>
              Weekly Schedule
            </h2>
            <button
              onClick={() => send({ action: "reset" })}
              style={{
                fontSize: 12, padding: "5px 12px", borderRadius: 8,
                border: "1px solid #e5e7eb", background: "#f9fafb",
                color: "#6b7280", cursor: "pointer"
              }}
            >
              Reset Week
            </button>
          </div>
          <ScheduleGrid
            dispensed={status?.dispensed}
            onManualDispense={handleManualDispense}
            dispensing={status?.dispensing}
            currentDay={currentDay}
          />
          <p style={{ margin: "12px 0 0", fontSize: 12, color: "#9ca3af" }}>
            Click any 💊 to manually trigger that dose. ✅ = already dispensed.
          </p>
        </div>

        {/* Offline banner */}
        {!connected && (
          <div style={{
            background: "#fff7ed", border: "1px solid #fed7aa",
            borderRadius: 12, padding: "14px 18px", fontSize: 13, color: "#92400e"
          }}>
            <strong>Cannot reach ESP32.</strong> Make sure it's powered on and connected to WiFi.
            Then update <code>ESP32_IP</code> in the React app to match your ESP32's IP address
            (shown in the Arduino Serial Monitor).
          </div>
        )}

      </div>

      {/* Confirm modal */}
      {confirming && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: 28,
            maxWidth: 340, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)"
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "#1e1b4b" }}>
              Confirm Dispense
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>
              Manually dispense <strong>{DAYS[confirming.day]}</strong>{" "}
              <strong>{SESSIONS[confirming.session]}</strong> ({SESSION_TIMES[confirming.session]})?
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={confirmDispense} style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                background: "#4f46e5", color: "#fff", border: "none",
                fontWeight: 600, fontSize: 14, cursor: "pointer"
              }}>
                Yes, Dispense
              </button>
              <button onClick={() => setConfirming(null)} style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                background: "#f3f4f6", color: "#374151", border: "none",
                fontSize: 14, cursor: "pointer"
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

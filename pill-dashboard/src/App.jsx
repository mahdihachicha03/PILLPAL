import { useState, useEffect, useRef, useCallback } from "react";

const DAYS          = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const SESSIONS      = ["Morning","Midday","Night"];
const SESSION_ICONS = ["🌅","☀️","🌙"];

const ESP32_IP = "192.168.1.38"; // ← Change to your ESP32's IP
const WS_URL   = `ws://${ESP32_IP}:81`;

// Format {hour, minute} → "09:00"
const fmt = ({ hour, minute }) =>
  `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;

// Parse "HH:MM" → {hour, minute}
const parse = (str) => {
  const [h, m] = str.split(":").map(Number);
  return { hour: h, minute: m };
};

// ── WebSocket hook ────────────────────────────────────────
function useWebSocket(url) {
  const ws           = useRef(null);
  const reconnectRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [status,    setStatus]    = useState(null);
  const [alerts,    setAlerts]    = useState([]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    try {
      ws.current = new WebSocket(url);
      ws.current.onopen  = () => { setConnected(true); ws.current.send(JSON.stringify({ action:"ping" })); };
      ws.current.onclose = () => { setConnected(false); reconnectRef.current = setTimeout(connect, 3000); };
      ws.current.onerror = () => ws.current?.close();
      ws.current.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "status") setStatus(msg);
          else if (msg.type === "dispensed")
            setAlerts(a => [{ id:Date.now(), kind:"success", text:`✅ Dispensed: ${DAYS[msg.day]} ${SESSIONS[msg.session]}` }, ...a].slice(0,5));
          else if (msg.type === "missed")
            setAlerts(a => [{ id:Date.now(), kind:"warning", text:`⚠️ Missed dose: ${DAYS[msg.day]} ${SESSIONS[msg.session]}` }, ...a].slice(0,5));
        } catch {}
      };
    } catch {}
  }, [url]);

  useEffect(() => {
    connect();
    return () => { clearTimeout(reconnectRef.current); ws.current?.close(); };
  }, [connect]);

  const send = useCallback((obj) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(obj));
  }, []);

  return { connected, status, alerts, send, setAlerts };
}

// ── Alert banner ──────────────────────────────────────────
function AlertBanner({ alert, onDismiss }) {
  const ok = alert.kind === "success";
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"10px 14px", borderRadius:10, marginBottom:8,
      background: ok ? "#ecfdf5" : "#fffbeb",
      border:`1px solid ${ok ? "#6ee7b7" : "#fcd34d"}`,
      fontSize:13, color: ok ? "#065f46" : "#92400e",
      animation:"slideIn 0.3s ease",
    }}>
      <span>{alert.text}</span>
      <button onClick={() => onDismiss(alert.id)} style={{
        background:"none", border:"none", cursor:"pointer",
        color:"inherit", fontSize:18, marginLeft:10, opacity:0.6
      }}>×</button>
    </div>
  );
}

// ── Countdown badge ───────────────────────────────────────
function CountdownBadge({ minutesUntilNext, nextSession, schedule }) {
  const h = Math.floor(minutesUntilNext / 60);
  const m = minutesUntilNext % 60;
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", gap:8,
      background:"#f0f9ff", border:"1px solid #bae6fd",
      borderRadius:24, padding:"6px 16px", fontSize:13, color:"#0369a1"
    }}>
      <span style={{ fontSize:16 }}>{SESSION_ICONS[nextSession ?? 0]}</span>
      <span>
        Next dose in <strong>{label}</strong>
        {schedule && <> — {SESSIONS[nextSession]} at <strong>{fmt(schedule[nextSession])}</strong></>}
      </span>
    </div>
  );
}

// ── Schedule time editor ──────────────────────────────────
function ScheduleEditor({ schedule, onSave, disabled }) {
  const [draft, setDraft] = useState(["09:00","12:00","20:00"]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Sync when ESP32 sends its schedule
  useEffect(() => {
    if (schedule) setDraft(schedule.map(fmt));
  }, [JSON.stringify(schedule)]);

  const handleChange = (i, val) => {
    const next = [...draft]; next[i] = val;
    setDraft(next); setError("");
  };

  const handleSave = () => {
    const parsed = draft.map(parse);
    for (const { hour, minute } of parsed) {
      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        setError("Please enter valid times (HH:MM)."); return;
      }
    }
    const mins = parsed.map(t => t.hour * 60 + t.minute);
    if (mins[0] >= mins[1] || mins[1] >= mins[2]) {
      setError("Times must be in order: Morning < Midday < Night."); return;
    }
    onSave(parsed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{
      background:"#fff", border:"1px solid #e5e7eb",
      borderRadius:16, padding:20, marginBottom:20,
      boxShadow:"0 1px 3px rgba(0,0,0,0.06)"
    }}>
      <div style={{ display:"flex", alignItems:"center",
        justifyContent:"space-between", marginBottom:16 }}>
        <h2 style={{ margin:0, fontSize:16, fontWeight:600, color:"#1e1b4b" }}>
          ⏰ Dispense Times
        </h2>
        {saved && (
          <span style={{ fontSize:12, color:"#059669", fontWeight:500, animation:"slideIn 0.3s ease" }}>
            ✓ Saved to ESP32
          </span>
        )}
      </div>

      <div style={{ display:"flex", flexWrap:"wrap", gap:16, marginBottom:16 }}>
        {SESSIONS.map((session, i) => (
          <div key={session} style={{ flex:"1 1 140px" }}>
            <label style={{ display:"block", fontSize:12, fontWeight:500,
              color:"#6b7280", marginBottom:6 }}>
              {SESSION_ICONS[i]} {session}
            </label>
            <input
              type="time"
              value={draft[i]}
              onChange={e => handleChange(i, e.target.value)}
              disabled={disabled}
              style={{
                width:"100%", padding:"8px 12px", borderRadius:10,
                border:"1.5px solid #e5e7eb", fontSize:15,
                fontFamily:"inherit", color:"#1e1b4b",
                background: disabled ? "#f9fafb" : "#fff",
                cursor: disabled ? "not-allowed" : "text",
                boxSizing:"border-box", outline:"none",
              }}
            />
          </div>
        ))}
      </div>

      {error && (
        <p style={{ margin:"0 0 12px", fontSize:13, color:"#dc2626" }}>⚠️ {error}</p>
      )}

      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <button
          onClick={handleSave}
          disabled={disabled}
          style={{
            padding:"9px 20px", borderRadius:10,
            background: disabled ? "#e5e7eb" : "#4f46e5",
            color: disabled ? "#9ca3af" : "#fff",
            border:"none", fontWeight:600, fontSize:14,
            cursor: disabled ? "not-allowed" : "pointer",
            transition:"all 0.15s",
          }}
        >
          Save Times
        </button>
        <p style={{ margin:0, fontSize:12, color:"#9ca3af" }}>
          Changes take effect immediately on the ESP32.
        </p>
      </div>
    </div>
  );
}

// ── Weekly pill grid ──────────────────────────────────────
function ScheduleGrid({ dispensed, onManualDispense, dispensing, currentDay, schedule }) {
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:"4px" }}>
        <thead>
          <tr>
            <th style={{ textAlign:"left", padding:"6px 8px",
              fontSize:12, color:"#6b7280", fontWeight:500 }}>Day</th>
            {SESSIONS.map((s, i) => (
              <th key={s} style={{ textAlign:"center", padding:"6px 8px",
                fontSize:12, color:"#6b7280", fontWeight:500 }}>
                {SESSION_ICONS[i]} {s}<br/>
                <span style={{ fontSize:11, opacity:0.7 }}>
                  {schedule ? fmt(schedule[i]) : "—"}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, d) => (
            <tr key={day}>
              <td style={{
                padding:"6px 8px", fontSize:13,
                fontWeight: d === currentDay ? 600 : 400,
                color: d === currentDay ? "#4f46e5" : "#374151",
                whiteSpace:"nowrap"
              }}>
                {d === currentDay && (
                  <span style={{ marginRight:4, fontSize:10,
                    background:"#4f46e5", color:"#fff",
                    borderRadius:4, padding:"1px 5px" }}>TODAY</span>
                )}
                {day}
              </td>
              {SESSIONS.map((_, s) => {
                const done = dispensed?.[d]?.[s];
                return (
                  <td key={s} style={{ textAlign:"center", padding:4 }}>
                    <button
                      disabled={dispensing}
                      onClick={() => onManualDispense(d, s)}
                      title={`Dispense ${day} ${SESSIONS[s]}`}
                      style={{
                        width:40, height:40, borderRadius:10,
                        border: done ? "1.5px solid #6ee7b7"
                          : d === currentDay ? "1.5px solid #a5b4fc"
                          : "1.5px solid #e5e7eb",
                        background: done ? "#d1fae5"
                          : d === currentDay ? "#eef2ff"
                          : "#f9fafb",
                        cursor: dispensing ? "not-allowed" : "pointer",
                        fontSize:18, transition:"all 0.15s",
                        display:"flex", alignItems:"center",
                        justifyContent:"center", margin:"0 auto",
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

// ── Main App ──────────────────────────────────────────────
export default function App() {
  const { connected, status, alerts, send, setAlerts } = useWebSocket(WS_URL);
  const [confirming, setConfirming] = useState(null);

  const currentDay = status?.wday != null
    ? (status.wday === 0 ? 6 : status.wday - 1)
    : new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  const confirmDispense = () => {
    if (!confirming) return;
    send({ action:"dispense", day:confirming.day, session:confirming.session });
    setConfirming(null);
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)",
      fontFamily:"'Segoe UI', system-ui, sans-serif",
      padding:"24px 16px",
    }}>
      <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse   { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        button:hover:not(:disabled) { opacity:0.85; transform:scale(1.03); }
        input[type="time"]:focus { border-color:#4f46e5 !important; box-shadow:0 0 0 3px #eef2ff; }
      `}</style>

      <div style={{ maxWidth:720, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center",
          justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <h1 style={{ margin:0, fontSize:24, fontWeight:700, color:"#1e1b4b" }}>💊 Pill Dispenser</h1>
            <p style={{ margin:"4px 0 0", fontSize:13, color:"#6b7280" }}>Weekly medication schedule</p>
          </div>
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            background: connected ? "#d1fae5" : "#fee2e2",
            border:`1px solid ${connected ? "#6ee7b7" : "#fca5a5"}`,
            borderRadius:20, padding:"6px 14px", fontSize:13,
            color: connected ? "#065f46" : "#991b1b"
          }}>
            <span style={{
              width:8, height:8, borderRadius:"50%",
              background: connected ? "#10b981" : "#ef4444",
              display:"inline-block",
              animation: connected ? "none" : "pulse 1.5s infinite"
            }} />
            {connected ? "ESP32 Online" : "ESP32 Offline"}
          </div>
        </div>

        {/* Live info pills */}
        {status && (
          <div style={{ display:"flex", gap:12, marginBottom:20, flexWrap:"wrap" }}>
            {[
              { icon:"🕐", val: status.time },
              { icon:"📡", val: status.ip },
              { icon:"🎯", val:`Slot ${status.currentSlot} / 21` },
            ].map(({ icon, val }) => (
              <div key={val} style={{ background:"#fff", border:"1px solid #e5e7eb",
                borderRadius:12, padding:"10px 16px", fontSize:13, color:"#374151" }}>
                {icon} <strong>{val}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Countdown */}
        {status?.minutesUntilNext != null && (
          <div style={{ marginBottom:20 }}>
            <CountdownBadge
              minutesUntilNext={status.minutesUntilNext}
              nextSession={status.nextSession}
              schedule={status.schedule}
            />
          </div>
        )}

        {/* Dispensing indicator */}
        {status?.dispensing && (
          <div style={{
            background:"#eff6ff", border:"1px solid #93c5fd",
            borderRadius:10, padding:"12px 16px", marginBottom:16,
            fontSize:13, color:"#1d4ed8", display:"flex", alignItems:"center", gap:10
          }}>
            <span style={{ animation:"pulse 0.8s infinite", fontSize:18 }}>⚙️</span>
            <strong>Dispensing in progress…</strong>
          </div>
        )}

        {/* Alerts */}
        {alerts.length > 0 && (
          <div style={{ marginBottom:16 }}>
            {alerts.map(a => (
              <AlertBanner key={a.id} alert={a}
                onDismiss={id => setAlerts(prev => prev.filter(x => x.id !== id))} />
            ))}
          </div>
        )}

        {/* ── Time editor ── */}
        <ScheduleEditor
          schedule={status?.schedule}
          onSave={(parsed) => send({ action:"setschedule", schedule:parsed })}
          disabled={!connected}
        />

        {/* ── Weekly grid ── */}
        <div style={{ background:"#fff", border:"1px solid #e5e7eb",
          borderRadius:16, padding:20, marginBottom:20,
          boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ display:"flex", alignItems:"center",
            justifyContent:"space-between", marginBottom:16 }}>
            <h2 style={{ margin:0, fontSize:16, fontWeight:600, color:"#1e1b4b" }}>Weekly Schedule</h2>
            <button onClick={() => send({ action:"reset" })} style={{
              fontSize:12, padding:"5px 12px", borderRadius:8,
              border:"1px solid #e5e7eb", background:"#f9fafb",
              color:"#6b7280", cursor:"pointer"
            }}>Reset Week</button>
          </div>
          <ScheduleGrid
            dispensed={status?.dispensed}
            onManualDispense={(d, s) => setConfirming({ day:d, session:s })}
            dispensing={status?.dispensing}
            currentDay={currentDay}
            schedule={status?.schedule}
          />
          <p style={{ margin:"12px 0 0", fontSize:12, color:"#9ca3af" }}>
            Click any 💊 to manually trigger that dose. ✅ = already dispensed.
          </p>
        </div>

        {/* Offline banner */}
        {!connected && (
          <div style={{
            background:"#fff7ed", border:"1px solid #fed7aa",
            borderRadius:12, padding:"14px 18px", fontSize:13, color:"#92400e"
          }}>
            <strong>Cannot reach ESP32.</strong> Make sure it's powered on and on the same WiFi.
            Update <code>ESP32_IP</code> in App.jsx to match the IP shown in the Arduino Serial Monitor.
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirming && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.4)",
          display:"flex", alignItems:"center", justifyContent:"center", zIndex:100
        }}>
          <div style={{
            background:"#fff", borderRadius:16, padding:28,
            maxWidth:340, width:"90%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)"
          }}>
            <h3 style={{ margin:"0 0 8px", fontSize:18, color:"#1e1b4b" }}>Confirm Dispense</h3>
            <p style={{ margin:"0 0 20px", fontSize:14, color:"#6b7280" }}>
              Manually dispense <strong>{DAYS[confirming.day]}</strong>{" "}
              <strong>{SESSIONS[confirming.session]}</strong>
              {status?.schedule && <> at <strong>{fmt(status.schedule[confirming.session])}</strong></>}?
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={confirmDispense} style={{
                flex:1, padding:"10px 0", borderRadius:10,
                background:"#4f46e5", color:"#fff", border:"none",
                fontWeight:600, fontSize:14, cursor:"pointer"
              }}>Yes, Dispense</button>
              <button onClick={() => setConfirming(null)} style={{
                flex:1, padding:"10px 0", borderRadius:10,
                background:"#f3f4f6", color:"#374151", border:"none",
                fontSize:14, cursor:"pointer"
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

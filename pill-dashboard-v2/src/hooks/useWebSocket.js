import { useState, useEffect, useRef, useCallback } from "react";

export const DAYS          = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export const SESSIONS      = ["Morning","Midday","Night"];
export const SESSION_ICONS = ["🌅","☀️","🌙"];
export const SESSION_TIMES = ["9:00 AM","12:00 PM","8:00 PM"];

export const fmt = ({ hour, minute }) =>
  `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;

export const parse = (str) => {
  const [h, m] = str.split(":").map(Number);
  return { hour: h, minute: m };
};

export default function useWebSocket(url) {
  const ws           = useRef(null);
  const reconnectRef = useRef(null);
  // Track whether this hook instance is still mounted
  const activeRef    = useRef(false);

  const [connected, setConnected] = useState(false);
  const [status,    setStatus]    = useState(null);
  const [alerts,    setAlerts]    = useState([]);
  const [history,   setHistory]   = useState([]);

  useEffect(() => {
    activeRef.current = true;

    function connect() {
      // Always close any existing socket before opening a new one
      if (ws.current) {
        ws.current.onclose   = null; // prevent reconnect loop
        ws.current.onerror   = null;
        ws.current.onmessage = null;
        ws.current.close();
        ws.current = null;
      }

      if (!activeRef.current) return;

      try {
        const socket = new WebSocket(url);
        ws.current = socket;

        socket.onopen = () => {
          if (!activeRef.current || ws.current !== socket) return;
          setConnected(true);
          socket.send(JSON.stringify({ action: "ping" }));
        };

        socket.onclose = () => {
          if (!activeRef.current || ws.current !== socket) return;
          setConnected(false);
          // Reconnect after 3 seconds
          reconnectRef.current = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          if (ws.current === socket) socket.close();
        };

        socket.onmessage = (e) => {
          // Guard: ignore events from stale sockets
          if (!activeRef.current || ws.current !== socket) return;
          try {
            const msg = JSON.parse(e.data);

            if (msg.type === "status") {
              setStatus(msg);

            } else if (msg.type === "dispensed") {
              const entry = {
                id:        Date.now(),
                kind:      "dispensed",
                day:       msg.day,
                session:   msg.session,
                timestamp: new Date().toLocaleTimeString(),
                date:      new Date().toLocaleDateString(),
              };
              setHistory(h => [entry, ...h].slice(0, 50));
              setAlerts(a => [{
                id:   Date.now(),
                kind: "success",
                text: `✅ Dispensed: ${DAYS[msg.day]} ${SESSIONS[msg.session]}`,
              }, ...a].slice(0, 5));

            } else if (msg.type === "missed") {
              const entry = {
                id:        Date.now(),
                kind:      "missed",
                day:       msg.day,
                session:   msg.session,
                timestamp: new Date().toLocaleTimeString(),
                date:      new Date().toLocaleDateString(),
              };
              setHistory(h => [entry, ...h].slice(0, 50));
              setAlerts(a => [{
                id:   Date.now(),
                kind: "warning",
                text: `⚠️ Missed dose: ${DAYS[msg.day]} ${SESSIONS[msg.session]}`,
              }, ...a].slice(0, 5));
            }
          } catch {}
        };
      } catch {}
    }

    connect();

    return () => {
      // Mark as unmounted so no stale callbacks fire
      activeRef.current = false;
      clearTimeout(reconnectRef.current);
      if (ws.current) {
        ws.current.onclose   = null;
        ws.current.onerror   = null;
        ws.current.onmessage = null;
        ws.current.close();
        ws.current = null;
      }
    };
  }, [url]); // only re-run if the URL changes

  const send = useCallback((obj) => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify(obj));
  }, []);

  const dismissAlert = useCallback((id) => {
    setAlerts(a => a.filter(x => x.id !== id));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);

  return { connected, status, alerts, history, send, dismissAlert, clearHistory };
}

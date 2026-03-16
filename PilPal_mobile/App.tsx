/**
 * Pill Dispenser — React Native Android App
 * Connects to ESP32 via WebSocket over local WiFi
 *
 * Setup:
 *   npx react-native init PillDispenserApp --template react-native-template-typescript
 *   npm install @notifee/react-native react-native-vibration
 *   npx pod-install  (iOS only, skip for Android)
 *
 * Then replace App.tsx with this file.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, Modal, Vibration, Platform, Animated,
  useColorScheme, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import notifee, { AndroidImportance, AndroidStyle } from '@notifee/react-native';

// ── Config ────────────────────────────────────────────────
const ESP32_IP = '192.168.1.100'; // ← Change to your ESP32's IP
const WS_URL   = `ws://${ESP32_IP}:81`;

const DAYS     = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const SESSIONS = ['Morning','Midday','Night'];
const TIMES    = ['9:00 AM','12:00 PM','8:00 PM'];
const ICONS    = ['🌅','☀️','🌙'];

// ── Types ─────────────────────────────────────────────────
interface Status {
  currentSlot:      number;
  dispensing:       boolean;
  wifi:             boolean;
  ip:               string;
  time:             string;
  wday:             number;
  hour:             number;
  minute:           number;
  minutesUntilNext: number;
  nextSession:      number;
  dispensed:        boolean[][];
}

interface AppAlert {
  id:   number;
  kind: 'success' | 'warning';
  text: string;
}

// ── Push notification helper ──────────────────────────────
async function sendNotification(title: string, body: string, isWarning = false) {
  await notifee.requestPermission();
  const channelId = await notifee.createChannel({
    id:         'pill_dispenser',
    name:       'Pill Dispenser',
    importance: AndroidImportance.HIGH,
    vibration:  true,
  });
  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId,
      importance: AndroidImportance.HIGH,
      style: { type: AndroidStyle.BIGTEXT, text: body },
      color: isWarning ? '#f59e0b' : '#10b981',
      smallIcon: 'ic_notification',
      pressAction: { id: 'default' },
    },
  });
}

// ── WebSocket hook ────────────────────────────────────────
function useWebSocket(url: string) {
  const ws              = useRef<WebSocket | null>(null);
  const reconnectRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);
  const [status,    setStatus]    = useState<Status | null>(null);
  const [alerts,    setAlerts]    = useState<AppAlert[]>([]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        setConnected(true);
        ws.current?.send(JSON.stringify({ action: 'ping' }));
      };

      ws.current.onclose = () => {
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.current.onerror = () => ws.current?.close();

      ws.current.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === 'status') {
            setStatus(msg);

          } else if (msg.type === 'dispensed') {
            const text = `${DAYS[msg.day]} ${SESSIONS[msg.session]} dispensed`;
            setAlerts(a => [{ id: Date.now(), kind: 'success', text: `✅ ${text}` }, ...a].slice(0, 5));
            Vibration.vibrate([0, 200, 100, 200]); // double buzz
            await sendNotification('💊 Dose Dispensed', text);

          } else if (msg.type === 'missed') {
            const text = `Missed: ${DAYS[msg.day]} ${SESSIONS[msg.session]} (${TIMES[msg.session]})`;
            setAlerts(a => [{ id: Date.now(), kind: 'warning', text: `⚠️ ${text}` }, ...a].slice(0, 5));
            Vibration.vibrate([0, 500, 200, 500, 200, 500]); // triple long buzz
            await sendNotification('⚠️ Missed Dose!', text, true);
          }
        } catch {}
      };
    } catch {}
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectRef.current!);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((obj: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(obj));
    }
  }, []);

  const dismissAlert = useCallback((id: number) => {
    setAlerts(a => a.filter(x => x.id !== id));
  }, []);

  return { connected, status, alerts, send, dismissAlert };
}

// ── Countdown pill ────────────────────────────────────────
function NextDose({ minutes, session }: { minutes: number; session: number }) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <View style={styles.nextDoseRow}>
      <Text style={styles.nextDoseIcon}>{ICONS[session]}</Text>
      <Text style={styles.nextDoseText}>
        Next dose in <Text style={styles.bold}>{label}</Text> — {TIMES[session]}
      </Text>
    </View>
  );
}

// ── Alert banner ──────────────────────────────────────────
function AlertBanner({ alert, onDismiss }: { alert: AppAlert; onDismiss: (id: number) => void }) {
  const isWarn = alert.kind === 'warning';
  return (
    <View style={[styles.alertRow, isWarn ? styles.alertWarn : styles.alertSuccess]}>
      <Text style={[styles.alertText, isWarn ? styles.alertTextWarn : styles.alertTextSuccess]}>
        {alert.text}
      </Text>
      <TouchableOpacity onPress={() => onDismiss(alert.id)}>
        <Text style={[styles.alertDismiss, isWarn ? styles.alertTextWarn : styles.alertTextSuccess]}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Schedule grid ─────────────────────────────────────────
function ScheduleGrid({
  dispensed, onPress, dispensing, todayIdx,
}: {
  dispensed: boolean[][] | undefined;
  onPress:   (d: number, s: number) => void;
  dispensing: boolean;
  todayIdx:   number;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Header */}
        <View style={styles.gridHeaderRow}>
          <View style={styles.gridDayCell} />
          {SESSIONS.map((s, i) => (
            <View key={s} style={styles.gridSessionCell}>
              <Text style={styles.gridSessionIcon}>{ICONS[i]}</Text>
              <Text style={styles.gridSessionLabel}>{s}</Text>
              <Text style={styles.gridSessionTime}>{TIMES[i]}</Text>
            </View>
          ))}
        </View>

        {/* Rows */}
        {DAYS.map((day, d) => (
          <View key={day} style={[styles.gridRow, d === todayIdx && styles.gridRowToday]}>
            <View style={styles.gridDayCell}>
              {d === todayIdx && <View style={styles.todayDot} />}
              <Text style={[styles.gridDayText, d === todayIdx && styles.gridDayTextToday]}>
                {day.slice(0, 3)}
              </Text>
            </View>
            {SESSIONS.map((_, s) => {
              const done = dispensed?.[d]?.[s];
              return (
                <View key={s} style={styles.gridSessionCell}>
                  <TouchableOpacity
                    disabled={dispensing}
                    onPress={() => onPress(d, s)}
                    style={[
                      styles.pillBtn,
                      done        && styles.pillBtnDone,
                      d === todayIdx && !done && styles.pillBtnToday,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pillBtnIcon}>{done ? '✅' : '💊'}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Main App ──────────────────────────────────────────────
export default function App() {
  const scheme = useColorScheme();
  const dark   = scheme === 'dark';

  const { connected, status, alerts, send, dismissAlert } = useWebSocket(WS_URL);
  const [confirming, setConfirming] = useState<{ day: number; session: number } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for offline dot
  useEffect(() => {
    if (!connected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [connected]);

  const todayIdx = status?.wday != null
    ? (status.wday === 0 ? 6 : status.wday - 1)
    : (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);

  const confirmDispense = () => {
    if (!confirming) return;
    send({ action: 'dispense', day: confirming.day, session: confirming.session });
    setConfirming(null);
  };

  const bg   = dark ? '#0f0f1a' : '#f4f6ff';
  const card = dark ? '#1a1a2e' : '#ffffff';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        backgroundColor={bg}
      />

      <ScrollView contentContainerStyle={[styles.scroll, { backgroundColor: bg }]}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, dark && styles.textLight]}>💊 Pill Dispenser</Text>
            <Text style={styles.subtitle}>Weekly medication schedule</Text>
          </View>
          <View style={[styles.statusBadge,
            connected ? styles.statusOnline : styles.statusOffline]}>
            <Animated.View style={[styles.statusDot,
              connected ? styles.dotOnline : styles.dotOffline,
              !connected && { opacity: pulseAnim }]} />
            <Text style={[styles.statusText,
              connected ? styles.statusTextOnline : styles.statusTextOffline]}>
              {connected ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {/* Live info pills */}
        {status && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}>
            <View style={styles.infoPillsRow}>
              {[
                { icon: '🕐', val: status.time },
                { icon: '📡', val: status.ip },
                { icon: '🎯', val: `Slot ${status.currentSlot}/21` },
              ].map(({ icon, val }) => (
                <View key={val} style={[styles.infoPill, { backgroundColor: card }]}>
                  <Text style={styles.infoPillText}>{icon} <Text style={[styles.bold, dark && styles.textLight]}>{val}</Text></Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Next dose */}
        {status?.minutesUntilNext != null && (
          <View style={[styles.card, { backgroundColor: card, marginBottom: 12 }]}>
            <NextDose minutes={status.minutesUntilNext} session={status.nextSession} />
          </View>
        )}

        {/* Dispensing indicator */}
        {status?.dispensing && (
          <View style={[styles.dispensingBar, { backgroundColor: card }]}>
            <ActivityIndicator size="small" color="#4f46e5" />
            <Text style={styles.dispensingText}>Dispensing in progress…</Text>
          </View>
        )}

        {/* Alerts */}
        {alerts.map(a => (
          <AlertBanner key={a.id} alert={a} onDismiss={dismissAlert} />
        ))}

        {/* Schedule grid */}
        <View style={[styles.card, { backgroundColor: card }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, dark && styles.textLight]}>Weekly Schedule</Text>
            <TouchableOpacity
              onPress={() => Alert.alert('Reset Week', 'Mark all slots as not dispensed?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: () => send({ action: 'reset' }) },
              ])}
              style={styles.resetBtn}>
              <Text style={styles.resetBtnText}>Reset Week</Text>
            </TouchableOpacity>
          </View>

          <ScheduleGrid
            dispensed={status?.dispensed}
            onPress={(d, s) => setConfirming({ day: d, session: s })}
            dispensing={!!status?.dispensing}
            todayIdx={todayIdx}
          />

          <Text style={styles.gridHint}>
            Tap 💊 to manually trigger that dose · ✅ = dispensed
          </Text>
        </View>

        {/* Offline message */}
        {!connected && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineBannerTitle}>Cannot reach ESP32</Text>
            <Text style={styles.offlineBannerText}>
              Make sure it's powered on and on the same WiFi network.
              Update <Text style={styles.mono}>ESP32_IP</Text> in App.tsx if needed.
            </Text>
          </View>
        )}

      </ScrollView>

      {/* Confirm Modal */}
      <Modal transparent visible={!!confirming} animationType="fade"
        onRequestClose={() => setConfirming(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: card }]}>
            <Text style={[styles.modalTitle, dark && styles.textLight]}>Confirm Dispense</Text>
            {confirming && (
              <Text style={styles.modalBody}>
                Manually dispense{'\n'}
                <Text style={styles.bold}>{DAYS[confirming.day]}</Text> —{' '}
                <Text style={styles.bold}>{SESSIONS[confirming.session]}</Text>
                {'\n'}({TIMES[confirming.session]})?
              </Text>
            )}
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmDispense}>
                <Text style={styles.modalConfirmText}>Yes, Dispense</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setConfirming(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:              { flex: 1 },
  scroll:            { padding: 16, paddingBottom: 40 },

  header:            { flexDirection: 'row', justifyContent: 'space-between',
                       alignItems: 'center', marginBottom: 20 },
  title:             { fontSize: 22, fontWeight: '700', color: '#1e1b4b' },
  subtitle:          { fontSize: 13, color: '#6b7280', marginTop: 2 },
  textLight:         { color: '#f1f5f9' },

  statusBadge:       { flexDirection: 'row', alignItems: 'center',
                       borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
                       borderWidth: 1 },
  statusOnline:      { backgroundColor: '#d1fae5', borderColor: '#6ee7b7' },
  statusOffline:     { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  statusDot:         { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  dotOnline:         { backgroundColor: '#10b981' },
  dotOffline:        { backgroundColor: '#ef4444' },
  statusText:        { fontSize: 13, fontWeight: '500' },
  statusTextOnline:  { color: '#065f46' },
  statusTextOffline: { color: '#991b1b' },

  infoPillsRow:      { flexDirection: 'row', gap: 8, paddingRight: 8 },
  infoPill:          { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                       borderWidth: 1, borderColor: '#e5e7eb' },
  infoPillText:      { fontSize: 13, color: '#6b7280' },

  card:              { borderRadius: 16, padding: 16, marginBottom: 16,
                       borderWidth: 1, borderColor: '#e5e7eb' },
  cardHeader:        { flexDirection: 'row', justifyContent: 'space-between',
                       alignItems: 'center', marginBottom: 14 },
  cardTitle:         { fontSize: 16, fontWeight: '600', color: '#1e1b4b' },

  resetBtn:          { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
                       paddingHorizontal: 10, paddingVertical: 5 },
  resetBtnText:      { fontSize: 12, color: '#6b7280' },

  nextDoseRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextDoseIcon:      { fontSize: 20 },
  nextDoseText:      { fontSize: 14, color: '#0369a1' },
  bold:              { fontWeight: '700' },

  dispensingBar:     { flexDirection: 'row', alignItems: 'center', gap: 10,
                       borderRadius: 10, padding: 12, marginBottom: 12,
                       borderWidth: 1, borderColor: '#93c5fd' },
  dispensingText:    { fontSize: 13, color: '#1d4ed8', fontWeight: '500' },

  alertRow:          { flexDirection: 'row', justifyContent: 'space-between',
                       alignItems: 'center', borderRadius: 10, padding: 12,
                       marginBottom: 8, borderWidth: 1 },
  alertSuccess:      { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
  alertWarn:         { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  alertText:         { fontSize: 13, flex: 1 },
  alertTextSuccess:  { color: '#065f46' },
  alertTextWarn:     { color: '#92400e' },
  alertDismiss:      { fontSize: 20, marginLeft: 10, opacity: 0.6 },

  // Grid
  gridHeaderRow:     { flexDirection: 'row', marginBottom: 4 },
  gridRow:           { flexDirection: 'row', alignItems: 'center',
                       paddingVertical: 4, borderRadius: 8 },
  gridRowToday:      { backgroundColor: '#eef2ff' },
  gridDayCell:       { width: 48, flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridDayText:       { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  gridDayTextToday:  { color: '#4f46e5', fontWeight: '700' },
  todayDot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4f46e5' },
  gridSessionCell:   { width: 72, alignItems: 'center', paddingVertical: 4 },
  gridSessionIcon:   { fontSize: 14 },
  gridSessionLabel:  { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  gridSessionTime:   { fontSize: 10, color: '#9ca3af' },

  pillBtn:           { width: 44, height: 44, borderRadius: 10, borderWidth: 1.5,
                       borderColor: '#e5e7eb', backgroundColor: '#f9fafb',
                       alignItems: 'center', justifyContent: 'center' },
  pillBtnDone:       { backgroundColor: '#d1fae5', borderColor: '#6ee7b7' },
  pillBtnToday:      { backgroundColor: '#eef2ff', borderColor: '#a5b4fc' },
  pillBtnIcon:       { fontSize: 20 },

  gridHint:          { fontSize: 11, color: '#9ca3af', marginTop: 12, textAlign: 'center' },

  offlineBanner:     { backgroundColor: '#fff7ed', borderRadius: 12, padding: 16,
                       borderWidth: 1, borderColor: '#fed7aa' },
  offlineBannerTitle:{ fontSize: 14, fontWeight: '700', color: '#92400e', marginBottom: 6 },
  offlineBannerText: { fontSize: 13, color: '#92400e', lineHeight: 20 },
  mono:              { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // Modal
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
                       alignItems: 'center', justifyContent: 'center' },
  modalBox:          { width: '85%', borderRadius: 20, padding: 24,
                       elevation: 10, shadowColor: '#000',
                       shadowOffset: { width: 0, height: 10 },
                       shadowOpacity: 0.2, shadowRadius: 20 },
  modalTitle:        { fontSize: 18, fontWeight: '700', color: '#1e1b4b', marginBottom: 10 },
  modalBody:         { fontSize: 14, color: '#6b7280', lineHeight: 22, marginBottom: 20 },
  modalBtns:         { flexDirection: 'row', gap: 10 },
  modalConfirm:      { flex: 1, backgroundColor: '#4f46e5', borderRadius: 12,
                       padding: 12, alignItems: 'center' },
  modalConfirmText:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalCancel:       { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12,
                       padding: 12, alignItems: 'center' },
  modalCancelText:   { color: '#374151', fontSize: 14 },
});

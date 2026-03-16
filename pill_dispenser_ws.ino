/*
  ============================================================
  Weekly Pill Dispenser — ESP32 WROOM + 28BYJ-48 + ULN2003
  + WebSocket Server for React Dashboard
  ============================================================
  Install via Arduino Library Manager:
    - "WebSockets" by Markus Sattler  (search: WebSockets)
    - "ArduinoJson" by Benoit Blanchon (search: ArduinoJson)

  Wiring (ULN2003 → ESP32):
    IN1 → GPIO 19 | IN2 → GPIO 18 | IN3 → GPIO 5 | IN4 → GPIO 17
    VCC → 5V external | GND → GND (shared with ESP32)
  ============================================================
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include "time.h"

// ── WiFi Credentials ──────────────────────────────────────
const char* WIFI_SSID        = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD    = "YOUR_WIFI_PASSWORD";

// ── NTP Settings ──────────────────────────────────────────
const char* NTP_SERVER          = "pool.ntp.org";
const long  GMT_OFFSET_SEC      = 3600;  // UTC+1 for Tunisia
const int   DAYLIGHT_OFFSET_SEC = 0;

// ── Stepper Motor Pins ────────────────────────────────────
#define IN1 19
#define IN2 18
#define IN3  5
#define IN4 17

// ── Stepper Configuration ─────────────────────────────────
#define STEPS_PER_REV   4096
#define STEP_DELAY_US   1000
#define NUM_SLOTS       22
#define STEPS_PER_SLOT  (STEPS_PER_REV / NUM_SLOTS)

// ── Half-step sequence ────────────────────────────────────
const int stepSequence[8][4] = {
  {1,0,0,0},{1,1,0,0},{0,1,0,0},{0,1,1,0},
  {0,0,1,0},{0,0,1,1},{0,0,0,1},{1,0,0,1}
};

// ── Schedule ──────────────────────────────────────────────
struct DispenseTime { int hour; int minute; };
const DispenseTime schedule[3] = {
  { 9,  0},  // Morning
  {12,  0},  // Midday
  {20,  0}   // Night
};

// ── State ─────────────────────────────────────────────────
int  currentSlot       = 0;
bool wifiConnected     = false;
bool dispensing        = false;
int  lastDispensedHour = -1;
int  lastDispensedDay  = -1;

// dispensed[dayIndex][session] — true if that slot was dispensed this week
bool dispensed[7][3] = {};

// ── WebSocket Server on port 81 ───────────────────────────
WebSocketsServer webSocket = WebSocketsServer(81);

// ─────────────────────────────────────────────────────────
// Stepper helpers
// ─────────────────────────────────────────────────────────
void stepMotor(int stepIndex) {
  digitalWrite(IN1, stepSequence[stepIndex][0]);
  digitalWrite(IN2, stepSequence[stepIndex][1]);
  digitalWrite(IN3, stepSequence[stepIndex][2]);
  digitalWrite(IN4, stepSequence[stepIndex][3]);
}

void releaseStepper() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

void rotateSteps(int steps) {
  static int stepIndex = 0;
  for (int i = 0; i < steps; i++) {
    stepIndex = (stepIndex + 1) % 8;
    stepMotor(stepIndex);
    delayMicroseconds(STEP_DELAY_US);
  }
  releaseStepper();
}

void advanceOneSlot() {
  rotateSteps(STEPS_PER_SLOT);
  currentSlot = (currentSlot + 1) % NUM_SLOTS;
  Serial.printf("[Stepper] Moved to slot %d\n", currentSlot);
}

// ─────────────────────────────────────────────────────────
// Day / Slot helpers
// ─────────────────────────────────────────────────────────
int getDayIndex(int tm_wday) {
  return (tm_wday == 0) ? 6 : (tm_wday - 1);  // Mon=0 ... Sun=6
}

int getTargetSlot(int dayIndex, int sessionIndex) {
  return 1 + (dayIndex * 3) + sessionIndex;
}

// ─────────────────────────────────────────────────────────
// Broadcast current status JSON to all WebSocket clients
// ─────────────────────────────────────────────────────────
void broadcastStatus() {
  struct tm timeInfo;
  bool hasTime = getLocalTime(&timeInfo);

  StaticJsonDocument<1024> doc;
  doc["type"]        = "status";
  doc["currentSlot"] = currentSlot;
  doc["dispensing"]  = dispensing;
  doc["wifi"]        = (WiFi.status() == WL_CONNECTED);
  doc["ip"]          = WiFi.localIP().toString();

  if (hasTime) {
    char timeBuf[20];
    strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S", &timeInfo);
    doc["time"]   = timeBuf;
    doc["wday"]   = timeInfo.tm_wday;
    doc["hour"]   = timeInfo.tm_hour;
    doc["minute"] = timeInfo.tm_min;

    // Next dose calculation
    int nowMinutes = timeInfo.tm_hour * 60 + timeInfo.tm_min;
    int schedMins[3] = {9*60, 12*60, 20*60};
    int nextMins = -1;
    int nextSession = -1;
    for (int s = 0; s < 3; s++) {
      if (schedMins[s] > nowMinutes) {
        nextMins    = schedMins[s];
        nextSession = s;
        break;
      }
    }
    if (nextMins == -1) { nextMins = 9*60; nextSession = 0; } // tomorrow morning
    doc["nextDoseMinutes"] = nextMins;
    doc["nextSession"]     = nextSession;
    doc["minutesUntilNext"] = (nextMins > nowMinutes)
                               ? (nextMins - nowMinutes)
                               : (nextMins + 24*60 - nowMinutes);
  }

  // Dispensed grid [7 days][3 sessions]
  JsonArray grid = doc.createNestedArray("dispensed");
  for (int d = 0; d < 7; d++) {
    JsonArray row = grid.createNestedArray();
    for (int s = 0; s < 3; s++) row.add(dispensed[d][s]);
  }

  String json;
  serializeJson(doc, json);
  webSocket.broadcastTXT(json);
}

// ─────────────────────────────────────────────────────────
// Dispense logic
// ─────────────────────────────────────────────────────────
void dispense(int targetSlot, int dayIndex, int sessionIndex) {
  dispensing = true;
  broadcastStatus();

  int stepsNeeded = (targetSlot - currentSlot + NUM_SLOTS) % NUM_SLOTS;
  Serial.printf("[Dispenser] Moving %d slot(s) → slot %d\n", stepsNeeded, targetSlot);

  for (int i = 0; i < stepsNeeded; i++) {
    advanceOneSlot();
    delay(100);
  }

  // Mark as dispensed
  if (dayIndex >= 0 && dayIndex < 7 && sessionIndex >= 0 && sessionIndex < 3) {
    dispensed[dayIndex][sessionIndex] = true;
  }

  dispensing = false;
  Serial.printf("[Dispenser] Done — slot %d dispensed\n", targetSlot);
  broadcastStatus();

  // Send a separate alert event
  StaticJsonDocument<128> alert;
  alert["type"]    = "dispensed";
  alert["slot"]    = targetSlot;
  alert["day"]     = dayIndex;
  alert["session"] = sessionIndex;
  String alertJson;
  serializeJson(alert, alertJson);
  webSocket.broadcastTXT(alertJson);
}

// ─────────────────────────────────────────────────────────
// WebSocket event handler
// ─────────────────────────────────────────────────────────
void onWebSocketEvent(uint8_t clientNum, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {

    case WStype_CONNECTED:
      Serial.printf("[WS] Client #%d connected\n", clientNum);
      broadcastStatus();  // send full state on connect
      break;

    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%d disconnected\n", clientNum);
      break;

    case WStype_TEXT: {
      StaticJsonDocument<256> cmd;
      DeserializationError err = deserializeJson(cmd, payload, length);
      if (err) { Serial.println("[WS] Bad JSON"); break; }

      const char* action = cmd["action"];

      // Manual dispense: { "action": "dispense", "day": 0, "session": 1 }
      if (strcmp(action, "dispense") == 0) {
        int day     = cmd["day"]     | -1;
        int session = cmd["session"] | -1;
        if (day >= 0 && day < 7 && session >= 0 && session < 3) {
          int slot = getTargetSlot(day, session);
          Serial.printf("[WS] Manual dispense → day=%d session=%d slot=%d\n", day, session, slot);
          dispense(slot, day, session);
        }
      }

      // Ping: { "action": "ping" }
      else if (strcmp(action, "ping") == 0) {
        broadcastStatus();
      }

      // Reset dispensed grid: { "action": "reset" }
      else if (strcmp(action, "reset") == 0) {
        memset(dispensed, 0, sizeof(dispensed));
        Serial.println("[WS] Dispensed grid reset");
        broadcastStatus();
      }

      break;
    }

    default: break;
  }
}

// ─────────────────────────────────────────────────────────
// WiFi + NTP
// ─────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
    Serial.println("[NTP] Time synchronized.");
  } else {
    Serial.println("\n[WiFi] FAILED.");
  }
}

// ─────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Weekly Pill Dispenser Starting ===");

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  releaseStepper();

  connectWiFi();

  // Start WebSocket server
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.println("[WS] WebSocket server started on port 81");
  Serial.println("[System] Ready.");
}

// ─────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────
unsigned long lastCheck     = 0;
unsigned long lastBroadcast = 0;

void loop() {
  webSocket.loop();  // handle WebSocket events first

  // Reconnect WiFi if lost
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost, reconnecting...");
    connectWiFi();
    delay(5000);
    return;
  }

  unsigned long now = millis();

  // Broadcast status every 10 seconds (keeps website clock live)
  if (now - lastBroadcast > 10000) {
    lastBroadcast = now;
    broadcastStatus();
  }

  // Check schedule every 30 seconds
  if (now - lastCheck > 30000) {
    lastCheck = now;

    struct tm timeInfo;
    if (!getLocalTime(&timeInfo)) {
      Serial.println("[NTP] Failed to get time");
      return;
    }

    int currentHour   = timeInfo.tm_hour;
    int currentMinute = timeInfo.tm_min;
    int currentWday   = timeInfo.tm_wday;

    for (int s = 0; s < 3; s++) {
      if (currentHour   == schedule[s].hour &&
          currentMinute == schedule[s].minute) {

        if (!(lastDispensedHour == currentHour && lastDispensedDay == currentWday)) {
          int dayIndex   = getDayIndex(currentWday);
          int targetSlot = getTargetSlot(dayIndex, s);

          Serial.printf("[Schedule] Auto-dispense: day=%d session=%d slot=%d\n",
                        dayIndex, s, targetSlot);

          // Send missed-dose alert if previous slot was never dispensed
          if (s > 0 && !dispensed[dayIndex][s-1]) {
            StaticJsonDocument<128> missed;
            missed["type"]    = "missed";
            missed["day"]     = dayIndex;
            missed["session"] = s - 1;
            String missedJson;
            serializeJson(missed, missedJson);
            webSocket.broadcastTXT(missedJson);
          }

          dispense(targetSlot, dayIndex, s);
          lastDispensedHour = currentHour;
          lastDispensedDay  = currentWday;
        }
        break;
      }
    }
  }
}

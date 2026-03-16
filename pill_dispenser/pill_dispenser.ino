/*
  ============================================================
  Weekly Pill Dispenser — ESP32 WROOM + 28BYJ-48 + ULN2003
  ============================================================
  22 compartments:
    - Slot 0  : Home / Empty
    - Slot 1  : Monday    Morning   (9:00 AM)
    - Slot 2  : Monday    Midday    (12:00 PM)
    - Slot 3  : Monday    Night     (8:00 PM)
    - Slot 4  : Tuesday   Morning
    - Slot 5  : Tuesday   Midday
    - Slot 6  : Tuesday   Night
    - ...continuing pattern...
    - Slot 19 : Sunday    Morning
    - Slot 20 : Sunday    Midday
    - Slot 21 : Sunday    Night

  Wiring (ULN2003 → ESP32):
    IN1 → GPIO 19
    IN2 → GPIO 18
    IN3 → GPIO 5
    IN4 → GPIO 17
    VCC → 5V (external recommended)
    GND → GND
  ============================================================
*/

#include <Arduino.h>
#include <WiFi.h>
#include "time.h"

// ── WiFi Credentials ──────────────────────────────────────
const char* WIFI_SSID     = "Ooredoo-ALHN-DA99";
const char* WIFI_PASSWORD = "RtvD4bYV9q";

// ── NTP Settings ──────────────────────────────────────────
const char* NTP_SERVER    = "pool.ntp.org";
const long  GMT_OFFSET_SEC   = 3600;   // Change to your UTC offset in seconds
                                        // Tunisia = UTC+1 → 3600
const int   DAYLIGHT_OFFSET_SEC = 0;   // Tunisia has no DST

// ── Stepper Motor Pins ────────────────────────────────────
#define IN1 19
#define IN2 18
#define IN3  5
#define IN4 17

// ── Stepper Configuration ─────────────────────────────────
// 28BYJ-48: 4096 steps = 1 full revolution (half-step mode)
#define STEPS_PER_REV     4096
#define STEP_DELAY_US     1000   // microseconds between steps (lower = faster, min ~800)

// 22 compartments → each slot = 360°/22 ≈ 16.36°
#define NUM_SLOTS         22
#define STEPS_PER_SLOT    (STEPS_PER_REV / NUM_SLOTS)  // ~186 steps

// ── Half-step sequence for 28BYJ-48 ──────────────────────
const int stepSequence[8][4] = {
  {1, 0, 0, 0},
  {1, 1, 0, 0},
  {0, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 0},
  {0, 0, 1, 1},
  {0, 0, 0, 1},
  {1, 0, 0, 1}
};

// ── State ─────────────────────────────────────────────────
int  currentSlot    = 0;    // starts at home (slot 0)
bool wifiConnected  = false;

// Tracks last dispense to avoid double-firing
int  lastDispensedHour = -1;
int  lastDispensedDay  = -1;

// ── Dispense Schedule ─────────────────────────────────────
// Three dispense times per day
struct DispenseTime { int hour; int minute; };
const DispenseTime schedule[3] = {
  { 4,  15},   // Morning
  {12,  0},   // Midday
  {20,  0}    // Night (8 PM)
};

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
  // De-energize all coils to prevent heat buildup
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

// Rotate forward by 'steps' steps
void rotateSteps(int steps) {
  static int stepIndex = 0;
  for (int i = 0; i < steps; i++) {
    stepIndex = (stepIndex + 1) % 8;
    stepMotor(stepIndex);
    delayMicroseconds(STEP_DELAY_US);
  }
  releaseStepper();
}

// Advance exactly one slot forward
void advanceOneSlot() {
  rotateSteps(STEPS_PER_SLOT);
  currentSlot = (currentSlot + 1) % NUM_SLOTS;
  Serial.printf("[Stepper] Moved to slot %d\n", currentSlot);
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
    Serial.println("\n[WiFi] FAILED. Time will not be available!");
  }
}



// ─────────────────────────────────────────────────────────
// Slot calculation
// ─────────────────────────────────────────────────────────
/*
  Slot layout:
    Slot 0  = Home
    Slot 1  = Mon Morning,  Slot 2  = Mon Midday,  Slot 3  = Mon Night
    Slot 4  = Tue Morning,  Slot 5  = Tue Midday,  Slot 6  = Tue Night
    ...
    Slot 19 = Sun Morning,  Slot 20 = Sun Midday,  Slot 21 = Sun Night

  tm_wday: 0=Sunday, 1=Monday ... 6=Saturday
  We remap so Monday=0 ... Sunday=6
*/
int getDayIndex(int tm_wday) {
  // Monday(1)→0, Tuesday(2)→1, ..., Sunday(0)→6
  return (tm_wday == 0) ? 6 : (tm_wday - 1);
}

int getTargetSlot(int dayIndex, int sessionIndex) {
  // sessionIndex: 0=Morning, 1=Midday, 2=Night
  return 1 + (dayIndex * 3) + sessionIndex;
}

// ─────────────────────────────────────────────────────────
// Dispense logic
// ─────────────────────────────────────────────────────────
void dispense(int targetSlot) {
  if (targetSlot == currentSlot) {
    Serial.println("[Dispenser] Already at correct slot. No move needed.");
    return;
  }

  // Always rotate forward (never backward)
  int stepsNeeded = (targetSlot - currentSlot + NUM_SLOTS) % NUM_SLOTS;
  Serial.printf("[Dispenser] Moving %d slot(s) forward to slot %d...\n",
                stepsNeeded, targetSlot);

  for (int i = 0; i < stepsNeeded; i++) {
    advanceOneSlot();
    delay(100);
  }
  Serial.printf("[Dispenser] ✓ Dispensed slot %d\n", targetSlot);
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

  Serial.println("[System] Ready. Waiting for dispense times...");
}

// ─────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────
void loop() {
  // Re-check WiFi every loop
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection, reconnecting...");
    connectWiFi();
    delay(5000);
    return;
  }

  struct tm timeInfo;
  if (!getLocalTime(&timeInfo)) {
    Serial.println("[NTP] Failed to get time, retrying...");
    delay(5000);
    return;
  }

  int currentHour   = timeInfo.tm_hour;
  int currentMinute = timeInfo.tm_min;
  int currentWday   = timeInfo.tm_wday;

  // Check each scheduled time
  for (int s = 0; s < 3; s++) {
    if (currentHour   == schedule[s].hour   &&
        currentMinute == schedule[s].minute) {

      // Only fire once per scheduled event
      if (!(lastDispensedHour == currentHour && lastDispensedDay == currentWday)) {
        int dayIndex    = getDayIndex(currentWday);
        int targetSlot  = getTargetSlot(dayIndex, s);

        Serial.printf("[Schedule] Triggered: Day=%d Session=%d → Slot %d\n",
                      dayIndex, s, targetSlot);

        dispense(targetSlot);

        lastDispensedHour = currentHour;
        lastDispensedDay  = currentWday;
      }
      break;
    }
  }

  delay(30000); // Check every 30 seconds
}

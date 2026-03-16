# Pill Dispenser — React Native Android App

## Prerequisites
- Node.js 18+
- Android Studio + Android SDK
- Java 17
- A physical Android device or emulator

---

## 1. Create the project

```bash
npx react-native init PillDispenserApp --template react-native-template-typescript
cd PillDispenserApp
```

---

## 2. Install dependencies

```bash
npm install @notifee/react-native
```

---

## 3. Add files

| File | Destination |
|------|------------|
| `App.tsx` | Replace `PillDispenserApp/App.tsx` |
| `ic_notification.xml` | `android/app/src/main/res/drawable/ic_notification.xml` |
| `colors.xml` | `android/app/src/main/res/values/colors.xml` |

---

## 4. Configure your ESP32 IP

Open `App.tsx` and change line 22:
```ts
const ESP32_IP = '192.168.1.100'; // ← Your ESP32's actual IP
```

Find the IP in Arduino Serial Monitor after uploading the ESP32 sketch.

---

## 5. Android permissions

Add these to `android/app/src/main/AndroidManifest.xml`
inside the `<manifest>` tag (before `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

---

## 6. Notifee setup (auto-linked on Android)

Notifee links automatically on Android. Just rebuild:

```bash
npx react-native run-android
```

---

## 7. Splash screen (optional but recommended)

Install react-native-bootsplash for a polished splash:

```bash
npm install react-native-bootsplash
npx react-native generate-bootsplash assets/bootsplash_logo.png \
  --background-color=#1e1b4b \
  --logo-width=100
```

Then in `App.tsx`, add at the top of the `App` component:
```ts
import RNBootSplash from 'react-native-bootsplash';
useEffect(() => { RNBootSplash.hide({ fade: true }); }, []);
```

---

## 8. Build release APK

```bash
cd android
./gradlew assembleRelease
```

APK will be at:
`android/app/build/outputs/apk/release/app-release.apk`

Copy to your phone and install!

---

## Features

| Feature | Details |
|---------|---------|
| WebSocket | Connects to ESP32 on port 81, auto-reconnects every 3s |
| Live status | Clock, IP, current slot updated every 10s |
| Weekly grid | All 7 days × 3 sessions, tap to manually dispense |
| Confirmation modal | Prevents accidental taps |
| Dark mode | Follows system theme automatically |
| Vibration | Double buzz on dispense, triple on missed dose |
| Push notifications | System notification with channel "Pill Dispenser" |
| Missed dose alert | Shown if a session passes without being dispensed |
| Reset week | Clears the dispensed grid on ESP32 |

---

## Troubleshooting

**App can't connect to ESP32**
- Phone and ESP32 must be on the same WiFi network
- Check the IP in `App.tsx` matches Serial Monitor output
- Try pinging the IP from your phone's browser: `http://192.168.x.x`

**Notifications not showing**
- On Android 13+, you must grant notification permission when prompted
- Check that `POST_NOTIFICATIONS` is in `AndroidManifest.xml`

**WebSocket closes immediately**
- Make sure the ESP32 sketch includes `webSocket.loop()` in `loop()`
- Ensure the `WebSockets` library by Markus Sattler is installed in Arduino IDE

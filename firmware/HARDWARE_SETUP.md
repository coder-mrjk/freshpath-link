# FreshPath Link – Hardware Wiring & Setup Guide

Two ESP32 nodes feed the FreshPath web application:

| Node | Hardware | Writes to | Shown in |
|---|---|---|---|
| **Truck GPS (GPS-01)** | ESP32 DevKit + u-blox NEO-M8N | `gpsUnits/GPS-01` (every 60 s) | Move (driver) portal – trip start / live tracker / end |
| **Storage (STORE-01)** | ESP32 DevKit + DHT22 (AM2302) | `mandis/<MANDI_DOC_ID>` + `mandis/<id>/readings` (every 60 s) | Mandi Hub – temperature, humidity, 24 h rolling chart |

---

## 1. Shopping List
- **ESP32 DevKit WROOM-32** × 2 (Do NOT use WROVER; on WROVER GPIO16/17 are reserved for PSRAM)
- **u-blox NEO-M8N GPS Module** with ceramic patch antenna × 1
- **DHT22 / AM2302 Sensor** × 1 (3-pin breakout module with built-in pull-up recommended; or bare 4-pin + 10 kΩ resistor)
- **Breadboard + Jumper Wires** (Female-to-Female & Male-to-Female)
- **Micro-USB cables** × 2
- *(Optional)* 2× LEDs + 2× 330 Ω resistors for external vehicle status indicators
- *(Optional)* Always-on USB Power Bank or 12V-to-5V car charger for the truck node

---

## 2. Wiring & Hardware Pinouts

### Truck GPS Node – ESP32 + u-blox NEO-M8N

```
u-blox NEO-M8N                     ESP32 DevKit V1 (38-pin WROOM-32)
──────────────────────────────────────────────────────────────────────
VCC  ────────────────────────────► 3V3   (or 5V/VIN if module has 5V regulator)
GND  ────────────────────────────► GND
TX   ────────────────────────────► GPIO16 (RX2)    [GPS TX -> ESP32 RX2]
RX   ────────────────────────────► GPIO17 (TX2)    [GPS RX <- ESP32 TX2]

Status Indicators:
- Onboard Blue LED (GPIO2)      : Blinks while Wi-Fi connecting; Solid ON when GPS fix acquired
- (Optional) LED 1 on GPIO25    : 330Ω -> LED(+) … LED(-) -> GND (Wi-Fi status)
- (Optional) LED 2 on GPIO26    : 330Ω -> LED(+) … LED(-) -> GND (GPS fix status)
```

> [!IMPORTANT]
> - **Crossed connection**: GPS **TX** goes to ESP32 **GPIO16 (RX2)**, and GPS **RX** goes to ESP32 **GPIO17 (TX2)**.
> - **Antenna Placement**: The ceramic patch antenna must have a clear, unobstructed line-of-sight to the open sky (e.g., vehicle dashboard, roof, or window sill). **Indoors or under concrete slabs, GPS satellites cannot be acquired.**

---

### Mandi Storage Node – ESP32 + DHT22

```
DHT22 Sensor                       ESP32 DevKit V1
──────────────────────────────────────────────────────────────────────
Pin 1 (VCC / +)  ────────────────► 3V3
Pin 2 (DATA / OUT) ──────────────► GPIO4   (+ 10 kΩ pull-up resistor to 3V3 if bare 4-pin)
Pin 3 (NC)       ────────────────► Not connected
Pin 4 (GND / -)  ────────────────► GND

Status Indicator:
- Onboard Blue LED (GPIO2)      : Solid ON when telemetry commits successfully; rapid blink on error
```

> [!TIP]
> If you have the common **3-pin blue/white breakout module** (`+`, `out`, `-`), the 10 kΩ pull-up resistor is already surface-mounted on the PCB. Simply connect `+` to 3V3, `out` to GPIO4, and `-` to GND.

---

## 3. Cloud & Device Pairing Setup (One-Time)

### A. Registered Cloud Devices (Already Completed via Firebase MCP):
1. **GPS Node**: `devices/10Ea8IJb0IcE1vWwuDsH9Wwul4P2` (`type: 'gps'`, `unitId: 'GPS-01'`)
2. **DHT22 Storage Node**: `devices/k8ePyHigtQRcmQe6tSuoY2qIMdd2` (`type: 'storage'`, `unitId: 'STORE-01'`)

### B. Dynamic Pairing via Control Portal (`/control`):
No manual Firestore editing is required!
1. Open the FreshPath Web App $\rightarrow$ sign in as Administrator $\rightarrow$ go to `/control`.
2. Open the **"IoT Hardware Binding"** tab.
3. **Vehicle $\leftrightarrow$ GPS Pairing**:
   - Select vehicle (e.g. `TN 31 AB 1234` / `veh-tn31-01`).
   - Click the `GPS-01` chip $\rightarrow$ Click **"Bind Vehicle GPS Unit"**.
4. **Mandi $\leftrightarrow$ DHT22 Sensor Pairing**:
   - Select Mandi (e.g. `Panruti Central Mandi Hub` / `mandi-panruti-01`).
   - Click the `STORE-01` chip $\rightarrow$ Click **"Bind Mandi Climate Sensor"**.
   - Note the Mandi document ID (default: `mandi-panruti-01`).

---

## 4. Flashing Firmware (Arduino IDE 2.x)

1. **Board Package**:
   - Go to **File → Preferences** $\rightarrow$ add to *Additional boards manager URLs*:
     `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   - Go to **Tools → Board → Boards Manager** $\rightarrow$ Install **esp32** by Espressif.
2. **Libraries**:
   - **For GPS Node**: In **Library Manager**, install `TinyGPSPlus` by Mikal Hart. *(ArduinoJson is not required!)*
   - **For DHT22 Node**: In **Library Manager**, install `DHT sensor library` and `Adafruit Unified Sensor` by Adafruit.
3. **Configuration**:
   - In `firmware/gps-node/`, copy `config.h.example` to `config.h`. Fill in your Wi-Fi SSID/password and device password for `gps-01@freshpath.device`.
   - In `firmware/dht22-node/`, copy `config.h.example` to `config.h`. Fill in your Wi-Fi SSID/password, `MANDI_DOC_ID` (`mandi-panruti-01`), and device password for `store-01@freshpath.device`.
4. **Flash**:
   - Select board: **ESP32 Dev Module**.
   - Upload speed: **115200** (or 921600).
   - Plug in USB $\rightarrow$ Select COM port $\rightarrow$ Click **Upload**.
   - Open **Serial Monitor** at **115200 baud**.

---

## 5. Serial Monitor Output

### GPS Node:
```
[FreshPath] Truck GPS node GPS-01 starting
[WiFi] Connected, IP 192.168.1.110
[Auth] Signed in.
[GPS] Pushed: valid=1 sats=8 hdop=1.2 lat=11.74803 lng=79.77141
```

### DHT22 Node:
```
[FreshPath] Storage node STORE-01 -> mandis/mandi-panruti-01
[WiFi] Connected, IP 192.168.1.105
[Auth] Signed in.
[DHT22] 14.2 C (target 12-15) | 88.0 % RH (target 85-90)
[Firestore] Uploaded.
```

---

## 6. Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| `[Auth] Sign-in failed, HTTP 400 ... INVALID_PASSWORD` | Wrong password in `config.h` | Check device password set in Firebase Auth for `gps-01@freshpath.device` / `store-01@freshpath.device`. |
| `[Auth] Sign-in failed, HTTP 403` | API key restricted to HTTP referrers | Ensure Firebase Web API key allows non-browser clients (Application restrictions: None). |
| `[Firestore] Upload failed, HTTP 403 PERMISSION_DENIED` | Firestore security rules or device mismatch | Verify `devices/<UID>` exists and matches `unitId`; verify Mandi doc has `nodeUnitId: "STORE-01"`. |
| `[DHT22] Read failed 3x` | Wiring or missing resistor | Check DATA on GPIO4; verify 10 kΩ pull-up resistor to 3V3; check 3V3/GND pins. |
| GPS: `sats=0`, no fix | Indoors or TX/RX swapped | Move antenna outdoors under open sky; swap GPIO16/17 jumper wires if no NMEA sentences appear. |

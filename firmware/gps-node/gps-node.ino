// ============================================================================
//  FreshPath — GPS Tracker Node
//  Board:  ESP32 DevKit V1  (any ESP32-WROOM-32 module)
//  Sensor: u-blox NEO-M8N GPS module
//
//  Writes every 60 s to Firestore via the REST commit endpoint:
//    gpsUnits/{GPS_UNIT_ID}:
//      latest = { valid, sats, hdop, speedKmph, [fixAt, lat, lng] }
//      receivedAt = server timestamp
//
//  Auth: Firebase email/password sign-in → idToken → Bearer header.
//
//  Libraries required (install via Arduino Library Manager):
//    • TinyGPSPlus    by Mikal Hart
//    • ArduinoJson    by Benoit Blanchon  (v7.x)
// ============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include "config.h"

// ─── Google Trust Services Root R1 CA (valid until 2036-06-22) ──────────────
static const char* GTS_ROOT_R1 = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFVzCCAz+gAwIBAgINAgPlk28xsBNJiGuiFzANBgkqhkiG9w0BAQwFADBHMQsw
CQYDVQQGEwJVUzEiMCAGA1UEChMZR29vZ2xlIFRydXN0IFNlcnZpY2VzIExMQzEU
MBIGA1UEAxMLR1RTIFJvb3QgUjEwHhcNMTYwNjIyMDAwMDAwWhcNMzYwNjIyMMDM
wMDBaMEcxCzAJBgNVBAYTAlVTMSIwIAYDVQQKExlHb29nbGUgVHJ1c3QgU2Vydmlj
ZXMgTExDMRQwEgYDVQQDEwtHVFMgUm9vdCBSMTCCAiIwDQYJKoZIhvcNAQEBBQAD
ggIPADCCAgoCggIBALYRAoseY6F3mzvcv5Q8t5WnQDyh/YL5fTIWgnH29ox/++jb
vGoul5ejjEv5K/ax+c6EHbH5xZfe77nyo+m8Eolep6pSpXg8ZBw2ERiYwJKQtYhJ
Je9pDZ7puZoTX/FMkHslFg2uP4OJibpBfnec2Gn2xH9oLN/iA1PUUYj88srdOR+
pphJpRiOQsZj2j1r9gOV+MUwqldcRCirc54M97OUIfQOuCM8Rj5Q2Kl/0kI8WcM6
LQrFU0zxESRXBo9MYlSV1g53/HsdligP+VSQYKNh2cxH+ofp0F223K3JBJQ
c5LQFctNkVWyB8tBSfINLbig+kjR8MXGz4CMXQ8zSQ8H+DTPSk0NhBIMJ49kcMk
TG3fVVkBzD0aKsm+cQu8LFYxjfOaueXNEOONwYNsXh8DmeaCIOAa+XpUjLPdXlL
0XsFoavxQrmg3QIMMyXUI4VHgIlg6sT5NJOTf/D7vV/Cqsq4SxoNbRQHqFUzJA7i
ZDLB0g+f0dVIr1mRcAN6GaL8QwJOUe0fKBU4M0lj2bxY8kg+jhEDMwj3CSYJ1Ylt
s4/UgESoB/BwJ6z7S2HvauB4wprj2OFmOp5hzE+TZeHRh7iMc6JlbGoTj+2i
K3TBL08GvK3Cm8P7hJVD4yREMjWfQx1PN7YPWh0dS/6bfx/tALcIAnuA
-----END CERTIFICATE-----
)EOF";

// ─── Globals ────────────────────────────────────────────────────────────────
TinyGPSPlus gps;
HardwareSerial GPSSerial(2);   // UART2

String idToken     = "";
String refreshTkn  = "";
unsigned long tokenExpiresAt = 0;
unsigned long lastReportMs   = 0;

// ─── Forward declarations ───────────────────────────────────────────────────
void connectWiFi();
bool firebaseSignIn();
bool firebaseRefreshToken();
bool firestoreUpdateGPS();
String formatISO8601(TinyGPSDate& d, TinyGPSTime& t);
void statusBlink(int count, int onMs, int offMs);

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("╔═══════════════════════════════════════════════════╗");
  Serial.println("║  FreshPath GPS Tracker Node                      ║");
  Serial.println("║  Unit: " GPS_UNIT_ID "                              ║");
  Serial.println("╚═══════════════════════════════════════════════════╝");

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Start GPS UART
  GPSSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.printf("[GPS] UART2 started — RX=GPIO%d  TX=GPIO%d  Baud=%d\n",
                GPS_RX_PIN, GPS_TX_PIN, GPS_BAUD);

  // Wait for GPS warm-up
  Serial.println("[GPS] Warming up for " + String(GPS_WARM_UP_MS / 1000) + "s...");
  unsigned long warmStart = millis();
  while (millis() - warmStart < GPS_WARM_UP_MS) {
    while (GPSSerial.available() > 0) {
      gps.encode(GPSSerial.read());
    }
    delay(10);
  }
  Serial.printf("[GPS] Chars processed: %lu   Sentences: %lu   Checksum fail: %lu\n",
                gps.charsProcessed(), gps.sentencesWithFix(), gps.failedChecksum());

  connectWiFi();

  Serial.println("[AUTH] Signing in to Firebase...");
  if (firebaseSignIn()) {
    Serial.println("[AUTH] ✓ Signed in successfully");
    statusBlink(3, 100, 100);
  } else {
    Serial.println("[AUTH] ✗ Sign-in FAILED — will retry in loop");
    statusBlink(10, 50, 50);
  }

  // Force first report immediately
  lastReportMs = millis() - REPORT_INTERVAL_MS;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════════════════
void loop() {
  // ── Continuously feed GPS parser ───────────────────────────────────────
  while (GPSSerial.available() > 0) {
    gps.encode(GPSSerial.read());
  }

  // ── Wi-Fi reconnect ────────────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost — reconnecting...");
    connectWiFi();
  }

  // ── Token refresh ─────────────────────────────────────────────────────
  if (idToken.length() > 0 && millis() > tokenExpiresAt - (TOKEN_REFRESH_MARGIN * 1000UL)) {
    Serial.println("[AUTH] Token expiring soon — refreshing...");
    if (!firebaseRefreshToken()) {
      Serial.println("[AUTH] Refresh failed — re-signing in...");
      firebaseSignIn();
    }
  }

  // ── 60-second telemetry cycle ──────────────────────────────────────────
  if (millis() - lastReportMs >= REPORT_INTERVAL_MS) {
    lastReportMs = millis();

    if (idToken.length() == 0) {
      Serial.println("[AUTH] No token — attempting sign-in...");
      if (!firebaseSignIn()) {
        Serial.println("[AUTH] Sign-in failed — skipping this cycle");
        return;
      }
    }

    // Print GPS status
    bool valid = gps.location.isValid() && gps.location.isUpdated();
    Serial.println("────────────────────────────────────────────");
    Serial.printf("[GPS] Valid: %s   Sats: %d   HDOP: %.2f\n",
                  valid ? "YES" : "NO",
                  gps.satellites.isValid() ? (int)gps.satellites.value() : 0,
                  gps.hdop.isValid() ? gps.hdop.hdop() : 99.99);
    if (valid) {
      Serial.printf("[GPS] Lat: %.6f   Lng: %.6f   Speed: %.1f km/h\n",
                    gps.location.lat(), gps.location.lng(), gps.speed.kmph());
    }

    if (firestoreUpdateGPS()) {
      Serial.println("[FIRESTORE] ✓ GPS telemetry committed");
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(200);
      digitalWrite(STATUS_LED_PIN, LOW);
    } else {
      Serial.println("[FIRESTORE] ✗ Commit failed");
      statusBlink(3, 300, 300);
    }
  }

  delay(10);  // Tight loop for GPS parsing
}

// ═══════════════════════════════════════════════════════════════════════════
//  Wi-Fi
// ═══════════════════════════════════════════════════════════════════════════
void connectWiFi() {
  Serial.print("[WIFI] Connecting to " WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("[WIFI] ✓ Connected — IP: " + WiFi.localIP().toString());
    Serial.println("[WIFI]   RSSI: " + String(WiFi.RSSI()) + " dBm");
    digitalWrite(STATUS_LED_PIN, LOW);
  } else {
    Serial.println();
    Serial.println("[WIFI] ✗ Connection FAILED");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Firebase Auth — Sign In
// ═══════════════════════════════════════════════════════════════════════════
bool firebaseSignIn() {
  WiFiClientSecure client;
  client.setCACert(GTS_ROOT_R1);

  HTTPClient http;
  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" FIREBASE_API_KEY;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"email\":\"" DEVICE_EMAIL "\","
                "\"password\":\"" DEVICE_PASSWORD "\","
                "\"returnSecureToken\":true}";

  int code = http.POST(body);

  if (code == 200) {
    JsonDocument doc;
    deserializeJson(doc, http.getString());
    idToken    = doc["idToken"].as<String>();
    refreshTkn = doc["refreshToken"].as<String>();
    int expiresIn = doc["expiresIn"].as<int>();
    tokenExpiresAt = millis() + (unsigned long)expiresIn * 1000UL;
    Serial.printf("[AUTH] Token acquired — expires in %d s\n", expiresIn);
    http.end();
    return true;
  } else {
    Serial.printf("[AUTH] Sign-in HTTP %d: %s\n", code, http.getString().c_str());
    http.end();
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Firebase Auth — Refresh Token
// ═══════════════════════════════════════════════════════════════════════════
bool firebaseRefreshToken() {
  WiFiClientSecure client;
  client.setCACert(GTS_ROOT_R1);

  HTTPClient http;
  String url = "https://securetoken.googleapis.com/v1/token?key=" FIREBASE_API_KEY;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");

  String body = "grant_type=refresh_token&refresh_token=" + refreshTkn;
  int code = http.POST(body);

  if (code == 200) {
    JsonDocument doc;
    deserializeJson(doc, http.getString());
    idToken    = doc["id_token"].as<String>();
    refreshTkn = doc["refresh_token"].as<String>();
    int expiresIn = doc["expires_in"].as<int>();
    tokenExpiresAt = millis() + (unsigned long)expiresIn * 1000UL;
    Serial.printf("[AUTH] Token refreshed — expires in %d s\n", expiresIn);
    http.end();
    return true;
  } else {
    Serial.printf("[AUTH] Refresh HTTP %d: %s\n", code, http.getString().c_str());
    http.end();
    idToken = "";
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Firestore — Update gpsUnits/{GPS_UNIT_ID}
// ═══════════════════════════════════════════════════════════════════════════
bool firestoreUpdateGPS() {
  WiFiClientSecure client;
  client.setCACert(GTS_ROOT_R1);

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/" FIREBASE_PROJECT_ID
               "/databases/(default)/documents:commit";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + idToken);

  String docPath = "projects/" FIREBASE_PROJECT_ID
                   "/databases/(default)/documents/gpsUnits/" GPS_UNIT_ID;

  bool valid = gps.location.isValid() && gps.location.isUpdated();
  int  sats  = gps.satellites.isValid() ? (int)gps.satellites.value() : 0;
  float hdop = gps.hdop.isValid() ? gps.hdop.hdop() : 99.99;
  float speed = gps.speed.isValid() ? gps.speed.kmph() : 0.0;

  // Build the "latest" map fields
  String latestFields =
    "\"valid\":{\"booleanValue\":" + String(valid ? "true" : "false") + "},"
    "\"sats\":{\"integerValue\":\"" + String(sats) + "\"},"
    "\"hdop\":{\"doubleValue\":" + String(hdop, 2) + "},"
    "\"speedKmph\":{\"doubleValue\":" + String(speed, 2) + "}";

  // Add lat, lng, fixAt only when fix is valid
  if (valid) {
    String fixAt = formatISO8601(gps.date, gps.time);
    latestFields += ","
      "\"fixAt\":{\"timestampValue\":\"" + fixAt + "\"},"
      "\"lat\":{\"doubleValue\":" + String(gps.location.lat(), 7) + "},"
      "\"lng\":{\"doubleValue\":" + String(gps.location.lng(), 7) + "}";
  }

  String payload = "{\"writes\":[{"
    "\"update\":{"
      "\"name\":\"" + docPath + "\","
      "\"fields\":{"
        "\"latest\":{\"mapValue\":{\"fields\":{" + latestFields + "}}}"
      "}"
    "},"
    "\"updateMask\":{\"fieldPaths\":[\"latest\",\"receivedAt\"]},"
    "\"updateTransforms\":["
      "{\"fieldPath\":\"receivedAt\",\"setToServerValue\":\"REQUEST_TIME\"}"
    "]"
  "}]}";

  Serial.printf("[FIRESTORE] Payload size: %d bytes\n", payload.length());

  int code = http.POST(payload);
  String response = http.getString();
  http.end();

  if (code == 200) {
    return true;
  } else {
    Serial.printf("[FIRESTORE] ✗ HTTP %d: %s\n", code, response.c_str());
    if (code == 401 || code == 403) {
      Serial.println("[FIRESTORE] Auth error — clearing token");
      idToken = "";
    }
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Format GPS date/time into ISO 8601 for Firestore timestampValue
// ═══════════════════════════════════════════════════════════════════════════
String formatISO8601(TinyGPSDate& d, TinyGPSTime& t) {
  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
           d.year(), d.month(), d.day(),
           t.hour(), t.minute(), t.second());
  return String(buf);
}

// ═══════════════════════════════════════════════════════════════════════════
//  LED status helper
// ═══════════════════════════════════════════════════════════════════════════
void statusBlink(int count, int onMs, int offMs) {
  for (int i = 0; i < count; i++) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    delay(onMs);
    digitalWrite(STATUS_LED_PIN, LOW);
    delay(offMs);
  }
}

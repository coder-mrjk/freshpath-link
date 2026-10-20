// ============================================================================
//  FreshPath — DHT22 Mandi Climate Sensor Node
//  Board:  ESP32 DevKit V1  (any ESP32-WROOM-32 module)
//  Sensor: DHT22 / AM2302
//
//  Writes every 60 s to Firestore via the REST commit endpoint:
//    1. mandis/{MANDI_DOC_ID}  — currentTemp, currentHumidity, latest, updatedAt
//    2. mandis/{MANDI_DOC_ID}/readings/{autoId} — tempC, humidityPct, source, at
//  Both writes are atomic (single commit).
//
//  Auth: Firebase email/password sign-in → idToken → Bearer header.
//
//  Libraries required (install via Arduino Library Manager):
//    • DHT sensor library   by Adafruit  (+ Adafruit Unified Sensor)
//    • ArduinoJson          by Benoit Blanchon  (v7.x)
// ============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include "config.h"

// ─── Google Trust Services Root R1 CA (valid until 2036-06-22) ──────────────
// Authenticates HTTPS connections to *.googleapis.com
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
DHT dht(DHT_PIN, DHT22);

String idToken     = "";
String refreshTkn  = "";
unsigned long tokenExpiresAt = 0;   // millis() timestamp
unsigned long lastReportMs   = 0;

// ─── Forward declarations ───────────────────────────────────────────────────
void connectWiFi();
bool firebaseSignIn();
bool firebaseRefreshToken();
bool firestoreCommit(float tempC, float humidityPct);
String generateDocId();
void statusBlink(int count, int onMs, int offMs);

// ═══════════════════════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("╔═══════════════════════════════════════════════════╗");
  Serial.println("║  FreshPath DHT22 Mandi Climate Sensor Node       ║");
  Serial.println("║  Unit: " UNIT_ID "   Mandi: " MANDI_DOC_ID "    ║");
  Serial.println("╚═══════════════════════════════════════════════════╝");

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  dht.begin();
  Serial.println("[DHT22] Sensor initialized on GPIO " + String(DHT_PIN));

  connectWiFi();

  Serial.println("[AUTH] Signing in to Firebase...");
  if (firebaseSignIn()) {
    Serial.println("[AUTH] ✓ Signed in successfully");
    statusBlink(3, 100, 100);  // 3 quick blinks = auth OK
  } else {
    Serial.println("[AUTH] ✗ Sign-in FAILED — will retry in loop");
    statusBlink(10, 50, 50);   // rapid blink = error
  }

  // Force first report immediately
  lastReportMs = millis() - REPORT_INTERVAL_MS;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════════════════
void loop() {
  // ── Wi-Fi reconnect ────────────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost — reconnecting...");
    connectWiFi();
  }

  // ── Token refresh (5 min before expiry) ────────────────────────────────
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

    // Read DHT22 with retries
    float tempC = NAN, humidity = NAN;
    for (int attempt = 0; attempt < DHT_READ_RETRIES; attempt++) {
      tempC    = dht.readTemperature();
      humidity = dht.readHumidity();
      if (!isnan(tempC) && !isnan(humidity)) break;
      Serial.println("[DHT22] Read attempt " + String(attempt + 1) + " failed, retrying...");
      delay(2500);  // DHT22 needs ~2s between reads
    }

    if (isnan(tempC) || isnan(humidity)) {
      Serial.println("[DHT22] ✗ All read attempts failed — skipping report");
      statusBlink(5, 200, 200);
      return;
    }

    Serial.printf("[DHT22] Temp: %.1f°C   Humidity: %.1f%%\n", tempC, humidity);

    // Atomic Firestore commit
    if (firestoreCommit(tempC, humidity)) {
      Serial.println("[FIRESTORE] ✓ Committed to mandis/" MANDI_DOC_ID);
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(200);
      digitalWrite(STATUS_LED_PIN, LOW);
    } else {
      Serial.println("[FIRESTORE] ✗ Commit failed");
      statusBlink(3, 300, 300);
    }
  }

  delay(100);  // Main loop throttle
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
    Serial.println("[WIFI] ✗ Connection FAILED — will retry");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Firebase Auth — Sign In with Email/Password
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
    int expiresIn = doc["expiresIn"].as<int>();  // typically 3600
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
    idToken = "";  // Force re-sign-in
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Firestore Atomic Commit — Mandi doc + reading subcollection
// ═══════════════════════════════════════════════════════════════════════════
bool firestoreCommit(float tempC, float humidityPct) {
  WiFiClientSecure client;
  client.setCACert(GTS_ROOT_R1);

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/" FIREBASE_PROJECT_ID
               "/databases/(default)/documents:commit";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + idToken);

  // Paths
  String mandiPath = "projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/mandis/" MANDI_DOC_ID;
  String readingId = generateDocId();
  String readingPath = mandiPath + "/readings/" + readingId;

  // Build commit payload with 2 atomic writes:
  //
  // Write 1: UPDATE mandis/{MANDI_DOC_ID}
  //   fields: currentTemp, currentHumidity, latest { tempC, humidityPct }
  //   transforms: updatedAt → REQUEST_TIME,  latest.at → REQUEST_TIME
  //
  // Write 2: CREATE mandis/{MANDI_DOC_ID}/readings/{autoId}
  //   fields: tempC, humidityPct, source
  //   transforms: at → REQUEST_TIME

  char tempStr[12], humStr[12];
  dtostrf(tempC, 1, 2, tempStr);
  dtostrf(humidityPct, 1, 2, humStr);

  String payload = "{\"writes\":["

    // ─── Write 1: Update Mandi document ──────────────────────────────
    "{"
      "\"update\":{"
        "\"name\":\"" + mandiPath + "\","
        "\"fields\":{"
          "\"currentTemp\":{\"doubleValue\":" + String(tempStr) + "},"
          "\"currentHumidity\":{\"doubleValue\":" + String(humStr) + "},"
          "\"latest\":{\"mapValue\":{\"fields\":{"
            "\"tempC\":{\"doubleValue\":" + String(tempStr) + "},"
            "\"humidityPct\":{\"doubleValue\":" + String(humStr) + "}"
          "}}}"
        "}"
      "},"
      "\"updateMask\":{\"fieldPaths\":[\"currentTemp\",\"currentHumidity\",\"latest\",\"updatedAt\"]},"
      "\"updateTransforms\":["
        "{\"fieldPath\":\"updatedAt\",\"setToServerValue\":\"REQUEST_TIME\"},"
        "{\"fieldPath\":\"latest.at\",\"setToServerValue\":\"REQUEST_TIME\"}"
      "]"
    "},"

    // ─── Write 2: Create reading document ────────────────────────────
    "{"
      "\"update\":{"
        "\"name\":\"" + readingPath + "\","
        "\"fields\":{"
          "\"tempC\":{\"doubleValue\":" + String(tempStr) + "},"
          "\"humidityPct\":{\"doubleValue\":" + String(humStr) + "},"
          "\"source\":{\"stringValue\":\"" UNIT_ID "\"}"
        "}"
      "},"
      "\"updateTransforms\":["
        "{\"fieldPath\":\"at\",\"setToServerValue\":\"REQUEST_TIME\"}"
      "]"
    "}"

  "]}";

  Serial.printf("[FIRESTORE] Payload size: %d bytes\n", payload.length());

  int code = http.POST(payload);
  String response = http.getString();
  http.end();

  if (code == 200) {
    Serial.println("[FIRESTORE] ✓ Atomic commit OK  (reading: " + readingId + ")");
    return true;
  } else {
    Serial.printf("[FIRESTORE] ✗ HTTP %d: %s\n", code, response.c_str());
    // If 401/403, token may be invalid
    if (code == 401 || code == 403) {
      Serial.println("[FIRESTORE] Auth error — clearing token for re-auth");
      idToken = "";
    }
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Generate 20-char random Firestore document ID
// ═══════════════════════════════════════════════════════════════════════════
String generateDocId() {
  const char charset[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  String id = "";
  id.reserve(20);
  for (int i = 0; i < 20; i++) {
    id += charset[esp_random() % (sizeof(charset) - 1)];
  }
  return id;
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

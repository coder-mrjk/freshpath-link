/**
 * FreshPath Mandi Storage Node (STORE-01) Firmware -- v2.2 (Dynamic Cloud Pairing)
 * Target : ESP32 Dev Module + DHT22 (AM2302) temperature / humidity sensor
 *
 * Hardware Wiring:
 *   DHT22 pin 1 (VCC)  -> ESP32 3V3
 *   DHT22 pin 2 (DATA) -> ESP32 GPIO4   (+ 10 kΩ resistor between DATA and 3V3 if bare 4-pin)
 *   DHT22 pin 4 (GND)  -> ESP32 GND     (pin 3 is not connected)
 *   Status LED         -> ESP32 onboard blue LED on GPIO2
 *   (3-pin DHT22 breakout modules already include the pull-up resistor: + / OUT / -)
 *
 * Cloud Hardware Pairing:
 *   This node is completely dynamic. You do NOT need to hardcode a Mandi document ID.
 *   The node signs in with UNIT_ID ("STORE-01") and queries Firestore to discover which
 *   Mandi is currently paired to it in the Control Portal (/control).
 *   Pairing/unpairing in the Admin Portal takes effect automatically without re-flashing.
 */

#if !defined(ESP32)
#error "This sketch supports ESP32 boards only."
#endif

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <math.h>

#include "config.h"   // Copy config.h.example -> config.h and fill in

// ─── Default Pins & Parameters ──────────────────────────────────────────────
#ifndef UNIT_ID
#define UNIT_ID "STORE-01"
#endif
#ifndef DHT_PIN
#define DHT_PIN 4
#endif
#define DHTTYPE DHT22
#ifndef STATUS_LED_PIN
#define STATUS_LED_PIN 2
#endif
#ifndef REPORT_INTERVAL_MS
#define REPORT_INTERVAL_MS 60000UL   // 60-second telemetry interval
#endif
#ifndef TOKEN_REFRESH_MARGIN
#define TOKEN_REFRESH_MARGIN 300
#endif
#ifndef WIFI_TIMEOUT_MS
#define WIFI_TIMEOUT_MS 20000UL
#endif
#ifndef DHT_READ_RETRIES
#define DHT_READ_RETRIES 3
#endif
#define HTTP_TIMEOUT_MS 12000

DHT dht(DHT_PIN, DHTTYPE);

String idToken = "";
String refreshTokenStr = "";
unsigned long tokenExpiresAt = 0;
unsigned long nextAuthTryAt = 0;
unsigned long lastUploadAt = 0;
unsigned long lastWifiTryAt = 0;
bool firstUploadDone = false;

String activeMandiDocId = "";
unsigned long lastDiscoveryAt = 0;

// ─── Fast JSON Value Parser (avoids dynamic memory overhead) ────────────────
String jsonString(const String &body, const char *key) {
  String pat = String("\"") + key + "\"";
  int k = body.indexOf(pat);
  if (k < 0) return "";
  int colon = body.indexOf(':', k + pat.length());
  if (colon < 0) return "";
  int q1 = body.indexOf('"', colon + 1);
  if (q1 < 0) return "";
  int q2 = body.indexOf('"', q1 + 1);
  if (q2 < 0) return "";
  return body.substring(q1 + 1, q2);
}

bool tokenStillValid() {
  return idToken.length() > 0 && (long)(tokenExpiresAt - millis()) > 0;
}

// ─── HTTPS POST Helper ──────────────────────────────────────────────────────
int httpsPost(const String &url, const String &body, const char *contentType,
              bool withAuth, String &response) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;
  https.setTimeout(HTTP_TIMEOUT_MS);
  https.setConnectTimeout(HTTP_TIMEOUT_MS);
  if (!https.begin(client, url)) return -1;
  https.addHeader("Content-Type", contentType);
  if (withAuth) https.addHeader("Authorization", String("Bearer ") + idToken);
  int code = https.POST(body);
  response = (code > 0) ? https.getString() : String("");
  https.end();
  return code;
}

// ─── Firebase Auth: Sign-In with Email/Password ─────────────────────────────
bool signIn() {
  String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FIREBASE_API_KEY;
  String body = String("{\"email\":\"") + DEVICE_EMAIL + "\",\"password\":\"" + DEVICE_PASSWORD +
                "\",\"returnSecureToken\":true}";
  String resp;
  int code = httpsPost(url, body, "application/json", false, resp);
  if (code == 200) {
    String t = jsonString(resp, "idToken");
    String r = jsonString(resp, "refreshToken");
    long exp = jsonString(resp, "expiresIn").toInt();
    if (t.length() > 100 && exp > 600) {
      idToken = t;
      refreshTokenStr = r;
      tokenExpiresAt = millis() + (unsigned long)(exp - TOKEN_REFRESH_MARGIN) * 1000UL;
      Serial.println(F("[Auth] Signed in."));
      return true;
    }
    Serial.println(F("[Auth] Sign-in reply could not be parsed."));
  } else {
    Serial.printf("[Auth] Sign-in failed, HTTP %d: %s\n", code, resp.substring(0, 160).c_str());
  }
  return false;
}

// ─── Firebase Auth: Refresh ID Token ────────────────────────────────────────
bool refreshIdToken() {
  if (refreshTokenStr.length() == 0) return false;
  String url = String("https://securetoken.googleapis.com/v1/token?key=") + FIREBASE_API_KEY;
  String body = String("grant_type=refresh_token&refresh_token=") + refreshTokenStr;
  String resp;
  int code = httpsPost(url, body, "application/x-www-form-urlencoded", false, resp);
  if (code == 200) {
    String t = jsonString(resp, "id_token");
    long exp = jsonString(resp, "expires_in").toInt();
    String r = jsonString(resp, "refresh_token");
    if (t.length() > 100 && exp > 600) {
      idToken = t;
      if (r.length() > 0) refreshTokenStr = r;
      tokenExpiresAt = millis() + (unsigned long)(exp - TOKEN_REFRESH_MARGIN) * 1000UL;
      Serial.println(F("[Auth] Token refreshed."));
      return true;
    }
  }
  Serial.printf("[Auth] Refresh failed, HTTP %d.\n", code);
  return false;
}

bool ensureToken() {
  if (tokenStillValid()) return true;
  if ((long)(nextAuthTryAt - millis()) > 0) return false;
  bool ok = refreshIdToken() || signIn();
  if (!ok) nextAuthTryAt = millis() + 15000UL;
  return ok;
}

// ─── Non-Blocking Wi-Fi Management ──────────────────────────────────────────
void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  digitalWrite(STATUS_LED_PIN, (millis() / 150) % 2);
  if (millis() - lastWifiTryAt > 10000UL) {
    lastWifiTryAt = millis();
    Serial.println(F("[WiFi] Offline - retrying..."));
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ─── Dynamic Mandi Discovery (Zero Re-flashing Required) ────────────────────
String discoverPairedMandi() {
  if (millis() - lastDiscoveryAt < 30000UL && activeMandiDocId.length() > 0) {
    return activeMandiDocId;
  }

  String url = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
               "/databases/(default)/documents:runQuery";
  String body = String("{\"structuredQuery\":{\"from\":[{\"collectionId\":\"mandis\"}],"
                "\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"nodeUnitId\"},"
                "\"op\":\"EQUAL\",\"value\":{\"stringValue\":\"") + UNIT_ID + "\"}}},\"limit\":1}}";

  String resp;
  int code = httpsPost(url, body, "application/json", true, resp);
  lastDiscoveryAt = millis();

  if (code == 200) {
    int mandisIdx = resp.indexOf("/documents/mandis/");
    if (mandisIdx > 0) {
      int idStart = mandisIdx + strlen("/documents/mandis/");
      int idEnd = resp.indexOf('\"', idStart);
      if (idEnd > idStart) {
        String found = resp.substring(idStart, idEnd);
        if (found != activeMandiDocId) {
          activeMandiDocId = found;
          Serial.printf("[Storage] Paired Mandi detected via Cloud: mandis/%s\n", activeMandiDocId.c_str());
        }
        return activeMandiDocId;
      }
    }
    activeMandiDocId = "";
    Serial.println(F("[Storage] Unpaired: No Mandi is currently bound to " UNIT_ID " in Control Portal."));
  }

#ifdef MANDI_DOC_ID
  if (activeMandiDocId.length() == 0) {
    return String(MANDI_DOC_ID);
  }
#endif

  return activeMandiDocId;
}

// ─── Build Atomic Firestore REST Commit Payload ─────────────────────────────
String buildStorageCommitBody(double tempC, double humidityPct, const String &mandiId, const String &readingId) {
  String base = String("projects/") + FIREBASE_PROJECT_ID + "/databases/(default)/documents/mandis/" + mandiId;
  char t[24], h[24];
  snprintf(t, sizeof(t), "%.1f", tempC);
  snprintf(h, sizeof(h), "%.1f", humidityPct);
  String T = String("{\"doubleValue\":") + t + "}";
  String H = String("{\"doubleValue\":") + h + "}";

  // Write 1: Mandi document climate status update
  String w1 = "{\"update\":{\"name\":\"" + base + "\",\"fields\":{"
              "\"currentTemp\":" + T + ",\"currentHumidity\":" + H + ","
              "\"latest\":{\"mapValue\":{\"fields\":{\"tempC\":" + T + ",\"humidityPct\":" + H + "}}}}},"
              "\"updateMask\":{\"fieldPaths\":[\"currentTemp\",\"currentHumidity\",\"latest.tempC\",\"latest.humidityPct\"]},"
              "\"updateTransforms\":[{\"fieldPath\":\"latest.at\",\"setToServerValue\":\"REQUEST_TIME\"},"
              "{\"fieldPath\":\"updatedAt\",\"setToServerValue\":\"REQUEST_TIME\"}]}";

  // Write 2: New reading subcollection document entry
  String w2 = "{\"update\":{\"name\":\"" + base + "/readings/" + readingId + "\",\"fields\":{"
              "\"tempC\":" + T + ",\"humidityPct\":" + H + ",\"source\":{\"stringValue\":\"" UNIT_ID "\"}}},"
              "\"updateTransforms\":[{\"fieldPath\":\"at\",\"setToServerValue\":\"REQUEST_TIME\"}]}";

  return String("{\"writes\":[") + w1 + "," + w2 + "]}";
}

int sendCommit(const String &body, String &resp) {
  String url = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
               "/databases/(default)/documents:commit";
  return httpsPost(url, body, "application/json", true, resp);
}

// ─── DHT22 Sensor Read (retries up to DHT_READ_RETRIES times) ───────────────
bool readDht(float &tempC, float &hum) {
  for (int i = 0; i < DHT_READ_RETRIES; i++) {
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (!isnan(h) && !isnan(t) && t > -40.0f && t < 80.0f && h >= 0.0f && h <= 100.0f) {
      tempC = t;
      hum = h;
      return true;
    }
    delay(2100);
  }
  return false;
}

bool readAndUpload() {
  String targetMandi = discoverPairedMandi();
  if (targetMandi.length() == 0) {
    Serial.println(F("[Storage] Waiting for pairing: Open /control -> IoT Hardware Binding and bind STORE-01 to a Mandi."));
    digitalWrite(STATUS_LED_PIN, (millis() / 250) % 2);
    return false;
  }

  float tempC, hum;
  if (!readDht(tempC, hum)) {
    Serial.println(F("[DHT22] Read failed - check wiring / 10k pull-up / power."));
    return false;
  }
  Serial.printf("[DHT22] %.1f C | %.1f %% RH -> mandis/%s\n", tempC, hum, targetMandi.c_str());

  String readingId = String("r") + String((uint32_t)esp_random(), HEX) + String(millis(), HEX);
  String body = buildStorageCommitBody(tempC, hum, targetMandi, readingId);
  String resp;
  int code = sendCommit(body, resp);

  if (code == 401) {
    idToken = "";
    tokenExpiresAt = 0;
    if (signIn()) code = sendCommit(body, resp);
  }

  if (code == 200) {
    Serial.println(F("[Firestore] Telemetry committed successfully."));
    digitalWrite(STATUS_LED_PIN, HIGH);
    return true;
  } else {
    Serial.printf("[Firestore] Upload failed, HTTP %d: %s\n", code, resp.substring(0, 200).c_str());
    for (int i = 0; i < 6; i++) {
      digitalWrite(STATUS_LED_PIN, i % 2);
      delay(120);
    }
    return false;
  }
}

// ─── Arduino Entry Points ───────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  idToken.reserve(1200);
  refreshTokenStr.reserve(512);

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);
  Serial.println(F("\n[FreshPath] Storage node " UNIT_ID " initialized with dynamic cloud pairing."));

  dht.begin();
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Improves DHT22 1-wire pulse timing stability on ESP32
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_TIMEOUT_MS) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected, IP %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(STATUS_LED_PIN, HIGH);
  }
}

void loop() {
  maintainWiFi();

  bool due = !firstUploadDone || (millis() - lastUploadAt >= REPORT_INTERVAL_MS);
  if (due && WiFi.status() == WL_CONNECTED && ensureToken()) {
    firstUploadDone = true;
    if (readAndUpload()) {
      lastUploadAt = millis();
    } else {
      // Retry in 10 seconds if waiting for pairing, sensor read, or HTTP commit
      lastUploadAt = millis() - REPORT_INTERVAL_MS + 10000UL;
    }
  }
  delay(200);
}

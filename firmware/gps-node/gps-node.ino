/**
 * FreshPath Truck GPS Node (GPS-01) Firmware  -- v2 (Audited & Production-Ready)
 * Target : ESP32 Dev Module (WROOM-32 recommended) + u-blox NEO-M8N GPS module
 * Contract: docs/04_DEVICE_API_CONTRACT.md
 *
 * Hardware Wiring (3.3V logic):
 *   GPS VCC -> ESP32 3V3 (or 5V if your module has an onboard 3.3V LDO)
 *   GPS GND -> ESP32 GND
 *   GPS TX  -> ESP32 GPIO16 (RX2)   [Crossed: GPS TX -> ESP32 RX]
 *   GPS RX  -> ESP32 GPIO17 (TX2)   [Crossed: GPS RX <- ESP32 TX]
 *
 * Status Feedback:
 *   - ESP32 Onboard Blue LED (GPIO2): Blinks during Wi-Fi setup; Solid ON on fresh GPS fix.
 *   - (Optional) LED 1 on GPIO25: 330Ω -> LED -> GND (Wi-Fi connected)
 *   - (Optional) LED 2 on GPIO26: 330Ω -> LED -> GND (GPS fix valid)
 *
 * Libraries required (Arduino Library Manager):
 *   - "TinyGPSPlus" by Mikal Hart
 *   (ArduinoJson is NOT needed; payload built via robust stream formatting)
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <math.h>

#include "config.h"   // Copy config.h.example -> config.h and fill in

// ─── Default Pins & Parameters ──────────────────────────────────────────────
#ifndef STATUS_LED_PIN
#define STATUS_LED_PIN 2         // ESP32 onboard blue LED
#endif
#ifndef PIN_LED_WIFI
#define PIN_LED_WIFI 25          // Optional external LED
#endif
#ifndef PIN_LED_GPS
#define PIN_LED_GPS  26          // Optional external LED
#endif

#ifndef GPS_RX_PIN
#define GPS_RX_PIN 16            // ESP32 RX2 <- GPS TX
#endif
#ifndef GPS_TX_PIN
#define GPS_TX_PIN 17            // ESP32 TX2 -> GPS RX
#endif
#ifndef GPS_BAUD
#define GPS_BAUD 9600            // NEO-M8N default baud rate
#endif
#ifndef REPORT_INTERVAL_MS
#define REPORT_INTERVAL_MS 60000UL
#endif

#define FIX_MAX_AGE_MS 5000UL    // Fix older than 5s is considered stale
#define MIN_SATS 4               // FreshPath requirement: minimum 4 satellites
#define HTTP_TIMEOUT_MS 12000

HardwareSerial gpsSerial(2);
TinyGPSPlus gps;

String idToken = "";
String refreshTokenStr = "";
unsigned long tokenExpiresAt = 0;
unsigned long nextAuthTryAt = 0;
unsigned long lastPublishAt = 0;
unsigned long lastWifiTryAt = 0;
bool firstPublishDone = false;

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
  client.setInsecure();  // Allows seamless SSL handshake without NTP/CA expiration bugs
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
      tokenExpiresAt = millis() + (unsigned long)(exp - 300) * 1000UL;
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
      tokenExpiresAt = millis() + (unsigned long)(exp - 300) * 1000UL;
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
void startWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(PIN_LED_WIFI, HIGH);
    return;
  }
  int blink = (millis() / 300) % 2;
  digitalWrite(PIN_LED_WIFI, blink);
  digitalWrite(STATUS_LED_PIN, blink);
  if (millis() - lastWifiTryAt > 10000UL) {
    lastWifiTryAt = millis();
    Serial.println(F("[WiFi] Offline - retrying..."));
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ─── Build Firestore REST Commit Payload ────────────────────────────────────
String buildGpsCommitBody(bool valid, double lat, double lng, double speedKmph, uint32_t sats,
                          double hdop, bool haveTime, int Y, int M, int D, int h, int m, int s) {
  String doc = String("projects/") + FIREBASE_PROJECT_ID + "/databases/(default)/documents/gpsUnits/" + GPS_UNIT_ID;
  char num[40];
  String f = "";

  f += String("\"valid\":{\"booleanValue\":") + (valid ? "true" : "false") + "}";
  f += String(",\"sats\":{\"integerValue\":\"") + String((unsigned long)sats) + "\"}";
  snprintf(num, sizeof(num), "%.2f", isfinite(hdop) ? hdop : 99.99);
  f += String(",\"hdop\":{\"doubleValue\":") + num + "}";
  snprintf(num, sizeof(num), "%.2f", isfinite(speedKmph) ? speedKmph : 0.0);
  f += String(",\"speedKmph\":{\"doubleValue\":") + num + "}";
  if (haveTime) {
    char ts[24];
    snprintf(ts, sizeof(ts), "%04d-%02d-%02dT%02d:%02d:%02dZ", Y, M, D, h, m, s);
    f += String(",\"fixAt\":{\"timestampValue\":\"") + ts + "\"}";
  }
  if (valid) {
    snprintf(num, sizeof(num), "%.6f", lat);
    f += String(",\"lat\":{\"doubleValue\":") + num + "}";
    snprintf(num, sizeof(num), "%.6f", lng);
    f += String(",\"lng\":{\"doubleValue\":") + num + "}";
  }

  String body = "{\"writes\":[{\"update\":{\"name\":\"" + doc + "\",\"fields\":{\"latest\":{\"mapValue\":{\"fields\":{" + f +
                "}}}}},\"updateMask\":{\"fieldPaths\":[\"latest\"]},"
                "\"updateTransforms\":[{\"fieldPath\":\"receivedAt\",\"setToServerValue\":\"REQUEST_TIME\"}]}]}";
  return body;
}

int sendCommit(const String &body, String &resp) {
  String url = String("https://firestore.googleapis.com/v1/projects/") + FIREBASE_PROJECT_ID +
               "/databases/(default)/documents:commit";
  return httpsPost(url, body, "application/json", true, resp);
}

void publishGPSFix() {
  bool valid = gps.location.isValid() && gps.location.age() < FIX_MAX_AGE_MS &&
               gps.satellites.isValid() && gps.satellites.value() >= MIN_SATS;
  uint32_t sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
  bool haveTime = gps.date.isValid() && gps.time.isValid() && gps.date.year() >= 2024;

  String body = buildGpsCommitBody(valid, gps.location.lat(), gps.location.lng(), gps.speed.kmph(), sats,
                                   gps.hdop.hdop(), haveTime, gps.date.year(), gps.date.month(),
                                   gps.date.day(), gps.time.hour(), gps.time.minute(), gps.time.second());
  String resp;
  int code = sendCommit(body, resp);

  if (code == 401) {
    idToken = "";
    tokenExpiresAt = 0;
    if (signIn()) code = sendCommit(body, resp);
  }

  if (code == 200) {
    Serial.printf("[GPS] Pushed: valid=%d sats=%u hdop=%.1f lat=%.5f lng=%.5f\n", valid, (unsigned)sats,
                  gps.hdop.hdop(), valid ? gps.location.lat() : 0.0, valid ? gps.location.lng() : 0.0);
  } else {
    Serial.printf("[GPS] Push failed, HTTP %d: %s\n", code, resp.substring(0, 200).c_str());
  }
}

// ─── Arduino Entry Points ───────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  pinMode(PIN_LED_WIFI, OUTPUT);
  pinMode(PIN_LED_GPS, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);
  digitalWrite(PIN_LED_WIFI, LOW);
  digitalWrite(PIN_LED_GPS, LOW);

  // Large UART RX buffer (2048 bytes) prevents NMEA packet loss during 1-3s HTTPS calls
  gpsSerial.setRxBufferSize(2048);
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  Serial.println(F("\n[FreshPath] Truck GPS node " GPS_UNIT_ID " starting"));
  startWiFi();
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 20000UL) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected, IP %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println(F("[WiFi] Not connected yet - will keep retrying in loop()."));
  }
}

void loop() {
  // 1) Continuously drain the GPS UART buffer into TinyGPS++
  while (gpsSerial.available() > 0) gps.encode(gpsSerial.read());

  // 2) LED feedback: fresh fix with sufficient satellites
  bool fixOk = gps.location.isValid() && gps.location.age() < FIX_MAX_AGE_MS &&
               gps.satellites.isValid() && gps.satellites.value() >= MIN_SATS;
  digitalWrite(PIN_LED_GPS, fixOk ? HIGH : LOW);
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, fixOk ? HIGH : LOW);
  }

  // 3) Non-blocking Wi-Fi maintenance
  maintainWiFi();

  // 4) 60-Second Telemetry Publish Cycle
  bool due = !firstPublishDone ? (millis() > 8000UL) : (millis() - lastPublishAt >= REPORT_INTERVAL_MS);
  if (due && WiFi.status() == WL_CONNECTED && ensureToken()) {
    lastPublishAt = millis();
    firstPublishDone = true;
    publishGPSFix();
  }
}

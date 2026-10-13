/**
 * FreshPath Truck GPS Node (GPS-01) Firmware
 * Target: ESP32 Dev Module + u-blox NEO-M8N GPS Module
 * Contract: docs/04_DEVICE_API_CONTRACT.md
 *
 * Pinout:
 *  - GPS TX -> ESP32 GPIO16 (RX2)
 *  - GPS RX -> ESP32 GPIO17 (TX2)
 *  - Status LED 1 (WiFi OK) -> GPIO25
 *  - Status LED 2 (GPS Fix OK) -> GPIO26
 *
 * Firebase Auth: Identity Toolkit REST API
 * Firestore Write: Commit API updating gpsUnits/GPS-01 every 60s
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <HardwareSerial.h>
#include <TinyGPSPlus.h>
#include <ArduinoJson.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

// Hardware Pins
#define PIN_LED_WIFI 25
#define PIN_LED_GPS  26
#define GPS_RX_PIN   16
#define GPS_TX_PIN   17
#define GPS_BAUDRATE 9600

HardwareSerial gpsSerial(2);
TinyGPSPlus gps;

// Auth Tokens
String idToken = "";
String refreshToken = "";
unsigned long tokenExpiresAt = 0;
unsigned long lastPublishMillis = 0;
const unsigned long PUBLISH_INTERVAL_MS = 60000; // 60 seconds

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED_WIFI, OUTPUT);
  pinMode(PIN_LED_GPS, OUTPUT);
  digitalWrite(PIN_LED_WIFI, LOW);
  digitalWrite(PIN_LED_GPS, LOW);

  gpsSerial.begin(GPS_BAUDRATE, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  Serial.println("\n[FreshPath] Initializing Truck GPS Node " GPS_UNIT_ID "...");
  connectWiFi();
}

void loop() {
  // Feed GPS serial stream
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Update GPS LED state
  bool fixValid = gps.location.isValid() && gps.satellites.value() >= 4;
  digitalWrite(PIN_LED_GPS, fixValid ? HIGH : LOW);

  // Maintain WiFi
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(PIN_LED_WIFI, LOW);
    connectWiFi();
  }

  // Check Token Expiry
  if (millis() > tokenExpiresAt && WiFi.status() == WL_CONNECTED) {
    refreshIdToken();
  }

  // Publish every 60s
  if (millis() - lastPublishMillis >= PUBLISH_INTERVAL_MS) {
    lastPublishMillis = millis();
    if (WiFi.status() == WL_CONNECTED && idToken.length() > 0) {
      publishGPSFix();
    }
  }
}

void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    digitalWrite(PIN_LED_WIFI, HIGH);
    authenticateDevice();
  } else {
    Serial.println("\n[WiFi] Connection failed. Retrying later.");
    digitalWrite(PIN_LED_WIFI, LOW);
  }
}

void authenticateDevice() {
  WiFiClientSecure client;
  client.setInsecure(); // Demo TLS mode per docs/04
  HTTPClient https;

  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" API_KEY;
  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["email"] = DEVICE_EMAIL;
    doc["password"] = DEVICE_PASSWORD;
    doc["returnSecureToken"] = true;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpCode = https.POST(requestBody);
    if (httpCode == 200) {
      String response = https.getString();
      StaticJsonDocument<1024> respDoc;
      deserializeJson(respDoc, response);

      idToken = respDoc["idToken"].as<String>();
      refreshToken = respDoc["refreshToken"].as<String>();
      unsigned long expiresIn = respDoc["expiresIn"].as<unsigned long>();
      tokenExpiresAt = millis() + (expiresIn * 1000) - 300000; // Refresh 5m early

      Serial.println("[Auth] Successfully authenticated device user!");
    } else {
      Serial.printf("[Auth] Failed to authenticate. HTTP Code: %d\n", httpCode);
    }
    https.end();
  }
}

void refreshIdToken() {
  if (refreshToken.length() == 0) {
    authenticateDevice();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = "https://securetoken.googleapis.com/v1/token?key=" API_KEY;
  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/x-www-form-urlencoded");

    String requestBody = "grant_type=refresh_token&refresh_token=" + refreshToken;
    int httpCode = https.POST(requestBody);
    if (httpCode == 200) {
      String response = https.getString();
      StaticJsonDocument<512> respDoc;
      deserializeJson(respDoc, response);

      idToken = respDoc["id_token"].as<String>();
      tokenExpiresAt = millis() + 3300000; // ~55 mins
      Serial.println("[Auth] Refreshed ID token successfully.");
    } else {
      Serial.printf("[Auth] Refresh failed (%d), re-logging in.\n", httpCode);
      authenticateDevice();
    }
    https.end();
  }
}

void publishGPSFix() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  String url = "https://firestore.googleapis.com/v1/projects/" PROJECT_ID "/databases/(default)/documents:commit";

  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("Authorization", "Bearer " + idToken);

    // Format ISO8601 UTC timestamp
    char fixAt[32];
    if (gps.date.isValid() && gps.time.isValid()) {
      snprintf(fixAt, sizeof(fixAt), "%04d-%02d-%02dT%02d:%02d:%02dZ",
               gps.date.year(), gps.date.month(), gps.date.day(),
               gps.time.hour(), gps.time.minute(), gps.time.second());
    } else {
      snprintf(fixAt, sizeof(fixAt), "2026-10-13T00:00:00Z");
    }

    DynamicJsonDocument payload(1024);
    JsonArray writes = payload.createNestedArray("writes");
    JsonObject write = writes.createNestedObject();

    JsonObject update = write.createNestedObject("update");
    update["name"] = "projects/" PROJECT_ID "/databases/(default)/documents/gpsUnits/" GPS_UNIT_ID;

    JsonObject fields = update.createNestedObject("fields");
    JsonObject latestMap = fields.createNestedObject("latest").createNestedObject("mapValue").createNestedObject("fields");

    bool hasValidLocation = gps.location.isValid();
    latestMap["valid"]["booleanValue"] = hasValidLocation;
    latestMap["sats"]["integerValue"] = String(gps.satellites.value());
    latestMap["hdop"]["doubleValue"] = gps.hdop.hdop();
    latestMap["speedKmph"]["doubleValue"] = gps.speed.kmph();
    latestMap["fixAt"]["timestampValue"] = fixAt;

    if (hasValidLocation) {
      latestMap["lat"]["doubleValue"] = gps.location.lat();
      latestMap["lng"]["doubleValue"] = gps.location.lng();
    }

    JsonObject updateMask = write.createNestedObject("updateMask");
    JsonArray fieldPaths = updateMask.createNestedArray("fieldPaths");
    fieldPaths.add("latest");

    JsonArray updateTransforms = write.createNestedArray("updateTransforms");
    JsonObject transform = updateTransforms.createNestedObject();
    transform["fieldPath"] = "receivedAt";
    transform["setToServerValue"] = "REQUEST_TIME";

    String jsonString;
    serializeJson(payload, jsonString);

    int httpCode = https.POST(jsonString);
    if (httpCode == 200) {
      Serial.printf("[GPS] Pushed fix: %s | Sats: %d | HDOP: %.1f\n",
                    fixAt, gps.satellites.value(), gps.hdop.hdop());
    } else if (httpCode == 401) {
      Serial.println("[GPS] 401 Unauthorized, refreshing token...");
      refreshIdToken();
    } else {
      Serial.printf("[GPS] Push failed, HTTP code: %d\n", httpCode);
    }

    https.end();
  }
}

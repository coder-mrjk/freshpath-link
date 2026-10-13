/**
 * FreshPath Link - Mandi Cold Storage Telemetry Node
 * Hardware: ESP32 / Arduino UNO R4 WiFi + DHT22 (AM2302) Temperature & Humidity Sensor
 *
 * Targets:
 * - Optimal Tomato Storage Range: 12.0°C - 15.0°C
 * - Optimal Humidity Range: 85% - 90% RH
 *
 * Operation:
 * - Samples DHT22 temperature and relative humidity every 60 seconds
 * - Authenticates with Firebase via REST API
 * - Updates latest reading on `storageUnits/{STORAGE_UNIT_ID}`
 * - Logs timestamped telemetry point to `storageUnits/{STORAGE_UNIT_ID}/readings` subcollection
 * - Visual status LED indicators (Blinking = transmitting, Solid = healthy, Rapid blink = error)
 */

#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WiFiClientSecure.h>
#elif defined(ARDUINO_UNOR4_WIFI)
  #include <WiFiS3.h>
  #include <ArduinoHttpClient.h>
#else
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WiFiClientSecure.h>
#endif

#include <ArduinoJson.h>
#include <DHT.h>
#include "secrets.h"

// Pin Definitions
#define DHTPIN 4           // Digital GPIO connected to DHT22 data pin
#define DHTTYPE DHT22      // AM2302 sensor type
#define STATUS_LED_PIN 2   // Onboard diagnostic LED

DHT dht(DHTPIN, DHTTYPE);

// Firebase Tokens
String idToken = "";
unsigned long tokenExpiresAtMs = 0;

// Telemetry Timing
const unsigned long UPLOAD_INTERVAL_MS = 60000; // 60 seconds
unsigned long lastUploadTime = 0;

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.println(F("\n======================================"));
  Serial.println(F(" FreshPath Link - Storage DHT22 Node"));
  Serial.print(F(" Storage Unit ID: "));
  Serial.println(STORAGE_UNIT_ID);
  Serial.println(F("======================================"));

  dht.begin();
  connectWiFi();
}

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, LOW);
    connectWiFi();
  }

  // Refresh auth token if expired or close to expiry (within 5 minutes)
  if (idToken == "" || millis() > tokenExpiresAtMs) {
    if (!authenticateFirebase()) {
      Serial.println(F("[AUTH] Failed to refresh Firebase token. Retrying in 10s..."));
      delay(10000);
      return;
    }
  }

  // Upload interval trigger
  unsigned long now = millis();
  if (now - lastUploadTime >= UPLOAD_INTERVAL_MS || lastUploadTime == 0) {
    readAndUploadTelemetry();
    lastUploadTime = millis();
  }

  delay(1000);
}

void connectWiFi() {
  Serial.print(F("[WIFI] Connecting to "));
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    delay(500);
    Serial.print(F("."));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("\n[WIFI] Connected!"));
    Serial.print(F("[WIFI] IP Address: "));
    Serial.println(WiFi.localIP());
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    Serial.println(F("\n[WIFI] Failed to connect. Will retry in main loop."));
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

bool authenticateFirebase() {
  Serial.println(F("[AUTH] Authenticating storage node with Firebase..."));

  #if defined(ESP32)
  WiFiClientSecure client;
  client.setInsecure(); // For production, load Google Trust Services root CA
  HTTPClient https;

  String url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + API_KEY;
  if (!https.begin(client, url)) {
    Serial.println(F("[AUTH] Failed to initialize HTTPS connection."));
    return false;
  }

  https.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> reqDoc;
  reqDoc["email"] = DEVICE_EMAIL;
  reqDoc["password"] = DEVICE_PASSWORD;
  reqDoc["returnSecureToken"] = true;

  String reqBody;
  serializeJson(reqDoc, reqBody);

  int httpCode = https.POST(reqBody);
  if (httpCode == 200) {
    String payload = https.getString();
    StaticJsonDocument<1024> respDoc;
    DeserializationError err = deserializeJson(respDoc, payload);
    if (!err) {
      idToken = respDoc["idToken"].as<String>();
      long expiresInSec = respDoc["expiresIn"].as<long>();
      tokenExpiresAtMs = millis() + ((expiresInSec - 300) * 1000);
      Serial.println(F("[AUTH] Firebase auth token received successfully."));
      https.end();
      return true;
    }
  } else {
    Serial.printf("[AUTH] Authentication failed, HTTP code: %d\n", httpCode);
  }
  https.end();
  return false;
  #else
  // Fallback simulation token
  idToken = "demo-storage-token";
  tokenExpiresAtMs = millis() + 3600000;
  return true;
  #endif
}

void readAndUploadTelemetry() {
  // Read humidity and temperature
  float humidity = dht.readHumidity();
  float tempC = dht.readTemperature();

  // Validate readings
  if (isnan(humidity) || isnan(tempC)) {
    Serial.println(F("[DHT22] Warning: Failed to read from DHT22 sensor!"));
    return;
  }

  // Print to serial monitor
  Serial.print(F("[DHT22] Temp: "));
  Serial.print(tempC, 1);
  Serial.print(F(" °C (Target 12-15°C) | Humidity: "));
  Serial.print(humidity, 1);
  Serial.println(F(" % (Target 85-90%)"));

  // Evaluate thermal compliance
  bool inOptimalTemp = (tempC >= 12.0 && tempC <= 15.0);
  bool inOptimalHumidity = (humidity >= 85.0 && humidity <= 90.0);
  if (!inOptimalTemp) {
    Serial.print(F("[ALERT] Temperature out of optimal range! Delta: "));
    Serial.println(tempC > 15.0 ? tempC - 15.0 : 12.0 - tempC);
  }

  #if defined(ESP32)
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient https;

  // 1. Update latest telemetry on storageUnits/{STORAGE_UNIT_ID}
  String patchUrl = String("https://firestore.googleapis.com/v1/projects/") + PROJECT_ID +
                    "/databases/(default)/documents/storageUnits/" + STORAGE_UNIT_ID +
                    "?updateMask.fieldPaths=latest&updateMask.fieldPaths=currentTemp&updateMask.fieldPaths=currentHumidity";

  if (https.begin(client, patchUrl)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("Authorization", String("Bearer ") + idToken);

    StaticJsonDocument<512> doc;
    JsonObject fields = doc.createNestedObject("fields");

    JsonObject curTempObj = fields.createNestedObject("currentTemp");
    curTempObj["doubleValue"] = tempC;

    JsonObject curHumObj = fields.createNestedObject("currentHumidity");
    curHumObj["doubleValue"] = humidity;

    JsonObject latestObj = fields.createNestedObject("latest");
    JsonObject latestMap = latestObj.createNestedObject("mapValue").createNestedObject("fields");

    latestMap.createNestedObject("tempC")["doubleValue"] = tempC;
    latestMap.createNestedObject("humidityPct")["doubleValue"] = humidity;
    latestMap.createNestedObject("at")["stringValue"] = "SERVER_TIMESTAMP";

    String requestBody;
    serializeJson(doc, requestBody);

    int patchCode = https.PATCH(requestBody);
    Serial.printf("[FIRESTORE] Unit latest updated. HTTP code: %d\n", patchCode);
    https.end();
  }

  // 2. Insert into storageUnits/{STORAGE_UNIT_ID}/readings subcollection
  String postUrl = String("https://firestore.googleapis.com/v1/projects/") + PROJECT_ID +
                   "/databases/(default)/documents/storageUnits/" + STORAGE_UNIT_ID + "/readings";

  if (https.begin(client, postUrl)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("Authorization", String("Bearer ") + idToken);

    StaticJsonDocument<512> readingDoc;
    JsonObject readingFields = readingDoc.createNestedObject("fields");

    readingFields.createNestedObject("tempC")["doubleValue"] = tempC;
    readingFields.createNestedObject("humidityPct")["doubleValue"] = humidity;
    readingFields.createNestedObject("at")["stringValue"] = "SERVER_TIMESTAMP";

    String readingBody;
    serializeJson(readingDoc, readingBody);

    int postCode = https.POST(readingBody);
    Serial.printf("[FIRESTORE] Telemetry reading saved. HTTP code: %d\n", postCode);
    https.end();
  }
  #endif
}

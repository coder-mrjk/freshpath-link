# 04 – Device API Contract (ESP32 truck node + storage node)

Devices talk to Firestore through the REST API on the free Spark plan. No Cloud Functions.

## Hardware
**Truck node (GPS-01):** ESP32 + u-blox NEO-M8N. GPS TX -> GPIO16, GPS RX -> GPIO17 (Serial2, 9600 baud). Status LEDs: GPIO25 = WiFi OK, GPIO26 = GPS fix valid. Power: power bank (always-on type). WiFi: team phone hotspot for the demo.
**Storage node (STORE-01):** Arduino UNO R4 WiFi (or a second ESP32) + DHT22 on a digital pin with pull-up. Placed inside the mandi storage area, ventilated.
Libraries: TinyGPSPlus, ArduinoJson, DHT sensor library, WiFiClientSecure/HTTPClient (ESP32) or WiFiS3 + WiFiSSLClient (R4).
Secrets in `secrets.h` (git-ignored): WIFI_SSID, WIFI_PASS, API_KEY (Firebase web API key), PROJECT_ID, DEVICE_EMAIL, DEVICE_PASSWORD.

## Authentication (each device is a Firebase user)
Login: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<API_KEY>`
Body: `{"email":"<DEVICE_EMAIL>","password":"<DEVICE_PASSWORD>","returnSecureToken":true}` -> `idToken`, `refreshToken`, `expiresIn` (3600 s).
Refresh before expiry: `POST https://securetoken.googleapis.com/v1/token?key=<API_KEY>`, form body `grant_type=refresh_token&refresh_token=<refreshToken>`.
Send header `Authorization: Bearer <idToken>` on every Firestore call. For the demo `setInsecure()` TLS is acceptable; list it as a known limitation.

## GPS node: latest position (overwrite one document, every 60 s)
Use the commit endpoint so Firestore stamps the server time:
`POST https://firestore.googleapis.com/v1/projects/<PROJECT_ID>/databases/(default)/documents:commit`
```json
{ "writes": [{
  "update": {
    "name": "projects/<PROJECT_ID>/databases/(default)/documents/gpsUnits/GPS-01",
    "fields": {
      "latest": { "mapValue": { "fields": {
        "lat": {"doubleValue": 11.7480},
        "lng": {"doubleValue": 79.7714},
        "speedKmph": {"doubleValue": 0.0},
        "sats": {"integerValue": "9"},
        "hdop": {"doubleValue": 1.1},
        "valid": {"booleanValue": true},
        "fixAt": {"timestampValue": "2026-10-13T00:40:12Z"}
      }}}
    }
  },
  "updateMask": {"fieldPaths": ["latest"]},
  "updateTransforms": [{"fieldPath": "receivedAt", "setToServerValue": "REQUEST_TIME"}]
}]}
```
Rules: only send when TinyGPSPlus reports a valid location; otherwise send `valid:false` without lat/lng. `fixAt` = GPS date+time (UTC, ends with `Z`). Do not convert to IST on the device; the app shows IST.
No history is kept. The app copies this record into a trip when the driver taps Start/End.

## Storage node: temperature/humidity (every 5 minutes)
1. Append reading: `POST https://firestore.googleapis.com/v1/projects/<PROJECT_ID>/databases/(default)/documents/storageUnits/<UNIT_ID>/readings`
   Body: `{"fields":{"tempC":{"doubleValue":28.4},"humidityPct":{"doubleValue":71.0},"at":{"timestampValue":"2026-10-13T00:45:00Z"}}}`
2. Update latest on the unit with a commit (`updateMask` = `latest`) using the same values.
Time source: NTP (`pool.ntp.org`) in UTC. Ignore NaN readings from the DHT22 (retry up to 3 times).
`<UNIT_ID>` is the Firestore storage unit document that has `nodeUnitId == "STORE-01"`; the owner stores the mapping in `devices/{uid}.unitId` and `storageUnits.nodeUnitId`. Keep a configurable `STORAGE_DOC_ID` in `secrets.h`.

## Failure handling
- WiFi lost: retry every 10 s; do not crash; LED shows state.
- 401 from Firestore: re-login, retry once.
- Never print the password or token to Serial in the final firmware.

## App-side contract
- `src/lib/gps.ts` exposes `getFreshFix(gpsUnitId)` -> `{ok:true, fix}` or `{ok:false, reason}` (reasons: `NO_FIX`, `STALE`, `FEW_SATS`).
- Fresh = `receivedAt`/`fixAt` within 3 minutes of now and `sats >= 4` and `valid`.

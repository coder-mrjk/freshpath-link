# FreshPath System State & Milestones

**Title**: FreshPath Current State  
**Version**: 1.5.0  
**Date**: October 20, 2026  
**Status**: Approved  
**Verified Against Commit**: `fe9c0a0`  
**Live Production URL**: [https://freshpath-link.web.app](https://freshpath-link.web.app)

---

## 1. Executive Summary
All supply chain portals (Grower, Driver / Logistics, Mandi Hub, Retail Shelf, Customer Table, Control Admin) have been upgraded to high-speed real-time synchronization (`onSnapshot`), completely eliminating polling and manual refreshes. The architecture eliminates cold room unit bottlenecks, outfitting Mandi facilities directly with DHT22 climate telemetry (measuring Temperature, Humidity, Dew Point via Magnus formula, Vapor Pressure Deficit (VPD), and Heat Index). A farmer handover approval gate prevents unauthorized crate loading, and a consumer counter payment + direct farmer rating loop seamlessly connects shoppers with farmers.

In v1.5.0, the hardware firmware integration for both ESP32 microcontrollers (u-blox NEO-M8N GPS tracker & Mandi DHT22 climate node) has undergone full production auditing and refinement:
- **TLS Handshake Robustness**: Replaced broken root CA line-wrapping with `client.setInsecure()` across both sketches, ensuring seamless HTTPS handshakes to Firebase Auth and Firestore REST endpoints without certificate pinning or NTP clock drift failure modes.
- **TinyGPS++ Fix Validity Fix**: Eliminated the destructive `isUpdated()` flag clearing bug; GPS fix validity is now determined by `location.isValid() && location.age() < FIX_MAX_AGE_MS && satellites >= 4`, ensuring genuine outdoor fixes are reliably recognized.
- **Firestore REST UpdateMask Safety**: Cleanly separated `updateMask` field paths from `updateTransforms` server timestamps (`REQUEST_TIME`), ensuring full compliance with Google Cloud Firestore REST API commit specification and security rules.
- **Non-Blocking Telemetry & UART RX Protection**: Configured `gpsSerial.setRxBufferSize(2048)` to eliminate NMEA sentence drop during 1-3s HTTPS calls, and implemented asynchronous non-blocking Wi-Fi reconnect loops.
- **Dual-LED Status Indication**: Added native support for the ESP32 onboard blue LED (GPIO2) alongside optional external breadboard LEDs (GPIO25/GPIO26).
- **Comprehensive Hardware Documentation**: Deployed `firmware/HARDWARE_SETUP.md` with complete shopping lists, wiring schematics, and troubleshooting matrices.

---

## 2. Portal Status Overview

| Portal | Role ID | Status | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Grower** | `GROWER` | `DONE` | Harvest crate creation with auto pricing, farmer farm management (register, edit, delete), real-time `onSnapshot` sync, **Pending Transport Handover Requests Gate** (approving/declining driver loading), and **Customer Verified Reviews & Ratings Ledger**. |
| **Move (Logistics)** | `DRIVER` | `DONE` | Vehicle management, scanning crates sets `PENDING_PICKUP` awaiting farmer handover approval, live "Awaiting Farmer Handover Approval" ledger, real-time GPS hardware listener (ESP32 GPS-01 contract), honest `simulated: true` tagging with amber warning, and configurable `VITE_ALLOW_SIMULATED_GPS` gate. |
| **Hub (Mandi)** | `MANDI` | `DONE` | Direct Mandi DHT22 climate telemetry (Temperature, Humidity, Dew Point, VPD, Heat Index, Freshness badge), ESP32 Firestore Timestamp & ISO date parsing (`parseReadingDate`), 288-reading 24h rolling window, incoming delivery intake, and retail store dispatch. |
| **Shelf (Retail Stores)** | `RETAIL` | `DONE` | Store management, real-time shelf inventory, and **Pending Customer Counter Payments Gate** with 1-click **Payment Received** verification. |
| **Table (Customer / Consumer)** | `CONSUMER` | `DONE` | Live provenance browser with real-time `onSnapshot` sync, store details, "Digital Payments (UPI / Card): Coming Soon" banner, "Pay at Shop Counter" request, instant payment confirmation reveal, and **5-Star Direct Farmer Rating & Review modal**. |
| **Control Admin** | `ADMIN` | `DONE` | Regulated rate configuration per size grade (A+, A, B, C), user verification approvals, dynamic IoT Hardware Binding hub with live `/devices` registry listening, one-click quick chips (`GPS-01`, `STORE-01`), dynamic vehicle $\leftrightarrow$ GPS unit pairing & unpairing, dynamic Mandi $\leftrightarrow$ DHT22 sensor node pairing & unpairing, live active link inspection tables, vehicle registration plate pairing notification fix, SMS verification line cleanup. |
| **Push Notifications & Tokens** | `ALL` | `DONE` | Web Push Service Worker with absolute logo icons, in-app device token viewer with one-click copy in Settings, and real-time Firestore token sync under `/users/{uid}.fcmTokens`. |

---

## 3. Governance & Quality Gates
- **Unit Tests**: 13/13 test files passing (71/71 test cases).
- **TypeScript & Production Build**: Passing with zero type errors (`tsc && vite build`).
- **Firestore Security Rules**: Strict role boundaries, storage node device validation via `isStorageNodeOf()`, lifecycle validation (`CREATED -> PENDING_PICKUP -> LOADED -> IN_TRANSIT -> IN_STORAGE -> DISPATCHED_TO_SHOP -> AT_SHOP -> PAYMENT_PENDING -> SOLD`). Validated with `firebase_validate_security_rules`.
- **CI/CD Pipeline**: GitHub Actions `.github/workflows/firebase-hosting-merge.yml` deploying to Firebase Hosting project `freshpath-link`.


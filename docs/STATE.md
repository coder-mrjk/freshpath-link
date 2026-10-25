# FreshPath System State & Milestones

**Title**: FreshPath Current State  
**Version**: 1.7.2  
**Date**: October 25, 2026  
**Status**: Approved  
**Verified Against Commit**: `d29a925`  
**Live Production URL**: [https://freshpath-link.web.app](https://freshpath-link.web.app)

---

## 1. Executive Summary
All supply chain portals (Grower, Driver / Logistics, Mandi Hub, Retail Shelf, Customer Table, Control Admin) run with high-speed real-time synchronization (`onSnapshot`), completely eliminating polling and manual refreshes. The architecture eliminates cold room unit bottlenecks, outfitting Mandi facilities directly with DHT22 climate telemetry (measuring Temperature, Humidity, Dew Point via Magnus formula, Vapor Pressure Deficit (VPD), and Heat Index). A farmer handover approval gate prevents unauthorized crate loading, and a consumer counter payment + direct farmer rating loop seamlessly connects shoppers with farmers.

In v1.7.2:
- **Real-Time Mandi Climate Telemetry in Grower Portal**:
  - Replaced legacy `storageUnitId` lookup with direct `mandiId` binding in [`src/portals/grow/GrowPortal.tsx`](file:///Users/karthi/freshpath/src/portals/grow/GrowPortal.tsx).
  - Completely purged hardcoded "13.5°C" and "Cold Room" references across the Grower portal. Displays live DHT22 temperature and humidity (`30.8°C • 84% RH`) pushed by the hardware node to `mandis/{id}`.
- **Farmer Live Crop Transport & GPS Route Tracking**:
  - Added real-time transit telemetry card on crates in `PENDING_PICKUP`, `LOADED`, and `IN_TRANSIT`.
  - Shows assigned driver name, pass ID, clickable phone number, truck plate number, target Mandi, live u-blox NEO GPS coordinates, satellite count, speed, and an expandable interactive Leaflet `TripMap`.
- **Shopkeeper Counter Payment Security Rules Fix**:
  - Delegated to `firestore-rules-author` to update `/purchases/{purchaseId}` rules, authorizing shopkeepers to record purchases on behalf of shoppers for `PAID_COUNTER` payment confirmations. Deployed to live Firebase.
- **Retail Shelf Portal UX Streamlining**:
  - Removed redundant "View Consumer Page" redirect button from [`src/portals/shelf/ShelfPortal.tsx`](file:///Users/karthi/freshpath/src/portals/shelf/ShelfPortal.tsx).

In v1.7.1:
- **Farmer Transport Handover Security Rules Fix**:
  - Delegated to `firestore-rules-author` to update `/trips/{tripId}` rules. Authorized signed-in farmers to append and update `bagIds` and `updatedAt` during crate handover approval (`affectedKeys().hasOnly(['bagIds', 'updatedAt'])`). Deployed to live Firebase project `freshpath-link`.
- **Live GPS Real-Time Map & Vehicle Tracking**:
  - Enhanced [`src/components/TripMap.tsx`](file:///Users/karthi/freshpath/src/components/TripMap.tsx) and [`src/portals/move/MovePortal.tsx`](file:///Users/karthi/freshpath/src/portals/move/MovePortal.tsx) to accept the real-time vehicle GPS telemetry (`current`) and destination Mandi (`destination`).
  - Completely resolved the map defaulting to Cuddalore coordinates by auto-centering on the live u-blox NEO GPS coordinates (`11.370423, 77.745483` with 12 satellites locked) and displaying a pulsing blue vehicle tracker with real-time speed, accuracy radius, and fix timestamps.
  - Deployed updated web application build to Firebase Hosting.

In v1.7.0:
- **Dynamic Cloud Hardware Pairing (STORE-01)**:
  - The ESP32 DHT22 storage node (`dht22-node.ino`) now queries Firestore dynamically using `documents:runQuery` matching `nodeUnitId == UNIT_ID` ("STORE-01") to discover its paired Mandi. This allows administrators to bind and unbind Mandis from the Control Portal (`/control`) without needing to change code or re-flash the ESP32.
- **Hardware Binding UX & Dynamic Selectors**:
  - Replaced raw text inputs in `/control` with clean `<select>` dropdowns loaded directly from registered `devices` (`type === 'gps'` and `type === 'storage'`).
  - Fixed UI symbols (replaced raw LaTeX `$\leftrightarrow$` with clean `↔`).
- **Live-Only Data Standard (Zero Hardcoded/Demo Values)**:
  - Completely purged hardcoded fallback values (e.g. 14.2°C, 88% humidity, default `GPS-01`, and hardcoded Panruti farm).
  - In Mandi Hub (`/hub`), unlinked facilities or sensors waiting for telemetry display `"-"` instead of fake numbers.
  - In Driver Move (`/move`), vehicle creation initializes with `gpsUnitId: null`, unlinked vehicles show `"Unlinked"`, and trip origin selection dynamically loads registered farm fields from the `fields` collection.
  - Trips strictly require a live hardware fix when `VITE_ALLOW_SIMULATED_GPS=false`.
- **Real-Time Cross-Portal Sync**:
  - Implemented real-time `onSnapshot` listeners across Control (users, vehicles, mandis, devices, pricing) and Grower (`config/pricing`) so price modifications and user approvals sync instantly without manual browser refreshes.
- **Firmware Credentials**:
  - Wi-Fi credentials set to SSID `KARTHI` / password `12345678` across `firmware/dht22-node/config.h` and `firmware/gps-node/config.h` (verified gitignored).

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


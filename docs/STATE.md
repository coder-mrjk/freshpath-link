# FreshPath System State & Milestones

**Title**: FreshPath Current State  
**Version**: 1.4.0  
**Date**: October 19, 2026  
**Status**: Approved  
**Verified Against Commit**: `07e8da1`  
**Live Production URL**: [https://freshpath-link.web.app](https://freshpath-link.web.app)

---

## 1. Executive Summary
All supply chain portals (Grower, Driver / Logistics, Mandi Hub, Retail Shelf, Customer Table, Control Admin) have been upgraded to high-speed real-time synchronization (`onSnapshot`), completely eliminating polling and manual refreshes. The architecture eliminates cold room unit bottlenecks, outfitting Mandi facilities directly with DHT22 climate telemetry (measuring Temperature, Humidity, Dew Point via Magnus formula, Vapor Pressure Deficit (VPD), and Heat Index). A farmer handover approval gate prevents unauthorized crate loading, and a consumer counter payment + direct farmer rating loop seamlessly connects shoppers with farmers.

In v1.4.0, the hardware telemetry data contracts for dual ESP32 integration (GPS Node "GPS-01" & Mandi DHT22 Node "STORE-01") have been applied across the application and security rules:
- **Firestore Security Rules**: Added `isStorageNodeOf(mandi)` helper verifying authenticated `storage` devices registered under `devices/{uid}` and matching `mandi.nodeUnitId`, scoped to only permit updates to `currentTemp`, `currentHumidity`, `latest`, and `updatedAt`.
- **Hub Portal Telemetry Stream**: Integrated `parseReadingDate` to support both Firestore Timestamps (written by ESP32) and ISO string dates, keeping the newest 288 points (~24h) for charting.
- **Demo Supply Chain Seeding**: Bound `nodeUnitId: 'STORE-01'` to `mandi-panruti-01` and seeded DHT22 readings directly into `mandis/{mandiId}/readings`.
- **Seed Script Maintenance**: Replaced invalid CLI seed script with clear guidance to utilize the in-app `/demo` suite.
- **Move Portal & Honest GPS Simulation**: Tagged fallback GPS fixes with `simulated: true` across `trip.start` and `trip.end`, displayed visible amber warning "Simulated GPS (no live fix)" in the trip UI and map popups, and implemented `VITE_ALLOW_SIMULATED_GPS` (default 'true'; blocks trip start when 'false').

---

## 2. Portal Status Overview

| Portal | Role ID | Status | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Grower** | `GROWER` | `DONE` | Harvest crate creation with auto pricing, farmer farm management (register, edit, delete), real-time `onSnapshot` sync, **Pending Transport Handover Requests Gate** (approving/declining driver loading), and **Customer Verified Reviews & Ratings Ledger**. |
| **Move (Logistics)** | `DRIVER` | `DONE` | Vehicle management, scanning crates sets `PENDING_PICKUP` awaiting farmer handover approval, live "Awaiting Farmer Handover Approval" ledger, real-time GPS hardware listener (ESP32 GPS-01 contract), honest `simulated: true` tagging with amber warning, and configurable `VITE_ALLOW_SIMULATED_GPS` gate. |
| **Hub (Mandi)** | `MANDI` | `DONE` | Direct Mandi DHT22 climate telemetry (Temperature, Humidity, Dew Point, VPD, Heat Index, Freshness badge), ESP32 Firestore Timestamp & ISO date parsing (`parseReadingDate`), 288-reading 24h rolling window, incoming delivery intake, and retail store dispatch. |
| **Shelf (Retail Stores)** | `RETAIL` | `DONE` | Store management, real-time shelf inventory, and **Pending Customer Counter Payments Gate** with 1-click **Payment Received** verification. |
| **Table (Customer / Consumer)** | `CONSUMER` | `DONE` | Live provenance browser with real-time `onSnapshot` sync, store details, "Digital Payments (UPI / Card): Coming Soon" banner, "Pay at Shop Counter" request, instant payment confirmation reveal, and **5-Star Direct Farmer Rating & Review modal**. |
| **Control Admin** | `ADMIN` | `DONE` | Regulated rate configuration per size grade (A+, A, B, C), user verification approvals, direct Mandi DHT22 sensor node pairing, vehicle registration plate pairing notification fix, SMS verification line cleanup. |
| **Push Notifications & Tokens** | `ALL` | `DONE` | Web Push Service Worker with absolute logo icons, in-app device token viewer with one-click copy in Settings, and real-time Firestore token sync under `/users/{uid}.fcmTokens`. |

---

## 3. Governance & Quality Gates
- **Unit Tests**: 13/13 test files passing (71/71 test cases).
- **TypeScript & Production Build**: Passing with zero type errors (`tsc && vite build`).
- **Firestore Security Rules**: Strict role boundaries, storage node device validation via `isStorageNodeOf()`, lifecycle validation (`CREATED -> PENDING_PICKUP -> LOADED -> IN_TRANSIT -> IN_STORAGE -> DISPATCHED_TO_SHOP -> AT_SHOP -> PAYMENT_PENDING -> SOLD`). Validated with `firebase_validate_security_rules`.
- **CI/CD Pipeline**: GitHub Actions `.github/workflows/firebase-hosting-merge.yml` deploying to Firebase Hosting project `freshpath-link`.


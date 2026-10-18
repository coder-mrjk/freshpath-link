# FreshPath System State & Milestones

**Title**: FreshPath Current State  
**Version**: 1.2.0  
**Date**: October 18, 2026  
**Status**: Approved  
**Verified Against Commit**: `HEAD`  
**Live Production URL**: [https://freshpath-link.web.app](https://freshpath-link.web.app)

---

## 1. Executive Summary
All supply chain portals (Grower, Driver / Logistics, Mandi Hub, Retail Shelf, Customer Table, Control Admin) have been upgraded to high-speed real-time synchronization (`onSnapshot`), completely eliminating polling and manual refreshes. The architecture eliminates cold room unit bottlenecks, outfitting Mandi facilities directly with DHT22 climate telemetry (measuring Temperature, Humidity, Dew Point via Magnus formula, Vapor Pressure Deficit (VPD), and Heat Index). A farmer handover approval gate prevents unauthorized crate loading, and a consumer counter payment + direct farmer rating loop seamlessly connects shoppers with farmers.

---

## 2. Portal Status Overview

| Portal | Role ID | Status | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Grower** | `GROWER` | `DONE` | Harvest crate creation with auto pricing, farmer farm management (register, edit, delete), real-time `onSnapshot` sync, **Pending Transport Handover Requests Gate** (approving/declining driver loading), and **Customer Verified Reviews & Ratings Ledger**. |
| **Move (Logistics)** | `DRIVER` | `DONE` | Vehicle management, scanning crates sets `PENDING_PICKUP` awaiting farmer handover approval, live "Awaiting Farmer Handover Approval" ledger, real-time GPS hardware listener, and trip lifecycle. Zero demo simulators. |
| **Hub (Mandi)** | `MANDI` | `DONE` | Direct Mandi DHT22 climate telemetry (Temperature, Humidity, Dew Point, VPD, Heat Index, Freshness badge), eliminated cold room unit requirements, removed demo injectors, real-time incoming delivery intake, and retail store dispatch. |
| **Shelf (Retail Stores)** | `RETAIL` | `DONE` | Store management, real-time shelf inventory, removed Print Label & self-ratings, and added **Pending Customer Counter Payments Gate** with 1-click **Payment Received** verification. |
| **Table (Customer / Consumer)** | `CONSUMER` | `DONE` | Live provenance browser with real-time `onSnapshot` sync, store details, "Digital Payments (UPI / Card): Coming Soon" banner, "Pay at Shop Counter" request, instant payment confirmation reveal, and **5-Star Direct Farmer Rating & Review modal**. |
| **Control Admin** | `ADMIN` | `DONE` | Regulated rate configuration per size grade (A+, A, B, C), user verification approvals, direct Mandi DHT22 sensor node pairing, vehicle registration plate pairing notification fix, SMS verification line cleanup. |

---

## 3. Governance & Quality Gates
- **Unit Tests**: 13/13 test files passing (68/68 test cases).
- **TypeScript & Production Build**: Passing with zero type errors (`tsc && vite build`).
- **Firestore Security Rules**: Strict role boundaries, lifecycle validation (`CREATED -> PENDING_PICKUP -> LOADED -> IN_TRANSIT -> IN_STORAGE -> DISPATCHED_TO_SHOP -> AT_SHOP -> PAYMENT_PENDING -> SOLD`), and rating updates. Validated with `firebase_validate_security_rules`.
- **CI/CD Pipeline**: GitHub Actions `.github/workflows/firebase-hosting-merge.yml` deploying to Firebase Hosting project `freshpath-link`.

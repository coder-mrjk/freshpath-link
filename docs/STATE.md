# FreshPath System State & Milestones

**Title**: FreshPath Current State  
**Version**: 1.1.1  
**Date**: October 18, 2026  
**Status**: Approved  
**Verified Against Commit**: `HEAD`  
**Live Production URL**: [https://freshpath-link.web.app](https://freshpath-link.web.app)

---

## 1. Executive Summary
All supply chain portals (Grower, Driver / Logistics, Mandi Hub, Retail Shelf, Customer Table, Control Admin) are active, functional, and connected with real-time Firestore synchronization. CI/CD automated deployments via GitHub Actions to Firebase Hosting are active on merge/push to `main`.

---

## 2. Portal Status Overview

| Portal | Role ID | Status | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Grower** | `GROWER` | `DONE` | Harvest batch creation, Crate QR label generator, farmer-direct farm management (register, edit, delete, switch active farm), official admin pricing badge & lock. |
| **Move (Logistics)** | `DRIVER` | `DONE` | Vehicle auto-provisioning, GPS route tracking with hardware telemetry fallback, 1-click batch pickup & delivery completion. |
| **Hub (Mandi Cold Storage)** | `MANDI` | `DONE` | Facility auto-provisioning, incoming delivery trucks list with 1-click intake to cold storage, dispatching to retail stores. |
| **Shelf (Retail Stores)** | `RETAIL` | `DONE` | Store auto-provisioning, incoming dispatches list with 1-click receive onto shelf, stock display with live decay timer. |
| **Table (Customer / Consumer)** | `CONSUMER` | `DONE` | Live produce browser across stores with 1-click purchase inspection, QR code verification, user settings access. |
| **Control Admin** | `ADMIN` | `DONE` | Regulated rate configuration per size grade (A+, A, B, C), user verification approvals, IoT hardware telemetry binding, system audits. (Farm editing/deleting kept exclusively in Farmer portal). |

---

## 3. Governance & Quality Gates
- **Unit Tests**: 13/13 test files passing (68/68 test cases).
- **TypeScript & Production Build**: Passing with zero type errors (`tsc && vite build`).
- **CI/CD Pipeline**: GitHub Actions `.github/workflows/firebase-hosting-merge.yml` deploying to Firebase Hosting project `freshpath-link`.

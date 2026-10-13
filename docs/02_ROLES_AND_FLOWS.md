# 02 – Roles, Approvals and Flows

## Roles
| Role | Portal | Approval | Pass ID |
|---|---|---|---|
| Owner (admin) | Control | Created manually in Firebase Console (`owners/{uid}`) | – |
| Farmer | Grow | Owner approves | `FP-F-0001`, `FP-F-0002`… |
| Driver | Move | Owner approves | `FP-D-0001`… |
| Mandi person | Hub | Owner approves | `FP-M-0001`… |
| Shop person | Shelf | Owner approves | `FP-S-0001`… |
| Consumer | Table | Automatic | `FP-C-` + 6 random chars |

Pass ID is issued by the owner at approval (transaction on `counters/{role}`). It is a FreshPath registration
number, **not a legal licence**. Pending/suspended users can log in but see only a "waiting for approval" page.

## Entrance
First screen: "Who are you?" cards (Farmer, Driver, Mandi, Shop, Consumer). Choose -> register or log in -> role is
saved in `users/{uid}`. Later logins go straight to the user's portal. Owner login is a separate small link.

## Bag status machine
`CREATED` -> `LOADED` -> `IN_TRANSIT` -> `IN_STORAGE` -> `DISPATCHED_TO_SHOP` -> `AT_SHOP` -> `SOLD`
| Transition | Who | How |
|---|---|---|
| (new) -> CREATED | Farmer | Create bag form |
| CREATED -> LOADED | Driver | Scans bag QR while trip is DRAFT |
| LOADED -> IN_TRANSIT | Driver | Taps "Start trip" (all bags in trip move together) |
| IN_TRANSIT -> IN_STORAGE | Mandi | Scans bag QR, chooses storage unit |
| IN_STORAGE -> DISPATCHED_TO_SHOP | Mandi | Scans bag, chooses shop |
| DISPATCHED_TO_SHOP -> AT_SHOP | Shop | Scans bag QR to receive |
| AT_SHOP -> SOLD | Consumer | Scans, reviews, taps "Confirm purchase" |
Rules: no skipping, no going back, a SOLD bag can never be sold again. Each transition writes one `events` row
and updates the bag in the same batch. Transport between mandi and shop is NOT tracked.

## Trip flow (Move)
1. Driver registers a vehicle (registration number like `TN 01 AB 1234`, type, capacity). Owner approves and links a GPS unit (e.g. `GPS-01`).
2. Driver creates a trip: origin text (typed), destination mandi (pick from list). Status DRAFT.
3. Driver scans bag QRs to add them (no typing of IDs; manual entry only as fallback).
4. "Start trip": app reads `gpsUnits/{id}.latest`. If the fix is valid and fresh (<= 3 minutes old, >= 4 satellites) copy it to `trip.start`; else show "Waiting for GPS fix – go outdoors".
5. "End trip" at the mandi: same for `trip.end`; trip status ENDED. Straight-line distance and duration are calculated.
6. Trip map: Leaflet pins for start (green) and end (red) with accuracy circle.

## Mandi flow (Hub)
- Receive: scan bag -> select storage unit -> IN_STORAGE.
- Storage view: live temperature/humidity for each unit (latest reading + simple chart of last 24 hours); list of bags inside with hours stored.
- Dispatch: scan bag -> choose shop -> DISPATCHED_TO_SHOP.

## Shop flow (Shelf)
- Receive: scan bag -> AT_SHOP. Shelf list with price (price per kg x weight) and freshness badge.

## Consumer flow (Table)
Scan QR -> bag page shows: freshness badge, harvested time (IST) and "x days ago", farmer first name, field + village,
weight, pieces, size grade, farmer's benefit note (if any), price, route map (start/end), straight-line distance, handler
timeline with IST times, mandi storage temperature summary (average/min/max while stored). Buttons: "Confirm purchase"
(only when status AT_SHOP), then "Rate" (1–5 stars + optional comment). "Digital payment – coming soon" (disabled).
History page lists purchased bags with price and time.

## Farmer dashboard (Grow)
Bag list with status and current place, bag detail with timeline, mandi temperature for bags in storage, buyers
(first name + customer ID), ratings and comments, "Print label" per bag.

## Handler count
Number of distinct users (farmer, driver, mandi person, shop person) who recorded an event for the bag.

## Event types
`BAG_CREATED, LOADED, TRIP_STARTED, TRIP_ENDED, RECEIVED_STORAGE, DISPATCHED_TO_SHOP, RECEIVED_SHOP, PURCHASED, RATED`

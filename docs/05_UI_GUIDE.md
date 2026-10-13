# 05 – UI Guide

## Principles
Mobile-first PWA. One-hand use. Big buttons (min 48 px). High contrast, outdoor-readable. Plain words.
Every screen has a title, a language toggle (English / தமிழ்) and a "Home" button. Tamil is optional: `en.json` is
complete; `ta.json` is filled in too, and marked "needs native review" in a comment.

## Look
Colours: tomato red `#D62828` (actions), leaf green `#2E7D32` (fresh/ok), amber `#F9A825` (warning), dark text `#1B1B1B`, background `#FAFAF7`.
Font: system sans-serif. Cards with rounded corners. Status chips colour-coded.

## Screens
**Entrance:** FreshPath logo + "Who are you?" with five role cards, then Register/Login.
**Register (all roles):** first name, full name, phone, address/village text, password. Role-specific extras:
farmer (first field: name, village, optional map pin), driver (vehicle reg no., type, capacity), mandi (mandi name, area, storage unit name), shop (shop name, area).
After sign-up: "Waiting for owner approval" screen (except consumer).
**Control (owner):** Approvals queue (approve -> issues Pass ID, reject, suspend), Link GPS unit to vehicle, Link sensor node to storage unit, Users list, Config (price per kg).
**Grow:** Home (my bags, counts by status), Create bag (product=Tomato, field, weight kg, pieces, size grade, harvest date-time, benefits note) -> shows price -> "Create & print label".
Label page `/print/:bagId`: QR (>= 3 cm when printed), bag ID in large text, farmer first name, product, weight, pieces, harvest date IST, "FreshPath". Buttons: Print, Download PNG, copies (1–4). `@media print` hides all UI. Bag detail: timeline, current status, mandi temperature, buyer + rating.
**Move:** Home (my trips), Vehicle card (reg no., GPS unit), New trip, Scan to load, Trip detail (bag list, Start / End buttons, GPS status chip, map with start/end pins).
**Hub:** Scan to receive, Storage (temperature/humidity big numbers + 24 h chart + bags inside), Dispatch to shop.
**Shelf:** Scan to receive, Shelf list.
**Table:** Scan, Bag page (see docs/02), Confirm purchase, Rate, History.

## Map details
Leaflet + OpenStreetMap tiles with the required attribution. Green pin = start, red pin = end, blue dot = latest GPS (Move/Control only).
Show lat/lng to 6 decimals, satellites and HDOP; draw an accuracy circle. Never claim "exact"; say "GPS accuracy depends on satellites".

## Scanner
Use `html5-qrcode` with the rear camera. Needs HTTPS (Firebase Hosting) or localhost. Always provide a manual "type bag ID" fallback.
Scan result parses `<origin>/b/<bagId>` or a raw bagId.

## Time display
All times via `formatIST()`; relative text like "2 days ago" is shown next to the IST time, never instead of it.

## Empty / error states
Friendly text for: no camera permission, no GPS fix, offline, not approved, bag not found, wrong status ("This bag is already sold").

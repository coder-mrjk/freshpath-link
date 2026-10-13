# 06 – Test Plan (and evidence for the judges)

## Principles
Test with the Firebase Emulator Suite first (Auth + Firestore), never with real people's data. Fake users: first names only. Keep a test log (table at the end) – the judges score "testing and improvement" from real results and fixes.

## 1. Unit tests (Vitest)
- `price`: 0.5, 1, 2, 5, 10, 25 kg -> 30, 60, 120, 300, 600, 1500.
- `formatIST`: `2026-10-13T00:40:12Z` -> `13 Oct 2026, 06:10:12 AM IST`; midnight rollover (`2026-10-12T19:00:00Z` -> next day 12:30 AM).
- `haversine`: known city pair distance within 1%.
- Bag ID generator: format, uniqueness, collision retry.
- Handler count: distinct users only.
- Freshness: boundaries at 70 and 40; clamps 0–100.
- `getFreshFix`: NO_FIX, STALE, FEW_SATS, ok.
- Status machine: every allowed and every forbidden transition.

## 2. Security rules tests (emulator)
Roles: anonymous, consumer, pending farmer, approved farmer/driver/mandi/shop, device-GPS, device-storage, owner, suspended user.
Must fail: user sets own role/status/passId; pending user creates bag; farmer creates bag for another farmer; wrong price; edit/delete event; skip status; sell bag twice; consumer reads another's phone; GPS device writes another unit; storage device writes GPS data; non-buyer rates; rate twice.
Must pass: each role's normal actions in docs/02.

## 3. End-to-end happy path (browser)
1. Owner approves farmer, driver, mandi, shop (Pass IDs appear). 2. Farmer creates 5 kg tomato bag (price Rs 300) and opens label. 3. Driver creates trip, scans bag, Start (GPS fix required). 4. Driver End at mandi. 5. Mandi receives into storage, sees temperature. 6. Mandi dispatches to shop. 7. Shop receives. 8. Consumer scans, sees journey, confirms purchase. 9. Consumer rates 4 stars. 10. Farmer sees buyer first name, rating, mandi temperature. Check every timestamp is IST and in order.

## 4. Negative and edge cases
Scan unknown QR; scan sold bag; two drivers load the same bag; Start trip with no GPS fix; WiFi off during an action; Tamil toggle on every screen; very small phone screen; browser Back after confirm purchase (no duplicate purchase).

## 5. Hardware tests (record real numbers)
- H1 GPS first fix outdoors: time to first fix, satellites, HDOP.
- H2 Pin accuracy: stand at a known landmark, compare the app pin with a phone map; record the offset in metres.
- H3 DHT22 vs a second thermometer at the same place; record difference.
- H4 Power bank stays on for 2 hours with the node.
- H5 WiFi drop and recovery; token refresh after > 1 hour.
- H6 Vehicle test (with a parent/teacher): node mounted, antenna facing sky; Start and End fixes valid.

## 6. QR and print tests
Print the label at 2–3 sizes. Scan 10 times each from 20–40 cm, indoors and in sunlight, with clear tape over it, slightly crumpled, and on a curved crate. Record success rate per case. Fix the weakest case (bigger QR, more margin, less glare).

## 7. People tests (3–5 volunteers, with permission)
Ask a farmer helper/driver/shopkeeper/shopper to do their task with no help. Record time taken, mistakes, quotes. Make at least 2 changes and re-test.

## 8. Real batch (for the journey log)
Use fake pass accounts but real tomatoes and a real route: farm -> truck -> mandi -> shop. Record stop, IST time, straight-line km from previous stop, handlings, what went wrong, what you changed. Use first names or roles only.

## Test log template
| ID | Date (IST) | What was tested | Expected | Actual | Pass/Fail | Fix made | Re-test |
|---|---|---|---|---|---|---|---|

## Done checklist before submission
All unit + rules tests pass; happy path passes on a real phone; GPS and DHT22 numbers recorded; QR scan table filled; 3+ people tests with 2 improvements; screenshots captured and labelled; no real personal data anywhere.

# 03 – Data Model, IDs, Time, Security (Firestore)

## Time
- Store `Timestamp` (UTC). Display with `formatIST()` -> e.g. `13 Oct 2026, 06:10:25 AM IST`.
- GPS time is UTC from the satellite; convert only at display. IST = UTC+5:30, no daylight saving.
- Event times use server timestamps (`serverTimestamp()`), never the phone clock.

## IDs
- Pass IDs: see docs/02.
- Bag ID (also document ID): `FP-TOM-YYMMDD-XXXXXX` (date in IST, 6 random chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`). Create must fail if the ID already exists (retry with a new random part).
- QR content: `<origin>/b/<bagId>` where origin = the hosted app URL. Scanning with the in-app scanner or a normal camera must both work.
- Trip ID: `TRP-YYMMDD-XXXX`. Vehicle ID = registration number without spaces, upper-case.

## Collections
```
users/{uid}
  role: farmer|driver|mandi|shop|consumer
  status: pending|approved|suspended|rejected
  passId, firstName, fullName(private), phone(private), addressText(private), preferredLang: "en"|"ta"
  createdAt, approvedAt, approvedBy
owners/{uid}                      (created manually in console)
counters/{role}                   { next: number }   (owner only)
devices/{uid}                     { type: "gps"|"storage", unitId }   (console only)
products/tomato                   { name:"Tomato", ratePerKg: 60, active: true }
config/freshness                  { perHourSinceHarvest: 0.5, perHourStoredAbove30C: 1.0, freshMin: 70, sellSoonMin: 40 }
fields/{fieldId}                  { farmerUid, name, village, district, lat?, lng?, createdAt }
bags/{bagId}
  product:"tomato", farmerUid, farmerPassId, farmerFirstName, fieldId, fieldName, village,
  weightKg, pieces, sizeGrade?, benefitsNote?, harvestAt, pricePerKg, totalPrice,
  status, tripId?, storageUnitId?, mandiId?, shopId?, holderUid, handlerUids[], createdAt, updatedAt,
  soldTo?: { consumerUid, consumerPassId, firstName }, rating?: { stars, comment, at }
vehicles/{vehicleId}              { driverUid, regNumber, vehicleType, capacityKg, gpsUnitId?, status }
gpsUnits/{gpsUnitId}              { vehicleId?, latest: { lat, lng, speedKmph, sats, hdop, valid, fixAt }, receivedAt }
trips/{tripId}
  driverUid, vehicleId, gpsUnitId, originText, destinationMandiId, status: DRAFT|IN_TRANSIT|ENDED,
  bagIds[], start?: { lat, lng, fixAt, sats, hdop }, end?: { ...same }, startedAt?, endedAt?, distanceKmStraight?, durationMin?
mandis/{mandiId}                  { mandiPersonUid, name, area, lat?, lng? }
storageUnits/{unitId}             { mandiId, name, nodeUnitId ("STORE-01"), latest: { tempC, humidityPct, at } }
storageUnits/{unitId}/readings/{autoId}   { tempC, humidityPct, at }
shops/{shopId}                    { shopPersonUid, name, area, lat?, lng? }
events/{eventId}                  { bagId, type, byUid, byRole, byPassId, at(server), place?: {lat,lng,text}, tripId?, note? }
purchases/{purchaseId}            { bagId, consumerUid, consumerPassId, price, at, paymentStatus: "NOT_ENABLED" }
```
No private data inside `bags`, `trips`, `events` (they are readable by signed-in users). Phone/address live only in `users`.

## Price
`totalPrice = weightKg x pricePerKg` (Rs 60 now). Examples: 0.5 kg = 30, 1 kg = 60, 2 kg = 120, 5 kg = 300, 10 kg = 600, 25 kg = 1500. Store `pricePerKg` on the bag so later rate changes do not alter old bags.

## Freshness score (demo estimate – label "estimate" in the UI)
`score = clamp(100 - perHourSinceHarvest x hoursSinceHarvest - perHourStoredAbove30C x hoursStoredAbove30C, 0, 100)`
Badge: score >= 70 green "Fresh"; 40–69 amber "Sell soon"; < 40 red "Check quality". Constants come from `config/freshness`.
Hours stored above 30 C are computed from `readings` between RECEIVED_STORAGE and DISPATCHED_TO_SHOP.

## Security rules (spec for `firestore.rules`)
Helpers: `signedIn()`, `isOwner()` (exists `owners/uid`), `me()` (user doc), `isApproved(role)`, `isDevice(unitId, type)`.
- `users`: user can create own doc with role in {farmer, driver, mandi, shop, consumer}; status forced to `pending` (consumer: `approved`); cannot set passId/status/role later. Owner can read all and update status/passId/approvedAt/approvedBy. A user reads only their own doc. Phone/address never readable by others.
- `counters`, `products`, `config`: owner writes; signed-in read (counters owner-only).
- `fields`: approved farmer creates/updates own; readable by signed-in users.
- `bags`: create only by approved farmer for own farmerUid, status `CREATED`, price = weight x active rate. Updates only follow the status machine in docs/02 by the correct approved role. No deletes. Signed-in users can read.
- `events`: create only by approved users with `byUid == request.auth.uid`; no update, no delete; signed-in read.
- `vehicles`: approved driver creates own; owner sets `gpsUnitId`/status; read by signed-in users.
- `gpsUnits/{id}`: device with `unitId == id` may write `latest`/`receivedAt`; owner may link vehicle; signed-in read.
- `trips`: approved driver creates/updates own; start/end only once; read by signed-in.
- `storageUnits` and `readings`: device with matching unitId creates readings and updates `latest`; mandi person/owner create units; signed-in read.
- `purchases`: approved consumer creates for self only when bag status is `AT_SHOP`; the same batch marks bag `SOLD`; reads: own purchases, the bag's farmer, owner.
- Rating: only the consumer who bought the bag, once.
- Default deny everything else.

## Indexes
Create composite indexes only when Firestore asks; add them to `firestore.indexes.json`.

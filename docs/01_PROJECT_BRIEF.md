# 01 – Project Brief: FreshPath

## Problem
A shopper buying tomatoes cannot see when they were harvested, how far they travelled, how many hands touched
them, or how they were stored. A farmer cannot see where the produce went or what customers thought. Most
spoilage happens at the mandi (open-air waiting, repeated handling, heat).

## Solution
Every crate/bag of tomatoes gets a **unique ID and QR label** printed from the app by the farmer. Each stage
scans it and the app records who, where and when (always shown in IST). A GPS unit on the truck records trip
start and end. A DHT22 sensor in the mandi storage records temperature and humidity. The shopper scans the QR at
the shop and sees the full journey, then confirms the purchase and can rate it.

## Name set
- App: **FreshPath**
- Portals: **Grow** (farmer), **Move** (driver), **Hub** (mandi), **Shelf** (shop), **Table** (consumer), **Control** (owner)

## In scope (v1)
- Email/password login, role chosen at sign-up, **owner approval** for farmer/driver/mandi/shop, unique Pass IDs
- Farmer: profile, fields, create bag, print QR label, dashboard (bags, location/status, buyers, ratings, mandi temperature)
- Driver: vehicle, trip, scan bags to load, Start trip / End trip with GPS position
- Mandi: receive bags into storage, see live temperature/humidity, dispatch bags to a shop
- Shop: receive bags from mandi, shelf list
- Consumer: register, scan QR, view journey, confirm purchase, history, rate
- Owner: approve users, issue Pass IDs, link GPS unit to vehicle, link sensor node to mandi storage, suspend users
- Leaflet + OpenStreetMap maps, all times in IST, English + optional Tamil
- Tomato only. Price: Rs 60 per kg x weight (editable in `products` config).

## Out of scope (v1) – show a "Coming soon" label where useful
- Real payments (button disabled: "Digital payment – coming soon")
- Tracking of transport between mandi and shop
- Continuous GPS history (only trip start and end are stored)
- Other vegetables (data model already supports a `product` field)

## Privacy principles
- Collect the minimum. No date of birth. Phone and address visible only to the owner and the user.
- Shoppers see farmer first name + field/village only. Farmers see buyer first name + customer ID only.
- Use fake test data only. Never put real people's phone numbers or details in the app, screenshots or video.

## Context: competition (HCL Jigsaw, Round 2)
Judges score evidence and clear thinking, not size. Therefore the app must: show clear labelled screens
(screenshots), keep an auditable journey log with times, distances and handler counts, and make test results easy
to record. Journey distance is **straight-line** distance (haversine) between trip start and end; label it that way.

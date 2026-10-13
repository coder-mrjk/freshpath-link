# 07 – Milestones and Prompts

Use one prompt per milestone. Start each with the workflow `/plan-milestone`, approve the plan, then build, then run `/test-milestone`.
Always begin a new agent conversation with: "Read `.agent/rules` and docs/01–07. Work only on the milestone named below."

## M0 – Scaffold
Prompt: "Milestone M0. Create the Vite + React + TypeScript + Tailwind project in this folder with the folder structure `src/portals/{grow,move,hub,shelf,table,control}`, `src/lib`, `src/components`, `src/i18n`. Add Firebase initialisation from `.env.local`, `.env.example`, react-router, i18n with en/ta, PWA plugin, `formatIST()`, Firebase emulator config, Vitest."
Done when: app runs, entrance page renders, `formatIST` tests pass, emulators start.

## M1 – Auth, roles, owner approvals, Pass IDs
Prompt: "Milestone M1. Entrance role cards, register/login, role-specific registration extras, pending-approval screen, Control portal approval queue with Pass ID issuing (transaction on counters), suspend, and `firestore.rules` for users/owners/counters with rules tests."
Done when: all roles register; owner approves; Pass IDs `FP-F-0001` style appear; pending users are blocked; rules tests pass.

## M2 – Grow (farmer)
Prompt: "Milestone M2. Fields, Create bag (price = weight x Rs 60), bag ID + QR, `/print/:bagId` label page with print CSS and PNG download, farmer home list. Add bags/events rules + tests."
Done when: 5 kg bag shows Rs 300; printed label scans with a phone camera; `BAG_CREATED` event is written.

## M3 – Move (driver) and GPS
Prompt: "Milestone M3. Vehicle registration, owner links GPS unit, trips, scan to load, Start/End using `getFreshFix`, straight-line distance and duration, Leaflet map with start/end pins and accuracy circle. Add rules + tests. Also write the firmware for the truck node in `/firmware/truck_gps` following docs/04."
Done when: with a fake `gpsUnits/GPS-01` document trips start/end correctly; stale or invalid fix is refused.

## M4 – Hub (mandi) and storage temperature
Prompt: "Milestone M4. Mandi profile and storage units, receive bag, dispatch to shop, storage view with latest temperature/humidity and 24 h chart from `readings`. Write firmware in `/firmware/storage_dht22` following docs/04."
Done when: receive/dispatch statuses follow the machine; readings appear live.

## M5 – Shelf (shop)
Prompt: "Milestone M5. Shop profile, receive from mandi, shelf list with price and freshness badge."
Done when: only dispatched bags can be received.

## M6 – Table (consumer)
Prompt: "Milestone M6. Consumer register (auto approved, customer ID), scanner with manual fallback, bag page per docs/02, Confirm purchase (batch: purchase + bag SOLD + event), history, rating, disabled payment button."
Done when: cannot buy twice; rating only by the buyer; all times IST.

## M7 – Farmer dashboard
Prompt: "Milestone M7. Grow dashboard: counts, bag timeline, mandi temperature for bags in storage, buyers (first name + customer ID), ratings."
Done when: farmer sees only own bags.

## M8 – Tamil and polish
Prompt: "Milestone M8. Complete ta.json for all screens, language toggle persisted per user, empty/error states, accessibility pass, PWA install, performance check on a mid-range phone."

## M9 – Test, security review, deploy
Prompt: "Milestone M9. Run `/security-review`, complete all tests in docs/06 that can be automated, seed demo data script (fake first names), prepare Firebase Hosting config. Do not deploy; give me the commands."

## Prompting tips
- Paste exact error messages. Ask "explain the root cause first".
- If you change a decision, edit the docs first, then tell the agent to re-sync.
- After M1, independent portals (M4, M5, M6) may run in parallel agents in separate folders.
- Commit to Git after every milestone.

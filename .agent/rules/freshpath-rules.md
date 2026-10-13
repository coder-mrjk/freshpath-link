# FreshPath – Workspace Rules (always follow)

## Project
FreshPath is a farm-to-table tomato tracking web app (PWA). One app, one Firebase project.
Portals: Grow (farmer), Move (driver), Hub (mandi), Shelf (shop), Table (consumer), Control (owner/admin).
Read `docs/01`–`docs/07` before planning any work. The docs are the source of truth.

## Stack (do not change without asking)
- React 18 + Vite + TypeScript, Tailwind CSS, react-router, react-i18next (English + Tamil)
- Firebase JS SDK v10+ modular: Authentication (email/password), Firestore, Hosting
- Leaflet + react-leaflet with OpenStreetMap tiles (keep the attribution visible)
- `html5-qrcode` to scan, `qrcode.react` to generate, `vite-plugin-pwa`
- Tests: Vitest, Firebase Emulator Suite, `@firebase/rules-unit-testing`
- FREE Firebase Spark plan ONLY: NO Cloud Functions, NO phone/SMS auth, NO Cloud Storage.

## Hard rules
1. Time: store Firestore `Timestamp` (UTC instants). Display ONLY through `formatIST()` in `src/lib/time.ts`
   using `Intl.DateTimeFormat` with `timeZone: "Asia/Kolkata"`. Never use the device's local time zone.
2. `events` is append-only. Never update or delete an event. Use server timestamps for event time.
3. Privacy: never show phone, full name or address to anyone except the owner and the user themself.
   No date of birth anywhere. Shoppers see only farmer first name + field/village.
4. Never commit secrets. Use `.env.local` (git-ignored) and provide `.env.example`.
   Never ask for or paste service-account keys or passwords.
5. Roles are enforced by Firestore security rules, not only by hiding screens. Every feature that reads or
   writes data needs a matching rule and a rules test.
6. Do not deploy (`firebase deploy`) or change security rules without showing me the diff first.
7. Use Firestore transactions or batched writes when several documents must change together (e.g. bag status + event).
8. Mobile-first UI, large touch targets, works on a mid-range Android phone. All text goes through i18n keys.
9. Use fake test data only (first names). Never real people's details.
10. Keep code small and readable: one portal per folder (`src/portals/<role>`), shared code in `src/lib` and `src/components`.
11. If a requirement is unclear or conflicts with the docs, ask before coding. If you change the data model, update `docs/03` first.

## Working style
- For every milestone: write a short plan first, wait for my approval, then build, then run tests, then summarise.
- After each milestone: list files changed, tests added, and how I can verify it manually.
- Stop and ask after two failed attempts at the same bug; explain the root cause before changing code again.

## GitHub Sync (Automatic)
- Repository: `https://github.com/coder-mrjk/freshpath-link.git` (Owner: `coder-mrjk`, Repo: `freshpath-link`, Branch: `main`)
- After completing and verifying each milestone M0 through M9:
  - Commit all verified files with a concise conventional commit message.
  - Push changes to GitHub via GitHub MCP or git push origin main without needing to be asked.


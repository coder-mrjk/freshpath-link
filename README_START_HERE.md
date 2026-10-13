# FreshPath – Antigravity Starter Pack

## What is in this pack
- `.agent/rules/freshpath-rules.md` – permanent instructions for the agent
- `.agent/workflows/` – saved prompts: `/plan-milestone`, `/test-milestone`, `/security-review`
- `docs/01_PROJECT_BRIEF.md` … `docs/07_MILESTONES_AND_PROMPTS.md` – everything the agent needs to know

## Step 1 – One-time setup (YOU do this, not the agent)
1. Install Node.js (LTS), Git, and Firebase CLI: `npm i -g firebase-tools`, then `firebase login`.
2. Firebase Console → create a project (stay on the free **Spark** plan, no billing).
3. Build → Authentication → Sign-in method → enable **Email/Password**.
4. Build → Firestore Database → Create → **production mode** → region `asia-south1` (Mumbai).
5. Project settings → Your apps → add a **Web app** → keep the `firebaseConfig` values for `.env.local`.
6. Authentication → Users → add the **Owner** account (your team email). Copy its UID.
   Firestore → create document `owners/<ownerUid>` with a field `createdAt` (timestamp).
7. Authentication → add two **device users**: `gps-01@freshpath.device` and `store-01@freshpath.device` (any strong passwords; keep them only in firmware `secrets.h`).
   Firestore → create `devices/<gpsUserUid>` = `{ type: "gps", unitId: "GPS-01" }` and `devices/<storeUserUid>` = `{ type: "storage", unitId: "STORE-01" }`.
8. Project settings → Users and permissions → add teammates as **Editor** (never share one password).

## Step 2 – Open in Antigravity
1. Install Antigravity, sign in with a Google account, open this folder as the workspace.
2. Run `git init`, add a `.gitignore` (node_modules, .env*, secrets.h, dist), and make the first commit.
3. Set terminal commands and reviews to ask for your approval (check Antigravity's settings).
4. Run the workflow `/plan-milestone` with: "Milestone M0".

## Step 3 – Milestone loop (repeat M0 → M9, see docs/07)
Plan → approve → build → `/test-milestone` → you test by hand → commit.
One milestone per prompt. Never skip the plan step.

## Step 4 – Before the real batch
Run `/security-review`, deploy to Firebase Hosting yourself (`firebase deploy`), print real QR labels and test scanning.

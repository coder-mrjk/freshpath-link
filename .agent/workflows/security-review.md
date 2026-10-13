---
description: Review Firestore rules and privacy for leaks before deploy
---
1. Read `firestore.rules` and `docs/03_DATA_MODEL.md` (security section).
2. For each role (anonymous, consumer, farmer, driver, mandi, shop, device, owner, pending/suspended user) list what it can read and write per collection.
3. Try to find: privilege escalation (user setting own role/status/passId), reading private fields (phone, address), editing or deleting events, double selling a bag, device writing outside its unit.
4. Write rules tests for every finding. Show me the diff; do not deploy.

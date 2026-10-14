/**
 * FreshPath Link - CLI Demo Seed Script
 * Run with: npm run seed
 */

import { seedFreshPathDemoData } from '../src/lib/seed';

async function main() {
  console.log('\n======================================================');
  console.log(' 🌱 FreshPath Link - Seeding Master Demo Data');
  console.log('======================================================\n');

  console.log('⏳ Connecting to Firestore and seeding data across all 7 stages...');
  const result = await seedFreshPathDemoData();

  if (result.success) {
    console.log('\n✅ SEEDING COMPLETE!\n');
    console.log('------------------------------------------------------');
    console.log(' Demo Accounts & Pass IDs:');
    console.log(' - Farmer:   Murugan (FP-F-0001) - Vadakku Thottam, Panruti');
    console.log(' - Driver:   Selvam  (FP-D-0001) - Vehicle: TN 31 AB 1234 (GPS-01)');
    console.log(' - Mandi:    Kumar   (FP-M-0001) - Panruti Mandi (STORE-01, 13.5°C)');
    console.log(' - Retailer: Ramesh  (FP-S-0001) - Fresh Basket Supermarket, Adyar');
    console.log(' - Consumer: Priya   (FP-C-98A72B) - Besant Nagar, Chennai');
    console.log('------------------------------------------------------');
    console.log(' 7 Crate Stages Seeded:');
    console.log(' 1. FP-TOM-261013-STAGE2 -> CREATED (Harvested at farm)');
    console.log(' 2. FP-TOM-261013-STAGE3 -> LOADED (In truck)');
    console.log(' 3. FP-TOM-261013-STAGE4 -> IN_TRANSIT (GPS active)');
    console.log(' 4. FP-TOM-261013-STAGE5 -> IN_STORAGE (Mandi Cold Room 1)');
    console.log(' 5. FP-TOM-261013-STAGE6 -> DISPATCHED_TO_SHOP (En route)');
    console.log(' 6. FP-TOM-261013-STAGE7 -> AT_SHOP (Retail shelf ready)');
    console.log(' 7. FP-TOM-261013-STAGE8 -> SOLD (Purchased + 5-star review)');
    console.log('------------------------------------------------------\n');
    process.exit(0);
  } else {
    console.error('\n❌ SEEDING FAILED:', result.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal seeding error:', err);
  process.exit(1);
});

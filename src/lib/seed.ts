/**
 * FreshPath Link - Master Demo Data Seeder
 * Populates realistic demo records across all supply-chain stages:
 * - Product rate (₹60/kg) & freshness configuration
 * - Demo role profiles (Farmer, Driver, Mandi, Shop, Consumer) with valid Pass IDs
 * - GPS node (GPS-01) with satellite fix
 * - Mandi cold room (STORE-01) with 24-hour DHT22 telemetry readings
 * - Delivery vehicle (TN 31 AB 1234) and completed trip
 * - 7 Produce crates spanning all 7 status stages:
 *   1. CREATED
 *   2. LOADED
 *   3. IN_TRANSIT
 *   4. IN_STORAGE
 *   5. DISPATCHED_TO_SHOP
 *   6. AT_SHOP
 *   7. SOLD (with 5-star verified consumer review)
 * - Complete immutable tamper-evident events ledger
 */

import { doc, setDoc, writeBatch, collection } from 'firebase/firestore';
import { db } from './firebase';

export async function seedFreshPathDemoData(): Promise<{ success: boolean; message: string }> {
  try {
    const now = new Date();
    const isoNow = now.toISOString();

    // 1. Product Catalog & Freshness Config
    await setDoc(doc(db, 'products', 'tomato'), {
      name: 'Tomato',
      ratePerKg: 60,
      active: true,
      updatedAt: isoNow,
    });

    await setDoc(doc(db, 'config', 'freshness'), {
      perHourSinceHarvest: 0.5,
      perHourStoredAbove30C: 1.0,
      freshMin: 70,
      sellSoonMin: 40,
    });

    // 2. Pass ID Sequential Counters
    await setDoc(doc(db, 'counters', 'farmer'), { next: 2 });
    await setDoc(doc(db, 'counters', 'driver'), { next: 2 });
    await setDoc(doc(db, 'counters', 'mandi'), { next: 2 });
    await setDoc(doc(db, 'counters', 'shop'), { next: 2 });

    // 3. Demo Role Users
    const users = [
      {
        uid: 'demo-farmer-murugan',
        role: 'farmer',
        status: 'approved',
        passId: 'FP-F-0001',
        firstName: 'Murugan',
        fullName: 'Murugan Palanisamy',
        phone: '+91 98765 43210',
        addressText: 'Vadakku Thottam, Panruti',
        preferredLang: 'en',
        createdAt: isoNow,
      },
      {
        uid: 'demo-driver-selvam',
        role: 'driver',
        status: 'approved',
        passId: 'FP-D-0001',
        firstName: 'Selvam',
        fullName: 'Selvam Krishnan',
        phone: '+91 98765 43211',
        addressText: 'Panruti Town',
        preferredLang: 'en',
        createdAt: isoNow,
      },
      {
        uid: 'demo-mandi-kumar',
        role: 'mandi',
        status: 'approved',
        passId: 'FP-M-0001',
        firstName: 'Kumar',
        fullName: 'Kumar Shanmugam',
        phone: '+91 98765 43212',
        addressText: 'Panruti Agro Market',
        preferredLang: 'en',
        createdAt: isoNow,
      },
      {
        uid: 'demo-shop-ramesh',
        role: 'shop',
        status: 'approved',
        passId: 'FP-S-0001',
        firstName: 'Ramesh',
        fullName: 'Ramesh Velu',
        phone: '+91 98765 43213',
        addressText: 'Fresh Basket, Adyar, Chennai',
        preferredLang: 'en',
        createdAt: isoNow,
      },
      {
        uid: 'demo-consumer-priya',
        role: 'consumer',
        status: 'approved',
        passId: 'FP-C-98A72B',
        firstName: 'Priya',
        fullName: 'Priya Ramasamy',
        phone: '+91 98765 43214',
        addressText: 'Besant Nagar, Chennai',
        preferredLang: 'en',
        createdAt: isoNow,
      },
    ];

    for (const u of users) {
      await setDoc(doc(db, 'users', u.uid), u);
    }

    // 4. Farm Field
    await setDoc(doc(db, 'fields', 'field-panruti-01'), {
      farmerUid: 'demo-farmer-murugan',
      name: 'Vadakku Thottam',
      village: 'Panruti',
      district: 'Cuddalore',
      lat: 11.748,
      lng: 79.7714,
      createdAt: isoNow,
    });

    // 5. GPS Hardware Node & Vehicle
    await setDoc(doc(db, 'vehicles', 'TN31AB1234'), {
      driverUid: 'demo-driver-selvam',
      regNumber: 'TN 31 AB 1234',
      vehicleType: 'Tata Ace Pickup',
      capacityKg: 1500,
      gpsUnitId: 'GPS-01',
      status: 'ACTIVE',
      createdAt: isoNow,
    });

    await setDoc(doc(db, 'gpsUnits', 'GPS-01'), {
      vehicleId: 'TN31AB1234',
      latest: {
        lat: 11.748,
        lng: 79.7714,
        speedKmph: 34.0,
        sats: 8,
        hdop: 1.1,
        valid: true,
        fixAt: isoNow,
      },
      receivedAt: isoNow,
    });

    // 6. Mandi & Storage Unit with 24-Hour Telemetry
    await setDoc(doc(db, 'mandis', 'mandi-panruti'), {
      mandiPersonUid: 'demo-mandi-kumar',
      name: 'Panruti Central Agro Mandi',
      area: 'Cuddalore Main Road',
      lat: 11.765,
      lng: 79.789,
    });

    await setDoc(doc(db, 'storageUnits', 'STORE-01'), {
      mandiId: 'mandi-panruti',
      name: 'Cold Storage Room 1',
      nodeUnitId: 'STORE-01',
      currentTemp: 13.5,
      currentHumidity: 88.0,
      latest: {
        tempC: 13.5,
        humidityPct: 88.0,
        at: isoNow,
      },
      targetTempMin: 12.0,
      targetTempMax: 15.0,
      targetHumidityMin: 85.0,
      targetHumidityMax: 90.0,
      capacityCrates: 200,
    });

    // Generate 24 telemetry data points (one per hour)
    for (let i = 24; i >= 1; i--) {
      const readingTime = new Date(now.getTime() - i * 3600000).toISOString();
      // Safe realistic variations between 12.8°C and 14.6°C
      const tempC = Math.round((13.2 + Math.sin(i / 2) * 1.1) * 10) / 10;
      const humidityPct = Math.round((87.0 + Math.cos(i / 3) * 2.0) * 10) / 10;

      await setDoc(doc(collection(db, 'storageUnits', 'STORE-01', 'readings')), {
        tempC,
        humidityPct,
        at: readingTime,
        source: 'dht22',
      });
    }

    // 7. Retail Shop
    await setDoc(doc(db, 'shops', 'shop-chennai-01'), {
      shopPersonUid: 'demo-shop-ramesh',
      name: 'Fresh Basket Supermarket',
      area: 'Adyar, Chennai',
      lat: 13.0012,
      lng: 80.2565,
    });

    // 8. Completed Delivery Trip
    await setDoc(doc(db, 'trips', 'TRP-261013-DEMO'), {
      driverUid: 'demo-driver-selvam',
      vehicleId: 'TN31AB1234',
      gpsUnitId: 'GPS-01',
      originText: 'Vadakku Thottam, Panruti',
      destinationMandiId: 'mandi-panruti',
      destinationMandiName: 'Panruti Central Agro Mandi',
      status: 'ENDED',
      bagIds: [
        'FP-TOM-261013-STAGE4',
        'FP-TOM-261013-STAGE5',
        'FP-TOM-261013-STAGE6',
        'FP-TOM-261013-STAGE7',
        'FP-TOM-261013-STAGE8',
      ],
      start: {
        lat: 11.748,
        lng: 79.7714,
        sats: 8,
        hdop: 1.1,
        valid: true,
        fixAt: new Date(now.getTime() - 14400000).toISOString(),
      },
      end: {
        lat: 11.765,
        lng: 79.789,
        sats: 9,
        hdop: 0.9,
        valid: true,
        fixAt: new Date(now.getTime() - 10800000).toISOString(),
      },
      distanceKmStraight: 21.5,
      durationMin: 48,
      createdAt: new Date(now.getTime() - 15000000).toISOString(),
    });

    // 9. Seven Produce Crates spanning all 7 Lifecycle Stages
    const crates = [
      {
        id: 'FP-TOM-261013-STAGE2',
        weightKg: 5,
        pieces: 45,
        totalPrice: 300,
        status: 'CREATED' as const,
        stageDesc: 'Harvested crate at farm, awaiting driver pickup',
      },
      {
        id: 'FP-TOM-261013-STAGE3',
        weightKg: 10,
        pieces: 90,
        totalPrice: 600,
        status: 'LOADED' as const,
        tripId: 'TRP-261013-DEMO',
        stageDesc: 'Loaded into truck, trip preparing to start',
      },
      {
        id: 'FP-TOM-261013-STAGE4',
        weightKg: 15,
        pieces: 135,
        totalPrice: 900,
        status: 'IN_TRANSIT' as const,
        tripId: 'TRP-261013-DEMO',
        stageDesc: 'On the road with active GPS satellite tracking',
      },
      {
        id: 'FP-TOM-261013-STAGE5',
        weightKg: 20,
        pieces: 180,
        totalPrice: 1200,
        status: 'IN_STORAGE' as const,
        tripId: 'TRP-261013-DEMO',
        storageUnitId: 'STORE-01',
        mandiId: 'mandi-panruti',
        stageDesc: 'Stored in Mandi Cold Room 1 at 13.5°C',
      },
      {
        id: 'FP-TOM-261013-STAGE6',
        weightKg: 25,
        pieces: 225,
        totalPrice: 1500,
        status: 'DISPATCHED_TO_SHOP' as const,
        tripId: 'TRP-261013-DEMO',
        storageUnitId: 'STORE-01',
        mandiId: 'mandi-panruti',
        shopId: 'shop-chennai-01',
        stageDesc: 'Dispatched from mandi en route to retail supermarket',
      },
      {
        id: 'FP-TOM-261013-STAGE7',
        weightKg: 5,
        pieces: 46,
        totalPrice: 300,
        status: 'AT_SHOP' as const,
        tripId: 'TRP-261013-DEMO',
        storageUnitId: 'STORE-01',
        mandiId: 'mandi-panruti',
        shopId: 'shop-chennai-01',
        stageDesc: 'Displayed on retail shelf for consumer purchase',
      },
      {
        id: 'FP-TOM-261013-STAGE8',
        weightKg: 5,
        pieces: 44,
        totalPrice: 300,
        status: 'SOLD' as const,
        tripId: 'TRP-261013-DEMO',
        storageUnitId: 'STORE-01',
        mandiId: 'mandi-panruti',
        shopId: 'shop-chennai-01',
        soldTo: {
          consumerUid: 'demo-consumer-priya',
          consumerPassId: 'FP-C-98A72B',
          firstName: 'Priya',
        },
        rating: {
          stars: 5,
          comment: 'Incredible sweetness, aroma and crunch! Love seeing the farm and temperature history.',
          at: isoNow,
        },
        stageDesc: 'Purchased by verified consumer with 5-star review',
      },
    ];

    const harvestTimestamp = new Date(now.getTime() - 24 * 3600000);

    for (const c of crates) {
      const bagData = {
        product: 'tomato',
        farmerUid: 'demo-farmer-murugan',
        farmerPassId: 'FP-F-0001',
        farmerFirstName: 'Murugan',
        fieldId: 'field-panruti-01',
        fieldName: 'Vadakku Thottam',
        village: 'Panruti',
        weightKg: c.weightKg,
        pieces: c.pieces,
        sizeGrade: 'Grade A',
        benefitsNote: 'Naturally field-ripened, hand-picked country tomatoes.',
        harvestAt: harvestTimestamp.toISOString(),
        pricePerKg: 60,
        totalPrice: c.totalPrice,
        status: c.status,
        tripId: c.tripId || null,
        storageUnitId: c.storageUnitId || null,
        mandiId: c.mandiId || null,
        shopId: c.shopId || null,
        soldTo: c.soldTo || null,
        rating: c.rating || null,
        holderUid: 'demo-farmer-murugan',
        handlerUids: ['demo-farmer-murugan', 'demo-driver-selvam', 'demo-mandi-kumar', 'demo-shop-ramesh'],
        createdAt: harvestTimestamp.toISOString(),
        updatedAt: isoNow,
      };

      await setDoc(doc(db, 'bags', c.id), bagData);

      // Ledger Events for this Crate
      const batch = writeBatch(db);

      // 1. Creation
      batch.set(doc(collection(db, 'events')), {
        bagId: c.id,
        type: 'BAG_CREATED',
        byUid: 'demo-farmer-murugan',
        byRole: 'farmer',
        byPassId: 'FP-F-0001',
        at: harvestTimestamp.toISOString(),
        place: { text: 'Vadakku Thottam, Panruti' },
        note: `Harvested: ${c.weightKg} kg (${c.pieces} pcs), Grade A.`,
      });

      // 2. Loading
      if (['LOADED', 'IN_TRANSIT', 'IN_STORAGE', 'DISPATCHED_TO_SHOP', 'AT_SHOP', 'SOLD'].includes(c.status)) {
        batch.set(doc(collection(db, 'events')), {
          bagId: c.id,
          tripId: 'TRP-261013-DEMO',
          type: 'LOADED',
          byUid: 'demo-driver-selvam',
          byRole: 'driver',
          byPassId: 'FP-D-0001',
          at: new Date(harvestTimestamp.getTime() + 7200000).toISOString(),
          place: { text: 'Vadakku Thottam, Panruti' },
          note: 'Loaded into vehicle TN 31 AB 1234.',
        });
      }

      // 3. Trip Start
      if (['IN_TRANSIT', 'IN_STORAGE', 'DISPATCHED_TO_SHOP', 'AT_SHOP', 'SOLD'].includes(c.status)) {
        batch.set(doc(collection(db, 'events')), {
          bagId: c.id,
          tripId: 'TRP-261013-DEMO',
          type: 'TRIP_STARTED',
          byUid: 'demo-driver-selvam',
          byRole: 'driver',
          byPassId: 'FP-D-0001',
          at: new Date(harvestTimestamp.getTime() + 10800000).toISOString(),
          place: { lat: 11.748, lng: 79.7714, text: 'Panruti Farm' },
          note: 'Trip departed for Mandi storage.',
        });
      }

      // 4. Trip End & Storage
      if (['IN_STORAGE', 'DISPATCHED_TO_SHOP', 'AT_SHOP', 'SOLD'].includes(c.status)) {
        batch.set(doc(collection(db, 'events')), {
          bagId: c.id,
          tripId: 'TRP-261013-DEMO',
          type: 'TRIP_ENDED',
          byUid: 'demo-driver-selvam',
          byRole: 'driver',
          byPassId: 'FP-D-0001',
          at: new Date(harvestTimestamp.getTime() + 14400000).toISOString(),
          place: { lat: 11.765, lng: 79.789, text: 'Panruti Mandi' },
          note: 'Arrived at Mandi. Straight-line distance: 21.5 km.',
        });

        batch.set(doc(collection(db, 'events')), {
          bagId: c.id,
          type: 'RECEIVED_STORAGE',
          byUid: 'demo-mandi-kumar',
          byRole: 'mandi',
          byPassId: 'FP-M-0001',
          at: new Date(harvestTimestamp.getTime() + 15000000).toISOString(),
          place: { text: 'Panruti Mandi - Cold Storage Room 1' },
          note: 'Preserved at 13.5°C in temperature-controlled cold room.',
        });
      }

      // 5. Dispatched to Shop
      if (['DISPATCHED_TO_SHOP', 'AT_SHOP', 'SOLD'].includes(c.status)) {
        batch.set(doc(collection(db, 'events')), {
          bagId: c.id,
          type: 'DISPATCHED_TO_SHOP',
          byUid: 'demo-mandi-kumar',
          byRole: 'mandi',
          byPassId: 'FP-M-0001',
          at: new Date(harvestTimestamp.getTime() + 18000000).toISOString(),
          place: { text: 'Panruti Mandi → Fresh Basket Supermarket' },
          note: 'Dispatched to retail partner in Chennai.',
        });
      }

      // 6. Received at Shop
      if (['AT_SHOP', 'SOLD'].includes(c.status)) {
        batch.set(doc(collection(db, 'events')), {
          bagId: c.id,
          type: 'RECEIVED_SHOP',
          byUid: 'demo-shop-ramesh',
          byRole: 'shop',
          byPassId: 'FP-S-0001',
          at: new Date(harvestTimestamp.getTime() + 21600000).toISOString(),
          place: { text: 'Fresh Basket Supermarket (Adyar, Chennai)' },
          note: 'Placed on retail produce shelf ready for consumers.',
        });
      }

      // 7. Purchased and Rated
      if (c.status === 'SOLD') {
        batch.set(doc(collection(db, 'purchases', 'purchase-demo-01')), {
          bagId: c.id,
          consumerUid: 'demo-consumer-priya',
          consumerPassId: 'FP-C-98A72B',
          price: 300,
          at: isoNow,
          paymentStatus: 'NOT_ENABLED',
        });

        batch.set(doc(collection(db, 'events')), {
          bagId: c.id,
          type: 'PURCHASED',
          byUid: 'demo-consumer-priya',
          byRole: 'consumer',
          byPassId: 'FP-C-98A72B',
          at: isoNow,
          place: { text: 'Fresh Basket Supermarket' },
          note: 'Purchased by verified consumer Priya (FP-C-98A72B).',
        });

        batch.set(doc(collection(db, 'events')), {
          bagId: c.id,
          type: 'RATED',
          byUid: 'demo-consumer-priya',
          byRole: 'consumer',
          byPassId: 'FP-C-98A72B',
          at: isoNow,
          note: 'Rated 5 stars: "Incredible sweetness, aroma and crunch! Love seeing the farm and temperature history."',
        });
      }

      await batch.commit();
    }

    return {
      success: true,
      message: 'Demo dataset successfully seeded with 7 lifecycle stages!',
    };
  } catch (err: unknown) {
    console.error('Error seeding demo data:', err);
    return {
      success: false,
      message: (err as Error)?.message || 'Failed to seed demo data.',
    };
  }
}

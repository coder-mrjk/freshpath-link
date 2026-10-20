import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, OWNER_EMAIL } from '../../context/AuthContext';
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserSettingsModal } from '../../components/UserSettingsModal';
import {
  Play,
  RotateCcw,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Radio,
  Thermometer,
  Truck,
  Sprout,
  Warehouse,
  Store,
  ShoppingBasket,
  ShieldCheck,
  ExternalLink,
  Users,
  Cpu,
  RefreshCw,
  Settings,
  LogOut,
} from 'lucide-react';

export const DemoPortal: React.FC = () => {
  const { isOwner, currentUser, logout } = useAuth();

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showConfirmDevicePurge, setShowConfirmDevicePurge] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [gpsStep, setGpsStep] = useState(0);

  // List of simulated crates generated
  const [generatedCrates, setGeneratedCrates] = useState<
    Array<{ id: string; stage: string; status: string; link: string }>
  >([]);

  // Safety: Demo Portal is exclusively for Root Owner
  if (!isOwner) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="backdrop-blur-xl bg-white/[0.03] border border-red-500/30 rounded-3xl p-8 shadow-2xl">
          <ShieldCheck className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-black text-white">Owner Access Restricted</h2>
          <p className="text-xs text-slate-400 mt-2 mb-6">
            The Demo Simulation Suite is reserved exclusively for the system owner (
            <span className="text-red-300 font-mono">{OWNER_EMAIL}</span>).
          </p>
          <Link
            to="/auth/control"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            Sign in as System Owner
          </Link>
        </div>
      </div>
    );
  }

  // 1. Reset Database (Clear all supply chain data, mandis, vehicles & demo users; strictly preserving hardware devices & owners)
  const handleClearDatabase = async () => {
    setShowConfirmReset(false);
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      let deletedCount = 0;

      // 1. Discover registered hardware device UIDs and owner UIDs to protect in users
      const devicesSnap = await getDocs(collection(db, 'devices'));
      const protectedDeviceUids = new Set<string>([
        '10Ea8IJb0IcE1vWwuDsH9Wwul4P2', // GPS-01
        'k8ePyHigtQRcmQe6tSuoY2qIMdd2', // STORE-01
      ]);
      devicesSnap.forEach((dDoc) => protectedDeviceUids.add(dDoc.id));

      const ownersSnap = await getDocs(collection(db, 'owners'));
      const protectedOwnerUids = new Set<string>(['oMl0ziVO7aWj9MH26ocPGH41fG12']);
      ownersSnap.forEach((oDoc) => protectedOwnerUids.add(oDoc.id));

      // 2. Clear telemetry readings subcollections under all mandis and storageUnits
      const mandisSnap = await getDocs(collection(db, 'mandis'));
      for (const mDoc of mandisSnap.docs) {
        const readingsSnap = await getDocs(collection(db, 'mandis', mDoc.id, 'readings'));
        for (const rDoc of readingsSnap.docs) {
          await deleteDoc(rDoc.ref);
          deletedCount++;
        }
      }

      const storageSnap = await getDocs(collection(db, 'storageUnits'));
      for (const sDoc of storageSnap.docs) {
        const readingsSnap = await getDocs(collection(db, 'storageUnits', sDoc.id, 'readings'));
        for (const rDoc of readingsSnap.docs) {
          await deleteDoc(rDoc.ref);
          deletedCount++;
        }
      }

      // 3. Delete documents from all supply chain collections (including mandis, vehicles, and gpsUnits)
      const collectionsToClear = [
        'bags',
        'trips',
        'events',
        'fields',
        'vehicles',
        'mandis',
        'storageUnits',
        'shops',
        'purchases',
        'counters',
        'gpsUnits',
      ];

      for (const colName of collectionsToClear) {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
          deletedCount++;
        }
      }

      // 4. Selectively clear Users (PRESERVE owners, admins, and hardware device credentials)
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const uDoc of usersSnap.docs) {
        const uData = uDoc.data();
        const email = (uData.email || '').toLowerCase();
        const uid = uDoc.id;

        const isOwnerDoc =
          email === OWNER_EMAIL.toLowerCase() ||
          uid === 'oMl0ziVO7aWj9MH26ocPGH41fG12' ||
          protectedOwnerUids.has(uid) ||
          uData.role === 'owner' ||
          uData.role === 'admin';

        const isDeviceDoc =
          email.endsWith('@freshpath.device') ||
          email.includes('.device') ||
          protectedDeviceUids.has(uid) ||
          uData.role === 'device';

        if (isOwnerDoc) {
          // Preserve and ensure clean owner status
          await setDoc(
            uDoc.ref,
            {
              role: 'owner',
              status: 'approved',
              passId: uData.passId || 'FP-OWNER-0001',
              fullName: uData.fullName || 'System Owner',
              firstName: uData.firstName || 'Owner',
              phone: uData.phone || '9790416096',
              email: uData.email || OWNER_EMAIL,
              addressText: uData.addressText || 'FreshPath Central Operations',
              preferredLang: uData.preferredLang || 'en',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else if (isDeviceDoc) {
          // Strictly preserve hardware device user document
          // Do not delete
        } else {
          // Delete only demo/test users
          await deleteDoc(uDoc.ref);
          deletedCount++;
        }
      }

      setGeneratedCrates([]);
      setSuccessMsg(
        `Database purged successfully! ${deletedCount} documents deleted. All Mandis, Vehicles, Crates, and test users were deleted. Hardware device registrations (devices collection) and Owner accounts were strictly preserved.`
      );
    } catch (err: unknown) {
      console.error('Error clearing database:', err);
      setErrorMsg((err as Error)?.message || 'Failed to clear database.');
    } finally {
      setLoading(false);
    }
  };

  // 1b. Global Purge: Remove all registered device push tokens across all accounts and logout
  const handlePurgeAllDevicesAndLogout = async () => {
    setShowConfirmDevicePurge(false);
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      // 1. Fetch all users from Firestore
      const usersSnap = await getDocs(collection(db, 'users'));
      const batch = writeBatch(db);
      let updatedUsersCount = 0;

      usersSnap.forEach((uDoc) => {
        batch.update(doc(db, 'users', uDoc.id), {
          fcmTokens: [],
          devices: [],
          notificationsEnabled: false,
          updatedAt: serverTimestamp(),
        });
        updatedUsersCount++;
      });

      if (updatedUsersCount > 0) {
        await batch.commit();
      }

      // 2. Clear local device token in storage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('freshpath_fcm_token');
      }

      // 3. Unregister all service workers on this client
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        } catch (swErr) {
          console.warn('Error unregistering service workers:', swErr);
        }
      }

      setSuccessMsg(
        `Successfully purged all registered push devices across ${updatedUsersCount} user accounts and cleared device tokens. Logging out session...`
      );

      // 4. Logout the session
      setTimeout(async () => {
        try {
          await logout();
        } catch {
          // ignore
        }
      }, 1500);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Failed to purge devices and logout.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Full 7-Stage Supply Chain Simulation
  const handleSeedFullSupplyChain = async () => {
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const ownerUid = currentUser?.uid || 'oMl0ziVO7aWj9MH26ocPGH41fG12';
      const batch = writeBatch(db);

      // A. Create Farmer Field
      const fieldId = 'field-panruti-01';
      batch.set(
        doc(db, 'fields', fieldId),
        {
          farmerUid: ownerUid,
          name: 'Vadakku Thottam (Field 1 - 2.5 Acres)',
          village: 'Panruti',
          district: 'Cuddalore',
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // B. Create Driver Vehicles (Multi-vehicle support)
      const vehicle1Id = 'veh-tn31-01';
      batch.set(
        doc(db, 'vehicles', vehicle1Id),
        {
          driverUid: ownerUid,
          regNumber: 'TN 31 AB 1234',
          vehicleType: 'Tata Ace (Refrigerated)',
          capacityKg: 1000,
          gpsUnitId: 'GPS-01',
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      const vehicle2Id = 'veh-tn31-02';
      batch.set(
        doc(db, 'vehicles', vehicle2Id),
        {
          driverUid: ownerUid,
          regNumber: 'TN 31 CD 5678',
          vehicleType: 'Mahindra Bolero Maxi Truck',
          capacityKg: 1500,
          gpsUnitId: 'GPS-02',
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // C. Create Mandi & Cold Storage
      const mandiId = 'mandi-panruti-01';
      batch.set(
        doc(db, 'mandis', mandiId),
        {
          mandiPersonUid: ownerUid,
          name: 'Panruti Agro Mandi',
          area: 'Cuddalore Main Road',
          nodeUnitId: 'STORE-01',
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      const storageUnitId = 'STORE-01';
      batch.set(
        doc(db, 'storageUnits', storageUnitId),
        {
          id: storageUnitId,
          mandiId,
          name: 'Cold Storage Room 1',
          nodeUnitId: 'STORE-01',
          currentTemp: 13.5,
          currentHumidity: 88.0,
          latest: {
            tempC: 13.5,
            humidityPct: 88.0,
            at: new Date().toISOString(),
          },
          targetTempMin: 12.0,
          targetTempMax: 15.0,
          targetHumidityMin: 85.0,
          targetHumidityMax: 90.0,
          capacityCrates: 250,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // D. Create Retail Shop
      const shopId = 'shop-adyar-01';
      batch.set(
        doc(db, 'shops', shopId),
        {
          id: shopId,
          shopPersonUid: ownerUid,
          name: 'Fresh Basket Supermarket',
          area: 'Adyar, Chennai',
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // E. Create Active Trip
      const tripId = 'TRIP-SIM-001';
      batch.set(
        doc(db, 'trips', tripId),
        {
          id: tripId,
          driverUid: ownerUid,
          driverPassId: 'FP-D-0001',
          driverName: 'Selvam Krishnan',
          vehicleId: vehicle1Id,
          vehicleReg: 'TN 31 AB 1234',
          gpsUnitId: 'GPS-01',
          origin: 'Vadakku Thottam, Panruti',
          destinationMandiId: mandiId,
          destinationMandiName: 'Panruti Agro Mandi',
          status: 'IN_TRANSIT',
          bagIds: ['FP-TOM-261015-STAGE4'],
          startedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // F. Create 7 Crate Batches (All Stages)
      const stagesConfig = [
        {
          id: 'FP-TOM-261015-STAGE2',
          stage: 'Stage 2: Harvested at Farm',
          status: 'CREATED',
          desc: 'Freshly harvested country tomatoes at farm, ready for truck pickup.',
          weightKg: 25,
          pieces: 180,
          pricePerKg: 60,
          totalPrice: 1500,
        },
        {
          id: 'FP-TOM-261015-STAGE3',
          stage: 'Stage 3: Loaded in Transport Truck',
          status: 'LOADED',
          desc: 'Scanned into refrigerated Tata Ace (TN 31 AB 1234).',
          weightKg: 25,
          pieces: 185,
          pricePerKg: 60,
          totalPrice: 1500,
        },
        {
          id: 'FP-TOM-261015-STAGE4',
          stage: 'Stage 4: In-Transit (GPS Live)',
          status: 'IN_TRANSIT',
          desc: 'En route along Chennai-Trichy highway with live GPS telemetry.',
          tripId,
          weightKg: 25,
          pieces: 175,
          pricePerKg: 60,
          totalPrice: 1500,
        },
        {
          id: 'FP-TOM-261015-STAGE5',
          stage: 'Stage 5: In Mandi Cold Storage',
          status: 'IN_STORAGE',
          desc: 'Checked into Cold Storage Room 1 (STORE-01) at optimal 13.5°C.',
          mandiId,
          storageUnitId,
          weightKg: 25,
          pieces: 170,
          pricePerKg: 60,
          totalPrice: 1500,
        },
        {
          id: 'FP-TOM-261015-STAGE6',
          stage: 'Stage 6: Dispatched to Retail Store',
          status: 'DISPATCHED_TO_SHOP',
          desc: 'Dispatched on final mile delivery to Fresh Basket Supermarket.',
          mandiId,
          shopId,
          weightKg: 25,
          pieces: 170,
          pricePerKg: 60,
          totalPrice: 1500,
        },
        {
          id: 'FP-TOM-261015-STAGE7',
          stage: 'Stage 7: On Retail Shelf',
          status: 'AT_SHOP',
          desc: 'Delivered and active on retail store shelf in Adyar, ready for purchase.',
          shopId,
          weightKg: 25,
          pieces: 170,
          pricePerKg: 60,
          totalPrice: 1500,
        },
        {
          id: 'FP-TOM-261015-STAGE8',
          stage: 'Stage 8: Sold to Consumer with Review',
          status: 'SOLD',
          desc: 'Purchased by verified consumer Priya with 5-star rating.',
          shopId,
          weightKg: 5,
          pieces: 35,
          pricePerKg: 60,
          totalPrice: 300,
        },
      ];

      const simulatedCratesList = [];

      for (const sc of stagesConfig) {
        const bagRef = doc(db, 'bags', sc.id);
        const bagData: any = {
          product: 'tomato',
          farmerUid: ownerUid,
          farmerPassId: 'FP-F-0001',
          farmerFirstName: 'Murugan',
          fieldId,
          fieldName: 'Vadakku Thottam (Field 1 - 2.5 Acres)',
          village: 'Panruti',
          weightKg: sc.weightKg,
          pieces: sc.pieces,
          sizeGrade: 'Grade A',
          benefitsNote: 'Naturally farm-ripened red country tomatoes. Zero synthetic ripening agents.',
          harvestAt: serverTimestamp(),
          pricePerKg: sc.pricePerKg,
          totalPrice: sc.totalPrice,
          status: sc.status,
          holderUid: ownerUid,
          handlerUids: [ownerUid],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if ((sc as any).tripId) bagData.tripId = (sc as any).tripId;
        if ((sc as any).mandiId) bagData.mandiId = (sc as any).mandiId;
        if ((sc as any).storageUnitId) bagData.storageUnitId = (sc as any).storageUnitId;
        if ((sc as any).shopId) bagData.shopId = (sc as any).shopId;

        batch.set(bagRef, bagData, { merge: true });

        // Create immutable event audit log
        const eventRef = doc(collection(db, 'events'));
        batch.set(eventRef, {
          bagId: sc.id,
          type: sc.status === 'CREATED' ? 'HARVEST' : sc.status,
          byUid: ownerUid,
          byRole: sc.status === 'CREATED' ? 'farmer' : sc.status === 'IN_STORAGE' ? 'mandi' : 'driver',
          byPassId: 'FP-OWNER-0001',
          at: serverTimestamp(),
          place: {
            text: 'Panruti supply chain node',
          },
          note: sc.desc,
        });

        simulatedCratesList.push({
          id: sc.id,
          stage: sc.stage,
          status: sc.status,
          link: `/b/${sc.id}`,
        });
      }

      // Also create purchase record for Stage 8
      const purchaseRef = doc(db, 'purchases', 'PUR-SIM-001');
      batch.set(
        purchaseRef,
        {
          id: 'PUR-SIM-001',
          bagId: 'FP-TOM-261015-STAGE8',
          consumerUid: ownerUid,
          consumerName: 'Priya Ramasamy',
          consumerPassId: 'FP-C-98A72B',
          price: 300,
          weightKg: 5,
          at: serverTimestamp(),
          rating: {
            stars: 5,
            comment: 'Super fresh, sweet and crisp farm-fresh tomatoes! Checked QR label provenance.',
          },
        },
        { merge: true }
      );

      // Commit all
      await batch.commit();

      // Seed initial DHT22 reading into mandis readings subcollection
      const readingRef = doc(collection(db, 'mandis', mandiId, 'readings'));
      await setDoc(readingRef, {
        tempC: 13.5,
        humidityPct: 88.0,
        at: new Date().toISOString(),
        source: 'simulated_dht22',
      });

      setGeneratedCrates(simulatedCratesList);
      setSuccessMsg(
        'Full 7-Stage Supply Chain successfully created! 1 Farm, 2 Vehicles, 1 Mandi, 1 Cold Storage, 1 Retail Shop, and 7 Crates covering every supply chain stage are now active.'
      );
    } catch (err: unknown) {
      console.error('Error seeding simulation:', err);
      setErrorMsg((err as Error)?.message || 'Failed to seed simulation.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Advance Driver GPS Waypoint
  const handleAdvanceGPS = async () => {
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const waypoints = [
      { lat: 11.7749, lng: 79.5537, place: 'Vadakku Thottam, Panruti (Origin)', speed: 0 },
      { lat: 11.9543, lng: 79.6245, place: 'Villupuram Highway Junction', speed: 45 },
      { lat: 12.2343, lng: 79.6521, place: 'Tindivanam Toll Plaza (NH 45)', speed: 60 },
      { lat: 12.6923, lng: 79.9768, place: 'Chengalpattu Flyover', speed: 55 },
      { lat: 12.9249, lng: 80.1000, place: 'Tambaram Outer Ring Road', speed: 40 },
      { lat: 13.0012, lng: 80.2565, place: 'Panruti Mandi & Cold Storage Bay', speed: 10 },
    ];

    const nextIndex = (gpsStep + 1) % waypoints.length;
    const currentWP = waypoints[nextIndex];

    try {
      const gpsData = {
        lat: currentWP.lat,
        lng: currentWP.lng,
        speed: currentWP.speed,
        altitude: 42.5,
        satellites: 9,
        hdop: 1.1,
        timestamp: new Date().toISOString(),
        fixType: '3D_FIX',
        status: 'VALID',
        nodeId: 'GPS-01',
      };

      await setDoc(doc(db, 'gpsUnits', 'GPS-01'), gpsData, { merge: true });

      // Update active trip
      await setDoc(
        doc(db, 'trips', 'TRIP-SIM-001'),
        {
          currentLocation: {
            lat: currentWP.lat,
            lng: currentWP.lng,
            text: currentWP.place,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setGpsStep(nextIndex);
      setSuccessMsg(
        `GPS Waypoint updated! Vehicle is at ${currentWP.place} (${currentWP.lat.toFixed(4)}°N, ${currentWP.lng.toFixed(4)}°E) traveling at ${currentWP.speed} km/h.`
      );
    } catch (err: unknown) {
      console.error('Error updating GPS:', err);
      setErrorMsg((err as Error)?.message || 'Failed to update GPS.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Inject Cold Storage Climate Telemetry
  const handleInjectClimate = async (tempC: number, humidityPct: number, label: string) => {
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const storageUnitId = 'STORE-01';
      const timestampIso = new Date().toISOString();

      // Subcollection reading
      const rRef = doc(collection(db, 'storageUnits', storageUnitId, 'readings'));
      await setDoc(rRef, {
        tempC,
        humidityPct,
        at: timestampIso,
        source: 'simulated_dht22',
        label,
      });

      // Storage unit document
      await setDoc(
        doc(db, 'storageUnits', storageUnitId),
        {
          currentTemp: tempC,
          currentHumidity: humidityPct,
          latest: {
            tempC,
            humidityPct,
            at: timestampIso,
          },
        },
        { merge: true }
      );

      setSuccessMsg(
        `Recorded ${label} telemetry: ${tempC}°C, ${humidityPct}% RH for Cold Storage Room 1 (STORE-01).`
      );
    } catch (err: unknown) {
      console.error('Error recording climate reading:', err);
      setErrorMsg((err as Error)?.message || 'Failed to record climate reading.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Seed 5 Demo Supply Chain User Profiles
  const handleSeedUsers = async () => {
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const demoUsers = [
        {
          uid: 'demo-farmer-murugan',
          email: 'farmer.murugan@freshpath.test',
          firstName: 'Murugan',
          fullName: 'Murugan Palanisamy',
          phone: '9876543210',
          role: 'farmer',
          status: 'approved',
          passId: 'FP-F-0001',
          addressText: 'Vadakku Thottam, Panruti',
          preferredLang: 'ta',
        },
        {
          uid: 'demo-driver-selvam',
          email: 'driver.selvam@freshpath.test',
          firstName: 'Selvam',
          fullName: 'Selvam Krishnan',
          phone: '9876543211',
          role: 'driver',
          status: 'approved',
          passId: 'FP-D-0001',
          addressText: 'Panruti Town',
          preferredLang: 'ta',
        },
        {
          uid: 'demo-mandi-kumar',
          email: 'mandi.kumar@freshpath.test',
          firstName: 'Kumar',
          fullName: 'Kumar Shanmugam',
          phone: '9876543212',
          role: 'mandi',
          status: 'approved',
          passId: 'FP-M-0001',
          addressText: 'Panruti Agro Market',
          preferredLang: 'en',
        },
        {
          uid: 'demo-shop-ramesh',
          email: 'shop.ramesh@freshpath.test',
          firstName: 'Ramesh',
          fullName: 'Ramesh Velu',
          phone: '9876543213',
          role: 'shop',
          status: 'approved',
          passId: 'FP-S-0001',
          addressText: 'Fresh Basket Supermarket, Adyar, Chennai',
          preferredLang: 'en',
        },
        {
          uid: 'demo-consumer-priya',
          email: 'consumer.priya@freshpath.test',
          firstName: 'Priya',
          fullName: 'Priya Ramasamy',
          phone: '9876543214',
          role: 'consumer',
          status: 'approved',
          passId: 'FP-C-98A72B',
          addressText: 'Besant Nagar, Chennai',
          preferredLang: 'en',
        },
      ];

      const batch = writeBatch(db);
      for (const du of demoUsers) {
        batch.set(
          doc(db, 'users', du.uid),
          {
            ...du,
            createdAt: serverTimestamp(),
            approvedAt: serverTimestamp(),
            approvedBy: 'FP-OWNER-0001',
          },
          { merge: true }
        );
      }

      await batch.commit();
      setSuccessMsg(
        'Successfully seeded 5 approved supply chain user accounts with 10-digit phone numbers and valid Pass IDs!'
      );
    } catch (err: unknown) {
      console.error('Error seeding users:', err);
      setErrorMsg((err as Error)?.message || 'Failed to seed users.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] p-6 rounded-3xl border border-white/[0.08] shadow-2xl mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-red-500/15 border border-red-500/30 text-red-300">
              Secret Owner Suite
            </span>
            <span className="text-xs text-slate-400 font-mono">/demo</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-red-400" />
            Supply Chain Testing & Simulation Suite
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Simulate end-to-end provenance flows, inject live hardware telemetry, test multi-vehicle logistics, and manage system database state.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-3.5 py-2 backdrop-blur-md bg-white/[0.05] hover:bg-white/[0.1] text-white border border-white/10 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Settings className="w-4 h-4 text-slate-300" />
            <span>Profile Settings</span>
          </button>
          <Link
            to="/control"
            className="px-3.5 py-2 bg-red-600/30 hover:bg-red-600/40 text-red-200 border border-red-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Control Portal</span>
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="mb-6 p-4 backdrop-blur-xl bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-[11px] underline ml-4 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 backdrop-blur-xl bg-red-500/10 border border-red-500/30 rounded-2xl text-red-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-[11px] underline ml-4 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Danger Zone: Clear Database */}
      <div className="relative backdrop-blur-xl bg-red-950/20 border border-red-500/30 rounded-3xl p-6 shadow-2xl mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-red-400">
              <Trash2 className="w-5 h-5" />
              <h3 className="font-extrabold text-base text-white">Database Reset (Preserves Owner &amp; Hardware Devices)</h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Wipes all test crates, trips, events, farmer fields, purchases, retail shops, and non-owner test users from Firestore. Your owner account (<span className="text-white font-mono">{OWNER_EMAIL}</span>) and registered hardware devices (<span className="text-amber-300 font-mono">GPS-01</span>, <span className="text-amber-300 font-mono">STORE-01</span>) are strictly preserved across Firestore and Firebase Authentication.
            </p>
          </div>

          <button
            onClick={() => setShowConfirmReset(true)}
            disabled={loading}
            className="py-2.5 px-4 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-2 whitespace-nowrap touch-target"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Clear Database</span>
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-red-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-slate-200">Terminal CLI Commands (Safe Purge): </span>
            <span className="text-slate-400">
              Run in your terminal to safely reset database or purge test auth accounts while preserving devices and owners:
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="px-3 py-1.5 bg-black/40 border border-red-500/30 text-red-300 rounded-lg font-mono text-[11px] select-all whitespace-nowrap" title="Database purge command">
              npm run clear-db
            </code>
            <code className="px-3 py-1.5 bg-black/40 border border-amber-500/30 text-amber-300 rounded-lg font-mono text-[11px] select-all whitespace-nowrap" title="Firebase auth purge command">
              npm run purge-auth
            </code>
          </div>
        </div>

        {/* Confirmation Modal */}
        {showConfirmReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="relative backdrop-blur-2xl bg-slate-900 border border-red-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl">
              <AlertTriangle className="w-10 h-10 text-red-400 mb-3 mx-auto" />
              <h4 className="text-base font-extrabold text-white text-center">
                Confirm Safe Database Purge
              </h4>
              <p className="text-xs text-slate-300 mt-2 text-center leading-relaxed">
                This will delete all test crates, journeys, vehicles, mandis, and simulated users. Your root owner account (<span className="text-red-300 font-mono">{OWNER_EMAIL}</span>) and registered hardware devices (<span className="text-amber-300 font-mono">devices</span> collection) will <strong className="text-white">NOT</strong> be deleted.
              </p>
              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={() => setShowConfirmReset(false)}
                  className="flex-1 py-2.5 px-4 bg-white/10 hover:bg-white/15 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearDatabase}
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-1.5"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>Yes, Purge Database</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone 2: Logout All Accounts & Purge Device Tokens */}
      <div className="relative backdrop-blur-xl bg-amber-950/20 border border-amber-500/30 rounded-3xl p-6 shadow-2xl mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 text-amber-400">
              <LogOut className="w-5 h-5" />
              <h3 className="font-extrabold text-base text-white">Logout All Accounts &amp; Purge All Device Push Tokens</h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Unlinks and clears all registered FCM device tokens (<code className="text-amber-300 font-mono text-[11px]">fcmTokens: []</code> and <code className="text-amber-300 font-mono text-[11px]">devices: []</code>) across every user account in Firestore, unregisters active Service Workers, and logs out the current session. Use this to reset cluttered notification device lists.
            </p>
          </div>

          <button
            onClick={() => setShowConfirmDevicePurge(true)}
            disabled={loading}
            className="py-2.5 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-lg transition-all flex items-center gap-2 whitespace-nowrap touch-target"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout &amp; Purge Devices</span>
          </button>
        </div>

        {/* Confirmation Modal */}
        {showConfirmDevicePurge && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="relative backdrop-blur-2xl bg-slate-900 border border-amber-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl">
              <AlertTriangle className="w-10 h-10 text-amber-400 mb-3 mx-auto" />
              <h4 className="text-base font-extrabold text-white text-center">
                Confirm Purge of All Device Push Tokens
              </h4>
              <p className="text-xs text-slate-300 mt-2 text-center leading-relaxed">
                This will unregister and delete all device push tokens from all accounts in Firestore, reset browser push registrations, and log out your session. You can re-enable notifications on any device afterwards.
              </p>
              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={() => setShowConfirmDevicePurge(false)}
                  className="flex-1 py-2.5 px-4 bg-white/10 hover:bg-white/15 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurgeAllDevicesAndLogout}
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-lg flex items-center justify-center gap-1.5"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                  <span>Yes, Purge &amp; Logout</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Simulation Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Card 1: 1-Click Supply Chain Simulation */}
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-emerald-400">
              <Play className="w-5 h-5" />
              <h3 className="font-extrabold text-base text-white">Full Supply Chain 7-Stage Generator</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Instantly provisions 1 farm, 2 transport vehicles, 1 mandi with cold room, 1 supermarket, and 7 distinct produce crates at every single supply chain milestone (from harvest to customer purchase).
            </p>
          </div>

          <button
            onClick={handleSeedFullSupplyChain}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-[0_4px_16px_rgba(74,222,128,0.25)] flex items-center justify-center gap-2 touch-target"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Generate 7-Stage Supply Chain Data</span>
          </button>
        </div>

        {/* Card 2: 5 Demo Supply Chain User Accounts */}
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-sky-400">
              <Users className="w-5 h-5" />
              <h3 className="font-extrabold text-base text-white">Seed 5 Supply Chain User Profiles</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Creates verified user profiles with 10-digit phone numbers and unique Pass IDs for Farmer (Murugan), Driver (Selvam), Mandi (Kumar), Retailer (Ramesh), and Consumer (Priya).
            </p>
          </div>

          <button
            onClick={handleSeedUsers}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-500 hover:to-sky-600 text-white rounded-xl text-xs font-bold transition-all shadow-[0_4px_16px_rgba(2,132,199,0.25)] flex items-center justify-center gap-2 touch-target"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            <span>Seed 5 Demo User Profiles</span>
          </button>
        </div>

        {/* Card 3: Driver GPS Waypoint Simulator */}
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-amber-400">
              <Radio className="w-5 h-5" />
              <h3 className="font-extrabold text-base text-white">Driver Live GPS Waypoint Injector</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Injects sequential satellite fixes along the Panruti to Chennai transit corridor (Villupuram, Tindivanam, Chengalpattu, Tambaram) to test real-time map tracking on the Driver Move Portal.
            </p>
          </div>

          <button
            onClick={handleAdvanceGPS}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-[0_4px_16px_rgba(217,119,6,0.25)] flex items-center justify-center gap-2 touch-target"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            <span>Step GPS Waypoint Forward (Step #{gpsStep + 1})</span>
          </button>
        </div>

        {/* Card 4: Cold Storage Climate & Excursions */}
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-purple-400">
              <Thermometer className="w-5 h-5" />
              <h3 className="font-extrabold text-base text-white">DHT22 Cold Storage Climate Injector</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3 leading-relaxed">
              Test cold-chain anomaly detection and freshness decay acceleration by injecting readings into Cold Storage Room 1 (STORE-01).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleInjectClimate(13.5, 88.0, 'Safe Normal')}
              disabled={loading}
              className="py-2 px-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-emerald-300 rounded-xl text-[11px] font-bold transition-colors"
            >
              Safe (13.5°C / 88%)
            </button>
            <button
              onClick={() => handleInjectClimate(19.2, 72.0, 'Warm Warning')}
              disabled={loading}
              className="py-2 px-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 rounded-xl text-[11px] font-bold transition-colors"
            >
              Warning (19.2°C)
            </button>
            <button
              onClick={() => handleInjectClimate(32.5, 42.0, 'Critical Heat Spike')}
              disabled={loading}
              className="py-2 px-2.5 bg-red-500/15 hover:bg-red-500/25 border border-red-400/30 text-red-300 rounded-xl text-[11px] font-bold transition-colors"
            >
              Heat Spike (32.5°C)
            </button>
            <button
              onClick={() => handleInjectClimate(13.0, 87.0, 'Recovered Cooling')}
              disabled={loading}
              className="py-2 px-2.5 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-300 rounded-xl text-[11px] font-bold transition-colors"
            >
              Recover (13.0°C)
            </button>
          </div>
        </div>
      </div>

      {/* Generated Crates Table (if seeded) */}
      {generatedCrates.length > 0 && (
        <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 shadow-2xl mb-8">
          <h3 className="font-extrabold text-base text-white mb-1">
            Simulated 7-Stage Crate Batches
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Click on any crate ID to inspect its public digital certificate and verifiable ledger events.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.04] border-b border-white/10 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Crate ID</th>
                  <th className="px-4 py-3">Supply Chain Stage</th>
                  <th className="px-4 py-3">Ledger Status</th>
                  <th className="px-4 py-3 text-right">Verification Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {generatedCrates.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-red-400">{c.id}</td>
                    <td className="px-4 py-3 text-slate-200 font-medium">{c.stage}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-white/10 text-slate-300 border border-white/10">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={c.link}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400 hover:text-red-300 underline"
                      >
                        <span>View Provenance</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Direct Portal Links */}
      <div className="backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 shadow-2xl">
        <h3 className="font-extrabold text-base text-white mb-1">Quick Direct Portal Access</h3>
        <p className="text-xs text-slate-400 mb-4">
          Jump straight into any portal with your Owner access to test features live:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <Link
            to="/grow"
            className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 hover:border-emerald-500/50 text-center transition-all group"
          >
            <Sprout className="w-5 h-5 text-emerald-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-white">Farmer</div>
            <div className="text-[10px] text-slate-400 font-mono">/grow</div>
          </Link>

          <Link
            to="/move"
            className="p-3 rounded-2xl bg-sky-950/20 border border-sky-500/20 hover:border-sky-500/50 text-center transition-all group"
          >
            <Truck className="w-5 h-5 text-sky-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-white">Driver</div>
            <div className="text-[10px] text-slate-400 font-mono">/move</div>
          </Link>

          <Link
            to="/hub"
            className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/20 hover:border-amber-500/50 text-center transition-all group"
          >
            <Warehouse className="w-5 h-5 text-amber-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-white">Mandi</div>
            <div className="text-[10px] text-slate-400 font-mono">/hub</div>
          </Link>

          <Link
            to="/shelf"
            className="p-3 rounded-2xl bg-purple-950/20 border border-purple-500/20 hover:border-purple-500/50 text-center transition-all group"
          >
            <Store className="w-5 h-5 text-purple-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-white">Retailer</div>
            <div className="text-[10px] text-slate-400 font-mono">/shelf</div>
          </Link>

          <Link
            to="/table"
            className="p-3 rounded-2xl bg-pink-950/20 border border-pink-500/20 hover:border-pink-500/50 text-center transition-all group"
          >
            <ShoppingBasket className="w-5 h-5 text-pink-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-white">Consumer</div>
            <div className="text-[10px] text-slate-400 font-mono">/table</div>
          </Link>

          <Link
            to="/control"
            className="p-3 rounded-2xl bg-red-950/20 border border-red-500/20 hover:border-red-500/50 text-center transition-all group"
          >
            <ShieldCheck className="w-5 h-5 text-red-400 mx-auto mb-1 group-hover:scale-110 transition-transform" />
            <div className="text-xs font-bold text-white">Control</div>
            <div className="text-[10px] text-slate-400 font-mono">/control</div>
          </Link>
        </div>
      </div>

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onProfileUpdated={() => {}}
        portalRole="control"
      />
    </div>
  );
};

export default DemoPortal;

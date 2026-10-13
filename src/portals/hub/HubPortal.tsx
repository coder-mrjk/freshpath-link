import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { parseScannedBagId } from '../../lib/bagId';
import { formatIST, timeAgoIST } from '../../lib/time';
import {
  StorageUnit,
  StorageReading,
  getStorageTemperatureStatus,
  getStorageHumidityStatus,
  formatStorageDuration,
  STORAGE_DEFAULTS,
} from '../../lib/storage';
import { calculateFreshness } from '../../lib/freshness';
import { StorageChart } from '../../components/StorageChart';
import { QRScannerModal } from '../../components/QRScannerModal';
import {
  Warehouse,
  Thermometer,
  Droplets,
  PlusCircle,
  QrCode,
  Send,
  AlertCircle,
  CheckCircle,
  Layers,
  Sparkles,
  Store,
  Clock,
} from 'lucide-react';

interface Mandi {
  id: string;
  mandiPersonUid: string;
  name: string;
  area: string;
}

interface Shop {
  id: string;
  name: string;
  area: string;
}

interface StoredBag {
  id: string;
  farmerFirstName: string;
  farmerPassId?: string;
  fieldName: string;
  village: string;
  weightKg: number;
  pieces: number;
  totalPrice: number;
  status: string;
  storageUnitId?: string;
  harvestAt: any;
  createdAt: any;
}

export const HubPortal: React.FC = () => {
  const { userProfile, currentUser, isOwner } = useAuth();

  const [mandis, setMandis] = useState<Mandi[]>([]);
  const [selectedMandi, setSelectedMandi] = useState<Mandi | null>(null);
  const [storageUnits, setStorageUnits] = useState<StorageUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<StorageUnit | null>(null);
  const [unitReadings, setUnitReadings] = useState<StorageReading[]>([]);
  const [storedBags, setStoredBags] = useState<StoredBag[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showScanner, setShowScanner] = useState(false);
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState('Cold Room A');
  const [newNodeId, setNewNodeId] = useState('STORE-01');

  // Dispatch Modal
  const [dispatchBag, setDispatchBag] = useState<StoredBag | null>(null);
  const [selectedShopId, setSelectedShopId] = useState('');

  const loadHubData = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Mandi for current user or all if owner
      let mandiList: Mandi[] = [];
      if (isOwner) {
        const mSnap = await getDocs(collection(db, 'mandis'));
        mSnap.forEach((d) => mandiList.push({ id: d.id, ...d.data() } as Mandi));
      } else {
        const mQ = query(collection(db, 'mandis'), where('mandiPersonUid', '==', currentUser.uid));
        const mSnap = await getDocs(mQ);
        mSnap.forEach((d) => mandiList.push({ id: d.id, ...d.data() } as Mandi));
      }

      // If no mandi exists yet for this approved person, fallback default
      if (mandiList.length === 0) {
        const defaultMandi: Mandi = {
          id: `mandi-${currentUser.uid.slice(0, 8)}`,
          mandiPersonUid: currentUser.uid,
          name: 'Panruti Central Agro Mandi',
          area: 'Cuddalore Main Road',
        };
        await setDoc(doc(db, 'mandis', defaultMandi.id), defaultMandi);
        mandiList = [defaultMandi];
      }

      setMandis(mandiList);
      const activeMandi = mandiList[0];
      setSelectedMandi(activeMandi);

      // 2. Fetch Storage Units for this Mandi
      const uQ = query(collection(db, 'storageUnits'), where('mandiId', '==', activeMandi.id));
      const uSnap = await getDocs(uQ);
      let uList: StorageUnit[] = [];
      uSnap.forEach((d) => uList.push({ id: d.id, ...d.data() } as StorageUnit));

      // Auto-provision initial storage unit if empty
      if (uList.length === 0) {
        const initUnit: StorageUnit = {
          id: 'STORE-01',
          mandiId: activeMandi.id,
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
          capacityCrates: 200,
          createdAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'storageUnits', initUnit.id), initUnit);
        uList = [initUnit];
      }

      setStorageUnits(uList);
      const targetUnit = uList[0];
      setSelectedUnit(targetUnit);

      // 3. Fetch readings for active unit
      await loadReadings(targetUnit.id);

      // 4. Fetch Stored Bags
      const bQ = query(
        collection(db, 'bags'),
        where('mandiId', '==', activeMandi.id),
        where('status', '==', 'IN_STORAGE')
      );
      const bSnap = await getDocs(bQ);
      const bList: StoredBag[] = [];
      bSnap.forEach((d) => bList.push({ id: d.id, ...d.data() } as StoredBag));
      bList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setStoredBags(bList);

      // 5. Fetch Retail Shops for dispatch
      const sSnap = await getDocs(collection(db, 'shops'));
      const sList: Shop[] = [];
      sSnap.forEach((d) => sList.push({ id: d.id, ...d.data() } as Shop));
      if (sList.length === 0) {
        const defaultShop: Shop = {
          id: 'SHOP-01',
          name: 'Fresh Basket Supermarket',
          area: 'Adyar, Chennai',
        };
        await setDoc(doc(db, 'shops', defaultShop.id), defaultShop);
        sList.push(defaultShop);
      }
      setShops(sList);
      if (sList.length > 0) {
        setSelectedShopId(sList[0].id);
      }
    } catch (err: unknown) {
      console.warn('Hub portal load error:', err);
      setError((err as Error)?.message || 'Failed to load mandi hub data.');
    } finally {
      setLoading(false);
    }
  };

  const loadReadings = async (unitId: string) => {
    try {
      const rSnap = await getDocs(collection(db, 'storageUnits', unitId, 'readings'));
      const rList: StorageReading[] = [];
      rSnap.forEach((d) => rList.push(d.data() as StorageReading));
      setUnitReadings(rList);
    } catch (err) {
      console.warn('Readings load error:', err);
    }
  };

  useEffect(() => {
    loadHubData();
  }, [currentUser]);

  // Create Storage Unit
  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMandi || !newUnitName.trim() || !newNodeId.trim()) return;

    try {
      const unitId = newNodeId.trim().toUpperCase();
      const newUnit: StorageUnit = {
        id: unitId,
        mandiId: selectedMandi.id,
        name: newUnitName.trim(),
        nodeUnitId: unitId,
        currentTemp: 14.0,
        currentHumidity: 87.0,
        latest: {
          tempC: 14.0,
          humidityPct: 87.0,
          at: new Date().toISOString(),
        },
        targetTempMin: 12.0,
        targetTempMax: 15.0,
        targetHumidityMin: 85.0,
        targetHumidityMax: 90.0,
        capacityCrates: 250,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'storageUnits', unitId), newUnit);
      setShowNewUnitModal(false);
      setSuccessMsg(`Created Cold Storage Unit "${unitId}" successfully!`);
      await loadHubData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to create storage unit.');
    }
  };

  // Receive Crate QR Code
  const handleReceiveBag = async (scannedValue: string) => {
    if (!currentUser || !selectedMandi || !selectedUnit) return;
    const bagId = parseScannedBagId(scannedValue);
    if (!bagId) {
      setError('Scanned code is not a valid FreshPath crate ID.');
      return;
    }

    setShowScanner(false);
    setActionLoading(true);
    setError(null);

    try {
      const bagRef = doc(db, 'bags', bagId);
      const bagSnap = await getDoc(bagRef);
      if (!bagSnap.exists()) {
        throw new Error(`Crate "${bagId}" not found in database.`);
      }

      const bagData = bagSnap.data();
      // Valid transition: IN_TRANSIT (or LOADED) -> IN_STORAGE
      if (bagData.status !== 'IN_TRANSIT' && bagData.status !== 'LOADED') {
        throw new Error(
          `Crate cannot be checked in. Current status is ${bagData.status} (only IN_TRANSIT crates can be received).`
        );
      }

      const batch = writeBatch(db);

      // 1. Update Bag
      batch.update(bagRef, {
        status: 'IN_STORAGE',
        mandiId: selectedMandi.id,
        storageUnitId: selectedUnit.id,
        holderUid: currentUser.uid,
        handlerUids: Array.from(new Set([...(bagData.handlerUids || []), currentUser.uid])),
        updatedAt: serverTimestamp(),
      });

      // 2. Append Ledger Event: RECEIVED_STORAGE
      const eventRef = doc(collection(db, 'events'));
      const currentTemp = selectedUnit.currentTemp || 13.5;
      batch.set(eventRef, {
        bagId,
        tripId: bagData.tripId || null,
        type: 'RECEIVED_STORAGE',
        byUid: currentUser.uid,
        byRole: 'mandi',
        byPassId: userProfile?.passId || 'FP-M-0001',
        at: serverTimestamp(),
        place: {
          text: `${selectedMandi.name} - ${selectedUnit.name}`,
        },
        note: `Received into storage unit ${selectedUnit.name} at ${currentTemp}°C.`,
      });

      await batch.commit();
      setSuccessMsg(`Crate ${bagId} checked into ${selectedUnit.name}!`);
      await loadHubData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to check in crate.');
    } finally {
      setActionLoading(false);
    }
  };

  // Dispatch Crate to Retail Shop
  const handleDispatchBag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchBag || !currentUser || !selectedMandi || !selectedShopId) return;

    setActionLoading(true);
    setError(null);

    try {
      const shop = shops.find((s) => s.id === selectedShopId);
      const shopName = shop ? shop.name : 'Retail Partner';

      const batch = writeBatch(db);

      // 1. Update Bag to DISPATCHED_TO_SHOP
      const bagRef = doc(db, 'bags', dispatchBag.id);
      batch.update(bagRef, {
        status: 'DISPATCHED_TO_SHOP',
        shopId: selectedShopId,
        updatedAt: serverTimestamp(),
      });

      // 2. Append Ledger Event: DISPATCHED_TO_SHOP
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        bagId: dispatchBag.id,
        type: 'DISPATCHED_TO_SHOP',
        byUid: currentUser.uid,
        byRole: 'mandi',
        byPassId: userProfile?.passId || 'FP-M-0001',
        at: serverTimestamp(),
        place: {
          text: `${selectedMandi.name} → ${shopName}`,
        },
        note: `Dispatched to retail shop: ${shopName} (${shop?.area || 'City'}).`,
      });

      await batch.commit();
      setDispatchBag(null);
      setSuccessMsg(`Crate ${dispatchBag.id} dispatched to ${shopName}!`);
      await loadHubData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to dispatch crate.');
    } finally {
      setActionLoading(false);
    }
  };

  // Simulate DHT22 Telemetry Injection
  const handleSimulateReading = async (tempC: number, humidityPct: number) => {
    if (!selectedUnit) return;
    try {
      const readingRef = doc(collection(db, 'storageUnits', selectedUnit.id, 'readings'));
      const timestampIso = new Date().toISOString();

      await setDoc(readingRef, {
        tempC,
        humidityPct,
        at: timestampIso,
        source: 'simulated',
      });

      await setDoc(
        doc(db, 'storageUnits', selectedUnit.id),
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
        `Recorded live telemetry reading: ${tempC}°C, ${humidityPct}% RH for ${selectedUnit.name}!`
      );
      await loadHubData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to record simulated reading.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto mb-4"></div>
        <p className="text-xs text-gray-500">Loading mandi cold storage telemetry...</p>
      </div>
    );
  }

  const tempStatus = getStorageTemperatureStatus(selectedUnit?.currentTemp);
  const humStatus = getStorageHumidityStatus(selectedUnit?.currentHumidity);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="bg-amber-700 text-white rounded-2xl p-6 shadow-xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-800 rounded-xl">
            <Warehouse className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Hub Portal</h1>
              {userProfile?.passId && (
                <span className="text-xs font-mono font-bold bg-amber-800 px-2.5 py-0.5 rounded-full border border-amber-500">
                  {userProfile.passId}
                </span>
              )}
            </div>
            {mandis.length > 1 ? (
              <select
                value={selectedMandi?.id}
                onChange={(e) => {
                  const m = mandis.find((x) => x.id === e.target.value);
                  if (m) setSelectedMandi(m);
                }}
                className="mt-1 text-xs bg-amber-800 text-white rounded-lg px-2 py-1 border border-amber-600 font-bold"
              >
                {mandis.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.area})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-amber-100 mt-0.5">
                Mandi: <strong>{selectedMandi?.name}</strong> • {selectedMandi?.area}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-100 text-amber-900 rounded-xl text-xs font-bold shadow-md transition-colors touch-target"
          >
            <QrCode className="w-4 h-4" />
            <span>Receive Crate</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between shadow-xs">
          <span className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            {successMsg}
          </span>
          <button onClick={() => setSuccessMsg(null)} className="underline text-[11px]">
            Dismiss
          </button>
        </div>
      )}

      {/* Storage Units Selector Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {storageUnits.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                setSelectedUnit(u);
                loadReadings(u.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedUnit?.id === u.id
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {u.name} ({u.nodeUnitId})
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowNewUnitModal(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 rounded-xl transition-colors"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>New Unit</span>
        </button>
      </div>

      {/* Selected Storage Unit Telemetry Dashboard */}
      {selectedUnit && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-charcoal">{selectedUnit.name}</h2>
                <span className="text-xs font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                  {selectedUnit.nodeUnitId}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Target Envelope: {STORAGE_DEFAULTS.TARGET_TEMP_MIN}°C – {STORAGE_DEFAULTS.TARGET_TEMP_MAX}°C | {STORAGE_DEFAULTS.TARGET_HUMIDITY_MIN}% – {STORAGE_DEFAULTS.TARGET_HUMIDITY_MAX}% RH
              </p>
            </div>

            {/* Live Reading Badges */}
            <div className="flex items-center gap-3">
              {/* Temp Badge */}
              <div
                className={`p-3 rounded-2xl border flex items-center gap-3 ${
                  tempStatus === 'optimal'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <Thermometer className="w-5 h-5 text-current shrink-0" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Temperature
                  </div>
                  <div className="text-lg font-black font-mono">
                    {selectedUnit.currentTemp !== undefined ? `${selectedUnit.currentTemp}°C` : '–'}
                  </div>
                </div>
              </div>

              {/* Humidity Badge */}
              <div
                className={`p-3 rounded-2xl border flex items-center gap-3 ${
                  humStatus === 'optimal'
                    ? 'bg-blue-50 border-blue-200 text-blue-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <Droplets className="w-5 h-5 text-current shrink-0" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Humidity
                  </div>
                  <div className="text-lg font-black font-mono">
                    {selectedUnit.currentHumidity !== undefined ? `${selectedUnit.currentHumidity}%` : '–'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Telemetry Chart */}
          <StorageChart readings={unitReadings} className="mb-6" />

          {/* Telemetry Simulator Quick Buttons for Demo */}
          <div className="bg-sandBg p-4 rounded-xl border border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-charcoal">DHT22 Telemetry Injector:</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSimulateReading(13.5, 88.0)}
                className="px-3 py-1 bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg text-xs font-bold transition-colors"
                title="Inject optimal 13.5°C reading"
              >
                Safe (13.5°C / 88%)
              </button>
              <button
                onClick={() => handleSimulateReading(18.2, 80.0)}
                className="px-3 py-1 bg-white hover:bg-amber-50 border border-amber-300 text-amber-800 rounded-lg text-xs font-bold transition-colors"
                title="Inject warning reading"
              >
                Warm Warning (18.2°C)
              </button>
              <button
                onClick={() => handleSimulateReading(31.5, 65.0)}
                className="px-3 py-1 bg-white hover:bg-red-50 border border-red-300 text-red-800 rounded-lg text-xs font-bold transition-colors"
                title="Inject high heat spike (>30°C)"
              >
                Heat Spike (31.5°C)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crates In Storage Section */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-700" />
            <h3 className="font-bold text-sm text-charcoal">
              Crates Currently In Cold Storage ({storedBags.length})
            </h3>
          </div>

          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Scan to Receive</span>
          </button>
        </div>

        {storedBags.length === 0 ? (
          <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-xl text-xs">
            No crates currently stored. Scan arriving crates from delivery trucks to check them in.
          </div>
        ) : (
          <div className="space-y-3">
            {storedBags.map((b) => {
              const freshInfo = calculateFreshness(b.harvestAt);
              const durationStr = formatStorageDuration(b.createdAt);

              return (
                <div
                  key={b.id}
                  className="p-4 rounded-xl border border-gray-200 hover:border-amber-300 bg-sandBg/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-charcoal">{b.id}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${freshInfo.colorClass}`}>
                        {freshInfo.score}% {freshInfo.label}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600">
                      Farmer: <strong>{b.farmerFirstName}</strong> ({b.farmerPassId || '–'}) • {b.fieldName}, {b.village}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
                      <span>{b.weightKg} kg ({b.pieces} pcs) • ₹{b.totalPrice}</span>
                      <span>• Harvested: {formatIST(b.harvestAt)} ({timeAgoIST(b.harvestAt)})</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right text-[11px] text-gray-500">
                      <span className="flex items-center gap-1 font-bold text-charcoal">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        {durationStr}
                      </span>
                      <span>in cold room</span>
                    </div>

                    <button
                      onClick={() => setDispatchBag(b)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors touch-target"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Dispatch</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dispatch Modal */}
      {dispatchBag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Store className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-base text-charcoal">Dispatch to Retail Shop</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Select destination retail partner for crate{' '}
              <strong className="font-mono text-charcoal">{dispatchBag.id}</strong>.
            </p>

            <form onSubmit={handleDispatchBag} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Destination Retail Shop
                </label>
                <select
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.area})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDispatchBag(null)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold shadow"
                >
                  {actionLoading ? 'Dispatching...' : 'Confirm Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Storage Unit Modal */}
      {showNewUnitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-base text-charcoal mb-4">Add Storage Unit</h3>
            <form onSubmit={handleCreateUnit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Storage Unit Name
                </label>
                <input
                  type="text"
                  required
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="e.g. Cold Room B"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Node Hardware Unit ID
                </label>
                <input
                  type="text"
                  required
                  value={newNodeId}
                  onChange={(e) => setNewNodeId(e.target.value)}
                  placeholder="e.g. STORE-02"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono uppercase"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewUnitModal(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow"
                >
                  Create Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      <QRScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleReceiveBag}
        title="Scan Crate QR to Receive into Storage"
      />
    </div>
  );
};

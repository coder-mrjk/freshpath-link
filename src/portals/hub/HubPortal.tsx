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
  addDoc,
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
import { UserSettingsModal } from '../../components/UserSettingsModal';
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
  Settings,
  Plus,
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

  // Settings & Registration Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRegisterMandiModal, setShowRegisterMandiModal] = useState(false);
  const [newMandiName, setNewMandiName] = useState('');
  const [newMandiArea, setNewMandiArea] = useState('');

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

      setMandis(mandiList);
      const activeMandi = mandiList.length > 0 ? mandiList[0] : null;
      setSelectedMandi(activeMandi);

      if (activeMandi) {
        // 2. Fetch Storage Units for this Mandi
        const uQ = query(collection(db, 'storageUnits'), where('mandiId', '==', activeMandi.id));
        const uSnap = await getDocs(uQ);
        let uList: StorageUnit[] = [];
        uSnap.forEach((d) => uList.push({ id: d.id, ...d.data() } as StorageUnit));
        setStorageUnits(uList);
        const targetUnit = uList.length > 0 ? uList[0] : null;
        setSelectedUnit(targetUnit);

        // 3. Fetch readings for active unit
        if (targetUnit) {
          await loadReadings(targetUnit.id);
        } else {
          setUnitReadings([]);
        }

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
      } else {
        setStorageUnits([]);
        setSelectedUnit(null);
        setUnitReadings([]);
        setStoredBags([]);
      }

      // 5. Fetch Retail Shops for dispatch
      const sSnap = await getDocs(collection(db, 'shops'));
      const sList: Shop[] = [];
      sSnap.forEach((d) => sList.push({ id: d.id, ...d.data() } as Shop));
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

  // Register New Mandi
  const handleRegisterMandi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newMandiName.trim()) return;

    setActionLoading(true);
    try {
      const mandiRef = await addDoc(collection(db, 'mandis'), {
        mandiPersonUid: currentUser.uid,
        name: newMandiName.trim(),
        area: newMandiArea.trim() || userProfile?.addressText || 'Tamil Nadu',
        createdAt: serverTimestamp(),
      });

      // Also create first storage unit
      const unitId = 'STORE-01';
      await setDoc(doc(db, 'storageUnits', unitId), {
        mandiId: mandiRef.id,
        name: 'Cold Storage Room 1',
        nodeUnitId: unitId,
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
      });

      setShowRegisterMandiModal(false);
      setNewMandiName('');
      setNewMandiArea('');
      setSuccessMsg(`Mandi "${newMandiName.trim()}" registered successfully!`);
      await loadHubData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to register mandi.');
    } finally {
      setActionLoading(false);
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
        byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
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
        byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4"></div>
        <p className="text-xs text-slate-400">Loading mandi cold storage telemetry...</p>
      </div>
    );
  }

  const tempStatus = getStorageTemperatureStatus(selectedUnit?.currentTemp);
  const humStatus = getStorageHumidityStatus(selectedUnit?.currentHumidity);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner - Amber Gradient Glass */}
      <div className="bg-gradient-to-r from-amber-900/60 to-amber-800/40 backdrop-blur-xl border border-amber-500/20 rounded-3xl p-6 shadow-2xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-2xl shadow-[0_0_20px_0_rgba(217,119,6,0.2)]">
            <Warehouse className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Hub Portal</h1>
              {(userProfile?.fullName || userProfile?.firstName) && (
                <span className="text-xs font-semibold bg-amber-950/60 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/40">
                  {userProfile.fullName || userProfile.firstName}
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
                className="mt-1 text-xs bg-slate-900/80 text-white rounded-lg px-2.5 py-1 border border-white/10 font-bold focus:outline-none"
              >
                {mandis.map((m) => (
                  <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                    {m.name} ({m.area})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-amber-200/80 mt-0.5">
                Mandi: <strong className="text-white">{selectedMandi?.name || 'No Mandi Registered'}</strong>
                {selectedMandi?.area && <span> • {selectedMandi.area}</span>}
                {userProfile?.fullName && <span> • Manager: <strong className="text-white">{userProfile.fullName}</strong></span>}
                {userProfile?.phone && <span> • 📞 {userProfile.phone}</span>}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {!selectedMandi && (
            <button
              onClick={() => setShowRegisterMandiModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 rounded-full text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Mandi</span>
            </button>
          )}

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-full text-xs transition-colors"
            title="User Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowScanner(true)}
            disabled={!selectedMandi || !selectedUnit}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(217,119,6,0.35)] transition-all touch-target"
          >
            <QrCode className="w-4 h-4 text-white" />
            <span>Receive Crate</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-300 flex items-start gap-2 backdrop-blur-md shadow-lg">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 flex items-center justify-between backdrop-blur-md shadow-lg">
          <span className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            {successMsg}
          </span>
          <button onClick={() => setSuccessMsg(null)} className="underline text-[11px] text-emerald-300 hover:text-emerald-200">
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
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedUnit?.id === u.id
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white border border-amber-400/30 shadow-[0_0_20px_0_rgba(217,119,6,0.30)]'
                  : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              {u.name} ({u.nodeUnitId})
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowNewUnitModal(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-xl transition-colors"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>New Unit</span>
        </button>
      </div>

      {/* Selected Storage Unit Telemetry Dashboard */}
      {selectedUnit && (
        <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">{selectedUnit.name}</h2>
                <span className="text-xs font-mono font-bold text-slate-300 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-md">
                  {selectedUnit.nodeUnitId}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Target Envelope: {STORAGE_DEFAULTS.TARGET_TEMP_MIN}°C – {STORAGE_DEFAULTS.TARGET_TEMP_MAX}°C | {STORAGE_DEFAULTS.TARGET_HUMIDITY_MIN}% – {STORAGE_DEFAULTS.TARGET_HUMIDITY_MAX}% RH
              </p>
            </div>

            {/* Live Reading Badges with Glow */}
            <div className="flex items-center gap-3">
              {/* Temp Badge */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center gap-3 backdrop-blur-md transition-all ${
                  tempStatus === 'optimal'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_20px_0_rgba(74,222,128,0.2)]'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-[0_0_20px_0_rgba(217,119,6,0.2)]'
                }`}
              >
                <Thermometer className="w-5 h-5 text-current shrink-0" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Temperature
                  </div>
                  <div className="text-lg font-black font-mono text-white">
                    {selectedUnit.currentTemp !== undefined ? `${selectedUnit.currentTemp}°C` : '–'}
                  </div>
                </div>
              </div>

              {/* Humidity Badge */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center gap-3 backdrop-blur-md transition-all ${
                  humStatus === 'optimal'
                    ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 shadow-[0_0_20px_0_rgba(56,189,248,0.2)]'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-[0_0_20px_0_rgba(217,119,6,0.2)]'
                }`}
              >
                <Droplets className="w-5 h-5 text-current shrink-0" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Humidity
                  </div>
                  <div className="text-lg font-black font-mono text-white">
                    {selectedUnit.currentHumidity !== undefined ? `${selectedUnit.currentHumidity}%` : '–'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Telemetry Chart */}
          <StorageChart readings={unitReadings} className="mb-6" />

          {/* Telemetry Simulator Quick Buttons */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200">DHT22 Telemetry Injector:</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSimulateReading(13.5, 88.0)}
                className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 text-emerald-300 rounded-lg text-xs font-bold transition-all"
                title="Inject optimal 13.5°C reading"
              >
                Safe (13.5°C / 88%)
              </button>
              <button
                onClick={() => handleSimulateReading(18.2, 80.0)}
                className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 rounded-lg text-xs font-bold transition-all"
                title="Inject warning reading"
              >
                Warm Warning (18.2°C)
              </button>
              <button
                onClick={() => handleSimulateReading(31.5, 65.0)}
                className="px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-400/30 text-red-300 rounded-lg text-xs font-bold transition-all"
                title="Inject high heat spike (>30°C)"
              >
                Heat Spike (31.5°C)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crates In Storage Section */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm text-white">
              Crates Currently In Cold Storage ({storedBags.length})
            </h3>
          </div>

          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(217,119,6,0.3)] transition-all"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Scan to Receive</span>
          </button>
        </div>

        {storedBags.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white/[0.02] border border-white/[0.06] rounded-2xl text-xs">
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
                  className="p-4 rounded-2xl border border-white/[0.08] hover:border-amber-500/40 bg-white/[0.02] hover:shadow-[0_0_20px_0_rgba(217,119,6,0.15)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-white">{b.id}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${freshInfo.colorClass}`}>
                        {freshInfo.score}% {freshInfo.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">
                      Farmer: <strong className="text-white">{b.farmerFirstName}</strong> ({b.farmerPassId || '–'}) • {b.fieldName}, {b.village}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{b.weightKg} kg ({b.pieces} pcs) • ₹{b.totalPrice}</span>
                      <span>• Harvested: {formatIST(b.harvestAt)} ({timeAgoIST(b.harvestAt)})</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 font-bold text-white">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        {durationStr}
                      </span>
                      <span>in cold room</span>
                    </div>

                    <button
                      onClick={() => setDispatchBag(b)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(147,51,234,0.3)] transition-all touch-target"
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
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setDispatchBag(null)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <Store className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-white">Dispatch to Retail Shop</h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Select destination retail partner for crate{' '}
                <strong className="font-mono text-purple-300">{dispatchBag.id}</strong>.
              </p>

              <form onSubmit={handleDispatchBag} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Destination Retail Shop
                  </label>
                  <select
                    value={selectedShopId}
                    onChange={(e) => setSelectedShopId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500/50"
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                        {s.name} ({s.area})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDispatchBag(null)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(147,51,234,0.3)] transition-all"
                  >
                    {actionLoading ? 'Dispatching...' : 'Confirm Dispatch'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* New Storage Unit Modal */}
      {showNewUnitModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setShowNewUnitModal(false)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-4">Add Storage Unit</h3>
              <form onSubmit={handleCreateUnit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Storage Unit Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    placeholder="e.g. Cold Room B"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Node Hardware Unit ID
                  </label>
                  <input
                    type="text"
                    required
                    value={newNodeId}
                    onChange={(e) => setNewNodeId(e.target.value)}
                    placeholder="e.g. STORE-02"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewUnitModal(false)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(217,119,6,0.3)] transition-all"
                  >
                    Create Unit
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Register Mandi Modal */}
      {showRegisterMandiModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setShowRegisterMandiModal(false)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-1">Register Mandi Facility</h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Enter your wholesale mandi name and market yard location
              </p>
              <form onSubmit={handleRegisterMandi} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mandi Business Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newMandiName}
                    onChange={(e) => setNewMandiName(e.target.value)}
                    placeholder="e.g. Panruti Agro Mandi"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Market Yard Area / Address
                  </label>
                  <input
                    type="text"
                    value={newMandiArea}
                    onChange={(e) => setNewMandiArea(e.target.value)}
                    placeholder="e.g. Cuddalore Main Road"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterMandiModal(false)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow transition-all"
                  >
                    {actionLoading ? 'Saving...' : 'Register Mandi'}
                  </button>
                </div>
              </form>
            </div>
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

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onProfileUpdated={loadHubData}
        portalRole="mandi"
      />
    </div>
  );
};

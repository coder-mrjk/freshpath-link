import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  addDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { parseScannedBagId } from '../../lib/bagId';
import { formatIST, timeAgoIST } from '../../lib/time';
import {
  StorageReading,
  evaluateMandiClimate,
  formatStorageDuration,
  STORAGE_DEFAULTS,
  parseReadingDate,
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
  Edit2,
  Trash2,
  Activity,
  Wind,
  Flame,
  CloudRain,
  ShieldCheck,
} from 'lucide-react';

interface Mandi {
  id: string;
  mandiPersonUid: string;
  name: string;
  area: string;
  nodeUnitId?: string;
  currentTemp?: number;
  currentHumidity?: number;
  updatedAt?: any;
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
  mandiId?: string;
  harvestAt: any;
  createdAt: any;
}

export const HubPortal: React.FC = () => {
  const { userProfile, currentUser, isOwner } = useAuth();

  const [mandis, setMandis] = useState<Mandi[]>([]);
  const [selectedMandi, setSelectedMandi] = useState<Mandi | null>(null);
  const [mandiReadings, setMandiReadings] = useState<StorageReading[]>([]);
  const [storedBags, setStoredBags] = useState<StoredBag[]>([]);
  const [incomingBags, setIncomingBags] = useState<StoredBag[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showScanner, setShowScanner] = useState(false);
  const [editingMandi, setEditingMandi] = useState<Mandi | null>(null);

  // Dispatch Modal
  const [dispatchBag, setDispatchBag] = useState<StoredBag | null>(null);
  const [selectedShopId, setSelectedShopId] = useState('');

  // Settings & Registration Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRegisterMandiModal, setShowRegisterMandiModal] = useState(false);
  const [newMandiName, setNewMandiName] = useState('');
  const [newMandiArea, setNewMandiArea] = useState('');

  // 1. Real-time Mandis Listener
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const mQ = isOwner
      ? collection(db, 'mandis')
      : query(collection(db, 'mandis'), where('mandiPersonUid', '==', currentUser.uid));

    const unsubscribeMandis = onSnapshot(
      mQ,
      (snapshot) => {
        const list: Mandi[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Mandi));
        setMandis(list);

        // Keep selected mandi in sync or choose first
        setSelectedMandi((prev) => {
          if (!prev) return list[0] || null;
          const matched = list.find((m) => m.id === prev.id);
          return matched || list[0] || null;
        });

        setLoading(false);
      },
      (err) => {
        console.warn('Real-time mandis listener error:', err);
        setError(err.message || 'Failed to sync Mandi facilities.');
        setLoading(false);
      }
    );

    return () => unsubscribeMandis();
  }, [currentUser, isOwner]);

  // 2. Real-time Shops Listener for Dispatches
  useEffect(() => {
    const sQ = collection(db, 'shops');
    const unsubscribeShops = onSnapshot(sQ, (snapshot) => {
      const sList: Shop[] = [];
      snapshot.forEach((d) => sList.push({ id: d.id, ...d.data() } as Shop));
      setShops(sList);
      if (sList.length > 0 && !selectedShopId) {
        setSelectedShopId(sList[0].id);
      }
    });

    return () => unsubscribeShops();
  }, [selectedShopId]);

  // 3. Real-time Incoming Bags Listener (in transit from farms)
  useEffect(() => {
    const inQ = query(collection(db, 'bags'), where('status', '==', 'IN_TRANSIT'));
    const unsubscribeIncoming = onSnapshot(inQ, (snapshot) => {
      const list: StoredBag[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as StoredBag));
      setIncomingBags(list);
    });

    return () => unsubscribeIncoming();
  }, []);

  // 4. Real-time Stored Bags & DHT22 Telemetry Listener for Selected Mandi
  useEffect(() => {
    if (!selectedMandi) {
      setStoredBags([]);
      setMandiReadings([]);
      return;
    }

    // Stored bags for this Mandi
    const bQ = query(
      collection(db, 'bags'),
      where('mandiId', '==', selectedMandi.id),
      where('status', '==', 'IN_STORAGE')
    );

    const unsubscribeBags = onSnapshot(bQ, (snapshot) => {
      const list: StoredBag[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as StoredBag));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setStoredBags(list);
    });

    // Subcollection readings for this Mandi
    const readingsQ = collection(db, 'mandis', selectedMandi.id, 'readings');
    const unsubscribeReadings = onSnapshot(readingsQ, (snapshot) => {
      const rList: StorageReading[] = [];
      snapshot.forEach((d) => rList.push(d.data() as StorageReading));
      // Sort chronologically for chart
      rList.sort((a, b) => parseReadingDate(a.at).getTime() - parseReadingDate(b.at).getTime());
      setMandiReadings(rList.slice(-288));
    });

    return () => {
      unsubscribeBags();
      unsubscribeReadings();
    };
  }, [selectedMandi?.id]);

  // Register New Mandi
  const handleRegisterMandi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newMandiName.trim()) return;

    setActionLoading(true);
    try {
      await addDoc(collection(db, 'mandis'), {
        mandiPersonUid: currentUser.uid,
        name: newMandiName.trim(),
        area: newMandiArea.trim() || userProfile?.addressText || 'Tamil Nadu',
        nodeUnitId: `DHT-${newMandiName.trim().slice(0, 4).toUpperCase()}-01`,
        currentTemp: 14.2,
        currentHumidity: 88.0,
        createdAt: serverTimestamp(),
      });

      setShowRegisterMandiModal(false);
      setNewMandiName('');
      setNewMandiArea('');
      setSuccessMsg(`Mandi "${newMandiName.trim()}" registered successfully!`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to register mandi.');
    } finally {
      setActionLoading(false);
    }
  };

  // Update Mandi
  const handleUpdateMandi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editingMandi || !editingMandi.name.trim()) return;

    try {
      await updateDoc(doc(db, 'mandis', editingMandi.id), {
        name: editingMandi.name.trim(),
        area: editingMandi.area.trim(),
        updatedAt: serverTimestamp(),
      });

      setEditingMandi(null);
      setSuccessMsg(`Mandi "${editingMandi.name.trim()}" updated successfully!`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to update mandi.');
    }
  };

  // Delete Mandi
  const handleDeleteMandi = async (mandiId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete Mandi "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'mandis', mandiId));
      setSuccessMsg(`Mandi "${name}" deleted successfully!`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to delete mandi.');
    }
  };

  // Receive Crate Directly into Mandi
  const handleReceiveBag = async (scannedValue: string) => {
    if (!currentUser || !selectedMandi) {
      setError('Please select an active Mandi before scanning crates.');
      return;
    }
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

      // 1. Update Bag with Mandi details directly (no cold storage room required)
      batch.update(bagRef, {
        status: 'IN_STORAGE',
        mandiId: selectedMandi.id,
        mandiName: selectedMandi.name,
        holderUid: currentUser.uid,
        handlerUids: Array.from(new Set([...(bagData.handlerUids || []), currentUser.uid])),
        updatedAt: serverTimestamp(),
      });

      // 2. Append Ledger Event: RECEIVED_STORAGE
      const eventRef = doc(collection(db, 'events'));
      const currentTemp = selectedMandi.currentTemp || 14.2;
      const currentHumidity = selectedMandi.currentHumidity || 88.0;

      batch.set(eventRef, {
        bagId,
        tripId: bagData.tripId || null,
        type: 'RECEIVED_STORAGE',
        byUid: currentUser.uid,
        byRole: 'mandi',
        byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
        at: serverTimestamp(),
        place: {
          text: `${selectedMandi.name} (${selectedMandi.area})`,
        },
        note: `Received into Mandi storage. Climate: ${currentTemp}°C, ${currentHumidity}% RH.`,
      });

      await batch.commit();
      setSuccessMsg(`Crate ${bagId} checked directly into Mandi ${selectedMandi.name}!`);
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
        shopName,
        shopArea: shop?.area || '',
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
        note: `Dispatched from Mandi to retail store: ${shopName} (${shop?.area || 'City'}).`,
      });

      await batch.commit();
      setDispatchBag(null);
      setSuccessMsg(`Crate ${dispatchBag.id} dispatched to ${shopName}!`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to dispatch crate.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4"></div>
        <p className="text-xs text-slate-400">Connecting to Mandi live telemetry network...</p>
      </div>
    );
  }

  // Calculate holistic DHT22 climate metrics
  const activeTemp = selectedMandi?.currentTemp ?? 14.2;
  const activeHumidity = selectedMandi?.currentHumidity ?? 88.0;
  const mandiClimate = evaluateMandiClimate(activeTemp, activeHumidity);

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
              <h1 className="text-2xl font-black tracking-tight text-white">Mandi Hub Portal</h1>
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
                {selectedMandi?.area && <span> • 📍 {selectedMandi.area}</span>}
                {userProfile?.fullName && <span> • Manager: <strong className="text-white">{userProfile.fullName}</strong></span>}
                {userProfile?.phone && <span> • 📞 {userProfile.phone}</span>}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => setShowRegisterMandiModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 rounded-full text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Mandi</span>
          </button>

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
            disabled={!selectedMandi}
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

      {/* Mandi Facility Direct Management Section */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400">
              <Warehouse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">My Mandi Facilities</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {mandis.length} {mandis.length === 1 ? 'Mandi' : 'Mandis'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Mandi managers have direct control to register, edit details, or manage facilities with fitted DHT22 sensors
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRegisterMandiModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow-md transition-all touch-target"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Register New Mandi</span>
            </button>
          </div>
        </div>

        {/* Mandis Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3">
          {mandis.length === 0 ? (
            <div className="col-span-full p-6 text-center text-xs text-slate-400">
              No Mandi facilities registered yet. Click &ldquo;Register New Mandi&rdquo; to add your wholesale hub.
            </div>
          ) : (
            mandis.map((m) => (
              <div
                key={m.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  selectedMandi?.id === m.id
                    ? 'bg-amber-500/10 border-amber-500/40 shadow-[0_0_15px_rgba(217,119,6,0.15)]'
                    : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                      <span>{m.name}</span>
                      {selectedMandi?.id === m.id && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      📍 {m.area}
                    </div>
                    <div className="text-[10px] text-amber-300 font-mono mt-1">
                      Sensor: {m.nodeUnitId || 'Direct Mandi DHT22'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingMandi(m)}
                      className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/10 text-xs transition-colors"
                      title="Edit Mandi Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMandi(m.id, m.name)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 text-xs transition-colors"
                      title="Delete Mandi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedMandi(m)}
                    className={`font-semibold transition-colors ${
                      selectedMandi?.id === m.id
                        ? 'text-amber-400 cursor-default'
                        : 'text-slate-400 hover:text-white underline'
                    }`}
                  >
                    {selectedMandi?.id === m.id ? '✓ Active Mandi' : 'Select Mandi'}
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {m.currentTemp ? `${m.currentTemp}°C` : '14.2°C'} | {m.currentHumidity ? `${m.currentHumidity}%` : '88%'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Direct Mandi DHT22 Climate Telemetry Dashboard */}
      {selectedMandi && (
        <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-white/[0.08]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">{selectedMandi.name} — Direct Climate Monitoring</h2>
                <span className="text-xs font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-md">
                  {selectedMandi.nodeUnitId || 'Fitted DHT22 Hardware'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Direct facility climate telemetry: Continuous temperature, humidity, dew point &amp; vapor pressure deficit monitoring.
              </p>
            </div>

            {/* Climate Preservation Status Pill */}
            <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 backdrop-blur-md ${mandiClimate.colorClass}`}>
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider">Preservation Status</div>
                <div className="text-xs font-black">{mandiClimate.label}</div>
              </div>
            </div>
          </div>

          {/* 5-Metric Physical Telemetry Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {/* 1. Temperature */}
            <div className="p-3.5 rounded-2xl border bg-white/[0.02] border-white/10 backdrop-blur-md">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Temperature</span>
                <Thermometer className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-black font-mono text-white">
                {activeTemp.toFixed(1)}°C
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Target: {STORAGE_DEFAULTS.TARGET_TEMP_MIN}°–{STORAGE_DEFAULTS.TARGET_TEMP_MAX}°C
              </div>
            </div>

            {/* 2. Relative Humidity */}
            <div className="p-3.5 rounded-2xl border bg-white/[0.02] border-white/10 backdrop-blur-md">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Humidity</span>
                <Droplets className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-xl font-black font-mono text-white">
                {activeHumidity.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Target: {STORAGE_DEFAULTS.TARGET_HUMIDITY_MIN}%–{STORAGE_DEFAULTS.TARGET_HUMIDITY_MAX}% RH
              </div>
            </div>

            {/* 3. Dew Point (Magnus Formula) */}
            <div className="p-3.5 rounded-2xl border bg-white/[0.02] border-white/10 backdrop-blur-md">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Dew Point</span>
                <CloudRain className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-black font-mono text-white">
                {mandiClimate.dewPoint.toFixed(1)}°C
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Condensation threshold
              </div>
            </div>

            {/* 4. Vapor Pressure Deficit (VPD) */}
            <div className="p-3.5 rounded-2xl border bg-white/[0.02] border-white/10 backdrop-blur-md">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Vapor Deficit</span>
                <Wind className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl font-black font-mono text-white">
                {mandiClimate.vpd.toFixed(2)} kPa
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Optimal: 0.40–0.80 kPa
              </div>
            </div>

            {/* 5. Apparent Heat Index */}
            <div className="p-3.5 rounded-2xl border bg-white/[0.02] border-white/10 backdrop-blur-md col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider">Heat Index</span>
                <Flame className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-xl font-black font-mono text-white">
                {mandiClimate.heatIndex.toFixed(1)}°C
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Apparent thermal load
              </div>
            </div>
          </div>

          {/* Practical Advice Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 mb-6 flex items-start gap-2.5">
            <Activity className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">Storage Guidance: </span>
              <span>{mandiClimate.advice}</span>
            </div>
          </div>

          {/* Telemetry Historical Trend Chart */}
          {mandiReadings.length > 0 ? (
            <StorageChart readings={mandiReadings} className="mb-2" />
          ) : (
            <div className="p-6 text-center text-slate-400 bg-white/[0.02] border border-white/[0.06] rounded-2xl text-xs">
              Direct telemetry active. Data points from Mandi hardware sensor stream automatically to the ledger.
            </div>
          )}
        </div>
      )}

      {/* Arriving Crates In Transit from Farms */}
      {incomingBags.length > 0 && (
        <div className="relative backdrop-blur-xl bg-amber-500/[0.05] rounded-3xl border border-amber-500/20 p-6 shadow-xl mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-sm text-white">
                Arriving Delivery Vehicles ({incomingBags.length} Crates In Transit)
              </h3>
            </div>
            <span className="text-[10px] text-amber-300 font-semibold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              Ready for Mandi Check-in
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {incomingBags.map((b) => (
              <div
                key={b.id}
                className="p-3 bg-slate-900/80 border border-white/10 rounded-2xl flex flex-col justify-between gap-3 shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-xs font-bold text-white truncate">{b.id}</span>
                    <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                      In Transit
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Farmer: <strong className="text-white">{b.farmerFirstName}</strong> ({b.village})
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {b.weightKg} kg • {b.pieces} pcs • ₹{b.totalPrice}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleReceiveBag(b.id)}
                  disabled={actionLoading || !selectedMandi}
                  className="w-full py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-[0_2px_10px_rgba(217,119,6,0.3)]"
                >
                  Receive into Mandi
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crates Currently Held at Mandi */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm text-white">
              Crates Currently In Mandi Storage ({storedBags.length})
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
            No crates currently stored at this Mandi. Scan arriving crates from transport vehicles to check them in.
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
                      <span>in Mandi</span>
                    </div>

                    <button
                      onClick={() => setDispatchBag(b)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(147,51,234,0.3)] transition-all touch-target"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Dispatch to Shop</span>
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

      {/* Edit Mandi Modal */}
      {editingMandi && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setEditingMandi(null)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-1">Edit Mandi Facility</h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Update mandi name and market yard location
              </p>
              <form onSubmit={handleUpdateMandi} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mandi Business Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editingMandi.name}
                    onChange={(e) => setEditingMandi({ ...editingMandi, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Market Yard Area / Address
                  </label>
                  <input
                    type="text"
                    value={editingMandi.area}
                    onChange={(e) => setEditingMandi({ ...editingMandi, area: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingMandi(null)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white rounded-xl text-xs font-bold shadow transition-all"
                  >
                    Save Changes
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
        title="Scan Crate QR to Receive into Mandi"
      />

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onProfileUpdated={() => {}}
        portalRole="mandi"
      />
    </div>
  );
};

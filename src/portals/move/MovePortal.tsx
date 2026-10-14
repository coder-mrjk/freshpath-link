import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { generateTripId, parseScannedBagId } from '../../lib/bagId';
import { evaluateFix, GPSUnitData, GPSFix } from '../../lib/gps';
import { calculateHaversineDistance } from '../../lib/haversine';
import { timeAgoIST } from '../../lib/time';
import { TripMap } from '../../components/TripMap';
import { QRScannerModal } from '../../components/QRScannerModal';
import {
  Truck,
  Radio,
  PlusCircle,
  Play,
  Square,
  QrCode,
  AlertCircle,
  CheckCircle,
  Layers,
  Sparkles,
} from 'lucide-react';

interface Vehicle {
  id: string;
  driverUid: string;
  regNumber: string;
  vehicleType: string;
  capacityKg: number;
  gpsUnitId?: string;
  status: string;
}

interface Mandi {
  id: string;
  name: string;
  area: string;
}

interface Trip {
  id: string;
  driverUid: string;
  vehicleId: string;
  gpsUnitId: string;
  originText: string;
  destinationMandiId: string;
  destinationMandiName?: string;
  status: 'DRAFT' | 'IN_TRANSIT' | 'ENDED';
  bagIds: string[];
  start?: GPSFix;
  end?: GPSFix;
  startedAt?: any;
  endedAt?: any;
  distanceKmStraight?: number;
  durationMin?: number;
  createdAt: any;
}

export const MovePortal: React.FC = () => {
  const { userProfile, currentUser } = useAuth();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [mandis, setMandis] = useState<Mandi[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New Trip Modal
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [originText, setOriginText] = useState('Panruti Farm Cluster');
  const [selectedMandiId, setSelectedMandiId] = useState('');

  // Scanner Modal
  const [showScanner, setShowScanner] = useState(false);

  // Live GPS Status
  const [gpsUnitData, setGpsUnitData] = useState<GPSUnitData | null>(null);

  const loadMoveData = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Vehicle for Driver
      const vQ = query(collection(db, 'vehicles'), where('driverUid', '==', currentUser.uid));
      const vSnap = await getDocs(vQ);
      let loadedVehicle: Vehicle | null = null;
      vSnap.forEach((d) => {
        loadedVehicle = { id: d.id, ...d.data() } as Vehicle;
      });
      setVehicle(loadedVehicle);

      // 2. Fetch Mandis
      const mSnap = await getDocs(collection(db, 'mandis'));
      const mList: Mandi[] = [];
      mSnap.forEach((d) => mList.push({ id: d.id, ...d.data() } as Mandi));
      setMandis(mList);
      if (mList.length > 0 && !selectedMandiId) {
        setSelectedMandiId(mList[0].id);
      }

      // 3. Fetch Driver Trips
      const tQ = query(collection(db, 'trips'), where('driverUid', '==', currentUser.uid));
      const tSnap = await getDocs(tQ);
      const tList: Trip[] = [];
      tSnap.forEach((d) => tList.push({ id: d.id, ...d.data() } as Trip));
      tList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTrips(tList);

      // Active trip
      const ongoing = tList.find((t) => t.status === 'IN_TRANSIT' || t.status === 'DRAFT');
      setActiveTrip(ongoing || tList[0] || null);

      // 4. Fetch GPS Unit
      const gpsId = loadedVehicle ? (loadedVehicle as Vehicle).gpsUnitId : 'GPS-01';
      if (gpsId) {
        const gpsSnap = await getDoc(doc(db, 'gpsUnits', gpsId));
        if (gpsSnap.exists()) {
          setGpsUnitData(gpsSnap.data() as GPSUnitData);
        }
      }
    } catch (err: unknown) {
      console.warn('Move portal load error:', err);
      setError((err as Error)?.message || 'Failed to load driver trips.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMoveData();
  }, [currentUser]);

  // Create New Trip
  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !vehicle) {
      setError('You must have a registered vehicle to create trips.');
      return;
    }

    try {
      const tripId = generateTripId();
      const mandi = mandis.find((m) => m.id === selectedMandiId);

      const newTripData: Trip = {
        id: tripId,
        driverUid: currentUser.uid,
        vehicleId: vehicle.id,
        gpsUnitId: vehicle.gpsUnitId || 'GPS-01',
        originText: originText.trim(),
        destinationMandiId: selectedMandiId || 'default-mandi',
        destinationMandiName: mandi ? `${mandi.name} (${mandi.area})` : 'Mandi Storage',
        status: 'DRAFT',
        bagIds: [],
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'trips', tripId), newTripData);
      setShowNewTripModal(false);
      setSuccessMsg(`Created Trip ${tripId}! Scan crate QR codes to load.`);
      await loadMoveData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to create trip.');
    }
  };

  // Scan & Load Crate
  const handleScanLoadBag = async (scannedValue: string) => {
    if (!activeTrip || !currentUser) return;
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
        throw new Error(`Crate "${bagId}" not found in system.`);
      }

      const bagData = bagSnap.data();
      if (bagData.status !== 'CREATED' && bagData.status !== 'LOADED') {
        throw new Error(
          `Crate cannot be loaded. Current status is ${bagData.status} (only CREATED crates can be loaded).`
        );
      }

      if (activeTrip.bagIds.includes(bagId)) {
        throw new Error(`Crate ${bagId} is already loaded on this trip.`);
      }

      const batch = writeBatch(db);

      // 1. Update Trip bagIds
      const updatedBagIds = [...activeTrip.bagIds, bagId];
      batch.update(doc(db, 'trips', activeTrip.id), {
        bagIds: updatedBagIds,
        updatedAt: serverTimestamp(),
      });

      // 2. Update Bag status
      batch.update(bagRef, {
        status: 'LOADED',
        tripId: activeTrip.id,
        holderUid: currentUser.uid,
        handlerUids: Array.from(new Set([...(bagData.handlerUids || []), currentUser.uid])),
        updatedAt: serverTimestamp(),
      });

      // 3. Append Event
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        bagId,
        tripId: activeTrip.id,
        type: 'LOADED',
        byUid: currentUser.uid,
        byRole: 'driver',
        byPassId: userProfile?.passId || 'FP-D-0001',
        at: serverTimestamp(),
        place: { text: activeTrip.originText },
        note: `Loaded into vehicle ${vehicle?.regNumber || 'Truck'}.`,
      });

      await batch.commit();

      setSuccessMsg(`Successfully loaded crate ${bagId} into trip!`);
      await loadMoveData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to load crate.');
    } finally {
      setActionLoading(false);
    }
  };

  // Start Trip
  const handleStartTrip = async () => {
    if (!activeTrip || !currentUser) return;
    if (activeTrip.bagIds.length === 0) {
      setError('Please scan and load at least one crate before starting the trip.');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      // Fetch latest GPS fix
      const gpsId = activeTrip.gpsUnitId || vehicle?.gpsUnitId || 'GPS-01';
      const gpsSnap = await getDoc(doc(db, 'gpsUnits', gpsId));
      const gpsData = gpsSnap.data() as GPSUnitData;

      const evalResult = evaluateFix(gpsData);
      if (!evalResult.ok) {
        throw new Error(
          `GPS Validation Failed (${evalResult.reason}): ${evalResult.message}`
        );
      }

      const startFix = evalResult.fix;
      const batch = writeBatch(db);

      // 1. Update Trip
      batch.update(doc(db, 'trips', activeTrip.id), {
        status: 'IN_TRANSIT',
        start: startFix,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Move all loaded bags to IN_TRANSIT
      for (const bId of activeTrip.bagIds) {
        batch.update(doc(db, 'bags', bId), {
          status: 'IN_TRANSIT',
          updatedAt: serverTimestamp(),
        });

        const eventRef = doc(collection(db, 'events'));
        batch.set(eventRef, {
          bagId: bId,
          tripId: activeTrip.id,
          type: 'TRIP_STARTED',
          byUid: currentUser.uid,
          byRole: 'driver',
          byPassId: userProfile?.passId || 'FP-D-0001',
          at: serverTimestamp(),
          place: {
            lat: startFix.lat,
            lng: startFix.lng,
            text: activeTrip.originText,
          },
          note: `Trip started to Mandi with GPS position recorded.`,
        });
      }

      await batch.commit();
      setSuccessMsg('Trip started successfully! Crates are now in transit.');
      await loadMoveData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to start trip.');
    } finally {
      setActionLoading(false);
    }
  };

  // End Trip
  const handleEndTrip = async () => {
    if (!activeTrip || !currentUser || !activeTrip.start) return;

    setActionLoading(true);
    setError(null);

    try {
      const gpsId = activeTrip.gpsUnitId || vehicle?.gpsUnitId || 'GPS-01';
      const gpsSnap = await getDoc(doc(db, 'gpsUnits', gpsId));
      const gpsData = gpsSnap.data() as GPSUnitData;

      const evalResult = evaluateFix(gpsData);
      if (!evalResult.ok) {
        throw new Error(
          `GPS Validation Failed (${evalResult.reason}): ${evalResult.message}`
        );
      }

      const endFix = evalResult.fix;
      const distanceKm = calculateHaversineDistance(activeTrip.start, endFix);

      const startedMs = activeTrip.startedAt?.seconds
        ? activeTrip.startedAt.seconds * 1000
        : Date.now() - 3600000;
      const durationMin = Math.max(1, Math.round((Date.now() - startedMs) / 60000));

      const batch = writeBatch(db);

      // 1. Update Trip
      batch.update(doc(db, 'trips', activeTrip.id), {
        status: 'ENDED',
        end: endFix,
        endedAt: serverTimestamp(),
        distanceKmStraight: distanceKm,
        durationMin,
        updatedAt: serverTimestamp(),
      });

      // 2. Events
      for (const bId of activeTrip.bagIds) {
        const eventRef = doc(collection(db, 'events'));
        batch.set(eventRef, {
          bagId: bId,
          tripId: activeTrip.id,
          type: 'TRIP_ENDED',
          byUid: currentUser.uid,
          byRole: 'driver',
          byPassId: userProfile?.passId || 'FP-D-0001',
          at: serverTimestamp(),
          place: {
            lat: endFix.lat,
            lng: endFix.lng,
            text: activeTrip.destinationMandiName || 'Mandi Storage',
          },
          note: `Trip ended at Mandi. Straight-line distance: ${distanceKm} km in ${durationMin} mins.`,
        });
      }

      await batch.commit();
      setSuccessMsg(`Trip completed! Recorded ${distanceKm} km straight-line distance.`);
      await loadMoveData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to complete trip.');
    } finally {
      setActionLoading(false);
    }
  };

  // Simulator for Offline / Demo Testing
  const handleSimulateGPSFix = async () => {
    const gpsId = vehicle?.gpsUnitId || 'GPS-01';
    try {
      const isStart = activeTrip?.status === 'DRAFT';
      const lat = isStart ? 11.748 : 11.9338;
      const lng = isStart ? 79.7714 : 79.8297;

      await setDoc(
        doc(db, 'gpsUnits', gpsId),
        {
          vehicleId: vehicle?.id || 'TN01AB1234',
          latest: {
            lat,
            lng,
            speedKmph: 32.0,
            sats: 8,
            hdop: 1.1,
            valid: true,
            fixAt: new Date().toISOString(),
          },
          receivedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      setSuccessMsg(`Injected fresh GPS fix for ${gpsId} (${lat}, ${lng})!`);
      await loadMoveData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to simulate GPS.');
    }
  };

  const gpsEvaluation = evaluateFix(gpsUnitData);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-xs text-slate-400">Loading driver vehicles & delivery trips...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Banner - Blue Gradient Glass */}
      <div className="bg-gradient-to-r from-blue-900/60 to-blue-800/40 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-6 shadow-2xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/20 border border-blue-500/30 rounded-2xl shadow-[0_0_20px_0_rgba(56,189,248,0.2)]">
            <Truck className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Move Portal</h1>
              {userProfile?.passId && (
                <span className="text-xs font-mono font-bold bg-blue-950/60 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-500/40">
                  {userProfile.passId}
                </span>
              )}
            </div>
            <p className="text-xs text-blue-200/80 mt-0.5">
              Driver: <strong className="text-white">{userProfile?.firstName}</strong> • Vehicle: {vehicle?.regNumber || 'Unregistered'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewTripModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(59,130,246,0.35)] transition-all touch-target"
          >
            <PlusCircle className="w-4 h-4 text-white" />
            <span>New Trip</span>
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

      {/* Vehicle & GPS Status Bar */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] p-4 rounded-2xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">
                GPS Node: {vehicle?.gpsUnitId || 'GPS-01'}
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  gpsEvaluation.ok
                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                }`}
              >
                {gpsEvaluation.ok ? 'Fix Active' : gpsEvaluation.reason}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {gpsEvaluation.ok
                ? `${gpsEvaluation.fix.sats} satellites locked (HDOP: ${gpsEvaluation.fix.hdop})`
                : gpsEvaluation.message}
            </p>
          </div>
        </div>

        {/* Demo GPS Simulator Button */}
        <button
          onClick={handleSimulateGPSFix}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-white/10 transition-colors"
          title="Inject fresh GPS satellite fix for testing"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>Simulate GPS Fix</span>
        </button>
      </div>

      {/* Active Trip Dashboard */}
      {activeTrip ? (
        <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] overflow-hidden mb-8">
          <div className="p-5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 bg-white/[0.02]">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-black text-white">
                  {activeTrip.id}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                    activeTrip.status === 'IN_TRANSIT'
                      ? 'bg-blue-500/20 border-blue-400/30 text-blue-300 animate-pulse'
                      : activeTrip.status === 'DRAFT'
                      ? 'bg-slate-700/50 border-white/10 text-slate-300'
                      : 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                  }`}
                >
                  {activeTrip.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                From: <strong className="text-white">{activeTrip.originText}</strong> → To: <strong className="text-white">{activeTrip.destinationMandiName}</strong>
              </p>
            </div>

            {/* Trip Action Buttons */}
            <div className="flex items-center gap-2">
              {activeTrip.status === 'DRAFT' && (
                <>
                  <button
                    onClick={() => setShowScanner(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-colors touch-target"
                  >
                    <QrCode className="w-4 h-4 text-blue-400" />
                    <span>Scan to Load ({activeTrip.bagIds.length})</span>
                  </button>
                  <button
                    onClick={handleStartTrip}
                    disabled={actionLoading || activeTrip.bagIds.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(74,222,128,0.3)] transition-all touch-target"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start Trip</span>
                  </button>
                </>
              )}

              {activeTrip.status === 'IN_TRANSIT' && (
                <button
                  onClick={handleEndTrip}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(239,68,68,0.3)] transition-all touch-target"
                >
                  <Square className="w-4 h-4" />
                  <span>End Trip at Mandi</span>
                </button>
              )}
            </div>
          </div>

          {/* Map Section */}
          <div className="p-4">
            <TripMap
              start={activeTrip.start}
              end={activeTrip.end}
              distanceKm={activeTrip.distanceKmStraight}
              className="h-72 w-full rounded-2xl overflow-hidden shadow-inner border border-white/[0.08]"
            />
          </div>

          {/* Loaded Bags List */}
          <div className="p-5 border-t border-white/[0.08] bg-white/[0.01]">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Loaded Crates in this Trip ({activeTrip.bagIds.length})</span>
            </h3>

            {activeTrip.bagIds.length === 0 ? (
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl text-center text-xs text-slate-400">
                No crates loaded yet. Tap "Scan to Load" to add farmer crates.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {activeTrip.bagIds.map((bId) => (
                  <div
                    key={bId}
                    className="p-3 bg-white/[0.02] rounded-xl border border-white/[0.08] text-xs font-mono font-bold text-white flex items-center justify-between"
                  >
                    <span>{bId}</span>
                    <span className="text-[10px] text-emerald-400 font-sans font-bold">✓ Loaded</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="backdrop-blur-xl bg-white/[0.03] p-8 rounded-3xl border border-white/[0.08] text-center mb-8 shadow-xl">
          <Truck className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h2 className="font-bold text-base text-white">No Active Trips</h2>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            Create a trip from a farm origin to a destination mandi to start loading crates.
          </p>
          <button
            onClick={() => setShowNewTripModal(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(59,130,246,0.35)] transition-all"
          >
            Create New Trip
          </button>
        </div>
      )}

      {/* Trip History Table */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
        <h3 className="font-bold text-sm text-white mb-4">Trip History ({trips.length})</h3>
        {trips.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No past trips recorded.</p>
        ) : (
          <div className="space-y-3">
            {trips.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveTrip(t)}
                className={`p-4 rounded-2xl border text-xs cursor-pointer transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  activeTrip?.id === t.id
                    ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_20px_0_rgba(59,130,246,0.15)]'
                    : 'border-white/[0.08] hover:border-white/20 bg-white/[0.02]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-white">{t.id}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        t.status === 'ENDED'
                          ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                          : 'bg-blue-500/15 border-blue-400/30 text-blue-300'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <p className="text-slate-300">
                    {t.originText} → {t.destinationMandiName}
                  </p>
                </div>

                <div className="text-right text-[11px] text-slate-400">
                  {t.distanceKmStraight && (
                    <span className="font-bold text-white block">
                      {t.distanceKmStraight} km ({t.durationMin || '–'} mins)
                    </span>
                  )}
                  <span>{timeAgoIST(t.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Trip Modal */}
      {showNewTripModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 w-full max-w-sm rounded-3xl p-6 shadow-2xl text-white">
            <h3 className="font-bold text-base text-white mb-4">Create New Delivery Trip</h3>
            <form onSubmit={handleCreateTrip} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Origin (Farm Cluster / Village)
                </label>
                <input
                  type="text"
                  required
                  value={originText}
                  onChange={(e) => setOriginText(e.target.value)}
                  placeholder="e.g. Panruti Farm Cluster"
                  className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Destination Mandi
                </label>
                <select
                  value={selectedMandiId}
                  onChange={(e) => setSelectedMandiId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50"
                >
                  {mandis.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                      {m.name} ({m.area})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewTripModal(false)}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(59,130,246,0.3)] transition-all"
                >
                  Create Trip
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
        onScanSuccess={handleScanLoadBag}
        title="Scan Crate QR to Load"
      />
    </div>
  );
};

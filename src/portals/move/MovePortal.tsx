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
      // Simulate Panruti farm coordinate or Mandi coordinate
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-xs text-gray-500">Loading driver vehicles & delivery trips...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="bg-blue-700 text-white rounded-2xl p-6 shadow-xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-800 rounded-xl">
            <Truck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Move Portal</h1>
              {userProfile?.passId && (
                <span className="text-xs font-mono font-bold bg-blue-800 px-2.5 py-0.5 rounded-full border border-blue-500">
                  {userProfile.passId}
                </span>
              )}
            </div>
            <p className="text-xs text-blue-100 mt-0.5">
              Driver: {userProfile?.firstName} • Vehicle: {vehicle?.regNumber || 'Unregistered'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewTripModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-100 text-blue-900 rounded-xl text-xs font-bold shadow-md transition-colors touch-target"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Trip</span>
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

      {/* Vehicle & GPS Status Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-xl text-charcoal">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-charcoal">
                GPS Node: {vehicle?.gpsUnitId || 'GPS-01'}
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  gpsEvaluation.ok
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {gpsEvaluation.ok ? 'Fix Active' : gpsEvaluation.reason}
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              {gpsEvaluation.ok
                ? `${gpsEvaluation.fix.sats} satellites locked (HDOP: ${gpsEvaluation.fix.hdop})`
                : gpsEvaluation.message}
            </p>
          </div>
        </div>

        {/* Demo GPS Simulator Button */}
        <button
          onClick={handleSimulateGPSFix}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-charcoal rounded-xl text-xs font-bold transition-colors"
          title="Inject fresh GPS satellite fix for testing"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Simulate GPS Fix</span>
        </button>
      </div>

      {/* Active Trip Dashboard */}
      {activeTrip ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8">
          <div className="p-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-sandBg">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-black text-charcoal">
                  {activeTrip.id}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    activeTrip.status === 'IN_TRANSIT'
                      ? 'bg-blue-100 text-blue-800 animate-pulse'
                      : activeTrip.status === 'DRAFT'
                      ? 'bg-gray-200 text-gray-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {activeTrip.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-gray-600">
                From: <strong>{activeTrip.originText}</strong> → To: <strong>{activeTrip.destinationMandiName}</strong>
              </p>
            </div>

            {/* Trip Action Buttons */}
            <div className="flex items-center gap-2">
              {activeTrip.status === 'DRAFT' && (
                <>
                  <button
                    onClick={() => setShowScanner(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-tomato-50 hover:bg-tomato-100 text-tomato-600 rounded-xl text-xs font-bold transition-colors touch-target"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Scan to Load ({activeTrip.bagIds.length})</span>
                  </button>
                  <button
                    onClick={handleStartTrip}
                    disabled={actionLoading || activeTrip.bagIds.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold shadow transition-colors touch-target"
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold shadow transition-colors touch-target"
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
              className="h-72 w-full rounded-xl overflow-hidden shadow-inner border border-gray-200"
            />
          </div>

          {/* Loaded Bags List */}
          <div className="p-5 border-t border-gray-100 bg-white">
            <h3 className="font-bold text-xs uppercase tracking-wider text-gray-600 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>Loaded Crates in this Trip ({activeTrip.bagIds.length})</span>
            </h3>

            {activeTrip.bagIds.length === 0 ? (
              <div className="p-4 bg-gray-50 rounded-xl text-center text-xs text-gray-400">
                No crates loaded yet. Tap "Scan to Load" to add farmer crates.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {activeTrip.bagIds.map((bId) => (
                  <div
                    key={bId}
                    className="p-3 bg-sandBg rounded-xl border border-gray-200 text-xs font-mono font-bold text-charcoal flex items-center justify-between"
                  >
                    <span>{bId}</span>
                    <span className="text-[10px] text-emerald-600 font-sans">✓ Loaded</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center mb-8">
          <Truck className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="font-bold text-base text-charcoal">No Active Trips</h2>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Create a trip from a farm origin to a destination mandi to start loading crates.
          </p>
          <button
            onClick={() => setShowNewTripModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow"
          >
            Create New Trip
          </button>
        </div>
      )}

      {/* Trip History Table */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
        <h3 className="font-bold text-sm text-charcoal mb-4">Trip History ({trips.length})</h3>
        {trips.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No past trips recorded.</p>
        ) : (
          <div className="space-y-3">
            {trips.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveTrip(t)}
                className={`p-4 rounded-xl border text-xs cursor-pointer transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  activeTrip?.id === t.id
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-charcoal">{t.id}</span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        t.status === 'ENDED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <p className="text-gray-600">
                    {t.originText} → {t.destinationMandiName}
                  </p>
                </div>

                <div className="text-right text-[11px] text-gray-500">
                  {t.distanceKmStraight && (
                    <span className="font-bold text-charcoal block">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-base text-charcoal mb-4">Create New Delivery Trip</h3>
            <form onSubmit={handleCreateTrip} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Origin (Farm Cluster / Village)
                </label>
                <input
                  type="text"
                  required
                  value={originText}
                  onChange={(e) => setOriginText(e.target.value)}
                  placeholder="e.g. Panruti Farm Cluster"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Destination Mandi
                </label>
                <select
                  value={selectedMandiId}
                  onChange={(e) => setSelectedMandiId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                >
                  {mandis.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.area})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewTripModal(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow"
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

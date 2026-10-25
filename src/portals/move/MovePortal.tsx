import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  setDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
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
import { UserSettingsModal } from '../../components/UserSettingsModal';
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
  Settings,
  Plus,
  Edit2,
  Trash2,
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
  lat?: number;
  lng?: number;
}

interface Trip {
  id: string;
  driverUid: string;
  vehicleId: string;
  gpsUnitId?: string | null;
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
  const { userProfile, currentUser, isOwner } = useAuth();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [mandis, setMandis] = useState<Mandi[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Registered Farms from Farmers
  const [registeredFarms, setRegisteredFarms] = useState<
    Array<{ id: string; name: string; village: string; district?: string }>
  >([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [availableBags, setAvailableBags] = useState<
    Array<{ id: string; weightKg: number; farmerFirstName: string; village: string; pieces: number }>
  >([]);
  const [pendingApprovalBags, setPendingApprovalBags] = useState<
    Array<{ id: string; weightKg: number; farmerFirstName: string; village: string; pieces: number }>
  >([]);

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [originText, setOriginText] = useState('');
  const [selectedMandiId, setSelectedMandiId] = useState('');
  const [selectedTripVehicleId, setSelectedTripVehicleId] = useState('');

  // New Vehicle form state
  const [newRegNumber, setNewRegNumber] = useState('');
  const [newVehicleType, setNewVehicleType] = useState('Pickup Truck');
  const [newCapacityKg, setNewCapacityKg] = useState('1000');

  // Scanner Modal
  const [showScanner, setShowScanner] = useState(false);

  // Live Hardware GPS Status
  const [gpsUnitData, setGpsUnitData] = useState<GPSUnitData | null>(null);

  // Vehicle Management State
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  // Real-time listener for Vehicle GPS hardware unit
  useEffect(() => {
    if (!selectedVehicle?.gpsUnitId) {
      setGpsUnitData(null);
      return;
    }
    const unsubGps = onSnapshot(doc(db, 'gpsUnits', selectedVehicle.gpsUnitId), (snap) => {
      if (snap.exists()) {
        setGpsUnitData(snap.data() as GPSUnitData);
      } else {
        setGpsUnitData(null);
      }
    });
    return () => unsubGps();
  }, [selectedVehicle?.gpsUnitId]);

  const loadMoveData = async () => {
    // Kept as manual refresh trigger if needed
    setLoading(true);
    setTimeout(() => setLoading(false), 300);
  };

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);

    // 1. Fetch ALL Vehicles for Driver (Driver can hold more than 1 vehicle)
    const vQ = isOwner
      ? collection(db, 'vehicles')
      : query(collection(db, 'vehicles'), where('driverUid', '==', currentUser.uid));
    const unsubVehicles = onSnapshot(vQ, (snap) => {
      const vList: Vehicle[] = [];
      snap.forEach((d) => vList.push({ id: d.id, ...d.data() } as Vehicle));
      setVehicles(vList);
      setSelectedVehicle((prev) => {
        if (!prev) return vList[0] || null;
        return vList.find((v) => v.id === prev.id) || vList[0] || null;
      });
      if (vList.length > 0 && !selectedTripVehicleId) {
        setSelectedTripVehicleId(vList[0].id);
      }
    });

    // 2. Fetch Mandis
    const unsubMandis = onSnapshot(collection(db, 'mandis'), (snap) => {
      const mList: Mandi[] = [];
      snap.forEach((d) => mList.push({ id: d.id, ...d.data() } as Mandi));
      setMandis(mList);
      if (mList.length > 0 && !selectedMandiId) {
        setSelectedMandiId(mList[0].id);
      }
    });

    // 3. Fetch Registered Farms added by Farmers from fields collection
    const unsubFarms = onSnapshot(collection(db, 'fields'), (snap) => {
      const fList: Array<{ id: string; name: string; village: string; district?: string }> = [];
      snap.forEach((d) => fList.push({ id: d.id, ...d.data() } as any));
      setRegisteredFarms(fList);
      if (fList.length > 0 && !selectedFarmId) {
        setSelectedFarmId(fList[0].id);
        setOriginText(`${fList[0].name} (${fList[0].village})`);
      }
    });

    // 4. Fetch Driver Trips
    const tQ = isOwner
      ? collection(db, 'trips')
      : query(collection(db, 'trips'), where('driverUid', '==', currentUser.uid));
    const unsubTrips = onSnapshot(tQ, (snap) => {
      const tList: Trip[] = [];
      snap.forEach((d) => tList.push({ id: d.id, ...d.data() } as Trip));
      tList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTrips(tList);

      const ongoing = tList.find((t) => t.status === 'IN_TRANSIT' || t.status === 'DRAFT');
      setActiveTrip(ongoing || tList[0] || null);
      setLoading(false);
    });

    // 5. Fetch Bags ready for pickup & awaiting farmer approval
    const bQ = collection(db, 'bags');
    const unsubBags = onSnapshot(bQ, (snap) => {
      const avail: Array<{ id: string; weightKg: number; farmerFirstName: string; village: string; pieces: number }> = [];
      const pending: Array<{ id: string; weightKg: number; farmerFirstName: string; village: string; pieces: number }> = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status === 'CREATED') {
          avail.push({ id: d.id, ...data } as any);
        } else if (data.status === 'PENDING_PICKUP' && data.pendingPickup?.driverUid === currentUser.uid) {
          pending.push({ id: d.id, ...data } as any);
        }
      });
      setAvailableBags(avail);
      setPendingApprovalBags(pending);
    });

    return () => {
      unsubVehicles();
      unsubMandis();
      unsubFarms();
      unsubTrips();
      unsubBags();
    };
  }, [currentUser, isOwner]);

  // Quick Add Vehicle
  const handleQuickAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newRegNumber.trim()) return;

    try {
      const vehicleId = newRegNumber.replace(/\s+/g, '').toUpperCase();
      const newVeh = {
        driverUid: currentUser.uid,
        regNumber: newRegNumber.trim().toUpperCase(),
        vehicleType: newVehicleType,
        capacityKg: Number(newCapacityKg) || 1000,
        status: 'PENDING_GPS',
        gpsUnitId: null,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'vehicles', vehicleId), newVeh);
      setNewRegNumber('');
      setShowAddVehicleModal(false);
      setSuccessMsg(`Vehicle "${newVeh.regNumber}" added successfully!`);
      await loadMoveData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to add vehicle.');
    }
  };

  // Update Vehicle
  const handleUpdateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editingVehicle || !editingVehicle.regNumber.trim()) return;

    try {
      await updateDoc(doc(db, 'vehicles', editingVehicle.id), {
        regNumber: editingVehicle.regNumber.trim().toUpperCase(),
        vehicleType: editingVehicle.vehicleType,
        capacityKg: Number(editingVehicle.capacityKg) || 1000,
        updatedAt: serverTimestamp(),
      });

      setVehicles((prev) =>
        prev.map((v) => (v.id === editingVehicle.id ? editingVehicle : v))
      );
      if (selectedVehicle?.id === editingVehicle.id) {
        setSelectedVehicle(editingVehicle);
      }
      setEditingVehicle(null);
      setSuccessMsg(`Vehicle "${editingVehicle.regNumber.toUpperCase()}" updated successfully!`);
      await loadMoveData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to update vehicle.');
    }
  };

  // Delete Vehicle
  const handleDeleteVehicle = async (vehicleId: string, reg: string) => {
    if (!window.confirm(`Are you sure you want to delete vehicle "${reg}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'vehicles', vehicleId));
      setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
      if (selectedVehicle?.id === vehicleId) {
        const remaining = vehicles.filter((v) => v.id !== vehicleId);
        setSelectedVehicle(remaining.length > 0 ? remaining[0] : null);
      }
      setSuccessMsg(`Vehicle "${reg}" deleted successfully!`);
      await loadMoveData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to delete vehicle.');
    }
  };

  // Create New Trip
  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    const tripVeh = vehicles.find((v) => v.id === selectedTripVehicleId) || selectedVehicle;
    if (!currentUser || !tripVeh) {
      setError('You must have a registered vehicle selected to create trips.');
      return;
    }

    try {
      const tripId = generateTripId();
      const mandi = mandis.find((m) => m.id === selectedMandiId);

      const newTripData: Trip = {
        id: tripId,
        driverUid: currentUser.uid,
        vehicleId: tripVeh.id,
        gpsUnitId: tripVeh.gpsUnitId || null,
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

  // Scan & Load Crate (with Farmer Handover Approval Gate)
  const handleScanLoadBag = async (scannedValue: string) => {
    if (!activeTrip || !currentUser) {
      setError('Please select or create an active trip before scanning crates.');
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
        throw new Error(`Crate "${bagId}" not found in system.`);
      }

      const bagData = bagSnap.data();
      if (bagData.status === 'LOADED' && activeTrip.bagIds.includes(bagId)) {
        throw new Error(`Crate ${bagId} is already approved and loaded on this trip.`);
      }

      if (bagData.status === 'PENDING_PICKUP') {
        throw new Error(`Crate ${bagId} is already awaiting farmer handover approval.`);
      }

      if (bagData.status !== 'CREATED' && bagData.status !== 'LOADED') {
        throw new Error(
          `Crate cannot be loaded. Current status is ${bagData.status} (only freshly harvested CREATED crates can be transported).`
        );
      }

      if (bagData.status === 'CREATED') {
        const batch = writeBatch(db);
        batch.update(bagRef, {
          status: 'PENDING_PICKUP',
          pendingPickup: {
            driverUid: currentUser.uid,
            driverName: userProfile?.fullName || userProfile?.firstName || 'Transport Driver',
            driverPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'FP-D-DRIVER'),
            driverPhone: userProfile?.phone || '',
            vehicleId: selectedVehicle?.id || '',
            vehicleReg: selectedVehicle?.regNumber || 'Vehicle',
            tripId: activeTrip.id,
            requestedAt: serverTimestamp(),
          },
          tripId: activeTrip.id,
          updatedAt: serverTimestamp(),
        });

        const eventRef = doc(collection(db, 'events'));
        batch.set(eventRef, {
          bagId,
          tripId: activeTrip.id,
          type: 'PICKUP_REQUESTED',
          byUid: currentUser.uid,
          byRole: 'driver',
          byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'FP-D-DRIVER'),
          at: serverTimestamp(),
          place: { text: activeTrip.originText },
          note: `Driver requested transport pickup for vehicle ${selectedVehicle?.regNumber || 'Truck'}. Awaiting farmer handover approval.`,
        });

        await batch.commit();
        setSuccessMsg(`Crate ${bagId} scanned! Handover request sent to farmer. Waiting for farmer approval in their Grow Portal.`);
        return;
      }

      // If already LOADED (approved by farmer)
      if (bagData.status === 'LOADED' && !activeTrip.bagIds.includes(bagId)) {
        const batch = writeBatch(db);
        const updatedBagIds = [...activeTrip.bagIds, bagId];
        batch.update(doc(db, 'trips', activeTrip.id), {
          bagIds: updatedBagIds,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        setSuccessMsg(`Crate ${bagId} added to active trip.`);
      }
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
      const gpsId = activeTrip.gpsUnitId || selectedVehicle?.gpsUnitId;
      if (!gpsId) {
        setError('No GPS tracker is linked to this vehicle. Please pair a GPS hardware unit in the Control Portal.');
        setActionLoading(false);
        return;
      }
      const gpsSnap = await getDoc(doc(db, 'gpsUnits', gpsId));
      const gpsData = gpsSnap.data() as GPSUnitData;

      let evalResult = evaluateFix(gpsData);
      if (!evalResult.ok) {
        if (import.meta.env.VITE_ALLOW_SIMULATED_GPS !== 'true') {
          setError(`Cannot start trip without live GPS fix: ${evalResult.message}`);
          setActionLoading(false);
          return;
        }
        // Auto-seed valid origin fix so trip starts cleanly
        const originFix: GPSFix = {
          lat: 11.748,
          lng: 79.7714,
          speedKmph: 24.5,
          sats: 8,
          hdop: 1.1,
          valid: true,
          fixAt: new Date().toISOString(),
          simulated: true,
        };
        await setDoc(doc(db, 'gpsUnits', gpsId), {
          vehicleId: selectedVehicle?.id || 'VEHICLE',
          latest: originFix,
          receivedAt: new Date().toISOString(),
        }, { merge: true });
        evalResult = { ok: true, fix: originFix };
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
          byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
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
      const gpsId = activeTrip.gpsUnitId || selectedVehicle?.gpsUnitId;
      if (!gpsId) {
        setError('No GPS tracker is linked to this vehicle. Please pair a GPS hardware unit in the Control Portal.');
        setActionLoading(false);
        return;
      }
      const gpsSnap = await getDoc(doc(db, 'gpsUnits', gpsId));
      const gpsData = gpsSnap.data() as GPSUnitData;

      let evalResult = evaluateFix(gpsData);
      if (!evalResult.ok) {
        if (import.meta.env.VITE_ALLOW_SIMULATED_GPS !== 'true') {
          setError(`Cannot complete trip without live GPS fix: ${evalResult.message}`);
          setActionLoading(false);
          return;
        }
        // Auto-seed destination fix
        const destFix: GPSFix = {
          lat: 11.9338,
          lng: 79.8297,
          speedKmph: 0.0,
          sats: 9,
          hdop: 0.9,
          valid: true,
          fixAt: new Date().toISOString(),
          simulated: true,
        };
        await setDoc(doc(db, 'gpsUnits', gpsId), {
          vehicleId: selectedVehicle?.id || 'VEHICLE',
          latest: destFix,
          receivedAt: new Date().toISOString(),
        }, { merge: true });
        evalResult = { ok: true, fix: destFix };
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
          byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner - Blue Gradient Glass */}
      <div className="bg-gradient-to-r from-blue-900/60 to-blue-800/40 backdrop-blur-xl border border-blue-500/20 rounded-3xl p-6 shadow-2xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/20 border border-blue-500/30 rounded-2xl shadow-[0_0_20px_0_rgba(56,189,248,0.2)]">
            <Truck className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Move Portal</h1>
              {(userProfile?.fullName || userProfile?.firstName) && (
                <span className="text-xs font-semibold bg-blue-950/60 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-500/40">
                  {userProfile.fullName || userProfile.firstName}
                </span>
              )}
            </div>
            <p className="text-xs text-blue-200/80 mt-0.5">
              Driver: <strong className="text-white">{userProfile?.fullName || userProfile?.firstName || 'Driver'}</strong>
              {userProfile?.phone && <span> • 📞 {userProfile.phone}</span>}
              {selectedVehicle ? (
                <span> • Active: <strong className="text-white font-mono">{selectedVehicle.regNumber}</strong></span>
              ) : (
                <span> • <span className="text-amber-300 font-semibold">No vehicle registered</span></span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Vehicle Switcher if multiple vehicles */}
          {vehicles.length > 1 && (
            <select
              value={selectedVehicle?.id || ''}
              onChange={(e) => {
                const chosen = vehicles.find((v) => v.id === e.target.value);
                if (chosen) setSelectedVehicle(chosen);
              }}
              className="px-3 py-2 bg-slate-900/90 border border-blue-400/30 rounded-full text-xs font-mono text-white focus:outline-none"
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.regNumber} ({v.vehicleType})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowAddVehicleModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-full text-xs font-semibold transition-colors"
            title="Register Another Vehicle"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Vehicle</span>
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
                GPS Node: {selectedVehicle?.gpsUnitId || 'Unlinked'}
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
      </div>

      {/* Registered Vehicles Management Section - Driver Direct Control */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 border border-blue-500/30 rounded-xl text-blue-400">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">My Registered Transport Vehicles</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  {vehicles.length} {vehicles.length === 1 ? 'Vehicle' : 'Vehicles'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Drivers have direct control to register, edit payload specs, or delete transport vehicles
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddVehicleModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl text-xs font-bold shadow-md transition-all touch-target"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Register New Vehicle</span>
            </button>
          </div>
        </div>

        {/* Vehicles Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3">
          {vehicles.length === 0 ? (
            <div className="col-span-full p-6 text-center text-xs text-slate-400">
              No vehicles registered yet. Click &ldquo;Register New Vehicle&rdquo; to add your transport truck or van.
            </div>
          ) : (
            vehicles.map((v) => (
              <div
                key={v.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  selectedVehicle?.id === v.id
                    ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                    : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white truncate flex items-center gap-1.5 font-mono">
                      <span>{v.regNumber}</span>
                      {selectedVehicle?.id === v.id && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-sans">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      🚚 {v.vehicleType} • {v.capacityKg} kg capacity
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingVehicle(v)}
                      className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/10 text-xs transition-colors"
                      title="Edit Vehicle Specs"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVehicle(v.id, v.regNumber)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 text-xs transition-colors"
                      title="Delete Vehicle"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVehicle(v);
                      setSelectedTripVehicleId(v.id);
                    }}
                    className={`font-semibold transition-colors ${
                      selectedVehicle?.id === v.id
                        ? 'text-blue-400 cursor-default'
                        : 'text-slate-400 hover:text-white underline'
                    }`}
                  >
                    {selectedVehicle?.id === v.id ? '✓ Selected for Trips' : 'Set as Active'}
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">GPS: {v.gpsUnitId || 'Unlinked'}</span>
                </div>
              </div>
            ))
          )}
        </div>
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
                {(activeTrip.start?.simulated || activeTrip.end?.simulated) && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    <span>Simulated GPS (no live fix)</span>
                  </span>
                )}
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

          {/* Simulated GPS Warning Banner */}
          {(activeTrip.start?.simulated || activeTrip.end?.simulated) && (
            <div className="mx-4 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-semibold">Simulated GPS (no live fix)</span>
            </div>
          )}

          {/* Map Section */}
          <div className="p-4">
            <TripMap
              start={activeTrip.start}
              end={activeTrip.end}
              current={gpsEvaluation.ok ? gpsEvaluation.fix : (gpsUnitData?.latest?.valid && gpsUnitData.latest.lat ? gpsUnitData.latest : null)}
              destination={(() => {
                const mandi = mandis.find((m) => m.id === activeTrip.destinationMandiId);
                return mandi ? { lat: mandi.lat, lng: mandi.lng, name: `${mandi.name} (${mandi.area})` } : null;
              })()}
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
                No crates loaded yet. Tap &ldquo;Scan to Load&rdquo; or load from ready farm crates below.
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

            {/* Crates Awaiting Farmer Handover Approval */}
            {activeTrip.status === 'DRAFT' && pendingApprovalBags.length > 0 && (
              <div className="mt-4 pt-4 border-t border-amber-500/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    <span>Awaiting Farmer Handover Approval ({pendingApprovalBags.length})</span>
                  </span>
                  <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    Live Syncing
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {pendingApprovalBags.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 text-xs font-mono font-bold text-white flex items-center justify-between"
                    >
                      <div>
                        <div>{b.id}</div>
                        <div className="text-[10px] text-amber-200/70 font-sans font-normal mt-0.5">
                          {b.weightKg} kg • {b.farmerFirstName}
                        </div>
                      </div>
                      <span className="text-[10px] text-amber-300 font-sans font-bold bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                        ⏳ Pending Approval
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ready Farmer Crates for 1-click pickup */}
            {activeTrip.status === 'DRAFT' && availableBags.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Farmer Crates Ready for Pickup ({availableBags.filter((b) => !activeTrip.bagIds.includes(b.id)).length})</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Tap to load without camera</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {availableBags
                    .filter((b) => !activeTrip.bagIds.includes(b.id))
                    .map((b) => (
                      <div
                        key={b.id}
                        className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs font-bold text-white truncate">{b.id}</div>
                          <div className="text-[10px] text-slate-300">
                            {b.weightKg} kg • {b.farmerFirstName} ({b.village})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleScanLoadBag(b.id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors shrink-0"
                        >
                          Load
                        </button>
                      </div>
                    ))}
                </div>
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
                    {(t.start?.simulated || t.end?.simulated) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        <span>Simulated GPS (no live fix)</span>
                      </span>
                    )}
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
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setShowNewTripModal(false)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-4">Create New Delivery Trip</h3>
            <form onSubmit={handleCreateTrip} className="space-y-3">
              {/* Vehicle selector */}
              {vehicles.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Transport Vehicle
                  </label>
                  <select
                    value={selectedTripVehicleId || selectedVehicle?.id || ''}
                    onChange={(e) => setSelectedTripVehicleId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50 font-mono"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                        {v.regNumber} ({v.vehicleType} • {v.capacityKg} kg)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Origin Farm Dropdown from Registered Farms */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Origin Farm (Harvest Location)
                </label>
                {registeredFarms.length > 0 ? (
                  <>
                    <select
                      value={selectedFarmId}
                      onChange={(e) => {
                        const fId = e.target.value;
                        setSelectedFarmId(fId);
                        if (fId === 'custom') {
                          setOriginText('');
                        } else {
                          const farm = registeredFarms.find((f) => f.id === fId);
                          if (farm) setOriginText(`${farm.name} (${farm.village})`);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50 mb-2"
                    >
                      {registeredFarms.map((f) => (
                        <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                          {f.name} — {f.village}{f.district ? ` (${f.district})` : ''}
                        </option>
                      ))}
                      <option value="custom" className="bg-slate-900 text-amber-300">
                        + Other / Custom Location
                      </option>
                    </select>

                    {selectedFarmId === 'custom' && (
                      <input
                        type="text"
                        required
                        value={originText}
                        onChange={(e) => setOriginText(e.target.value)}
                        placeholder="Type custom origin / farm location..."
                        className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                      />
                    )}
                  </>
                ) : (
                  <div>
                    <input
                      type="text"
                      required
                      value={originText}
                      onChange={(e) => setOriginText(e.target.value)}
                      placeholder="Enter farm harvest location..."
                      className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      No farm fields registered yet. Farmer can register farm fields in the Grow Portal.
                    </p>
                  </div>
                )}
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
        </div>
      )}

      {/* Quick Add Vehicle Modal */}
      {showAddVehicleModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setShowAddVehicleModal(false)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-1">Register Transport Vehicle</h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Add another vehicle to your driver fleet profile
              </p>
              <form onSubmit={handleQuickAddVehicle} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    required
                    value={newRegNumber}
                    onChange={(e) => setNewRegNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. TN 31 AB 1234"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white font-mono uppercase focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Vehicle Type
                  </label>
                  <select
                    value={newVehicleType}
                    onChange={(e) => setNewVehicleType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="Pickup Truck">Pickup Truck</option>
                    <option value="LCV Mini Truck">LCV Mini Truck</option>
                    <option value="Heavy Truck">Heavy Truck</option>
                    <option value="Three Wheeler">Three Wheeler</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Payload Capacity (kg)
                  </label>
                  <input
                    type="number"
                    value={newCapacityKg}
                    onChange={(e) => setNewCapacityKg(e.target.value)}
                    placeholder="1000"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddVehicleModal(false)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl text-xs font-bold shadow transition-all"
                  >
                    Save Vehicle
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Vehicle Modal */}
      {editingVehicle && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setEditingVehicle(null)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-1">Edit Vehicle Details</h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Update registration number or vehicle specs
              </p>
              <form onSubmit={handleUpdateVehicle} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Registration Number
                  </label>
                  <input
                    type="text"
                    required
                    value={editingVehicle.regNumber}
                    onChange={(e) =>
                      setEditingVehicle({ ...editingVehicle, regNumber: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white font-mono uppercase focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Vehicle Type
                  </label>
                  <select
                    value={editingVehicle.vehicleType}
                    onChange={(e) =>
                      setEditingVehicle({ ...editingVehicle, vehicleType: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="Pickup Truck">Pickup Truck</option>
                    <option value="LCV Mini Truck">LCV Mini Truck</option>
                    <option value="Heavy Truck">Heavy Truck</option>
                    <option value="Three Wheeler">Three Wheeler</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Payload Capacity (kg)
                  </label>
                  <input
                    type="number"
                    value={editingVehicle.capacityKg}
                    onChange={(e) =>
                      setEditingVehicle({ ...editingVehicle, capacityKg: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingVehicle(null)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-xl text-xs font-bold shadow transition-all"
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
        onScanSuccess={handleScanLoadBag}
        title="Scan Crate QR to Load"
      />

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onProfileUpdated={loadMoveData}
        portalRole="driver"
      />
    </div>
  );
};

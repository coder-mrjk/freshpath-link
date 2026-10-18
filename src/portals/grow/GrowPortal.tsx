import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { generateBagId } from '../../lib/bagId';
import {
  calculateTotalPrice,
  formatRupees,
  GradePricing,
  DEFAULT_GRADE_PRICING,
  getPriceForGrade,
} from '../../lib/price';
import { formatIST, timeAgoIST } from '../../lib/time';
import { calculateFreshness } from '../../lib/freshness';
import { initRemoteConfig, getRemoteNumber } from '../../lib/remoteConfig';
import { showLocalNotification } from '../../lib/notifications';
import { UserSettingsModal } from '../../components/UserSettingsModal';
import {
  Sprout,
  PlusCircle,
  Printer,
  Scale,
  AlertCircle,
  Thermometer,
  Star,
  ExternalLink,
  Users,
  CheckCircle,
  Settings,
  Lock,
  Edit2,
  Trash2,
  Truck,
} from 'lucide-react';

interface Field {
  id: string;
  name: string;
  village: string;
  district?: string;
}

interface Bag {
  id: string;
  farmerFirstName: string;
  fieldName: string;
  village: string;
  weightKg: number;
  pieces: number;
  sizeGrade?: string;
  totalPrice: number;
  status: string;
  harvestAt: any;
  createdAt: any;
  benefitsNote?: string;
  tripId?: string;
  storageUnitId?: string;
  mandiId?: string;
  shopId?: string;
  handlerUids?: string[];
  pendingPickup?: {
    driverUid: string;
    driverName: string;
    driverPassId?: string;
    driverPhone?: string;
    vehicleId?: string;
    vehicleReg?: string;
    tripId?: string;
    requestedAt?: any;
  };
  soldTo?: {
    consumerUid: string;
    consumerPassId: string;
    firstName: string;
  };
  rating?: {
    stars: number;
    comment?: string;
    at: any;
  };
}

interface StorageUnitInfo {
  tempC?: number;
  humidityPct?: number;
  name?: string;
}

export const GrowPortal: React.FC = () => {
  const { userProfile, currentUser, isOwner } = useAuth();

  const [bags, setBags] = useState<Bag[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('');
  const [ratePerKg, setRatePerKg] = useState<number>(60);
  const [gradePrices, setGradePrices] = useState<GradePricing>(DEFAULT_GRADE_PRICING);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Storage telemetry map (storageUnitId -> StorageUnitInfo)
  const [storageMap, setStorageMap] = useState<Record<string, StorageUnitInfo>>({});

  // Form State
  const [showHarvestModal, setShowHarvestModal] = useState(false);
  const [weightKg, setWeightKg] = useState<number>(5);
  const [pieces, setPieces] = useState<number>(45);
  const [sizeGrade, setSizeGrade] = useState<string>('Grade A');
  const [benefitsNote, setBenefitsNote] = useState<string>('Naturally ripened Country Tomatoes');

  const handleGradeChange = (newGrade: string) => {
    setSizeGrade(newGrade);
    const updatedRate = getPriceForGrade(newGrade, gradePrices);
    setRatePerKg(updatedRate);
  };

  // Filter State
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Field Management Modals
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showManageFieldsModal, setShowManageFieldsModal] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldVillage, setNewFieldVillage] = useState(userProfile?.addressText || '');
  const [newFieldDistrict, setNewFieldDistrict] = useState('');

  const loadGrowData = async () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 300);
  };

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);

    // 1. Fetch Fields real-time
    const fieldsQ = query(collection(db, 'fields'), where('farmerUid', '==', currentUser.uid));
    const unsubFields = onSnapshot(fieldsQ, (snap) => {
      const fieldList: Field[] = [];
      snap.forEach((d) => fieldList.push({ id: d.id, ...d.data() } as Field));
      setFields(fieldList);
      setSelectedFieldId((prev) => {
        if (!prev) return fieldList[0]?.id || '';
        return fieldList.some((f) => f.id === prev) ? prev : fieldList[0]?.id || '';
      });
    });

    // 2. Fetch Bags real-time
    const bagsQ = query(collection(db, 'bags'), where('farmerUid', '==', currentUser.uid));
    const unsubBags = onSnapshot(bagsQ, async (snap) => {
      const bagList: Bag[] = [];
      const unitIdsToFetch = new Set<string>();

      snap.forEach((d) => {
        const data = { id: d.id, ...d.data() } as Bag;
        bagList.push(data);
        if (data.storageUnitId) {
          unitIdsToFetch.add(data.storageUnitId);
        }
      });

      bagList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setBags(bagList);
      setLoading(false);

      // Check if new handover requests arrived and trigger web notification
      const pendingHandover = bagList.find((b) => b.status === 'PENDING_PICKUP');
      if (pendingHandover) {
        showLocalNotification('🚚 Transport Handover Request', {
          body: `Vehicle ${pendingHandover.pendingPickup?.vehicleReg || 'Truck'} requested to load crate ${pendingHandover.id}. Tap to approve.`,
          tag: `handover-${pendingHandover.id}`,
        });
      }

      // Fetch Mandi / Storage live readings
      const newStorageMap: Record<string, StorageUnitInfo> = {};
      for (const unitId of Array.from(unitIdsToFetch)) {
        try {
          const uSnap = await getDoc(doc(db, 'mandis', unitId));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            newStorageMap[unitId] = {
              tempC: uData.currentTemp ?? uData.latest?.tempC,
              humidityPct: uData.currentHumidity ?? uData.latest?.humidityPct,
              name: uData.name,
            };
          } else {
            const legacySnap = await getDoc(doc(db, 'storageUnits', unitId));
            if (legacySnap.exists()) {
              const lData = legacySnap.data();
              newStorageMap[unitId] = {
                tempC: lData.currentTemp ?? lData.latest?.tempC,
                humidityPct: lData.currentHumidity ?? lData.latest?.humidityPct,
                name: lData.name,
              };
            }
          }
        } catch {
          // ignore
        }
      }
      setStorageMap(newStorageMap);
    });

    // 3. Fetch Pricing Config (Remote Config 0-cost + Firestore fallback)
    const loadPricing = async () => {
      try {
        await initRemoteConfig();
        const rcPricing: GradePricing = {
          gradeAPlus: getRemoteNumber('regulated_price_grade_a_plus') || DEFAULT_GRADE_PRICING.gradeAPlus,
          gradeA: getRemoteNumber('regulated_price_grade_a') || DEFAULT_GRADE_PRICING.gradeA,
          gradeB: getRemoteNumber('regulated_price_grade_b') || DEFAULT_GRADE_PRICING.gradeB,
          gradeC: getRemoteNumber('regulated_price_grade_c') || DEFAULT_GRADE_PRICING.gradeC,
        };

        const pricingSnap = await getDoc(doc(db, 'config', 'pricing'));
        if (pricingSnap.exists()) {
          const p = pricingSnap.data() as GradePricing;
          const loaded: GradePricing = {
            gradeAPlus: p.gradeAPlus ?? rcPricing.gradeAPlus,
            gradeA: p.gradeA ?? rcPricing.gradeA,
            gradeB: p.gradeB ?? rcPricing.gradeB,
            gradeC: p.gradeC ?? rcPricing.gradeC,
          };
          setGradePrices(loaded);
          setRatePerKg(getPriceForGrade(sizeGrade, loaded));
        } else {
          setGradePrices(rcPricing);
          setRatePerKg(getPriceForGrade(sizeGrade, rcPricing));
        }
      } catch (e) {
        console.warn('Failed to load pricing config (using defaults):', e);
      }
    };
    loadPricing();

    return () => {
      unsubFields();
      unsubBags();
    };
  }, [currentUser]);

  // Farmer Handover Approval Handlers
  const handleApproveHandover = async (bag: Bag) => {
    if (!currentUser || !bag.pendingPickup) return;
    setActionLoading(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      const tripId = bag.pendingPickup.tripId;

      // 1. Update Bag to LOADED
      batch.update(doc(db, 'bags', bag.id), {
        status: 'LOADED',
        holderUid: bag.pendingPickup.driverUid,
        handlerUids: Array.from(new Set([...(bag.handlerUids || []), currentUser.uid, bag.pendingPickup.driverUid])),
        updatedAt: serverTimestamp(),
      });

      // 2. Add crate to trip bagIds if tripId exists
      if (tripId) {
        const tripRef = doc(db, 'trips', tripId);
        const tripSnap = await getDoc(tripRef);
        if (tripSnap.exists()) {
          const tripData = tripSnap.data();
          const existingBagIds = tripData.bagIds || [];
          if (!existingBagIds.includes(bag.id)) {
            batch.update(tripRef, {
              bagIds: [...existingBagIds, bag.id],
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      // 3. Append Event: HANDOVER_APPROVED
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        bagId: bag.id,
        tripId: tripId || null,
        type: 'HANDOVER_APPROVED',
        byUid: currentUser.uid,
        byRole: 'farmer',
        byPassId: userProfile?.passId || 'FP-F-VERIFIED',
        at: serverTimestamp(),
        place: { text: bag.village },
        note: `Farmer approved transport handover to driver ${bag.pendingPickup.driverName} (${bag.pendingPickup.vehicleReg || 'Truck'}).`,
      });

      await batch.commit();
      setSuccessMsg(`Crate ${bag.id} handover approved! Crate is now loaded onto driver's transport vehicle.`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to approve handover.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeclineHandover = async (bag: Bag) => {
    if (!currentUser) return;
    setActionLoading(true);
    setError(null);
    try {
      await updateDoc(doc(db, 'bags', bag.id), {
        status: 'CREATED',
        pendingPickup: null,
        updatedAt: serverTimestamp(),
      });
      setSuccessMsg(`Handover for crate ${bag.id} was declined.`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to decline handover.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newFieldName.trim()) return;

    try {
      const docRef = await addDoc(collection(db, 'fields'), {
        farmerUid: currentUser.uid,
        name: newFieldName.trim(),
        village: newFieldVillage.trim() || 'Village',
        district: newFieldDistrict.trim(),
        createdAt: serverTimestamp(),
      });

      setFields((prev) => [
        ...prev,
        {
          id: docRef.id,
          name: newFieldName.trim(),
          village: newFieldVillage.trim(),
          district: newFieldDistrict.trim(),
        },
      ]);
      setSelectedFieldId(docRef.id);
      setShowFieldModal(false);
      setNewFieldName('');
      setSuccessMsg('New field registered successfully!');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to add field.');
    }
  };

  const handleUpdateField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editingField || !editingField.name.trim()) return;

    try {
      await updateDoc(doc(db, 'fields', editingField.id), {
        farmerUid: currentUser.uid,
        name: editingField.name.trim(),
        village: editingField.village.trim() || 'Village',
        district: editingField.district?.trim() || '',
        updatedAt: serverTimestamp(),
      });

      setFields((prev) =>
        prev.map((f) => (f.id === editingField.id ? editingField : f))
      );
      setEditingField(null);
      setSuccessMsg('Farm details updated successfully!');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to update farm details.');
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!window.confirm('Are you sure you want to delete this farm? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'fields', fieldId));
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      if (selectedFieldId === fieldId) {
        const remaining = fields.filter((f) => f.id !== fieldId);
        setSelectedFieldId(remaining.length > 0 ? remaining[0].id : '');
      }
      setSuccessMsg('Farm deleted successfully!');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to delete farm.');
    }
  };

  const handleCreateBag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) return;

    if (!selectedFieldId && fields.length === 0) {
      setError('Please register a farm / field before creating a crate.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const currentField = fields.find((f) => f.id === selectedFieldId) || fields[0];
      const bagId = generateBagId();
      const officialRate = getPriceForGrade(sizeGrade, gradePrices);
      const totalPrice = calculateTotalPrice(weightKg, officialRate);

      const batch = writeBatch(db);

      // 1. Create Bag Document
      const bagRef = doc(db, 'bags', bagId);
      const bagData = {
        product: 'tomato',
        farmerUid: currentUser.uid,
        farmerPassId: userProfile.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
        farmerFirstName: userProfile.firstName || (isOwner ? 'Owner' : 'Farmer'),
        fieldId: currentField?.id || 'default-field',
        fieldName: currentField?.name || 'Main Farm',
        village: currentField?.village || userProfile.addressText || 'Tamil Nadu',
        weightKg: Number(weightKg),
        pieces: Number(pieces),
        sizeGrade,
        benefitsNote: benefitsNote.trim(),
        harvestAt: serverTimestamp(),
        pricePerKg: officialRate,
        totalPrice,
        status: 'CREATED',
        holderUid: currentUser.uid,
        handlerUids: [currentUser.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      batch.set(bagRef, bagData);

      // 2. Append Immutable Event Document
      const eventRef = doc(collection(db, 'events'));
      const eventData = {
        bagId,
        type: 'BAG_CREATED',
        byUid: currentUser.uid,
        byRole: 'farmer',
        byPassId: userProfile.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
        at: serverTimestamp(),
        place: {
          text: `${currentField?.name || 'Farm'}, ${currentField?.village || 'Village'}`,
        },
        note: `Harvested crate: ${weightKg} kg (${pieces} pieces), ${sizeGrade}.`,
      };
      batch.set(eventRef, eventData);

      await batch.commit();

      setShowHarvestModal(false);
      setSuccessMsg(`Crate ${bagId} created! Print QR label to paste on crate.`);
      await loadGrowData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to create crate.');
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics Calculations
  const totalHarvested = bags.length;
  const totalWeight = bags.reduce((acc, b) => acc + (b.weightKg || 0), 0);
  const totalValue = bags.reduce((acc, b) => acc + (b.totalPrice || 0), 0);
  const inMandiCount = bags.filter((b) => b.status === 'IN_STORAGE').length;
  const soldBags = bags.filter((b) => b.status === 'SOLD');
  const soldCount = soldBags.length;

  const ratedBags = bags.filter((b) => b.rating && b.rating.stars);
  const avgRating =
    ratedBags.length > 0
      ? (
          ratedBags.reduce((acc, b) => acc + b.rating!.stars, 0) / ratedBags.length
        ).toFixed(1)
      : null;

  const pendingHandoverBags = bags.filter((b) => b.status === 'PENDING_PICKUP');

  // Filter bags
  const filteredBags = bags.filter((b) => {
    if (filterStatus === 'ALL') return true;
    return b.status === filterStatus;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner - Gradient Glass */}
      <div className="bg-gradient-to-r from-emerald-900/60 to-emerald-800/40 backdrop-blur-xl border border-emerald-500/20 rounded-3xl p-6 shadow-2xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl shadow-[0_0_20px_0_rgba(74,222,128,0.2)]">
            <Sprout className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Grow Portal</h1>
              {(userProfile?.fullName || userProfile?.firstName) && (
                <span className="text-xs font-semibold bg-emerald-950/60 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                  {userProfile.fullName || userProfile.firstName}
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-200/80 mt-0.5">
              Farmer: <strong className="text-white">{userProfile?.fullName || userProfile?.firstName || 'Farmer'}</strong>
              {userProfile?.phone && <span> • 📞 {userProfile.phone}</span>}
              <span> • {userProfile?.addressText || 'Farm Cluster'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase font-bold text-emerald-300/80 tracking-wider block flex items-center justify-end gap-1">
              <Lock className="w-2.5 h-2.5 text-amber-400" />
              <span>Admin Rate</span>
            </span>
            <span className="text-xl font-black text-white">{formatRupees(gradePrices.gradeA)}/kg</span>
          </div>

          <button
            onClick={() => setShowManageFieldsModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 hover:text-white rounded-full text-xs font-bold transition-all shadow-[0_0_12px_rgba(74,222,128,0.2)]"
            title="Manage Registered Farms & Fields"
          >
            <Sprout className="w-3.5 h-3.5 text-emerald-400" />
            <span>Farms ({fields.length})</span>
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
            onClick={() => setShowHarvestModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(74,222,128,0.35)] transition-all touch-target"
          >
            <PlusCircle className="w-4 h-4 text-white" />
            <span>Harvest New Crate</span>
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

      {/* Farmer Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] p-4 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Harvested</div>
          <div className="text-xl font-black text-white mt-1">{totalHarvested} crates</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{totalWeight} kg total</div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] p-4 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Crop Value</div>
          <div className="text-xl font-black text-emerald-400 mt-1">{formatRupees(totalValue)}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">@ ₹{ratePerKg}/kg</div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] p-4 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">In Mandi Storage</div>
          <div className="text-xl font-black text-amber-400 mt-1">{inMandiCount} crates</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Cold room active</div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] p-4 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Crates Sold</div>
          <div className="text-xl font-black text-purple-400 mt-1">{soldCount} crates</div>
          <div className="text-[10px] text-slate-400 mt-0.5">To consumers</div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] p-4 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Consumer Rating</div>
          <div className="text-xl font-black text-amber-400 mt-1 flex items-center gap-1">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <span>{avgRating ? `${avgRating}` : '–'}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {ratedBags.length} verified reviews
          </div>
        </div>
      </div>

      {/* Pending Transport Handover Requests Gate */}
      {pendingHandoverBags.length > 0 && (
        <div className="relative backdrop-blur-xl bg-amber-500/[0.08] rounded-3xl border border-amber-400/40 p-6 shadow-2xl mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-400 border border-amber-500/30">
                <Truck className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-black text-sm text-white flex items-center gap-2">
                  <span>Pending Transport Handover Requests ({pendingHandoverBags.length})</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 border border-amber-400/40">
                    Action Required
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  A transport driver has scanned these crates. Review driver credentials and approve before crates leave your farm.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingHandoverBags.map((bag) => (
              <div
                key={bag.id}
                className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 flex flex-col justify-between gap-3 shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-white text-sm">{bag.id}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Awaiting Farmer Approval
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 mt-2 space-y-1">
                    <div>
                      <strong className="text-white">Driver: </strong>
                      {bag.pendingPickup?.driverName || 'Driver'} ({bag.pendingPickup?.driverPassId || 'FP-D-DRIVER'})
                    </div>
                    <div>
                      <strong className="text-white">Vehicle: </strong>
                      <span className="font-mono font-bold text-sky-300">{bag.pendingPickup?.vehicleReg || 'Transport Truck'}</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      {bag.weightKg} kg • {bag.pieces} tomatoes • {bag.fieldName}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => handleDeclineHandover(bag)}
                    disabled={actionLoading}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    ✕ Decline
                  </button>
                  <button
                    onClick={() => handleApproveHandover(bag)}
                    disabled={actionLoading}
                    className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(16,185,129,0.3)] transition-all"
                  >
                    ✓ Approve Handover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registered Farms Management Section - Farmer Direct Control */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Sprout className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">My Registered Farms</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {fields.length} {fields.length === 1 ? 'Farm' : 'Farms'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Farmers have direct control to edit details or delete their cultivation fields
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFieldModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl text-xs font-bold shadow-md transition-all touch-target"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Register New Farm</span>
            </button>
          </div>
        </div>

        {/* Farm Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3">
          {fields.length === 0 ? (
            <div className="col-span-full p-6 text-center text-xs text-slate-400">
              No farms registered yet. Click &ldquo;Register New Farm&rdquo; to add your first cultivation field.
            </div>
          ) : (
            fields.map((f) => (
              <div
                key={f.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  selectedFieldId === f.id
                    ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_15px_rgba(74,222,128,0.15)]'
                    : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                      <span>{f.name}</span>
                      {selectedFieldId === f.id && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      📍 {f.village} {f.district ? `• ${f.district}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingField(f);
                        setShowManageFieldsModal(true);
                      }}
                      className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/10 text-xs transition-colors"
                      title="Edit Farm Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteField(f.id)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 text-xs transition-colors"
                      title="Delete Farm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedFieldId(f.id)}
                    className={`font-semibold transition-colors ${
                      selectedFieldId === f.id
                        ? 'text-emerald-400 cursor-default'
                        : 'text-slate-400 hover:text-white underline'
                    }`}
                  >
                    {selectedFieldId === f.id ? '✓ Selected for Harvest' : 'Set as Current Farm'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4">
        {[
          { key: 'ALL', label: `All Crates (${bags.length})` },
          { key: 'PENDING_PICKUP', label: `Handover Pending (${pendingHandoverBags.length})` },
          { key: 'IN_STORAGE', label: `In Mandi Storage (${inMandiCount})` },
          { key: 'IN_TRANSIT', label: `In Transit (${bags.filter((b) => b.status === 'IN_TRANSIT').length})` },
          { key: 'SOLD', label: `Sold to Buyers (${soldCount})` },
          { key: 'CREATED', label: `Ready for Pickup (${bags.filter((b) => b.status === 'CREATED').length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              filterStatus === tab.key
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white border border-emerald-400/30 shadow-[0_0_20px_0_rgba(74,222,128,0.30)]'
                : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Crates Inventory List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-16 backdrop-blur-xl bg-white/[0.03] rounded-2xl border border-white/[0.08]">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-400">Loading your farm records...</p>
          </div>
        ) : filteredBags.length === 0 ? (
          <div className="backdrop-blur-xl bg-white/[0.03] p-12 rounded-2xl border border-white/[0.08] text-center shadow-xl">
            <Sprout className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h3 className="font-bold text-white text-base">No crates found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              {bags.length === 0
                ? 'Harvest your first crate of tomatoes to generate a QR label.'
                : 'No crates matched this filter.'}
            </p>
            <button
              onClick={() => setShowHarvestModal(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(74,222,128,0.3)] transition-all"
            >
              Harvest New Crate
            </button>
          </div>
        ) : (
          filteredBags.map((bag) => {
            const fresh = calculateFreshness(bag.harvestAt || bag.createdAt);
            const storageInfo = bag.storageUnitId ? storageMap[bag.storageUnitId] : null;

            return (
              <div
                key={bag.id}
                className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] hover:border-emerald-500/40 rounded-2xl p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] hover:shadow-[0_0_25px_0_rgba(74,222,128,0.15)] transition-all duration-300"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">{bag.id}</span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                        bag.status === 'CREATED'
                          ? 'bg-blue-500/15 border-blue-400/30 text-blue-400'
                          : bag.status === 'IN_TRANSIT'
                          ? 'bg-amber-500/15 border-amber-400/30 text-amber-400'
                          : bag.status === 'IN_STORAGE'
                          ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-400'
                          : bag.status === 'SOLD'
                          ? 'bg-purple-500/15 border-purple-400/30 text-purple-400'
                          : 'bg-slate-700/50 border-white/10 text-slate-300'
                      }`}
                    >
                      {bag.status.replace('_', ' ')}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${fresh.colorClass}`}
                    >
                      {fresh.score}% {fresh.label}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="font-black text-base text-emerald-400">
                      {formatRupees(bag.totalPrice)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      {bag.weightKg} kg (~{bag.pieces} pcs)
                    </span>
                  </div>
                </div>

                {/* Body Details */}
                <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div>
                    <span className="font-semibold text-white">Origin Field: </span>
                    {bag.fieldName}, {bag.village} ({bag.sizeGrade || 'Grade A'})
                  </div>
                  <div>
                    <span className="font-semibold text-white">Harvested: </span>
                    {formatIST(bag.harvestAt || bag.createdAt)} ({timeAgoIST(bag.harvestAt || bag.createdAt)})
                  </div>
                </div>

                {/* Live Storage Telemetry Alert for Crates in Mandi */}
                {bag.status === 'IN_STORAGE' && (
                  <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-200 flex items-center justify-between mb-3 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-amber-400" />
                      <span>
                        Preserved in <strong className="text-white">{storageInfo?.name || 'Mandi Cold Room'}</strong>:
                      </span>
                      <span className="font-mono font-bold text-amber-300">
                        {storageInfo?.tempC !== undefined ? `${storageInfo.tempC}°C` : '13.5°C'} (Safe Range: 12°–15°C)
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Protected
                    </span>
                  </div>
                )}

                {/* Sold / Consumer Review Details */}
                {bag.status === 'SOLD' && bag.soldTo && (
                  <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 text-xs text-purple-200 mb-3 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1 font-bold text-purple-200">
                        <Users className="w-3.5 h-3.5 text-purple-400" />
                        Buyer: {bag.soldTo.firstName} ({bag.soldTo.consumerPassId})
                      </span>
                      {bag.rating ? (
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${
                                s <= bag.rating!.stars
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-600'
                              }`}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No review left</span>
                      )}
                    </div>
                    {bag.rating?.comment && (
                      <p className="text-xs text-purple-100 italic mt-1">"{bag.rating.comment}"</p>
                    )}
                  </div>
                )}

                {/* Bottom Actions Bar */}
                <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
                  <Link
                    to={`/b/${bag.id}`}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition-colors"
                  >
                    <span>View Crate Provenance</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>

                  <Link
                    to={`/print/${bag.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-white/10 transition-colors touch-target"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Label</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Customer Verified Reviews & Ratings Ledger */}
      {ratedBags.length > 0 && (
        <div className="mt-8 relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400">
                <Star className="w-5 h-5 fill-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>Customer Verified Reviews & Ratings</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    ★ {avgRating} / 5.0 ({ratedBags.length} reviews)
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Direct customer feedback and quality evaluations received from supermarket counters
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
            {ratedBags.map((bag) => (
              <div
                key={bag.id}
                className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-2xl flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white">{bag.id}</span>
                    <div className="flex items-center gap-0.5 text-amber-400">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= (bag.rating?.stars || 0)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-600'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {bag.rating?.comment && (
                    <p className="text-xs text-amber-100/90 italic mt-2">
                      &ldquo;{bag.rating.comment}&rdquo;
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Buyer: <strong className="text-slate-200">{bag.soldTo?.firstName || 'Verified Customer'}</strong></span>
                  <span>{bag.rating?.at ? formatIST(bag.rating.at) : 'Recently'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Harvest Crate Modal */}
      {showHarvestModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setShowHarvestModal(false)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-lg my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 sm:p-8 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-base text-white">Harvest New Crate</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHarvestModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 text-xs font-bold transition-colors"
                >
                  ✕ Close
                </button>
              </div>

            <form onSubmit={handleCreateBag} className="space-y-4">
              {/* Field Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-300">Field / Farm</label>
                  <div className="flex items-center gap-2">
                    {fields.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowManageFieldsModal(true)}
                        className="text-[11px] font-bold text-slate-300 hover:text-white flex items-center gap-1"
                      >
                        <Edit2 className="w-3 h-3 text-slate-400" />
                        <span>Manage</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowFieldModal(true)}
                      className="text-[11px] font-bold text-emerald-400 hover:underline"
                    >
                      + Add Field
                    </button>
                  </div>
                </div>
                {fields.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowFieldModal(true)}
                    className="w-full py-2.5 px-3 border border-dashed border-white/20 rounded-xl text-xs text-slate-400 hover:border-emerald-500 hover:text-emerald-400 font-semibold"
                  >
                    + Register your first field
                  </button>
                ) : (
                  <select
                    value={selectedFieldId}
                    onChange={(e) => setSelectedFieldId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                  >
                    {fields.map((f) => (
                      <option key={f.id} value={f.id} className="bg-slate-900 text-white">
                        {f.name} ({f.village})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Weight */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Weight (kg)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0.5}
                    max={100}
                    step={0.5}
                    required
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-800/80 border border-white/10 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-emerald-500/50"
                  />
                  <Scale className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                </div>
              </div>

              {/* Estimated Pieces & Grade */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Pieces (~ count)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={pieces}
                    onChange={(e) => setPieces(Number(e.target.value))}
                    className="w-full px-2.5 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Tomato Quality Grade</label>
                  <select
                    value={sizeGrade}
                    onChange={(e) => handleGradeChange(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                  >
                    <option value="Grade A+" className="bg-slate-900 text-purple-300">
                      Grade A+ (Supreme / Export) • ₹{gradePrices.gradeAPlus}/kg
                    </option>
                    <option value="Grade A" className="bg-slate-900 text-emerald-300">
                      Grade A (Wholesale Premium) • ₹{gradePrices.gradeA}/kg
                    </option>
                    <option value="Grade B" className="bg-slate-900 text-amber-300">
                      Grade B (Standard Market) • ₹{gradePrices.gradeB}/kg
                    </option>
                    <option value="Grade C" className="bg-slate-900 text-slate-300">
                      Grade C (Economy / Puree) • ₹{gradePrices.gradeC}/kg
                    </option>
                  </select>
                </div>
              </div>

              {/* Rate Adjustment (Locked to Control Admin) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rate (₹ per kg)</span>
                  </label>
                  <span className="text-[10px] text-amber-300 font-bold bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    Control Admin Mandated
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-slate-800/90 border border-white/10 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-bold text-xs">₹</span>
                    <span className="text-base font-black text-white">{getPriceForGrade(sizeGrade, gradePrices)}</span>
                    <span className="text-xs text-slate-400">/kg</span>
                    <span className="text-[11px] text-emerald-400 font-semibold ml-2">({sizeGrade})</span>
                  </div>
                  <span className="text-[10px] text-slate-400 italic">Fixed rate • Admin governed</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  The rate per kg can only be edited by Control Admin to protect market integrity.
                </p>
              </div>

              {/* Value Calculation */}
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                    Calculated Crate Total
                  </span>
                  <span className="text-xs text-emerald-200">
                    {weightKg} kg × ₹{getPriceForGrade(sizeGrade, gradePrices)}/kg ({sizeGrade})
                  </span>
                </div>
                <span className="text-xl font-black text-emerald-400">
                  {formatRupees(calculateTotalPrice(weightKg, getPriceForGrade(sizeGrade, gradePrices)))}
                </span>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Produce Notes / Benefits
                </label>
                <input
                  type="text"
                  value={benefitsNote}
                  onChange={(e) => setBenefitsNote(e.target.value)}
                  placeholder="e.g. Naturally ripened Country Tomatoes"
                  className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHarvestModal(false)}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-[0_4px_20px_rgba(74,222,128,0.35)] transition-all"
                >
                  {submitting ? 'Generating...' : 'Save & Print QR'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* New Field Modal */}
      {showFieldModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setShowFieldModal(false)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-2xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-4">Register New Field / Farm</h3>
              <form onSubmit={handleCreateField} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Field / Farm Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="e.g. Vadakku Thottam"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Village</label>
                  <input
                    type="text"
                    required
                    value={newFieldVillage}
                    onChange={(e) => setNewFieldVillage(e.target.value)}
                    placeholder="Village"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">District</label>
                  <input
                    type="text"
                    value={newFieldDistrict}
                    onChange={(e) => setNewFieldDistrict(e.target.value)}
                    placeholder="District"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFieldModal(false)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_20px_rgba(74,222,128,0.35)] transition-all"
                  >
                    Save Field
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Manage Fields / Farms Modal */}
      {showManageFieldsModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => {
            setShowManageFieldsModal(false);
            setEditingField(null);
          }}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-lg my-8 transform overflow-hidden rounded-2xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-base text-white">Manage Farms & Fields</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Edit farm details or delete obsolete farms</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowManageFieldsModal(false);
                    setShowFieldModal(true);
                  }}
                  className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 rounded-xl text-xs font-bold border border-emerald-500/30 transition-colors"
                >
                  + Add New
                </button>
              </div>

              {/* Editing Form if a field is actively being edited */}
              {editingField ? (
                <form onSubmit={handleUpdateField} className="space-y-3 p-4 bg-slate-800/80 rounded-xl border border-emerald-500/30 mb-4">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                    Edit Farm Details
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Farm / Field Name</label>
                    <input
                      type="text"
                      required
                      value={editingField.name}
                      onChange={(e) => setEditingField({ ...editingField, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Village</label>
                      <input
                        type="text"
                        required
                        value={editingField.village}
                        onChange={(e) => setEditingField({ ...editingField, village: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">District</label>
                      <input
                        type="text"
                        value={editingField.district || ''}
                        onChange={(e) => setEditingField({ ...editingField, district: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingField(null)}
                      className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl text-xs font-bold shadow-md"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              ) : null}

              {/* List of Farms */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {fields.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No farms registered yet. Click &ldquo;+ Add New&rdquo; to add your first farm.
                  </div>
                ) : (
                  fields.map((f) => (
                    <div
                      key={f.id}
                      className="p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-xl flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white truncate">{f.name}</div>
                        <div className="text-xs text-slate-400">
                          {f.village} {f.district ? `• ${f.district}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingField(f)}
                          className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/10 text-xs transition-colors"
                          title="Edit Farm"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteField(f.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 text-xs transition-colors"
                          title="Delete Farm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 pt-3 border-t border-white/10 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowManageFieldsModal(false);
                    setEditingField(null);
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onProfileUpdated={loadGrowData}
        portalRole="farmer"
      />
    </div>
  );
};

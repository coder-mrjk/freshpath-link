import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
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

  // New Field Modal
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldVillage, setNewFieldVillage] = useState(userProfile?.addressText || '');
  const [newFieldDistrict, setNewFieldDistrict] = useState('');

  const loadGrowData = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Fields
      const fieldsQ = query(collection(db, 'fields'), where('farmerUid', '==', currentUser.uid));
      const fieldSnap = await getDocs(fieldsQ);
      const fieldList: Field[] = [];
      fieldSnap.forEach((d) => fieldList.push({ id: d.id, ...d.data() } as Field));
      setFields(fieldList);
      if (fieldList.length > 0 && !selectedFieldId) {
        setSelectedFieldId(fieldList[0].id);
      }

      // 2. Fetch Bags
      const bagsQ = query(collection(db, 'bags'), where('farmerUid', '==', currentUser.uid));
      const bagSnap = await getDocs(bagsQ);
      const bagList: Bag[] = [];
      const unitIdsToFetch = new Set<string>();

      bagSnap.forEach((d) => {
        const data = { id: d.id, ...d.data() } as Bag;
        bagList.push(data);
        if (data.storageUnitId) {
          unitIdsToFetch.add(data.storageUnitId);
        }
      });

      // Sort by creation time desc
      bagList.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setBags(bagList);

      // 3. Fetch Storage Unit live readings for crates in mandi
      const newStorageMap: Record<string, StorageUnitInfo> = {};
      for (const unitId of Array.from(unitIdsToFetch)) {
        try {
          const uSnap = await getDoc(doc(db, 'storageUnits', unitId));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            newStorageMap[unitId] = {
              tempC: uData.currentTemp ?? uData.latest?.tempC,
              humidityPct: uData.currentHumidity ?? uData.latest?.humidityPct,
              name: uData.name,
            };
          }
        } catch (e) {
          // ignore individual read errors
        }
      }
      setStorageMap(newStorageMap);

      // 4. Fetch Configured Grade Pricing
      try {
        const pricingSnap = await getDoc(doc(db, 'config', 'pricing'));
        if (pricingSnap.exists()) {
          const p = pricingSnap.data() as GradePricing;
          const loaded: GradePricing = {
            gradeAPlus: p.gradeAPlus ?? DEFAULT_GRADE_PRICING.gradeAPlus,
            gradeA: p.gradeA ?? DEFAULT_GRADE_PRICING.gradeA,
            gradeB: p.gradeB ?? DEFAULT_GRADE_PRICING.gradeB,
            gradeC: p.gradeC ?? DEFAULT_GRADE_PRICING.gradeC,
          };
          setGradePrices(loaded);
          setRatePerKg(getPriceForGrade(sizeGrade, loaded));
        } else {
          const prodSnap = await getDoc(doc(db, 'products', 'tomato'));
          if (prodSnap.exists()) {
            setRatePerKg(prodSnap.data().ratePerKg || 60);
          }
        }
      } catch (err) {
        console.warn('Failed to load grade pricing config:', err);
      }
    } catch (err: unknown) {
      console.warn('Failed to load farmer data:', err);
      setError((err as Error)?.message || 'Failed to load farm records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrowData();
  }, [currentUser]);

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
      const totalPrice = calculateTotalPrice(weightKg, ratePerKg);

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
        pricePerKg: ratePerKg,
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

  // Filter bags
  const filteredBags = bags.filter((b) => {
    if (filterStatus === 'ALL') return true;
    return b.status === filterStatus;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
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
            <span className="text-[10px] uppercase font-bold text-emerald-300/80 tracking-wider block">
              Tomato Rate
            </span>
            <span className="text-xl font-black text-white">{formatRupees(ratePerKg)}/kg</span>
          </div>

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

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4">
        {[
          { key: 'ALL', label: `All Crates (${bags.length})` },
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
                    <span>View Public Provenance</span>
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

      {/* Harvest Crate Modal */}
      {showHarvestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Harvest New Crate</h3>
              </div>
              <button
                onClick={() => setShowHarvestModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleCreateBag} className="space-y-4">
              {/* Field Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-300">Field / Farm</label>
                  <button
                    type="button"
                    onClick={() => setShowFieldModal(true)}
                    className="text-[11px] font-bold text-emerald-400 hover:underline"
                  >
                    + Add Field
                  </button>
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

              {/* Rate Adjustment */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300">Rate (₹ per kg)</label>
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    Suggested for {sizeGrade}: ₹{getPriceForGrade(sizeGrade, gradePrices)}/kg
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={ratePerKg}
                    onChange={(e) => setRatePerKg(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white font-bold focus:outline-none focus:border-emerald-500/50"
                  />
                  <span className="text-xs text-slate-400">/kg</span>
                </div>
              </div>

              {/* Value Calculation */}
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                    Calculated Crate Total
                  </span>
                  <span className="text-xs text-emerald-200">
                    {weightKg} kg × ₹{ratePerKg}/kg ({sizeGrade})
                  </span>
                </div>
                <span className="text-xl font-black text-emerald-400">
                  {formatRupees(calculateTotalPrice(weightKg, ratePerKg))}
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
      )}

      {/* New Field Modal */}
      {showFieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 w-full max-w-sm rounded-2xl p-6 shadow-2xl text-white">
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

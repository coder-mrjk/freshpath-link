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
import { calculateTotalPrice, formatRupees } from '../../lib/price';
import { formatIST, timeAgoIST } from '../../lib/time';
import { calculateFreshness } from '../../lib/freshness';
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
  const { userProfile, currentUser } = useAuth();

  const [bags, setBags] = useState<Bag[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('');
  const [ratePerKg, setRatePerKg] = useState<number>(60);
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

  // Filter State
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // New Field Modal
  const [showFieldModal, setShowFieldModal] = useState(false);
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

      // 4. Fetch Product Price
      const prodSnap = await getDoc(doc(db, 'products', 'tomato'));
      if (prodSnap.exists()) {
        setRatePerKg(prodSnap.data().ratePerKg || 60);
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
        farmerPassId: userProfile.passId || 'FP-F-0001',
        farmerFirstName: userProfile.firstName,
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
        byPassId: userProfile.passId || 'FP-F-0001',
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
      {/* Top Banner */}
      <div className="bg-emerald-700 text-white rounded-2xl p-6 shadow-xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-800 rounded-xl">
            <Sprout className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Grow Portal</h1>
              {userProfile?.passId && (
                <span className="text-xs font-mono font-bold bg-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-500">
                  {userProfile.passId}
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-100 mt-0.5">
              Farmer: <strong>{userProfile?.firstName}</strong> • {userProfile?.addressText || 'Farm Cluster'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] uppercase font-bold text-emerald-200 block">
              Tomato Rate
            </span>
            <span className="text-xl font-black">{formatRupees(ratePerKg)}/kg</span>
          </div>

          <button
            onClick={() => setShowHarvestModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-100 text-emerald-900 rounded-xl text-xs font-bold shadow-md transition-colors touch-target"
          >
            <PlusCircle className="w-4 h-4 text-emerald-700" />
            <span>Harvest New Crate</span>
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

      {/* Farmer Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="text-[10px] font-bold text-gray-400 uppercase">Total Harvested</div>
          <div className="text-xl font-black text-charcoal mt-1">{totalHarvested} crates</div>
          <div className="text-[10px] text-gray-500 mt-0.5">{totalWeight} kg total</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="text-[10px] font-bold text-gray-400 uppercase">Crop Value</div>
          <div className="text-xl font-black text-emerald-600 mt-1">{formatRupees(totalValue)}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">@ ₹{ratePerKg}/kg</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="text-[10px] font-bold text-gray-400 uppercase">In Mandi Storage</div>
          <div className="text-xl font-black text-amber-600 mt-1">{inMandiCount} crates</div>
          <div className="text-[10px] text-gray-500 mt-0.5">Cold room active</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="text-[10px] font-bold text-gray-400 uppercase">Crates Sold</div>
          <div className="text-xl font-black text-purple-600 mt-1">{soldCount} crates</div>
          <div className="text-[10px] text-gray-500 mt-0.5">To consumers</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold text-gray-400 uppercase">Consumer Rating</div>
          <div className="text-xl font-black text-amber-500 mt-1 flex items-center gap-1">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <span>{avgRating ? `${avgRating}` : '–'}</span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
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
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              filterStatus === tab.key
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Crates Inventory List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-gray-500">Loading your farm records...</p>
          </div>
        ) : filteredBags.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
            <Sprout className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="font-bold text-charcoal text-base">No crates found</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto mb-4">
              {bags.length === 0
                ? 'Harvest your first crate of tomatoes to generate a QR label.'
                : 'No crates matched this filter.'}
            </p>
            <button
              onClick={() => setShowHarvestModal(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow"
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
                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs hover:border-emerald-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-charcoal">{bag.id}</span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        bag.status === 'CREATED'
                          ? 'bg-blue-100 text-blue-800'
                          : bag.status === 'IN_TRANSIT'
                          ? 'bg-amber-100 text-amber-800'
                          : bag.status === 'IN_STORAGE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : bag.status === 'SOLD'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
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
                    <span className="font-black text-base text-emerald-700">
                      {formatRupees(bag.totalPrice)}
                    </span>
                    <span className="text-[10px] text-gray-400 block">
                      {bag.weightKg} kg (~{bag.pieces} pcs)
                    </span>
                  </div>
                </div>

                {/* Body Details */}
                <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
                  <div>
                    <span className="font-semibold text-charcoal">Origin Field: </span>
                    {bag.fieldName}, {bag.village} ({bag.sizeGrade || 'Grade A'})
                  </div>
                  <div>
                    <span className="font-semibold text-charcoal">Harvested: </span>
                    {formatIST(bag.harvestAt || bag.createdAt)} ({timeAgoIST(bag.harvestAt || bag.createdAt)})
                  </div>
                </div>

                {/* Live Storage Telemetry Alert for Crates in Mandi */}
                {bag.status === 'IN_STORAGE' && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-amber-600" />
                      <span>
                        Preserved in <strong>{storageInfo?.name || 'Mandi Cold Room'}</strong>:
                      </span>
                      <span className="font-mono font-bold text-charcoal">
                        {storageInfo?.tempC !== undefined ? `${storageInfo.tempC}°C` : '13.5°C'} (Safe Safe Range: 12°–15°C)
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Protected
                    </span>
                  </div>
                )}

                {/* Sold / Consumer Review Details */}
                {bag.status === 'SOLD' && bag.soldTo && (
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1 font-bold">
                        <Users className="w-3.5 h-3.5 text-purple-700" />
                        Buyer: {bag.soldTo.firstName} ({bag.soldTo.consumerPassId})
                      </span>
                      {bag.rating ? (
                        <div className="flex items-center gap-0.5 text-amber-500">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3.5 h-3.5 ${
                                s <= bag.rating!.stars
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">No review left</span>
                      )}
                    </div>
                    {bag.rating?.comment && (
                      <p className="text-xs text-purple-950 italic mt-1">"{bag.rating.comment}"</p>
                    )}
                  </div>
                )}

                {/* Bottom Actions Bar */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                  <Link
                    to={`/b/${bag.id}`}
                    className="text-xs text-emerald-700 hover:underline font-bold flex items-center gap-1"
                  >
                    <span>View Public Provenance</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>

                  <Link
                    to={`/print/${bag.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-charcoal rounded-xl text-xs font-bold transition-colors touch-target"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-base text-charcoal">Harvest New Crate</h3>
              </div>
              <button
                onClick={() => setShowHarvestModal(false)}
                className="text-gray-400 hover:text-charcoal text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleCreateBag} className="space-y-4">
              {/* Field Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">Field / Farm</label>
                  <button
                    type="button"
                    onClick={() => setShowFieldModal(true)}
                    className="text-[11px] font-bold text-emerald-700 hover:underline"
                  >
                    + Add Field
                  </button>
                </div>
                {fields.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowFieldModal(true)}
                    className="w-full py-2.5 px-3 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-emerald-500 hover:text-emerald-700 font-semibold"
                  >
                    + Register your first field
                  </button>
                ) : (
                  <select
                    value={selectedFieldId}
                    onChange={(e) => setSelectedFieldId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs"
                  >
                    {fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.village})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Weight */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Weight (kg)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0.5}
                    max={100}
                    step={0.5}
                    required
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-bold"
                  />
                  <Scale className="w-4 h-4 absolute right-3 top-3 text-gray-400" />
                </div>
              </div>

              {/* Estimated Pieces & Grade */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Pieces (~ count)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={pieces}
                    onChange={(e) => setPieces(Number(e.target.value))}
                    className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Grade</label>
                  <select
                    value={sizeGrade}
                    onChange={(e) => setSizeGrade(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-xl text-xs"
                  >
                    <option value="Grade A">Grade A (Premium)</option>
                    <option value="Grade B">Grade B (Medium)</option>
                    <option value="Grade C">Grade C (Local)</option>
                  </select>
                </div>
              </div>

              {/* Value Calculation */}
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                    Calculated Value
                  </span>
                  <span className="text-xs text-emerald-700">
                    {weightKg} kg × ₹{ratePerKg}/kg
                  </span>
                </div>
                <span className="text-xl font-black text-emerald-800">
                  {formatRupees(calculateTotalPrice(weightKg, ratePerKg))}
                </span>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Produce Notes / Benefits
                </label>
                <input
                  type="text"
                  value={benefitsNote}
                  onChange={(e) => setBenefitsNote(e.target.value)}
                  placeholder="e.g. Naturally ripened Country Tomatoes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowHarvestModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold shadow-md"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-base text-charcoal mb-4">Register New Field / Farm</h3>
            <form onSubmit={handleCreateField} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Field / Farm Name
                </label>
                <input
                  type="text"
                  required
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="e.g. Vadakku Thottam"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Village</label>
                <input
                  type="text"
                  required
                  value={newFieldVillage}
                  onChange={(e) => setNewFieldVillage(e.target.value)}
                  placeholder="Village"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">District</label>
                <input
                  type="text"
                  value={newFieldDistrict}
                  onChange={(e) => setNewFieldDistrict(e.target.value)}
                  placeholder="District"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFieldModal(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow"
                >
                  Save Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

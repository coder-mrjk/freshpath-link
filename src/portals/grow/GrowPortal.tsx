import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
import {
  Sprout,
  PlusCircle,
  Printer,
  Scale,
  AlertCircle,
  Layers,
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
}

export const GrowPortal: React.FC = () => {
  const { userProfile, currentUser } = useAuth();
  const navigate = useNavigate();

  const [bags, setBags] = useState<Bag[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('');
  const [ratePerKg, setRatePerKg] = useState<number>(60);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [weightKg, setWeightKg] = useState<number>(5);
  const [pieces, setPieces] = useState<number>(45);
  const [sizeGrade, setSizeGrade] = useState<string>('Grade A');
  const [benefitsNote, setBenefitsNote] = useState<string>('Naturally ripened Country Tomatoes');

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
      bagSnap.forEach((d) => bagList.push({ id: d.id, ...d.data() } as Bag));
      // Sort by creation time desc
      bagList.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setBags(bagList);

      // 3. Fetch Product Price
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
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to add field.');
    }
  };

  const handleCreateBag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) return;

    if (!selectedFieldId && fields.length === 0) {
      setError('Please add a farm / field before creating a crate.');
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

      // Navigate to Print Label Page immediately
      navigate(`/print/${bagId}`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to create bag.');
      setSubmitting(false);
    }
  };

  const currentTotalPrice = calculateTotalPrice(weightKg, ratePerKg);

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
                <span className="text-xs font-mono font-bold bg-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-600">
                  {userProfile.passId}
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-100 mt-0.5">
              Welcome, {userProfile?.firstName}! Harvest produce, track crates, and print verified QR labels.
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-emerald-200 block">
            Tomato Rate
          </span>
          <span className="text-xl font-black">{formatRupees(ratePerKg)}/kg</span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Create Bag Form */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <PlusCircle className="w-5 h-5 text-tomato-500" />
              <h2 className="font-bold text-base text-charcoal">
                Create Crate / Bag
              </h2>
            </div>

            <form onSubmit={handleCreateBag} className="space-y-4">
              {/* Field Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">
                    Field / Farm
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowFieldModal(true)}
                    className="text-[11px] font-bold text-tomato-600 hover:underline flex items-center gap-0.5"
                  >
                    + Add Field
                  </button>
                </div>
                {fields.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowFieldModal(true)}
                    className="w-full py-2.5 px-3 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-tomato-500 hover:text-tomato-600 font-semibold"
                  >
                    + Register your first field
                  </button>
                ) : (
                  <select
                    value={selectedFieldId}
                    onChange={(e) => setSelectedFieldId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-tomato-500 focus:outline-none"
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
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Weight (kg)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0.5}
                    max={100}
                    step={0.5}
                    required
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-tomato-500 focus:outline-none"
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
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Grade
                  </label>
                  <select
                    value={sizeGrade}
                    onChange={(e) => setSizeGrade(e.target.value)}
                    className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-xl text-xs"
                  >
                    <option value="Grade A">Grade A (Large)</option>
                    <option value="Grade B">Grade B (Medium)</option>
                    <option value="Grade C">Grade C (Small)</option>
                  </select>
                </div>
              </div>

              {/* Benefits note */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Farmer Note / Quality Highlight
                </label>
                <input
                  type="text"
                  value={benefitsNote}
                  onChange={(e) => setBenefitsNote(e.target.value)}
                  placeholder="e.g. Chemical-free, hand-picked"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>

              {/* Live Price Calculator */}
              <div className="p-3 bg-tomato-50 rounded-xl border border-tomato-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-tomato-700 block">
                    Calculated Value
                  </span>
                  <span className="text-xs text-gray-600">
                    {weightKg} kg × ₹{ratePerKg}/kg
                  </span>
                </div>
                <span className="text-xl font-black text-tomato-600">
                  {formatRupees(currentTotalPrice)}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-tomato-500 hover:bg-tomato-600 disabled:bg-gray-300 text-white font-bold rounded-xl text-xs shadow-md transition-colors touch-target flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>{submitting ? 'Generating Crate...' : 'Create & Print Label'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Harvested Bags List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-charcoal flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              <span>Harvested Crates ({bags.length})</span>
            </h2>
            <button
              onClick={loadGrowData}
              className="text-xs text-tomato-600 hover:underline font-semibold"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-500">Loading your farm records...</p>
            </div>
          ) : bags.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
              <Sprout className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-bold text-charcoal text-base">No crates recorded yet</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Fill out the form on the left to harvest your first crate of tomatoes and print its traceable QR label.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {bags.map((bag) => (
                <div
                  key={bag.id}
                  className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs hover:shadow-md transition-shadow flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-3 bg-red-50 text-tomato-500 rounded-xl shrink-0 mt-0.5">
                      <Sprout className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-charcoal">
                          {bag.id}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            bag.status === 'CREATED'
                              ? 'bg-blue-100 text-blue-800'
                              : bag.status === 'LOADED' || bag.status === 'IN_TRANSIT'
                              ? 'bg-amber-100 text-amber-800'
                              : bag.status === 'SOLD'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {bag.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 flex items-center gap-2">
                        <span className="font-semibold text-charcoal">{bag.weightKg} kg</span> •
                        <span>~{bag.pieces} pcs</span> •
                        <span>{bag.fieldName}</span>
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Harvested {timeAgoIST(bag.harvestAt || bag.createdAt)} ({formatIST(bag.harvestAt || bag.createdAt)})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                    <div className="text-right">
                      <span className="font-black text-base text-tomato-600 block">
                        {formatRupees(bag.totalPrice)}
                      </span>
                    </div>
                    <Link
                      to={`/print/${bag.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-tomato-50 hover:text-tomato-600 text-charcoal rounded-xl text-xs font-bold transition-colors touch-target"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print Label</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Village
                </label>
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
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  District
                </label>
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

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatIST, timeAgoIST } from '../../lib/time';
import { formatRupees } from '../../lib/price';
import { calculateFreshness } from '../../lib/freshness';
import { calculateStorageTelemetryStats, StorageReading } from '../../lib/storage';
import { TripMap } from '../../components/TripMap';
import { GPSFix } from '../../lib/gps';
import {
  ShieldCheck,
  MapPin,
  Sparkles,
  Truck,
  Warehouse,
  Star,
  Users,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Layers,
  LogIn,
  UserCheck,
} from 'lucide-react';

interface BagData {
  id: string;
  product: string;
  farmerUid: string;
  farmerFirstName: string;
  farmerPassId: string;
  fieldId?: string;
  fieldName: string;
  village: string;
  weightKg: number;
  pieces: number;
  sizeGrade?: string;
  benefitsNote?: string;
  pricePerKg: number;
  totalPrice: number;
  status: 'CREATED' | 'LOADED' | 'IN_TRANSIT' | 'IN_STORAGE' | 'DISPATCHED_TO_SHOP' | 'AT_SHOP' | 'SOLD';
  tripId?: string;
  storageUnitId?: string;
  mandiId?: string;
  shopId?: string;
  harvestAt: any;
  createdAt: any;
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

interface TripData {
  id: string;
  originText: string;
  destinationMandiName?: string;
  start?: GPSFix;
  end?: GPSFix;
  distanceKmStraight?: number;
  durationMin?: number;
}

interface StorageInfo {
  name: string;
  nodeUnitId: string;
  minTemp: number;
  maxTemp: number;
  avgTemp: number;
  avgHumidity: number;
}

interface LedgerEvent {
  id: string;
  type: string;
  byRole: string;
  byPassId: string;
  byUid: string;
  place?: { text?: string; lat?: number; lng?: number };
  note?: string;
  at: any;
}

interface BagProvenanceViewProps {
  bagId: string;
  onBack?: () => void;
}

export const BagProvenanceView: React.FC<BagProvenanceViewProps> = ({ bagId, onBack }) => {
  const { currentUser, userProfile } = useAuth();

  const [bag, setBag] = useState<BagData | null>(null);
  const [trip, setTrip] = useState<TripData | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Purchase & Rating state
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedStars, setSelectedStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const fetchBagJourney = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Bag
      const bSnap = await getDoc(doc(db, 'bags', bagId));
      if (!bSnap.exists()) {
        throw new Error(`Crate "${bagId}" not found in provenance registry.`);
      }
      const bData = { id: bSnap.id, ...bSnap.data() } as BagData;
      setBag(bData);

      // 2. Fetch Trip if present
      if (bData.tripId) {
        const tSnap = await getDoc(doc(db, 'trips', bData.tripId));
        if (tSnap.exists()) {
          setTrip({ id: tSnap.id, ...tSnap.data() } as TripData);
        }
      }

      // 3. Fetch Storage Unit and Telemetry readings if present
      if (bData.storageUnitId) {
        const uSnap = await getDoc(doc(db, 'storageUnits', bData.storageUnitId));
        if (uSnap.exists()) {
          const uData = uSnap.data();
          const rSnap = await getDocs(
            collection(db, 'storageUnits', bData.storageUnitId, 'readings')
          );
          const rList: StorageReading[] = [];
          rSnap.forEach((d) => rList.push(d.data() as StorageReading));
          const stats = calculateStorageTelemetryStats(rList);

          setStorageInfo({
            name: uData.name || 'Cold Room',
            nodeUnitId: uData.nodeUnitId || 'STORE-01',
            minTemp: stats.minTemp,
            maxTemp: stats.maxTemp,
            avgTemp: stats.avgTemp,
            avgHumidity: stats.avgHumidity,
          });
        }
      }

      // 4. Fetch Immutable Ledger Events
      const eQ = query(collection(db, 'events'), where('bagId', '==', bagId));
      const eSnap = await getDocs(eQ);
      const eList: LedgerEvent[] = [];
      eSnap.forEach((d) => eList.push({ id: d.id, ...d.data() } as LedgerEvent));
      eList.sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
      setEvents(eList);
    } catch (err: unknown) {
      console.warn('Provenance load error:', err);
      setError((err as Error)?.message || 'Failed to retrieve crate provenance.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBagJourney();
  }, [bagId]);

  // Handle Confirm Purchase
  const handleConfirmPurchase = async () => {
    if (!bag || !currentUser) return;
    if (bag.status !== 'AT_SHOP') {
      setError(`Cannot purchase. Crate status is ${bag.status} (only crates AT_SHOP can be purchased).`);
      return;
    }

    setIsPurchasing(true);
    setError(null);

    try {
      const consumerPassId = userProfile?.passId || `FP-C-${currentUser.uid.slice(0, 6).toUpperCase()}`;
      const consumerName = userProfile?.firstName || 'Consumer';

      const batch = writeBatch(db);

      // 1. Update Bag to SOLD
      batch.update(doc(db, 'bags', bag.id), {
        status: 'SOLD',
        soldTo: {
          consumerUid: currentUser.uid,
          consumerPassId,
          firstName: consumerName,
        },
        updatedAt: serverTimestamp(),
      });

      // 2. Insert Purchases record
      const purchaseRef = doc(collection(db, 'purchases'));
      batch.set(purchaseRef, {
        bagId: bag.id,
        consumerUid: currentUser.uid,
        consumerPassId,
        price: bag.totalPrice,
        at: serverTimestamp(),
        paymentStatus: 'NOT_ENABLED',
      });

      // 3. Append Ledger Event: PURCHASED
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        bagId: bag.id,
        type: 'PURCHASED',
        byUid: currentUser.uid,
        byRole: 'consumer',
        byPassId: consumerPassId,
        at: serverTimestamp(),
        place: { text: 'Retail Store' },
        note: `Purchased by verified consumer ${consumerName} (${consumerPassId}).`,
      });

      await batch.commit();
      setSuccessMsg('Purchase confirmed! Thank you for buying farm-direct produce.');
      await fetchBagJourney();
      setShowRatingModal(true);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to complete purchase.');
    } finally {
      setIsPurchasing(false);
    }
  };

  // Handle Rating Submission
  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bag || !currentUser) return;

    setSubmittingRating(true);
    setError(null);

    try {
      const ratingData = {
        stars: selectedStars,
        comment: ratingComment.trim(),
        at: serverTimestamp(),
      };

      const batch = writeBatch(db);

      // 1. Update Bag rating
      batch.update(doc(db, 'bags', bag.id), {
        rating: ratingData,
      });

      // 2. Append Ledger Event: RATED
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        bagId: bag.id,
        type: 'RATED',
        byUid: currentUser.uid,
        byRole: 'consumer',
        byPassId: userProfile?.passId || 'FP-C-0001',
        at: serverTimestamp(),
        note: `Rated ${selectedStars} stars: "${ratingComment.trim() || 'No comment'}"`,
      });

      await batch.commit();
      setShowRatingModal(false);
      setSuccessMsg('Your review and rating have been recorded on the permanent ledger!');
      await fetchBagJourney();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tomato-600 mx-auto mb-4"></div>
        <p className="text-xs text-gray-500">Decrypting tamper-evident provenance ledger...</p>
      </div>
    );
  }

  if (error || !bag) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-charcoal">Provenance Record Not Found</h2>
        <p className="text-xs text-gray-500 mt-1 mb-6">
          {error || 'Unable to locate crate details.'}
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 bg-charcoal text-white rounded-xl text-xs font-bold"
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  const freshness = calculateFreshness(bag.harvestAt);
  const uniqueHandlers = Array.from(new Set(events.map((e) => e.byPassId || e.byRole))).length;
  const isBuyer = bag.soldTo?.consumerUid === currentUser?.uid;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Top Bar with Back Button */}
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-charcoal transition-colors"
        >
          ← Back to Scanner
        </button>
      )}

      {/* Notifications */}
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

      {/* Provenance Hero Card */}
      <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-lg mb-6">
        <div className="bg-radial from-tomato-500 to-tomato-600 p-6 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-white" />
              <span className="font-mono text-sm font-black tracking-wider bg-black/20 px-3 py-1 rounded-full border border-white/20">
                {bag.id}
              </span>
            </div>

            <span
              className={`text-xs font-black px-3 py-1 rounded-full shadow-xs uppercase tracking-wider ${
                bag.status === 'SOLD'
                  ? 'bg-purple-100 text-purple-900'
                  : bag.status === 'AT_SHOP'
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {bag.status === 'SOLD' ? '✓ Purchased' : bag.status.replace('_', ' ')}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black">Fresh Farm Tomatoes</h1>
              <p className="text-xs text-tomato-100 mt-1 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                <span>
                  {bag.fieldName}, {bag.village}
                </span>
              </p>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-3xl font-black">{formatRupees(bag.totalPrice)}</div>
              <div className="text-xs text-tomato-100">
                ₹{bag.pricePerKg} / kg • {bag.weightKg} kg ({bag.pieces} pcs)
              </div>
            </div>
          </div>
        </div>

        {/* Quality & Freshness Indicator */}
        <div className="p-6 border-b border-gray-100 bg-sandBg/50 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-leaf-100 text-leaf-800 rounded-2xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Live Freshness Score
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${freshness.colorClass}`}
                >
                  {freshness.score}% {freshness.label}
                </span>
              </div>
              <p className="text-xs text-charcoal font-medium mt-0.5">
                Harvested: <strong>{formatIST(bag.harvestAt)}</strong> ({timeAgoIST(bag.harvestAt)})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Tamper-Proof Audit:</span>
            <span className="inline-flex items-center gap-1 text-xs font-mono font-bold bg-white px-2.5 py-1 rounded-xl border border-gray-200 text-charcoal">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              {uniqueHandlers} handlers verified
            </span>
          </div>
        </div>

        {/* Farmer Profile & Field Details */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-gray-100">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Farmer Provenance
            </h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                {bag.farmerFirstName[0]}
              </div>
              <div>
                <div className="font-bold text-sm text-charcoal">{bag.farmerFirstName}</div>
                <div className="text-xs font-mono text-emerald-700 font-bold">
                  {bag.farmerPassId}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Produce Characteristics
            </h3>
            <div className="space-y-1 text-xs text-gray-700">
              <div>
                Grade: <strong>{bag.sizeGrade || 'Grade A'}</strong>
              </div>
              {bag.benefitsNote && (
                <div className="text-gray-500 italic">"{bag.benefitsNote}"</div>
              )}
            </div>
          </div>
        </div>

        {/* GPS Transit Map & Route Section */}
        {trip && (
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>GPS Transport Journey</span>
            </h3>

            <div className="mb-3 flex items-center justify-between text-xs text-gray-600">
              <span>
                Origin: <strong>{trip.originText}</strong>
              </span>
              <span>
                Destination: <strong>{trip.destinationMandiName || 'Central Mandi'}</strong>
              </span>
            </div>

            <TripMap
              start={trip.start}
              end={trip.end}
              distanceKm={trip.distanceKmStraight}
              className="h-60 w-full rounded-2xl overflow-hidden shadow-inner border border-gray-200"
            />
          </div>
        )}

        {/* Mandi Cold Storage Telemetry Summary */}
        {storageInfo && (
          <div className="p-6 border-b border-gray-100 bg-sandBg/30">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
              <Warehouse className="w-4 h-4 text-amber-600" />
              <span>Cold Storage Telemetry ({storageInfo.name})</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Avg Temp</div>
                <div className="text-base font-black text-charcoal font-mono mt-0.5">
                  {storageInfo.avgTemp}°C
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Safe Envelope</div>
                <div className="text-base font-black text-emerald-700 font-mono mt-0.5">
                  12°C – 15°C
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Min / Max</div>
                <div className="text-base font-black text-charcoal font-mono mt-0.5">
                  {storageInfo.minTemp}° / {storageInfo.maxTemp}°
                </div>
              </div>

              <div className="bg-white p-3 rounded-xl border border-gray-200 text-center">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Avg Humidity</div>
                <div className="text-base font-black text-blue-700 font-mono mt-0.5">
                  {storageInfo.avgHumidity}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Immutable Audit Trail Timeline */}
        <div className="p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-600" />
            <span>Immutable Supply Chain Ledger ({events.length} events)</span>
          </h3>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
            {events.map((e, idx) => {
              const isLast = idx === events.length - 1;

              return (
                <div key={e.id || idx} className="relative">
                  <div
                    className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white shadow-xs ${
                      isLast ? 'bg-tomato-600 ring-2 ring-tomato-200' : 'bg-charcoal'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-charcoal">
                        {e.type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {e.byRole} • {e.byPassId}
                      </span>
                    </div>

                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {formatIST(e.at)} ({timeAgoIST(e.at)})
                    </div>

                    {e.place?.text && (
                      <div className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        <span>{e.place.text}</span>
                      </div>
                    )}

                    {e.note && <p className="text-xs text-gray-700 mt-1 italic">"{e.note}"</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Existing Rating Card if already rated */}
        {bag.rating && (
          <div className="p-6 bg-amber-50/60 border-t border-amber-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Consumer Verified Review
              </span>
              <div className="flex items-center gap-1 text-amber-500">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${
                      s <= bag.rating!.stars ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>
            {bag.rating.comment && (
              <p className="text-xs text-amber-950 italic">"{bag.rating.comment}"</p>
            )}
            <div className="text-[10px] text-amber-700 mt-1">
              Verified Buyer: {bag.soldTo?.firstName} • {formatIST(bag.rating.at)}
            </div>
          </div>
        )}

        {/* Purchase Action Box */}
        {bag.status === 'AT_SHOP' && (
          <div className="p-6 bg-sandBg border-t border-gray-200">
            {!currentUser ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-sm text-charcoal flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-tomato-600" />
                    <span>Ready for Purchase ({formatRupees(bag.totalPrice)})</span>
                  </h4>
                  <p className="text-xs text-gray-600 mt-1 max-w-md">
                    Sign in or create a consumer account to confirm this purchase, save it in your personal history, and unlock direct farmer reviews.
                  </p>
                </div>
                <Link
                  to={`/auth/consumer?redirect=${encodeURIComponent(`/b/${bag.id}`)}`}
                  className="w-full sm:w-auto px-5 py-2.5 bg-tomato-600 hover:bg-tomato-700 text-white rounded-xl text-xs font-bold shadow-md transition-all touch-target inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In to Buy & Save</span>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-sm text-charcoal flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>Purchase as Verified Consumer</span>
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Logged in as <strong>{userProfile?.firstName || 'Consumer'}</strong> ({userProfile?.passId || 'Verified'}). Confirm purchase to lock provenance.
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {/* Disabled Digital Payment as per spec */}
                  <button
                    disabled
                    className="px-3 py-2.5 bg-gray-200 text-gray-400 rounded-xl text-xs font-bold cursor-not-allowed flex items-center gap-1.5"
                    title="Coming in future release"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Digital Pay (Soon)</span>
                  </button>

                  <button
                    onClick={handleConfirmPurchase}
                    disabled={isPurchasing}
                    className="flex-1 sm:flex-none px-6 py-2.5 bg-tomato-600 hover:bg-tomato-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold shadow-md transition-all touch-target"
                  >
                    {isPurchasing ? 'Processing...' : 'Confirm Purchase'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rate Button if bought by this user and not yet rated */}
        {bag.status === 'SOLD' && isBuyer && !bag.rating && (
          <div className="p-4 bg-amber-50 border-t border-amber-200 text-center">
            <button
              onClick={() => setShowRatingModal(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              Rate this Produce (1–5 Stars)
            </button>
          </div>
        )}
      </div>

      {/* Rating Modal */}
      {showRatingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-base text-charcoal mb-2">Rate Your Tomatoes</h3>
            <p className="text-xs text-gray-500 mb-4">
              Share your direct feedback for farmer <strong>{bag.farmerFirstName}</strong>.
            </p>

            <form onSubmit={handleSubmitRating} className="space-y-4">
              <div className="flex items-center justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setSelectedStars(star)}
                    className="p-1 touch-target transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-7 h-7 ${
                        star <= selectedStars
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Comment (Optional)
                </label>
                <textarea
                  rows={3}
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="e.g. Delicious, fresh taste and crisp texture!"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRatingModal(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Skip
                </button>
                <button
                  type="submit"
                  disabled={submittingRating}
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow"
                >
                  {submittingRating ? 'Saving...' : 'Submit Rating'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

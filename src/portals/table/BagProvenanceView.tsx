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
  updateDoc,
  writeBatch,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatIST, timeAgoIST } from '../../lib/time';
import { formatRupees } from '../../lib/price';
import { calculateFreshness } from '../../lib/freshness';
import { calculateStorageTelemetryStats, StorageReading } from '../../lib/storage';
import { showLocalNotification } from '../../lib/notifications';
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
  Store,
  Clock,
  DollarSign,
  Check,
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
  status: 'CREATED' | 'PENDING_PICKUP' | 'LOADED' | 'IN_TRANSIT' | 'IN_STORAGE' | 'DISPATCHED_TO_SHOP' | 'AT_SHOP' | 'PAYMENT_PENDING' | 'SOLD';
  tripId?: string;
  storageUnitId?: string;
  mandiId?: string;
  mandiName?: string;
  shopId?: string;
  shopName?: string;
  shopArea?: string;
  harvestAt: any;
  createdAt: any;
  pendingBuyer?: {
    uid: string;
    name: string;
    passId: string;
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
  const { currentUser, userProfile, isOwner } = useAuth();

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

  // Real-time synchronization for crate provenance
  useEffect(() => {
    if (!bagId) return;
    setLoading(true);
    setError(null);

    const bagRef = doc(db, 'bags', bagId);
    const unsubscribeBag = onSnapshot(
      bagRef,
      async (bSnap) => {
        if (!bSnap.exists()) {
          setError(`Crate "${bagId}" not found in provenance registry.`);
          setLoading(false);
          return;
        }

        const bData = { id: bSnap.id, ...bSnap.data() } as BagData;
        setBag(bData);
        setLoading(false);

        // Auto open rating modal if crate was just confirmed sold to current consumer and not yet rated
        if (bData.status === 'SOLD' && bData.soldTo?.consumerUid === currentUser?.uid && !bData.rating) {
          setShowRatingModal(true);
          showLocalNotification('🎉 Payment Confirmed & Provenance Verified!', {
            body: `Your farm produce is verified! Tap to submit a 5-star review for farmer ${bData.farmerFirstName}.`,
            tag: `sold-${bData.id}`,
          });
        }

        // Fetch Trip if present
        if (bData.tripId) {
          try {
            const tSnap = await getDoc(doc(db, 'trips', bData.tripId));
            if (tSnap.exists()) {
              setTrip({ id: tSnap.id, ...tSnap.data() } as TripData);
            }
          } catch (e) {
            console.warn('Trip fetch error:', e);
          }
        }

        // Fetch Mandi or Storage Unit Telemetry readings
        if (bData.mandiId) {
          try {
            const mSnap = await getDoc(doc(db, 'mandis', bData.mandiId));
            if (mSnap.exists()) {
              const mData = mSnap.data();
              const rSnap = await getDocs(collection(db, 'mandis', bData.mandiId, 'readings'));
              const rList: StorageReading[] = [];
              rSnap.forEach((d) => rList.push(d.data() as StorageReading));
              const stats = calculateStorageTelemetryStats(rList);

              setStorageInfo({
                name: mData.name || 'Mandi Facility',
                nodeUnitId: mData.nodeUnitId || 'Direct Mandi DHT22',
                minTemp: stats.minTemp,
                maxTemp: stats.maxTemp,
                avgTemp: stats.avgTemp,
                avgHumidity: stats.avgHumidity,
              });
            }
          } catch (e) {
            console.warn('Mandi readings fetch error:', e);
          }
        } else if (bData.storageUnitId) {
          try {
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
                name: uData.name || 'Cold Storage',
                nodeUnitId: uData.nodeUnitId || 'STORE-01',
                minTemp: stats.minTemp,
                maxTemp: stats.maxTemp,
                avgTemp: stats.avgTemp,
                avgHumidity: stats.avgHumidity,
              });
            }
          } catch (e) {
            console.warn('Storage unit readings fetch error:', e);
          }
        }

        // Fetch Immutable Ledger Events
        try {
          const eQ = query(collection(db, 'events'), where('bagId', '==', bagId));
          const eSnap = await getDocs(eQ);
          const eList: LedgerEvent[] = [];
          eSnap.forEach((d) => eList.push({ id: d.id, ...d.data() } as LedgerEvent));
          eList.sort((a, b) => (a.at?.seconds || 0) - (b.at?.seconds || 0));
          setEvents(eList);
        } catch (e) {
          console.warn('Events fetch error:', e);
        }
      },
      (err) => {
        console.warn('Provenance onSnapshot error:', err);
        setError(err.message || 'Failed to sync crate provenance.');
        setLoading(false);
      }
    );

    return () => unsubscribeBag();
  }, [bagId, currentUser?.uid]);

  // Consumer initiates Pay at Shop Counter
  const handleRequestCounterPayment = async () => {
    if (!bag || !currentUser) return;
    if (bag.status !== 'AT_SHOP') {
      setError(`Cannot request payment. Crate status is ${bag.status} (only crates on shelf can be purchased).`);
      return;
    }

    setIsPurchasing(true);
    setError(null);

    try {
      const consumerPassId = userProfile?.passId || `FP-C-${currentUser.uid.slice(0, 6).toUpperCase()}`;
      const consumerName = userProfile?.fullName || userProfile?.firstName || 'Consumer';

      await updateDoc(doc(db, 'bags', bag.id), {
        status: 'PAYMENT_PENDING',
        pendingBuyer: {
          uid: currentUser.uid,
          name: consumerName,
          passId: consumerPassId,
          requestedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      setSuccessMsg(`Payment request sent to shop counter! Please pay at the counter.`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to submit counter payment request.');
    } finally {
      setIsPurchasing(false);
    }
  };

  // Consumer submits 5-star rating for Farmer
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

      // 1. Update Bag rating & updatedAt
      batch.update(doc(db, 'bags', bag.id), {
        rating: ratingData,
        updatedAt: serverTimestamp(),
      });

      // 2. Append Ledger Event: RATED
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        bagId: bag.id,
        type: 'RATED',
        byUid: currentUser.uid,
        byRole: 'consumer',
        byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'FP-C-VERIFIED'),
        at: serverTimestamp(),
        place: { text: bag.shopName ? `${bag.shopName} (${bag.shopArea || 'Store'})` : 'Retail Store' },
        note: `Rated ${selectedStars} stars for farmer ${bag.farmerFirstName}: "${ratingComment.trim() || 'No comment'}"`,
      });

      await batch.commit();
      setShowRatingModal(false);
      setSuccessMsg('Your review and rating have been recorded on the immutable ledger!');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto mb-4"></div>
        <p className="text-xs text-slate-400">Decrypting tamper-evident provenance ledger...</p>
      </div>
    );
  }

  if (error || !bag) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] shadow-2xl">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white">Provenance Record Not Found</h2>
        <p className="text-xs text-slate-400 mt-1 mb-6">
          {error || 'Unable to locate crate details.'}
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors"
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  const freshness = calculateFreshness(bag.harvestAt);
  const uniqueHandlers = Array.from(new Set(events.map((e) => e.byPassId || e.byRole))).length;
  const isBuyer = bag.soldTo?.consumerUid === currentUser?.uid || isOwner;
  const isPendingBuyer = bag.pendingBuyer?.uid === currentUser?.uid;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Bar with Back Button */}
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          ← Back to Scanner
        </button>
      )}

      {/* Notifications */}
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

      {/* Provenance Hero Card */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] overflow-hidden shadow-2xl mb-6">
        <div className="bg-gradient-to-r from-red-950/80 via-red-900/60 to-slate-900/80 p-6 text-white border-b border-white/[0.08]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-red-400" />
              <span className="font-mono text-sm font-black tracking-wider bg-white/10 px-3 py-1 rounded-full border border-white/20 text-white">
                {bag.id}
              </span>
            </div>

            <span
              className={`text-xs font-black px-3 py-1 rounded-full shadow-xs uppercase tracking-wider border ${
                bag.status === 'SOLD'
                  ? 'bg-purple-500/20 border-purple-400/30 text-purple-300'
                  : bag.status === 'PAYMENT_PENDING'
                  ? 'bg-amber-500/20 border-amber-400/30 text-amber-300'
                  : bag.status === 'AT_SHOP'
                  ? 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
                  : 'bg-slate-700/40 border-slate-600/30 text-slate-300'
              }`}
            >
              {bag.status === 'SOLD'
                ? '✓ Verified Purchase'
                : bag.status === 'PAYMENT_PENDING'
                ? '⏳ Awaiting Counter Payment'
                : bag.status === 'AT_SHOP'
                ? 'On Retail Shelf'
                : bag.status.replace('_', ' ')}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-white">Farm-Direct Fresh Produce</h1>
              <p className="text-xs text-red-200/80 mt-1 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-red-400" />
                <span>
                  {bag.fieldName}, {bag.village}
                </span>
                {bag.shopName && (
                  <span className="text-slate-300 font-semibold">
                    • Sold at <strong className="text-white">{bag.shopName}</strong> ({bag.shopArea || 'Store'})
                  </span>
                )}
              </p>
            </div>

            <div className="text-left sm:text-right">
              <div className="text-3xl font-black text-white">{formatRupees(bag.totalPrice)}</div>
              <div className="text-xs text-red-200/80">
                ₹{bag.pricePerKg} / kg • {bag.weightKg} kg ({bag.pieces} pcs)
              </div>
            </div>
          </div>
        </div>

        {/* Quality & Freshness Indicator */}
        <div className="p-6 border-b border-white/[0.08] bg-white/[0.02] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-2xl shadow-[0_0_20px_0_rgba(74,222,128,0.2)]">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Live Freshness Score
                </span>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${freshness.colorClass}`}
                >
                  {freshness.score}% {freshness.label}
                </span>
              </div>
              <p className="text-xs text-slate-200 font-medium mt-0.5">
                Harvested: <strong className="text-white">{formatIST(bag.harvestAt)}</strong> ({timeAgoIST(bag.harvestAt)})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Tamper-Proof Audit:</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-white/5 px-3 py-1 rounded-xl border border-white/10 text-white">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              {uniqueHandlers} handlers verified
            </span>
          </div>
        </div>

        {/* Farmer Profile & Field Details */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-white/[0.08]">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Farmer Provenance
            </h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center font-bold text-sm">
                {bag.farmerFirstName[0]}
              </div>
              <div>
                <div className="font-bold text-sm text-white">{bag.farmerFirstName}</div>
                <div className="text-xs font-mono text-emerald-400 font-bold">
                  {bag.farmerPassId}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Produce Characteristics
            </h3>
            <div className="space-y-1 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Quality Tier:</span>
                <span
                  className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                    (bag.sizeGrade || '').includes('A+')
                      ? 'bg-purple-500/20 border-purple-400/40 text-purple-300'
                      : (bag.sizeGrade || '').includes('A')
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                      : (bag.sizeGrade || '').includes('B')
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                      : 'bg-slate-700/40 border-slate-600/40 text-slate-300'
                  }`}
                >
                  {bag.sizeGrade || 'Grade A'}
                </span>
                <span className="text-xs font-mono font-bold text-slate-300">
                  ₹{bag.pricePerKg}/kg
                </span>
              </div>
              {bag.benefitsNote && (
                <div className="text-slate-400 italic">"{bag.benefitsNote}"</div>
              )}
            </div>
          </div>
        </div>

        {/* GPS Transit Map & Route Section */}
        {trip && (
          <div className="p-6 border-b border-white/[0.08]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-blue-400" />
              <span>GPS Transport Journey</span>
            </h3>

            <div className="mb-3 flex items-center justify-between text-xs text-slate-300">
              <span>
                Origin: <strong className="text-white">{trip.originText}</strong>
              </span>
              <span>
                Destination Mandi: <strong className="text-white">{trip.destinationMandiName || 'Central Hub'}</strong>
              </span>
            </div>

            <TripMap
              start={trip.start}
              end={trip.end}
              distanceKm={trip.distanceKmStraight}
              className="h-60 w-full rounded-2xl overflow-hidden shadow-inner border border-white/[0.08]"
            />
          </div>
        )}

        {/* Mandi Climate & Storage Telemetry Summary */}
        {storageInfo && (
          <div className="p-6 border-b border-white/[0.08] bg-white/[0.01]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Warehouse className="w-4 h-4 text-amber-400" />
              <span>Mandi Climate Telemetry ({storageInfo.name})</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="backdrop-blur-md bg-white/[0.03] p-3.5 rounded-2xl border border-white/[0.08] text-center">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Avg Temp</div>
                <div className="text-base font-black text-white font-mono mt-0.5">
                  {storageInfo.avgTemp}°C
                </div>
              </div>

              <div className="backdrop-blur-md bg-white/[0.03] p-3.5 rounded-2xl border border-white/[0.08] text-center">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Safe Envelope</div>
                <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                  12°C – 15°C
                </div>
              </div>

              <div className="backdrop-blur-md bg-white/[0.03] p-3.5 rounded-2xl border border-white/[0.08] text-center">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Min / Max</div>
                <div className="text-base font-black text-white font-mono mt-0.5">
                  {storageInfo.minTemp}° / {storageInfo.maxTemp}°
                </div>
              </div>

              <div className="backdrop-blur-md bg-white/[0.03] p-3.5 rounded-2xl border border-white/[0.08] text-center">
                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Avg Humidity</div>
                <div className="text-base font-black text-sky-400 font-mono mt-0.5">
                  {storageInfo.avgHumidity}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Immutable Audit Trail Timeline */}
        <div className="p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Immutable Supply Chain Ledger ({events.length} events)</span>
          </h3>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/[0.1]">
            {events.map((e, idx) => {
              const isLast = idx === events.length - 1;

              return (
                <div key={e.id || idx} className="relative">
                  <div
                    className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-slate-900 shadow-md ${
                      isLast ? 'bg-red-500 ring-4 ring-red-500/20' : 'bg-slate-500'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">
                        {e.type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
                        {e.byRole} • {e.byPassId}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {formatIST(e.at)} ({timeAgoIST(e.at)})
                    </div>

                    {e.place?.text && (
                      <div className="text-xs text-slate-300 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{e.place.text}</span>
                      </div>
                    )}

                    {e.note && <p className="text-xs text-slate-300 mt-1 italic">"{e.note}"</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Existing Verified Review if present */}
        {bag.rating && (
          <div className="p-6 bg-amber-500/10 border-t border-amber-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Consumer Verified Review
              </span>
              <div className="flex items-center gap-1 text-amber-400">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-4 h-4 ${
                      s <= bag.rating!.stars ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>
            {bag.rating.comment && (
              <p className="text-xs text-amber-100 italic">"{bag.rating.comment}"</p>
            )}
            <div className="text-[10px] text-amber-400/80 mt-1">
              Verified Buyer: {bag.soldTo?.firstName} • {formatIST(bag.rating.at)}
            </div>
          </div>
        )}

        {/* CONSUMER COUNTER PURCHASE WORKFLOW ACTIONS */}
        <div className="p-6 bg-white/[0.02] border-t border-white/[0.08]">
          {/* 1. STATE: AT_SHOP (Ready to pay at counter) */}
          {bag.status === 'AT_SHOP' && (
            <div>
              {/* Digital payment coming soon notice */}
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-purple-300">
                  <CreditCard className="w-4 h-4 text-purple-400 shrink-0" />
                  <span><strong>Digital Payments (UPI / Cards):</strong> Coming soon. Pay cash/counter at retail billing desk.</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                  Coming Soon
                </span>
              </div>

              {!currentUser ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-red-400" />
                      <span>Ready for Purchase ({formatRupees(bag.totalPrice)})</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md">
                      Sign in or create a consumer account to confirm this counter purchase and submit your direct rating to the farmer.
                    </p>
                  </div>
                  <Link
                    to={`/auth/consumer?redirect=${encodeURIComponent(`/b/${bag.id}`)}`}
                    className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(193,18,31,0.3)] transition-all touch-target inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Sign In to Buy Produce</span>
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                      <Store className="w-4 h-4 text-emerald-400" />
                      <span>Found at {bag.shopName || 'Retail Store'} ({formatRupees(bag.totalPrice)})</span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tap below to send a payment notification to the shopkeeper's desk.
                    </p>
                  </div>

                  <button
                    onClick={handleRequestCounterPayment}
                    disabled={isPurchasing}
                    className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-black shadow-[0_4px_16px_rgba(16,185,129,0.35)] transition-all touch-target flex items-center justify-center gap-2"
                  >
                    <DollarSign className="w-4 h-4 stroke-[3]" />
                    <span>{isPurchasing ? 'Notifying Desk...' : `Pay at Shop Counter (₹${bag.totalPrice})`}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2. STATE: PAYMENT_PENDING (Waiting for Shopkeeper to confirm receipt) */}
          {bag.status === 'PAYMENT_PENDING' && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-300 animate-pulse">
                  <Clock className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-white">Awaiting Shopkeeper Confirmation</h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Live Syncing
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/90 mt-1">
                    {isPendingBuyer
                      ? `Please pay ₹${bag.totalPrice} at the retail counter. The shopkeeper has received your request. Once verified, this screen will update automatically to unlock your direct farmer rating!`
                      : `Counter payment requested for buyer ${bag.pendingBuyer?.name || 'Customer'}. Awaiting shopkeeper confirmation.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 3. STATE: SOLD (Payment Verified) */}
          {bag.status === 'SOLD' && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Payment Confirmed &amp; Provenance Verified</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Verified counter purchase for <strong className="text-white">{bag.soldTo?.firstName}</strong>.
                  </p>
                </div>
              </div>

              {isBuyer && !bag.rating && (
                <button
                  onClick={() => setShowRatingModal(true)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-black shadow-[0_4px_16px_rgba(245,158,11,0.35)] transition-all flex items-center justify-center gap-2 touch-target"
                >
                  <Star className="w-4 h-4 fill-current stroke-current" />
                  <span>Rate this Produce (1–5 Stars)</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5-Star Farmer Rating Modal */}
      {showRatingModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setShowRatingModal(false)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-1">Rate Your Farm Tomatoes</h3>
              <p className="text-xs text-slate-400 mb-4">
                Share direct verified feedback for farmer <strong className="text-emerald-300">{bag.farmerFirstName}</strong> ({bag.village}).
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
                        className={`w-8 h-8 ${
                          star <= selectedStars
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Direct Feedback for Farmer (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="e.g. Incredibly fresh, crisp skin, and natural farm taste!"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRatingModal(false)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRating}
                    className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-black shadow-[0_4px_16px_rgba(245,158,11,0.3)] transition-all"
                  >
                    {submittingRating ? 'Recording...' : 'Submit Rating'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

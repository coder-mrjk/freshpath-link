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
  addDoc,
  serverTimestamp,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { parseScannedBagId } from '../../lib/bagId';
import { formatIST, timeAgoIST } from '../../lib/time';
import { formatRupees } from '../../lib/price';
import { calculateFreshness } from '../../lib/freshness';
import { showLocalNotification } from '../../lib/notifications';
import { measureAsyncTrace } from '../../lib/performance';
import { QRScannerModal } from '../../components/QRScannerModal';
import { UserSettingsModal } from '../../components/UserSettingsModal';
import {
  Store,
  QrCode,
  AlertCircle,
  CheckCircle,
  Search,
  Settings,
  Plus,
  PlusCircle,
  Edit2,
  Trash2,
  Sparkles,
  CreditCard,
  Check,
  Star,
  PackageCheck,
  UserCheck,
} from 'lucide-react';

interface Shop {
  id: string;
  shopPersonUid: string;
  name: string;
  area: string;
}

interface ShelfBag {
  id: string;
  farmerFirstName: string;
  farmerPassId?: string;
  fieldName: string;
  village: string;
  weightKg: number;
  pieces: number;
  sizeGrade?: string;
  pricePerKg: number;
  totalPrice: number;
  status: string;
  shopId?: string;
  harvestAt: any;
  createdAt: any;
  updatedAt?: any;
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

export const ShelfPortal: React.FC = () => {
  const { userProfile, currentUser, isOwner } = useAuth();

  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);

  // Bag collections in real-time
  const [shelfBags, setShelfBags] = useState<ShelfBag[]>([]);
  const [pendingPaymentBags, setPendingPaymentBags] = useState<ShelfBag[]>([]);
  const [soldBags, setSoldBags] = useState<ShelfBag[]>([]);
  const [dispatchedBags, setDispatchedBags] = useState<ShelfBag[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterFreshness, setFilterFreshness] = useState<'ALL' | 'FRESH' | 'SELL_SOON' | 'CHECK_QUALITY'>('ALL');

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showScanner, setShowScanner] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newShopName, setNewShopName] = useState('');
  const [newShopArea, setNewShopArea] = useState('');

  // 1. Real-time Shops Listener
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    const sQ = isOwner
      ? collection(db, 'shops')
      : query(collection(db, 'shops'), where('shopPersonUid', '==', currentUser.uid));

    const unsubscribeShops = onSnapshot(
      sQ,
      (snapshot) => {
        const sList: Shop[] = [];
        snapshot.forEach((d) => sList.push({ id: d.id, ...d.data() } as Shop));
        setShops(sList);

        setSelectedShop((prev) => {
          if (!prev) return sList[0] || null;
          const matched = sList.find((s) => s.id === prev.id);
          return matched || sList[0] || null;
        });

        setLoading(false);
      },
      (err) => {
        console.warn('Real-time shops listener error:', err);
        setError(err.message || 'Failed to sync retail stores.');
        setLoading(false);
      }
    );

    return () => unsubscribeShops();
  }, [currentUser, isOwner]);

  // 2. Real-time Dispatched Bags (arriving from Mandi)
  useEffect(() => {
    const dispQ = query(collection(db, 'bags'), where('status', '==', 'DISPATCHED_TO_SHOP'));
    const unsubscribeDisp = onSnapshot(dispQ, (snapshot) => {
      const list: ShelfBag[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as ShelfBag));
      setDispatchedBags(list);
    });

    return () => unsubscribeDisp();
  }, []);

  // 3. Real-time Bags for Selected Shop (AT_SHOP, PAYMENT_PENDING, SOLD)
  useEffect(() => {
    if (!selectedShop) {
      setShelfBags([]);
      setPendingPaymentBags([]);
      setSoldBags([]);
      return;
    }

    // Query all crates for this shop
    const shopBagsQ = query(collection(db, 'bags'), where('shopId', '==', selectedShop.id));
    const unsubscribeBags = onSnapshot(shopBagsQ, (snapshot) => {
      const onShelf: ShelfBag[] = [];
      const pendingPay: ShelfBag[] = [];
      const sold: ShelfBag[] = [];

      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as ShelfBag;
        if (item.status === 'AT_SHOP') {
          onShelf.push(item);
        } else if (item.status === 'PAYMENT_PENDING') {
          pendingPay.push(item);
        } else if (item.status === 'SOLD') {
          sold.push(item);
        }
      });

      // Sort by recent activity
      onShelf.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      pendingPay.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      sold.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));

      setShelfBags(onShelf);
      setPendingPaymentBags(pendingPay);
      setSoldBags(sold);

      // Trigger notification if customer is waiting to pay
      if (pendingPay.length > 0) {
        const waitingBag = pendingPay[0];
        showLocalNotification('💰 Customer Payment Ready', {
          body: `Shopper ${waitingBag.pendingBuyer?.name || 'Customer'} is waiting to pay ₹${waitingBag.totalPrice} for Crate ${waitingBag.id}.`,
          tag: `pending-payment-${waitingBag.id}`,
        });
      }
    });

    return () => unsubscribeBags();
  }, [selectedShop?.id]);

  // Handle Receive Crate QR
  const handleReceiveBag = async (scannedValue: string) => {
    if (!currentUser || !selectedShop) return;
    const bagId = parseScannedBagId(scannedValue);
    if (!bagId) {
      setError('Scanned code is not a valid FreshPath crate ID.');
      return;
    }

    setShowScanner(false);
    setError(null);
    setActionLoading(true);

    try {
      const bagRef = doc(db, 'bags', bagId);
      const bagSnap = await getDoc(bagRef);
      if (!bagSnap.exists()) {
        throw new Error(`Crate "${bagId}" not found in system.`);
      }

      const bagData = bagSnap.data();
      // Valid transition: DISPATCHED_TO_SHOP (or IN_STORAGE) -> AT_SHOP
      if (bagData.status !== 'DISPATCHED_TO_SHOP' && bagData.status !== 'IN_STORAGE') {
        throw new Error(
          `Crate cannot be received. Current status is "${bagData.status}". Crates must be in "DISPATCHED_TO_SHOP" status from the Mandi.`
        );
      }

      const batch = writeBatch(db);

      // 1. Update Bag to AT_SHOP
      batch.update(bagRef, {
        status: 'AT_SHOP',
        shopId: selectedShop.id,
        shopName: selectedShop.name,
        shopArea: selectedShop.area,
        holderUid: currentUser.uid,
        handlerUids: Array.from(new Set([...(bagData.handlerUids || []), currentUser.uid])),
        updatedAt: serverTimestamp(),
      });

      // 2. Append Ledger Event: RECEIVED_SHOP
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        bagId,
        type: 'RECEIVED_SHOP',
        byUid: currentUser.uid,
        byRole: 'shop',
        byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
        at: serverTimestamp(),
        place: {
          text: `${selectedShop.name} (${selectedShop.area})`,
        },
        note: `Received and placed on retail shelf for consumer purchase.`,
      });

      await batch.commit();
      setSuccessMsg(`Crate ${bagId} successfully received and placed on shelf!`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to receive crate.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Counter Payment Received (Shopkeeper clicks "Payment Received")
  const handleConfirmPaymentReceived = async (bag: ShelfBag) => {
    if (!currentUser || !selectedShop) return;

    setActionLoading(true);
    setError(null);

    try {
      const buyerUid = bag.pendingBuyer?.uid || 'COUNTER_BUYER';
      const buyerName = bag.pendingBuyer?.name || 'Walk-in Consumer';
      const buyerPassId = bag.pendingBuyer?.passId || 'FP-C-COUNTER';

      const batch = writeBatch(db);

      // 1. Update Bag to SOLD
      const bagRef = doc(db, 'bags', bag.id);
      batch.update(bagRef, {
        status: 'SOLD',
        soldTo: {
          consumerUid: buyerUid,
          consumerPassId: buyerPassId,
          firstName: buyerName,
        },
        paymentStatus: 'PAID_COUNTER',
        soldAtShopId: selectedShop.id,
        soldAtShopName: selectedShop.name,
        updatedAt: serverTimestamp(),
      });

      // 2. Append Purchase record
      const purchaseRef = doc(collection(db, 'purchases'));
      batch.set(purchaseRef, {
        bagId: bag.id,
        consumerUid: buyerUid,
        consumerPassId: buyerPassId,
        price: bag.totalPrice,
        paymentStatus: 'PAID_COUNTER',
        shopId: selectedShop.id,
        shopName: selectedShop.name,
        at: serverTimestamp(),
      });

      // 3. Append Ledger Event: PURCHASED
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, {
        bagId: bag.id,
        type: 'PURCHASED',
        byUid: currentUser.uid,
        byRole: 'shop',
        byPassId: userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'UNVERIFIED'),
        at: serverTimestamp(),
        place: { text: `${selectedShop.name} (${selectedShop.area})` },
        note: `Payment received in cash/counter by shopkeeper for buyer ${buyerName} (${buyerPassId}).`,
      });

      await measureAsyncTrace('shop_confirm_payment', () => batch.commit());
      setSuccessMsg(`Payment received! Crate ${bag.id} marked SOLD. Consumer provenance unlocked.`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to confirm counter payment.');
    } finally {
      setActionLoading(false);
    }
  };

  // Create Shop
  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newShopName.trim()) return;

    try {
      await addDoc(collection(db, 'shops'), {
        shopPersonUid: currentUser.uid,
        name: newShopName.trim(),
        area: newShopArea.trim() || userProfile?.addressText || 'Market Area',
        createdAt: serverTimestamp(),
      });
      setShowShopModal(false);
      setNewShopName('');
      setNewShopArea('');
      setSuccessMsg(`Retail Store "${newShopName.trim()}" registered successfully!`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to create shop.');
    }
  };

  // Update Shop
  const handleUpdateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editingShop || !editingShop.name.trim()) return;

    try {
      await updateDoc(doc(db, 'shops', editingShop.id), {
        name: editingShop.name.trim(),
        area: editingShop.area.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditingShop(null);
      setSuccessMsg(`Retail Store "${editingShop.name.trim()}" updated successfully!`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to update shop.');
    }
  };

  // Delete Shop
  const handleDeleteShop = async (shopId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete Retail Store "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'shops', shopId));
      setSuccessMsg(`Retail Store "${name}" deleted.`);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to delete shop.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <p className="text-xs text-slate-400">Connecting to retail store shelf inventory...</p>
      </div>
    );
  }

  // Filter & Search Logic for Shelf Crates
  const filteredBags = shelfBags.filter((b) => {
    const matchesSearch =
      b.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.farmerFirstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.village.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterFreshness === 'ALL') return true;
    const fresh = calculateFreshness(b.harvestAt);
    return fresh.badge === filterFreshness;
  });

  // Calculate Metrics
  const totalCrates = shelfBags.length;
  const totalWeightKg = shelfBags.reduce((acc, b) => acc + (b.weightKg || 0), 0);
  const totalShelfValue = shelfBags.reduce((acc, b) => acc + (b.totalPrice || 0), 0);
  const avgFreshness =
    totalCrates > 0
      ? Math.round(
          shelfBags.reduce((acc, b) => acc + calculateFreshness(b.harvestAt).score, 0) / totalCrates
        )
      : 100;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner - Purple Gradient Glass */}
      <div className="bg-gradient-to-r from-purple-900/60 to-purple-800/40 backdrop-blur-xl border border-purple-500/20 rounded-3xl p-6 shadow-2xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 border border-purple-500/30 rounded-2xl shadow-[0_0_20px_0_rgba(147,51,234,0.2)]">
            <Store className="w-8 h-8 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Shelf &amp; Store Portal</h1>
              {(userProfile?.fullName || userProfile?.firstName) && (
                <span className="text-xs font-semibold bg-purple-950/60 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-500/40">
                  {userProfile.fullName || userProfile.firstName}
                </span>
              )}
            </div>
            {shops.length > 1 ? (
              <select
                value={selectedShop?.id}
                onChange={(e) => {
                  const s = shops.find((x) => x.id === e.target.value);
                  if (s) setSelectedShop(s);
                }}
                className="mt-1 text-xs bg-slate-900/80 text-white rounded-lg px-2.5 py-1 border border-white/10 font-bold focus:outline-none"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                    {s.name} ({s.area})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-purple-200/80 mt-0.5">
                Retail Store: <strong className="text-white">{selectedShop?.name || 'No Shop Registered'}</strong>
                {selectedShop?.area && <span> • 📍 {selectedShop.area}</span>}
                {userProfile?.fullName && <span> • Manager: <strong className="text-white">{userProfile.fullName}</strong></span>}
                {userProfile?.phone && <span> • 📞 {userProfile.phone}</span>}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => {
              setNewShopName('');
              setNewShopArea('');
              setShowShopModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 rounded-full text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Store</span>
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
            disabled={!selectedShop}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 disabled:opacity-50 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(147,51,234,0.35)] transition-all touch-target"
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

      {/* PENDING COUNTER PAYMENTS GATE (Real-time Customer Scan & Pay) */}
      {pendingPaymentBags.length > 0 && (
        <div className="relative backdrop-blur-xl bg-gradient-to-r from-emerald-950/70 via-emerald-900/40 to-slate-900/80 rounded-3xl border-2 border-emerald-500/50 p-6 shadow-2xl mb-8 animate-pulse-border">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white">Pending Counter Payments</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-slate-950">
                    {pendingPaymentBags.length} Waiting
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Shoppers scanned crate QR at your counter. Confirm physical payment received to unlock their provenance and farmer rating.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingPaymentBags.map((bag) => (
              <div
                key={bag.id}
                className="p-4 bg-slate-900/90 border border-emerald-500/30 rounded-2xl flex flex-col justify-between gap-3 shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-mono text-sm font-black text-white">{bag.id}</span>
                    <span className="text-base font-black text-emerald-400">
                      {formatRupees(bag.totalPrice)}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Customer: <strong className="text-white">{bag.pendingBuyer?.name || 'Walk-in Buyer'}</strong></span>
                      <span className="font-mono text-[10px] text-slate-400">({bag.pendingBuyer?.passId || '–'})</span>
                    </p>
                    <p className="text-slate-400">
                      Produce: {bag.weightKg} kg tomatoes ({bag.pieces} pcs) • Farmer: {bag.farmerFirstName}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleConfirmPaymentReceived(bag)}
                  disabled={actionLoading}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 rounded-xl text-xs font-black shadow-[0_4px_16px_rgba(16,185,129,0.35)] transition-all flex items-center justify-center gap-2 touch-target"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Payment Received (₹{bag.totalPrice})</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registered Retail Stores Management Section */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-400">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white">My Registered Retail Stores</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {shops.length} {shops.length === 1 ? 'Store' : 'Stores'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Retailers have direct control to register, edit location details, or manage retail stores
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNewShopName('');
                setNewShopArea('');
                setShowShopModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-xl text-xs font-bold shadow-md transition-all touch-target"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Register New Store</span>
            </button>
          </div>
        </div>

        {/* Store Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-3">
          {shops.length === 0 ? (
            <div className="col-span-full p-6 text-center text-xs text-slate-400">
              No retail stores registered yet. Click &ldquo;Register New Store&rdquo; to add your supermarket or grocery outlet.
            </div>
          ) : (
            shops.map((s) => (
              <div
                key={s.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  selectedShop?.id === s.id
                    ? 'bg-purple-500/10 border-purple-500/40 shadow-[0_0_15px_rgba(147,51,234,0.15)]'
                    : 'bg-white/[0.02] hover:bg-white/[0.04] border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                      <span>{s.name}</span>
                      {selectedShop?.id === s.id && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      📍 {s.area}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingShop(s)}
                      className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/10 text-xs transition-colors"
                      title="Edit Store Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteShop(s.id, s.name)}
                      className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 text-xs transition-colors"
                      title="Delete Store"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedShop(s)}
                    className={`font-semibold transition-colors ${
                      selectedShop?.id === s.id
                        ? 'text-purple-400 cursor-default'
                        : 'text-slate-400 hover:text-white underline'
                    }`}
                  >
                    {selectedShop?.id === s.id ? '✓ Active Store' : 'Set as Active'}
                  </button>
                  <span className="text-[10px] text-slate-400">
                    {shelfBags.filter((b) => b.shopId === s.id).length} on Shelf
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="relative backdrop-blur-xl bg-white/[0.03] p-4 rounded-2xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Active Crates
          </div>
          <div className="text-2xl font-black text-white mt-1">{totalCrates}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Ready for shoppers</div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/[0.03] p-4 rounded-2xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Total Weight
          </div>
          <div className="text-2xl font-black text-white mt-1">{totalWeightKg} kg</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Fresh produce stock</div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/[0.03] p-4 rounded-2xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Shelf Value
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {formatRupees(totalShelfValue)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Total retail value</div>
        </div>

        <div className="relative backdrop-blur-xl bg-white/[0.03] p-4 rounded-2xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Avg Freshness
          </div>
          <div className="text-2xl font-black text-emerald-400 mt-1">{avgFreshness}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Quality score</div>
        </div>
      </div>

      {/* Arriving Crates Dispatched from Mandi */}
      {dispatchedBags.length > 0 && (
        <div className="relative backdrop-blur-xl bg-purple-500/[0.05] rounded-3xl border border-purple-500/20 p-6 shadow-xl mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h3 className="font-bold text-sm text-white">
                Arriving Mandi Dispatches ({dispatchedBags.length} Crates Ready for Shelf)
              </h3>
            </div>
            <span className="text-[10px] text-purple-300 font-semibold bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20">
              Ready for Store Shelf
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {dispatchedBags.map((b) => (
              <div
                key={b.id}
                className="p-3 bg-slate-900/80 border border-white/10 rounded-2xl flex flex-col justify-between gap-3 shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-mono text-xs font-bold text-white truncate">{b.id}</span>
                    <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                      Dispatched
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
                  disabled={!selectedShop}
                  className="w-full py-1.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-xl text-xs font-bold transition-all shadow-[0_2px_10px_rgba(147,51,234,0.3)]"
                >
                  Receive onto Shelf
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter & Search Header */}
      <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-2xl border border-white/[0.08] p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search crate ID, farmer, village..."
            className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-400 focus:ring-1 focus:ring-purple-500/50 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {(['ALL', 'FRESH', 'SELL_SOON', 'CHECK_QUALITY'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterFreshness(mode)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                filterFreshness === mode
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white border border-purple-400/30 shadow-[0_0_20px_0_rgba(147,51,234,0.3)]'
                  : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              {mode === 'ALL'
                ? 'All Crates'
                : mode === 'FRESH'
                ? 'Fresh (≥70%)'
                : mode === 'SELL_SOON'
                ? 'Sell Soon (40-69%)'
                : 'Check (<40%)'}
            </button>
          ))}
        </div>
      </div>

      {/* Shelf Crates List */}
      <div className="space-y-4 mb-8">
        {filteredBags.length === 0 ? (
          <div className="backdrop-blur-xl bg-white/[0.03] p-12 rounded-3xl border border-white/[0.08] text-center shadow-xl">
            <Store className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <h3 className="font-bold text-base text-white">No Crates On Shelf</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              {shelfBags.length === 0
                ? 'Scan arriving crates from the Mandi to put them on your retail shelf.'
                : 'No crates matched your search filters.'}
            </p>
            <button
              onClick={() => setShowScanner(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(147,51,234,0.35)] transition-all"
            >
              Scan &amp; Receive Crates
            </button>
          </div>
        ) : (
          filteredBags.map((bag) => {
            const fresh = calculateFreshness(bag.harvestAt);

            return (
              <div
                key={bag.id}
                className="relative backdrop-blur-xl bg-white/[0.03] rounded-2xl border border-white/[0.08] hover:border-purple-500/40 p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] hover:shadow-[0_0_25px_0_rgba(147,51,234,0.15)] transition-all duration-300"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-white">{bag.id}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${fresh.colorClass}`}
                    >
                      {fresh.score}% {fresh.label}
                    </span>
                    {bag.sizeGrade && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          bag.sizeGrade.includes('A+')
                            ? 'bg-purple-500/20 border-purple-400/40 text-purple-300'
                            : bag.sizeGrade.includes('A')
                            ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                            : bag.sizeGrade.includes('B')
                            ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                            : 'bg-slate-700/40 border-slate-600/40 text-slate-300'
                        }`}
                      >
                        {bag.sizeGrade}
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-lg font-black text-emerald-400">
                      {formatRupees(bag.totalPrice)}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      (₹{bag.pricePerKg}/kg • {bag.weightKg} kg)
                    </span>
                  </div>
                </div>

                <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div>
                    <span className="font-semibold text-white">Farmer Origin: </span>
                    {bag.farmerFirstName} ({bag.farmerPassId || '–'}) • {bag.fieldName}, {bag.village}
                  </div>
                  <div>
                    <span className="font-semibold text-white">Harvested: </span>
                    {formatIST(bag.harvestAt)} ({timeAgoIST(bag.harvestAt)})
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="pt-3 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    {bag.pieces} tomatoes in crate • Ready for shopper scan
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recent Store Sales Ledger */}
      {soldBags.length > 0 && (
        <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] p-6 shadow-xl mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">
                Completed Counter Sales ({soldBags.length})
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Total Revenue: <strong className="text-emerald-400">{formatRupees(soldBags.reduce((acc, b) => acc + (b.totalPrice || 0), 0))}</strong>
            </span>
          </div>

          <div className="space-y-3">
            {soldBags.map((bag) => (
              <div
                key={bag.id}
                className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-white">{bag.id}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ✓ Counter Paid
                    </span>
                    {bag.rating && (
                      <span className="flex items-center gap-1 text-amber-400 font-bold text-[11px]">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {bag.rating.stars} Stars
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300">
                    Buyer: <strong className="text-white">{bag.soldTo?.firstName || 'Customer'}</strong> ({bag.soldTo?.consumerPassId || '–'}) • {bag.weightKg} kg tomatoes
                  </p>
                </div>

                <div className="text-right">
                  <div className="font-bold text-emerald-400 text-sm">
                    {formatRupees(bag.totalPrice)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {bag.updatedAt ? formatIST(bag.updatedAt) : 'Recently'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Register Store Modal */}
      {showShopModal && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setShowShopModal(false)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-1">Register Retail Store</h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Enter your supermarket or grocery store outlet name and location
              </p>
              <form onSubmit={handleCreateShop} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Store Business Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newShopName}
                    onChange={(e) => setNewShopName(e.target.value)}
                    placeholder="e.g. Fresh Basket Supermarket"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Area / Locality
                  </label>
                  <input
                    type="text"
                    required
                    value={newShopArea}
                    onChange={(e) => setNewShopArea(e.target.value)}
                    placeholder="e.g. Adyar, Chennai"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowShopModal(false)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-xl text-xs font-bold shadow-[0_4px_16px_rgba(147,51,234,0.3)] transition-all"
                  >
                    Register Store
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Store Modal */}
      {editingShop && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setEditingShop(null)}
        >
          <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
            <div
              className="relative w-full max-w-sm my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 text-left shadow-2xl backdrop-blur-xl transition-all text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-base text-white mb-1">Edit Retail Store</h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Update store name and locality details
              </p>
              <form onSubmit={handleUpdateShop} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Store Business Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShop.name}
                    onChange={(e) => setEditingShop({ ...editingShop, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Area / Locality
                  </label>
                  <input
                    type="text"
                    required
                    value={editingShop.area}
                    onChange={(e) => setEditingShop({ ...editingShop, area: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500/50"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingShop(null)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-xl text-xs font-bold shadow transition-all"
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
        title="Scan Crate QR to Receive onto Shelf"
      />

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onProfileUpdated={() => {}}
        portalRole="shop"
      />
    </div>
  );
};

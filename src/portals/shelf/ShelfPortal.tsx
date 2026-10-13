import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { parseScannedBagId } from '../../lib/bagId';
import { formatIST, timeAgoIST } from '../../lib/time';
import { formatRupees } from '../../lib/price';
import { calculateFreshness } from '../../lib/freshness';
import { QRScannerModal } from '../../components/QRScannerModal';
import {
  Store,
  QrCode,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Printer,
  Search,
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
}

export const ShelfPortal: React.FC = () => {
  const { userProfile, currentUser, isOwner } = useAuth();
  const navigate = useNavigate();

  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [shelfBags, setShelfBags] = useState<ShelfBag[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFreshness, setFilterFreshness] = useState<'ALL' | 'FRESH' | 'SELL_SOON' | 'CHECK_QUALITY'>('ALL');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Scanner modal
  const [showScanner, setShowScanner] = useState(false);

  // Shop setup modal
  const [showShopModal, setShowShopModal] = useState(false);
  const [newShopName, setNewShopName] = useState('Fresh Basket Supermarket');
  const [newShopArea, setNewShopArea] = useState('Adyar, Chennai');

  const loadShelfData = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Shop for current user (or all if owner)
      let sList: Shop[] = [];
      if (isOwner) {
        const sSnap = await getDocs(collection(db, 'shops'));
        sSnap.forEach((d) => sList.push({ id: d.id, ...d.data() } as Shop));
      } else {
        const sQ = query(collection(db, 'shops'), where('shopPersonUid', '==', currentUser.uid));
        const sSnap = await getDocs(sQ);
        sSnap.forEach((d) => sList.push({ id: d.id, ...d.data() } as Shop));
      }

      // Auto-provision initial shop if none exists
      if (sList.length === 0) {
        const defaultShop: Shop = {
          id: `shop-${currentUser.uid.slice(0, 8)}`,
          shopPersonUid: currentUser.uid,
          name: 'Fresh Basket Supermarket',
          area: 'Adyar, Chennai',
        };
        await setDoc(doc(db, 'shops', defaultShop.id), defaultShop);
        sList = [defaultShop];
      }

      setShops(sList);
      const activeShop = sList[0];
      setSelectedShop(activeShop);

      // 2. Fetch Shelf Bags (status == 'AT_SHOP')
      const bQ = query(
        collection(db, 'bags'),
        where('shopId', '==', activeShop.id),
        where('status', '==', 'AT_SHOP')
      );
      const bSnap = await getDocs(bQ);
      const bList: ShelfBag[] = [];
      bSnap.forEach((d) => bList.push({ id: d.id, ...d.data() } as ShelfBag));
      bList.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setShelfBags(bList);
    } catch (err: unknown) {
      console.warn('Shelf portal load error:', err);
      setError((err as Error)?.message || 'Failed to load retail shop data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShelfData();
  }, [currentUser]);

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

    try {
      const bagRef = doc(db, 'bags', bagId);
      const bagSnap = await getDoc(bagRef);
      if (!bagSnap.exists()) {
        throw new Error(`Crate "${bagId}" not found in system.`);
      }

      const bagData = bagSnap.data();
      // Valid transition: DISPATCHED_TO_SHOP -> AT_SHOP
      if (bagData.status !== 'DISPATCHED_TO_SHOP') {
        throw new Error(
          `Crate cannot be received. Current status is "${bagData.status}". Crates must be in "DISPATCHED_TO_SHOP" status from the Mandi.`
        );
      }

      const batch = writeBatch(db);

      // 1. Update Bag to AT_SHOP
      batch.update(bagRef, {
        status: 'AT_SHOP',
        shopId: selectedShop.id,
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
        byPassId: userProfile?.passId || 'FP-S-0001',
        at: serverTimestamp(),
        place: {
          text: `${selectedShop.name} (${selectedShop.area})`,
        },
        note: `Received and placed on retail shelf for consumer purchase.`,
      });

      await batch.commit();
      setSuccessMsg(`Crate ${bagId} successfully received and placed on shelf!`);
      await loadShelfData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to receive crate.');
    }
  };

  // Create / Update Shop Profile
  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newShopName.trim() || !newShopArea.trim()) return;

    try {
      const shopId = selectedShop?.id || `shop-${currentUser.uid.slice(0, 8)}`;
      const shopData: Shop = {
        id: shopId,
        shopPersonUid: currentUser.uid,
        name: newShopName.trim(),
        area: newShopArea.trim(),
      };

      await setDoc(doc(db, 'shops', shopId), shopData, { merge: true });
      setShowShopModal(false);
      setSuccessMsg('Retail shop profile updated successfully!');
      await loadShelfData();
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to update shop profile.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
        <p className="text-xs text-gray-500">Loading retail shelf inventory...</p>
      </div>
    );
  }

  // Filter & Search Logic
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="bg-purple-700 text-white rounded-2xl p-6 shadow-xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-800 rounded-xl">
            <Store className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">Shelf Portal</h1>
              {userProfile?.passId && (
                <span className="text-xs font-mono font-bold bg-purple-800 px-2.5 py-0.5 rounded-full border border-purple-500">
                  {userProfile.passId}
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
                className="mt-1 text-xs bg-purple-800 text-white rounded-lg px-2 py-1 border border-purple-600 font-bold"
              >
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.area})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-purple-100 mt-0.5">
                Retailer: <strong>{selectedShop?.name}</strong> • {selectedShop?.area}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-gray-100 text-purple-900 rounded-xl text-xs font-bold shadow-md transition-colors touch-target"
          >
            <QrCode className="w-4 h-4" />
            <span>Receive Crate</span>
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

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Active Crates
          </div>
          <div className="text-2xl font-black text-charcoal mt-1">{totalCrates}</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Ready for shoppers</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Total Weight
          </div>
          <div className="text-2xl font-black text-charcoal mt-1">{totalWeightKg} kg</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Fresh stock</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Shelf Value
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {formatRupees(totalShelfValue)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">At ₹60 / kg</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Avg Freshness
          </div>
          <div className="text-2xl font-black text-leaf-700 mt-1">{avgFreshness}%</div>
          <div className="text-[10px] text-gray-400 mt-0.5">Quality rating</div>
        </div>
      </div>

      {/* Filter & Search Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search crate ID, farmer, village..."
            className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs focus:ring-1 focus:ring-purple-500 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {(['ALL', 'FRESH', 'SELL_SOON', 'CHECK_QUALITY'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterFreshness(mode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                filterFreshness === mode
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
      <div className="space-y-4">
        {filteredBags.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
            <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-base text-charcoal">No Crates On Shelf</h3>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              {shelfBags.length === 0
                ? 'Scan arriving crates from the Mandi to put them on your retail shelf.'
                : 'No crates matched your search filters.'}
            </p>
            <button
              onClick={() => setShowScanner(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-purple-700"
            >
              Scan & Receive Crates
            </button>
          </div>
        ) : (
          filteredBags.map((bag) => {
            const fresh = calculateFreshness(bag.harvestAt);

            return (
              <div
                key={bag.id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:border-purple-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-charcoal">{bag.id}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${fresh.colorClass}`}
                    >
                      {fresh.score}% {fresh.label}
                    </span>
                    {bag.sizeGrade && (
                      <span className="text-[10px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                        Grade {bag.sizeGrade}
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-lg font-black text-emerald-600">
                      {formatRupees(bag.totalPrice)}
                    </span>
                    <span className="text-[10px] text-gray-400 block">
                      (₹{bag.pricePerKg}/kg • {bag.weightKg} kg)
                    </span>
                  </div>
                </div>

                <div className="py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
                  <div>
                    <span className="font-semibold text-charcoal">Farmer Origin: </span>
                    {bag.farmerFirstName} ({bag.farmerPassId || '–'}) • {bag.fieldName}, {bag.village}
                  </div>
                  <div>
                    <span className="font-semibold text-charcoal">Harvested: </span>
                    {formatIST(bag.harvestAt)} ({timeAgoIST(bag.harvestAt)})
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-400">
                    {bag.pieces} tomatoes in crate
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/print/${bag.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-charcoal rounded-xl text-xs font-bold transition-colors touch-target"
                      title="Print Shelf Barcode Tag"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Label</span>
                    </button>

                    <button
                      onClick={() => navigate(`/b/${bag.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold transition-colors touch-target"
                      title="Customer QR provenance page"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Consumer View</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Shop Profile Modal */}
      {showShopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="font-bold text-base text-charcoal mb-4">Edit Retail Shop Details</h3>
            <form onSubmit={handleSaveShop} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Shop Name
                </label>
                <input
                  type="text"
                  required
                  value={newShopName}
                  onChange={(e) => setNewShopName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Area / Locality
                </label>
                <input
                  type="text"
                  required
                  value={newShopArea}
                  onChange={(e) => setNewShopArea(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowShopModal(false)}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow"
                >
                  Save Profile
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
        onScanSuccess={handleReceiveBag}
        title="Scan Crate QR to Receive onto Shelf"
      />
    </div>
  );
};

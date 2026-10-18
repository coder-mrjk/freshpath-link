import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { parseScannedBagId } from '../../lib/bagId';
import { formatIST, timeAgoIST } from '../../lib/time';
import { formatRupees } from '../../lib/price';
import { QRScannerModal } from '../../components/QRScannerModal';
import { BagProvenanceView } from './BagProvenanceView';
import {
  Salad,
  QrCode,
  Search,
  ShoppingBag,
  Star,
  ChevronRight,
  LogIn,
  History,
} from 'lucide-react';

interface PurchaseRecord {
  id: string;
  bagId: string;
  price: number;
  at: any;
  farmerName?: string;
  village?: string;
  rating?: {
    stars: number;
    comment?: string;
  };
}

export const TablePortal: React.FC = () => {
  const { userProfile, currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'SCAN' | 'HISTORY'>('SCAN');
  const [manualBagId, setManualBagId] = useState('');
  const [selectedBagId, setSelectedBagId] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  // Recent scans in localStorage
  const [recentScans, setRecentScans] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('freshpath_recent_scans');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const recordRecentScan = (bagId: string) => {
    setRecentScans((prev) => {
      const updated = [bagId, ...prev.filter((id) => id !== bagId)].slice(0, 6);
      try {
        localStorage.setItem('freshpath_recent_scans', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  // Scanner modal
  const [showScanner, setShowScanner] = useState(false);

  const loadPurchaseHistory = async () => {
    if (!currentUser) return;
    setLoadingPurchases(true);
    try {
      const pQ = query(collection(db, 'purchases'), where('consumerUid', '==', currentUser.uid));
      const pSnap = await getDocs(pQ);
      const pList: PurchaseRecord[] = [];

      for (const d of pSnap.docs) {
        const pData = d.data();
        let farmerName = 'Local Farmer';
        let village = 'Farm Cluster';
        let rating = undefined;

        // Fetch bag details for enrichment
        if (pData.bagId) {
          try {
            const bSnap = await getDoc(doc(db, 'bags', pData.bagId));
            if (bSnap.exists()) {
              const b = bSnap.data();
              farmerName = b.farmerFirstName || farmerName;
              village = b.village || village;
              rating = b.rating;
            }
          } catch (e) {
            // ignore
          }
        }

        pList.push({
          id: d.id,
          bagId: pData.bagId,
          price: pData.price || 0,
          at: pData.at,
          farmerName,
          village,
          rating,
        });
      }

      pList.sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
      setPurchases(pList);
    } catch (err) {
      console.warn('Purchases history load error:', err);
    } finally {
      setLoadingPurchases(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      loadPurchaseHistory();
    }
  }, [activeTab, currentUser]);

  const handleScanSuccess = (scannedValue: string) => {
    const bagId = parseScannedBagId(scannedValue);
    if (bagId) {
      setShowScanner(false);
      recordRecentScan(bagId);
      setSelectedBagId(bagId);
    }
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const bagId = parseScannedBagId(manualBagId);
    if (bagId) {
      recordRecentScan(bagId);
      setSelectedBagId(bagId);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner - Crimson Gradient Glass */}
      <div className="bg-gradient-to-r from-red-900/60 to-red-800/40 backdrop-blur-xl border border-red-500/20 rounded-3xl p-6 shadow-2xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-2xl shadow-[0_0_20px_0_rgba(193,18,31,0.2)]">
            <Salad className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Table Portal</h1>
              {(userProfile?.fullName || userProfile?.firstName) && (
                <span className="text-xs font-semibold bg-red-950/60 text-red-300 px-2.5 py-0.5 rounded-full border border-red-500/40">
                  {userProfile.fullName || userProfile.firstName}
                </span>
              )}
            </div>
            <p className="text-xs text-red-200/80 mt-0.5">
              Consumer:{' '}
              <strong className="text-white">{userProfile?.fullName || userProfile?.firstName || 'Guest Shopper'}</strong>
              {userProfile?.phone && <span> • 📞 {userProfile.phone}</span>}
              {!currentUser && ' • Sign in to save your history'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {!currentUser ? (
            <Link
              to="/auth/consumer?redirect=/table"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold border border-white/10 shadow-xs transition-colors touch-target"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In / Register</span>
            </Link>
          ) : null}

          <button
            onClick={() => setShowScanner(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(193,18,31,0.35)] transition-all touch-target"
          >
            <QrCode className="w-4 h-4 text-white" />
            <span>Scan Crate QR</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 pb-2">
        <button
          onClick={() => {
            setActiveTab('SCAN');
          }}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
            activeTab === 'SCAN'
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
              : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          Verify Provenance
        </button>

        <button
          onClick={() => {
            setActiveTab('HISTORY');
            setSelectedBagId(null);
          }}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'HISTORY'
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
              : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>My Purchases</span>
        </button>
      </div>

      {/* Active Crate Details View if selected */}
      {selectedBagId ? (
        <BagProvenanceView
          bagId={selectedBagId}
          onBack={() => {
            setSelectedBagId(null);
            setManualBagId('');
          }}
        />
      ) : activeTab === 'SCAN' ? (
        <div className="space-y-6">
          {/* Quick Scanner Hero Card */}
          <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] p-8 text-center shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
            <div className="w-16 h-16 bg-red-500/15 border border-red-500/30 text-red-400 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_25px_0_rgba(193,18,31,0.2)]">
              <QrCode className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-black text-white">Instant QR Crate Scanner</h2>
            <p className="text-xs text-slate-400 mt-1 mb-6 max-w-sm mx-auto leading-relaxed">
              Scan any FreshPath tomato crate QR code at your retail supermarket to inspect complete farm-to-table provenance, harvest time, temperature history, and GPS route.
            </p>
            <button
              onClick={() => setShowScanner(true)}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-full text-sm font-bold shadow-[0_4px_24px_rgba(193,18,31,0.4)] transition-all touch-target inline-flex items-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              <span>Launch Camera Scanner</span>
            </button>
          </div>

          {/* Manual Entry Fallback */}
          <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-2xl border border-white/[0.08] p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Search className="w-4 h-4 text-slate-400" />
              <span>Or Enter Crate ID Manually</span>
            </h3>
            <form onSubmit={handleManualSearch} className="flex gap-2">
              <input
                type="text"
                required
                value={manualBagId}
                onChange={(e) => setManualBagId(e.target.value)}
                placeholder="e.g. FP-TOM-261013-ABC123"
                className="flex-1 px-4 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50"
              />
              <button
                type="submit"
                className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Inspect
              </button>
            </form>
          </div>

          {/* Recently Inspected Crates */}
          {recentScans.length > 0 && (
            <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-2xl border border-white/[0.08] p-5 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <History className="w-4 h-4 text-red-400" />
                <span>Recently Inspected Crates</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentScans.map((rId) => (
                  <button
                    key={rId}
                    type="button"
                    onClick={() => setSelectedBagId(rId)}
                    className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 touch-target"
                  >
                    <span>{rId}</span>
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Purchase History Tab */
        <div className="relative backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] p-6 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <h3 className="font-bold text-sm text-white mb-4 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-red-400" />
            <span>My Purchased Crates {currentUser ? `(${purchases.length})` : ''}</span>
          </h3>

          {!currentUser ? (
            <div className="py-12 px-6 text-center bg-white/[0.02] rounded-2xl border border-dashed border-white/10">
              <div className="w-12 h-12 bg-red-500/15 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-red-500/20">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">Save Your Produce History</h4>
              <p className="text-xs text-slate-400 mt-1 mb-5 max-w-sm mx-auto leading-relaxed">
                Create a free consumer account to automatically track your fresh produce purchases, retain digital farm provenance receipts, and leave direct ratings for farmers.
              </p>
              <Link
                to="/auth/consumer?redirect=/table"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-full text-xs font-bold shadow-[0_4px_20px_rgba(193,18,31,0.35)] transition-all touch-target"
              >
                <LogIn className="w-4 h-4" />
                <span>Create Consumer Account / Sign In</span>
              </Link>
            </div>
          ) : loadingPurchases ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500 mx-auto mb-2"></div>
              <p className="text-xs text-slate-400">Loading your purchase ledger...</p>
            </div>
          ) : purchases.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs bg-white/[0.02] border border-white/[0.06] rounded-2xl">
              <p>You have not confirmed any crate purchases yet.</p>
              <button
                onClick={() => setActiveTab('SCAN')}
                className="mt-3 px-5 py-2 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-full text-xs font-bold"
              >
                Scan Produce Now
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {purchases.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedBagId(p.bagId)}
                  className="p-4 rounded-2xl border border-white/[0.08] hover:border-red-500/40 bg-white/[0.02] cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-white">{p.bagId}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                        Purchased
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">
                      Farmer: <strong className="text-white">{p.farmerName}</strong> • {p.village}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Bought on {formatIST(p.at)} ({timeAgoIST(p.at)})
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right">
                      <div className="text-base font-black text-emerald-400">
                        {formatRupees(p.price)}
                      </div>
                      {p.rating ? (
                        <div className="flex items-center gap-0.5 text-amber-400 text-[10px]">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          <span>{p.rating.stars} stars rated</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-amber-400 underline">Tap to rate</span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scanner Modal */}
      <QRScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanSuccess={handleScanSuccess}
        title="Scan Crate QR to Verify Provenance"
      />
    </div>
  );
};

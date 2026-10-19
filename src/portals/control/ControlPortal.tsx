import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, UserProfile, UserRole, OWNER_EMAIL } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatIST } from '../../lib/time';
import { GradePricing, DEFAULT_GRADE_PRICING, formatRupees } from '../../lib/price';
import { UserSettingsModal } from '../../components/UserSettingsModal';
import {
  ShieldCheck,
  CheckCircle,
  Radio,
  Cpu,
  Users,
  Search,
  DollarSign,
  RefreshCw,
  LogOut,
  Lock,
  Settings,
} from 'lucide-react';

export const ControlPortal: React.FC = () => {
  const {
    isOwner,
    currentUser,
    userProfile,
    loading: authLoading,
    logout,
  } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'approvals' | 'users' | 'hardware' | 'security' | 'config'>('approvals');
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; driverUid: string; regNumber: string; gpsUnitId?: string }>>([]);
  const [mandis, setMandis] = useState<Array<{ id: string; name: string; area: string; mandiPersonUid?: string; nodeUnitId?: string }>>([]);
  const [devices, setDevices] = useState<Array<{ id: string; unitId: string; type: 'gps' | 'storage' }>>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Hardware Link Form State
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [gpsUnitIdInput, setGpsUnitIdInput] = useState('GPS-01');
  const [selectedMandiId, setSelectedMandiId] = useState('');
  const [sensorNodeIdInput, setSensorNodeIdInput] = useState('STORE-01');

  // Config State
  const [gradePrices, setGradePrices] = useState<GradePricing>(DEFAULT_GRADE_PRICING);

  useEffect(() => {
    if (!authLoading && !isOwner) {
      // If not owner, redirect to owner login
      navigate('/auth/control');
    }
  }, [isOwner, authLoading, navigate]);

  // Strict Root Owner identification helper
  const isRootOwnerUser = (u: { email?: string; uid?: string } | null | undefined): boolean => {
    if (!u) return false;
    const email = (u.email || '').toLowerCase().trim();
    return email === OWNER_EMAIL.toLowerCase() || u.uid === 'oMl0ziVO7aWj9MH26ocPGH41fG12';
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Pending Users
      const qPending = query(collection(db, 'users'), where('status', '==', 'pending'));
      const pendingSnap = await getDocs(qPending);
      const pendingList: UserProfile[] = [];
      pendingSnap.forEach((d) => pendingList.push({ ...d.data(), uid: d.id } as UserProfile));
      setPendingUsers(pendingList);

      // 2. All Users
      const allSnap = await getDocs(collection(db, 'users'));
      const allList: UserProfile[] = [];
      allSnap.forEach((d) => {
        const data = d.data() as UserProfile;
        const isThisOwner = isRootOwnerUser({ email: (data as any).email, uid: d.id });
        if (isThisOwner) {
          data.role = 'owner';
          data.status = 'approved';
          data.passId = 'FP-OWNER-0001';
        } else if (data.role === 'owner') {
          // Demote any non-owner document falsely marked as owner
          data.role = 'consumer';
          if (data.passId === 'FP-OWNER-0001') {
            data.passId = undefined;
          }
        }
        allList.push({ ...data, uid: d.id });
      });
      setAllUsers(allList);

      // 3. Vehicles
      const vSnap = await getDocs(collection(db, 'vehicles'));
      const vList: Array<{ id: string; driverUid: string; regNumber: string; gpsUnitId?: string }> = [];
      vSnap.forEach((d) => vList.push({ id: d.id, ...d.data() } as any));
      setVehicles(vList);
      if (vList.length > 0 && !selectedVehicleId) {
        setSelectedVehicleId(vList[0].id);
      }

      // 4. Mandis (for direct Mandi Climate DHT22 sensor binding)
      const mSnap = await getDocs(collection(db, 'mandis'));
      const mList: Array<{ id: string; name: string; area: string; mandiPersonUid?: string; nodeUnitId?: string }> = [];
      mSnap.forEach((d) => mList.push({ id: d.id, ...d.data() } as any));
      setMandis(mList);
      if (mList.length > 0 && !selectedMandiId) {
        setSelectedMandiId(mList[0].id);
      }

      // 4b. Registered IoT Devices (from /devices)
      const devSnap = await getDocs(collection(db, 'devices'));
      const devList: Array<{ id: string; unitId: string; type: 'gps' | 'storage' }> = [];
      devSnap.forEach((d) => devList.push({ id: d.id, ...d.data() } as any));
      setDevices(devList);


      // 5. Product rate & Grade Pricing
      const pricingDoc = await getDoc(doc(db, 'config', 'pricing'));
      if (pricingDoc.exists()) {
        const pData = pricingDoc.data() as GradePricing;
        const loadedPricing: GradePricing = {
          gradeAPlus: pData.gradeAPlus ?? DEFAULT_GRADE_PRICING.gradeAPlus,
          gradeA: pData.gradeA ?? DEFAULT_GRADE_PRICING.gradeA,
          gradeB: pData.gradeB ?? DEFAULT_GRADE_PRICING.gradeB,
          gradeC: pData.gradeC ?? DEFAULT_GRADE_PRICING.gradeC,
        };
        setGradePrices(loadedPricing);
      } else {
        const prodDoc = await getDoc(doc(db, 'products', 'tomato'));
        if (prodDoc.exists() && prodDoc.data().ratePerKg) {
          setGradePrices((prev) => ({ ...prev, gradeA: prodDoc.data().ratePerKg }));
        }
      }

    } catch (err: unknown) {
      console.warn('Control portal load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getRolePrefix = (role: UserRole) => {
    switch (role) {
      case 'farmer':
        return 'FP-F-';
      case 'driver':
        return 'FP-D-';
      case 'mandi':
        return 'FP-M-';
      case 'shop':
        return 'FP-S-';
      default:
        return 'FP-U-';
    }
  };

  // Approve & issue pass ID via transaction on counters/{role}
  const handleApprove = async (userToApprove: UserProfile) => {
    setActionLoading(userToApprove.uid);
    setMessage(null);

    try {
      const role = userToApprove.role;
      const counterRef = doc(db, 'counters', role);
      const userRef = doc(db, 'users', userToApprove.uid);

      await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextNum = 1;
        if (counterDoc.exists()) {
          nextNum = counterDoc.data().next || 1;
        }

        const prefix = getRolePrefix(role);
        const passId = `${prefix}${String(nextNum).padStart(4, '0')}`;

        transaction.set(counterRef, { next: nextNum + 1 }, { merge: true });
        transaction.update(userRef, {
          status: 'approved',
          passId,
          approvedAt: serverTimestamp(),
          approvedBy: currentUser?.uid || 'OWNER',
        });
      });

      setMessage({
        text: `Approved ${userToApprove.firstName} (${userToApprove.role}) with new Pass ID!`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      setMessage({
        text: `Approval failed: ${(err as Error)?.message || 'Database error'}`,
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Suspend/Restore/Reject
  const handleUpdateStatus = async (uid: string, status: 'suspended' | 'rejected' | 'approved') => {
    const targetUser = allUsers.find((u) => u.uid === uid);
    if (isRootOwnerUser({ email: (targetUser as any)?.email, uid })) {
      setMessage({ text: 'Root System Owner status is protected and cannot be altered.', type: 'error' });
      return;
    }
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), { status });
      setMessage({ text: `Account status updated to ${status}.`, type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: `Status update failed: ${(err as Error)?.message}`, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Delete user from directory
  const handleDeleteUser = async (uid: string, _role: string) => {
    const targetUser = allUsers.find((u) => u.uid === uid);
    if (isRootOwnerUser({ email: (targetUser as any)?.email, uid })) {
      setMessage({ text: 'Root System Owner cannot be deleted.', type: 'error' });
      return;
    }
    if (!window.confirm('Are you sure you want to permanently delete this user from the directory?')) return;
    setActionLoading(uid);
    try {
      await deleteDoc(doc(db, 'users', uid));
      setMessage({ text: 'User removed from directory.', type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: `Failed to delete user: ${(err as Error)?.message}`, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Bind GPS unit to vehicle
  const handleLinkGps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleId || !gpsUnitIdInput.trim()) return;

    try {
      const vRef = doc(db, 'vehicles', selectedVehicleId);
      await updateDoc(vRef, {
        gpsUnitId: gpsUnitIdInput.trim().toUpperCase(),
        status: 'ACTIVE',
      });

      const gpsRef = doc(db, 'gpsUnits', gpsUnitIdInput.trim().toUpperCase());
      await setDoc(
        gpsRef,
        {
          vehicleId: selectedVehicleId,
          receivedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const targetVehicle = vehicles.find((v) => v.id === selectedVehicleId);
      const vehicleDisplay = targetVehicle?.regNumber || selectedVehicleId;

      setMessage({
        text: `Vehicle ${vehicleDisplay} linked to ${gpsUnitIdInput.trim().toUpperCase()}!`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: `GPS linking failed: ${(err as Error)?.message}`, type: 'error' });
    }
  };

  // Bind DHT22 Sensor Node to Mandi directly
  const handleLinkMandiSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMandiId || !sensorNodeIdInput.trim()) return;

    try {
      const nodeUnitId = sensorNodeIdInput.trim().toUpperCase();
      const mRef = doc(db, 'mandis', selectedMandiId);
      await updateDoc(mRef, {
        nodeUnitId,
      });

      const targetMandi = mandis.find((m) => m.id === selectedMandiId);
      const mandiName = targetMandi?.name || selectedMandiId;

      setMessage({
        text: `Mandi "${mandiName}" linked to DHT22 sensor node ${nodeUnitId}!`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: `Mandi sensor linking failed: ${(err as Error)?.message}`, type: 'error' });
    }
  };

  // Unbind GPS unit from vehicle
  const handleUnlinkGps = async (vehicleId: string) => {
    try {
      const vRef = doc(db, 'vehicles', vehicleId);
      await updateDoc(vRef, {
        gpsUnitId: null,
        status: 'PENDING_GPS',
      });
      const targetVehicle = vehicles.find((v) => v.id === vehicleId);
      setMessage({
        text: `Unpaired GPS unit from vehicle ${targetVehicle?.regNumber || vehicleId}!`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: `GPS unlinking failed: ${(err as Error)?.message}`, type: 'error' });
    }
  };

  // Unbind DHT22 Sensor Node from Mandi
  const handleUnlinkMandiSensor = async (mandiId: string) => {
    try {
      const mRef = doc(db, 'mandis', mandiId);
      await updateDoc(mRef, {
        nodeUnitId: null,
      });
      const targetMandi = mandis.find((m) => m.id === mandiId);
      setMessage({
        text: `Unpaired DHT22 sensor from Mandi "${targetMandi?.name || mandiId}"!`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: `Mandi sensor unlinking failed: ${(err as Error)?.message}`, type: 'error' });
    }
  };

  // Update grade pricing matrix
  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(
        doc(db, 'config', 'pricing'),
        {
          gradeAPlus: Number(gradePrices.gradeAPlus),
          gradeA: Number(gradePrices.gradeA),
          gradeB: Number(gradePrices.gradeB),
          gradeC: Number(gradePrices.gradeC),
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.uid,
        },
        { merge: true }
      );

      await setDoc(
        doc(db, 'products', 'tomato'),
        {
          name: 'Fresh Tomatoes',
          ratePerKg: Number(gradePrices.gradeA),
          gradePrices,
          active: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage({
        text: `Grade pricing saved: Grade A+ (₹${gradePrices.gradeAPlus}), Grade A (₹${gradePrices.gradeA}), Grade B (₹${gradePrices.gradeB}), Grade C (₹${gradePrices.gradeC})`,
        type: 'success',
      });
    } catch (err: unknown) {
      setMessage({ text: `Failed to update pricing: ${(err as Error)?.message}`, type: 'error' });
    }
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      u.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.passId && u.passId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#0F172A] text-slate-100 overflow-hidden max-w-6xl mx-auto px-4 py-8">
      {/* Background radial gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(193,18,31,0.5) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-[600px] h-[600px] rounded-full blur-[120px] opacity-15 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(2,132,199,0.5) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Top Banner */}
      <div className="relative backdrop-blur-2xl bg-slate-900/80 border border-white/10 rounded-3xl p-6 shadow-2xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-2xl shadow-[0_0_20px_0_rgba(193,18,31,0.2)]">
            <ShieldCheck className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white">Control Portal</h1>
              <span className="text-[10px] font-mono font-bold bg-red-500/20 border border-red-400/40 text-red-300 px-2.5 py-0.5 rounded-full">
                ROOT OWNER
              </span>
              {(userProfile?.fullName || currentUser?.displayName) && (
                <span className="text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 px-2.5 py-0.5 rounded-full">
                  {userProfile?.fullName || currentUser?.displayName}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Administered by: <strong>{userProfile?.fullName || currentUser?.displayName || currentUser?.email || OWNER_EMAIL}</strong>
              {userProfile?.phone && <span> • {userProfile.phone}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
            title="User Profile & Settings"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold transition-all shadow-[0_4px_16px_rgba(239,68,68,0.3)]"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-2xl text-xs font-semibold flex items-center justify-between backdrop-blur-md shadow-lg ${message.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
            : 'bg-red-500/10 text-red-300 border border-red-500/30'
            }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="underline text-[11px] ml-4 hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 pb-3 mb-6">
        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'approvals'
            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
            : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
            }`}
        >
          <span>Pending Approvals</span>
          {pendingUsers.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-400 text-slate-950 text-[10px] font-black">
              {pendingUsers.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'users'
            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
            : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
            }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory ({allUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('hardware')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'hardware'
            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
            : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
            }`}
        >
          <Radio className="w-4 h-4" />
          <span>IoT Hardware Binding</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'security'
            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
            : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
            }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>System Security</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'config'
            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
            : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
            }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Rates & Configuration</span>
        </button>
      </div>

      {loading && (
        <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <RefreshCw className="w-4 h-4 animate-spin text-red-400" />
          <span>Synchronizing portal datasets...</span>
        </div>
      )}

      {/* Tab 1: Approvals Queue */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              Pending Verification Requests
            </h2>
            <span className="text-xs text-slate-400">
              {pendingUsers.length} pending review
            </span>
          </div>

          {pendingUsers.length === 0 ? (
            <div className="backdrop-blur-xl bg-white/[0.03] p-12 rounded-3xl border border-white/[0.08] text-center text-slate-400 shadow-xl">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="font-bold text-sm text-white">All caught up!</p>
              <p className="text-xs text-slate-400 mt-1">
                There are currently no new registration requests awaiting approval.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingUsers.map((u) => (
                <div
                  key={u.uid}
                  className="relative backdrop-blur-xl bg-white/[0.03] p-5 rounded-2xl border border-amber-500/30 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300">
                        {u.role}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formatIST(u.createdAt as any)}
                      </span>
                    </div>

                    <h3 className="font-extrabold text-base text-white">{u.fullName || u.firstName}</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      📍 {u.addressText || 'Location not specified'} • 📞 {u.phone || 'No phone'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mt-5 pt-4 border-t border-white/10">
                    <button
                      onClick={() => handleApprove(u)}
                      disabled={actionLoading === u.uid}
                      className="flex-1 py-2 px-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_16px_rgba(74,222,128,0.25)] touch-target"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{actionLoading === u.uid ? 'Approving...' : 'Approve & Issue Pass'}</span>
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(u.uid, 'rejected')}
                      disabled={actionLoading === u.uid}
                      className="py-2 px-3 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 rounded-xl text-xs font-semibold transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: All Users Directory */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, Pass ID, or role..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-white/10 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 shadow-inner"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          </div>

          <div className="backdrop-blur-xl bg-white/[0.03] rounded-3xl border border-white/[0.08] overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.04] border-b border-white/10 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Pass ID</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredUsers.map((u) => {
                    const isRootOwner = isRootOwnerUser({ email: (u as any).email, uid: u.uid });
                    return (
                      <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-red-400">
                          {u.passId || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {u.fullName || u.firstName || 'User'}
                            {isRootOwner && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/20 text-red-300 border border-red-500/30 uppercase tracking-wider font-bold">
                                Root Owner
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            📞 {u.phone || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-300">{u.role}</td>
                        <td className="px-4 py-3 text-slate-400">{u.addressText || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${isRootOwner || u.status === 'approved'
                              ? 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-300'
                              : u.status === 'pending'
                                ? 'bg-amber-500/15 border border-amber-400/30 text-amber-300'
                                : 'bg-red-500/15 border border-red-400/30 text-red-300'
                              }`}
                          >
                            {isRootOwner ? 'Approved' : u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isRootOwner ? (
                            <span className="text-[11px] text-slate-500 font-mono italic">Protected</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2.5">
                              {u.status === 'approved' && (
                                <button
                                  onClick={() => handleUpdateStatus(u.uid, 'suspended')}
                                  disabled={actionLoading === u.uid}
                                  className="text-[11px] text-amber-400 hover:text-amber-300 underline font-semibold"
                                >
                                  Suspend
                                </button>
                              )}
                              {u.status === 'suspended' && (
                                <button
                                  onClick={() => handleUpdateStatus(u.uid, 'approved')}
                                  disabled={actionLoading === u.uid}
                                  className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-semibold"
                                >
                                  Approve
                                </button>
                              )}
                              {u.status === 'pending' && (
                                <button
                                  onClick={() => handleApprove(u)}
                                  disabled={actionLoading === u.uid}
                                  className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-semibold"
                                >
                                  Approve
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteUser(u.uid, u.role)}
                                disabled={actionLoading === u.uid}
                                className="text-[11px] text-red-400 hover:text-red-300 underline font-semibold"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Hardware Linking & Pairing Management */}
      {activeTab === 'hardware' && (
        <div className="space-y-6">
          {/* Registered Firebase IoT Devices Banner */}
          <div className="backdrop-blur-xl bg-white/[0.03] p-5 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-500/15 border border-red-500/30 text-red-400 rounded-xl">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Registered IoT Hardware Nodes in Firebase</h3>
                  <p className="text-[11px] text-slate-400">Authenticated ESP32 hardware credentials registered under /devices collection</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-white/10 font-mono">
                {devices.length} Devices Online
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {devices.map((d) => (
                <div
                  key={d.id}
                  className="p-3.5 bg-slate-900/70 rounded-2xl border border-white/10 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-white">{d.unitId}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        d.type === 'gps'
                          ? 'bg-sky-500/20 border-sky-400/30 text-sky-300'
                          : 'bg-amber-500/20 border-amber-400/30 text-amber-300'
                      }`}>
                        {d.type.toUpperCase()} Node
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-1 truncate max-w-[240px]" title={d.id}>
                      UID: {d.id}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (d.type === 'gps') {
                        setGpsUnitIdInput(d.unitId);
                      } else {
                        setSensorNodeIdInput(d.unitId);
                      }
                    }}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-colors"
                  >
                    Use ID
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Pairing Forms: 2 Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Link Vehicle to GPS */}
            <div className="backdrop-blur-xl bg-white/[0.03] p-6 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-sky-500/15 border border-sky-400/30 text-sky-400 rounded-xl">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Vehicle GPS Pairing</h3>
                  <p className="text-xs text-slate-400">Bind physical GPS tracker to driver vehicle</p>
                </div>
              </div>

              <form onSubmit={handleLinkGps} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Select Registered Vehicle
                  </label>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500/50"
                  >
                    {vehicles.length === 0 && <option value="" className="bg-slate-900 text-white">No vehicles registered</option>}
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                        {v.regNumber} ({v.gpsUnitId ? `GPS: ${v.gpsUnitId}` : 'Unlinked'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      GPS Hardware Unit ID
                    </label>
                    {devices.filter((d) => d.type === 'gps').length > 0 && (
                      <div className="flex gap-1">
                        {devices.filter((d) => d.type === 'gps').map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setGpsUnitIdInput(d.unitId)}
                            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30"
                          >
                            {d.unitId}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={gpsUnitIdInput}
                    onChange={(e) => setGpsUnitIdInput(e.target.value)}
                    placeholder="e.g. GPS-01"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={vehicles.length === 0}
                    className="flex-1 py-2.5 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all touch-target shadow-[0_4px_16px_rgba(2,132,199,0.3)]"
                  >
                    Pair Vehicle GPS Unit
                  </button>
                  {vehicles.find((v) => v.id === selectedVehicleId)?.gpsUnitId && (
                    <button
                      type="button"
                      onClick={() => handleUnlinkGps(selectedVehicleId)}
                      className="px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-colors"
                      title="Unpair GPS from this vehicle"
                    >
                      Unpair
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Link Mandi Facility to DHT22 Climate Node */}
            <div className="backdrop-blur-xl bg-white/[0.03] p-6 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-amber-500/15 border border-amber-400/30 text-amber-400 rounded-xl">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Mandi Climate Sensor Pairing</h3>
                  <p className="text-xs text-slate-400">Bind DHT22 temperature & humidity sensor directly to Mandi</p>
                </div>
              </div>

              <form onSubmit={handleLinkMandiSensor} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Select Mandi Facility
                  </label>
                  <select
                    value={selectedMandiId}
                    onChange={(e) => setSelectedMandiId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                  >
                    {mandis.length === 0 && <option value="" className="bg-slate-900 text-white">No mandis registered</option>}
                    {mandis.map((m) => (
                      <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                        {m.name} ({m.area}) — {m.nodeUnitId ? `Node: ${m.nodeUnitId}` : 'Unlinked'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      DHT22 Sensor Node Unit ID
                    </label>
                    {devices.filter((d) => d.type === 'storage').length > 0 && (
                      <div className="flex gap-1">
                        {devices.filter((d) => d.type === 'storage').map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setSensorNodeIdInput(d.unitId)}
                            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          >
                            {d.unitId}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={sensorNodeIdInput}
                    onChange={(e) => setSensorNodeIdInput(e.target.value)}
                    placeholder="e.g. STORE-01"
                    className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={mandis.length === 0}
                    className="flex-1 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all touch-target shadow-[0_4px_16px_rgba(217,119,6,0.3)]"
                  >
                    Bind Mandi Climate Sensor
                  </button>
                  {mandis.find((m) => m.id === selectedMandiId)?.nodeUnitId && (
                    <button
                      type="button"
                      onClick={() => handleUnlinkMandiSensor(selectedMandiId)}
                      className="px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-colors"
                      title="Unpair DHT22 sensor from this Mandi"
                    >
                      Unpair
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Live Hardware Pairings Status Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vehicles Pairing Status */}
            <div className="backdrop-blur-xl bg-white/[0.03] p-5 rounded-3xl border border-white/[0.08] shadow-xl">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
                <span>Vehicle $\leftrightarrow$ GPS Active Links</span>
                <span className="text-[10px] text-slate-400 font-mono">{vehicles.length} Vehicles</span>
              </h4>
              <div className="space-y-2">
                {vehicles.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">No vehicles found.</p>
                ) : (
                  vehicles.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 bg-slate-900/60 rounded-xl border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-white">{v.regNumber}</span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {v.id}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {v.gpsUnitId ? (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            {v.gpsUnitId}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 font-semibold">Unlinked</span>
                        )}
                        {v.gpsUnitId && (
                          <button
                            type="button"
                            onClick={() => handleUnlinkGps(v.id)}
                            className="text-[10px] text-red-400 hover:text-red-300 underline"
                          >
                            Unpair
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Mandi Pairing Status */}
            <div className="backdrop-blur-xl bg-white/[0.03] p-5 rounded-3xl border border-white/[0.08] shadow-xl">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
                <span>Mandi $\leftrightarrow$ DHT22 Active Links</span>
                <span className="text-[10px] text-slate-400 font-mono">{mandis.length} Mandis</span>
              </h4>
              <div className="space-y-2">
                {mandis.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">No mandis found.</p>
                ) : (
                  mandis.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-slate-900/60 rounded-xl border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-white">{m.name}</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">📍 {m.area}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.nodeUnitId ? (
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {m.nodeUnitId}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 font-semibold">Unlinked</span>
                        )}
                        {m.nodeUnitId && (
                          <button
                            type="button"
                            onClick={() => handleUnlinkMandiSensor(m.id)}
                            className="text-[10px] text-red-400 hover:text-red-300 underline"
                          >
                            Unpair
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: System Security */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Owner Account Status */}
          <div className="backdrop-blur-xl bg-white/[0.03] p-6 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-red-500/15 border border-red-400/30 text-red-400 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">System Owner Verification</h3>
                <p className="text-xs text-slate-400">Designated administrative account</p>
              </div>
            </div>

            <div className="space-y-3 text-xs bg-slate-900/60 p-4 rounded-2xl border border-white/10">
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-slate-400">Owner Email:</span>
                <span className="font-mono font-bold text-white">{currentUser?.email || OWNER_EMAIL}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-slate-400">Account UID:</span>
                <span className="font-mono text-slate-300 text-[11px] truncate max-w-[180px]">{currentUser?.uid}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-slate-400">Pass ID:</span>
                <span className="font-mono font-bold text-red-400">FP-OWNER-0001</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-slate-400">Google Sign-In:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Enabled
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-slate-400">Email Verification:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Verified
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Account Role:</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Root Owner (Permanent)
                </span>
              </div>
            </div>
          </div>

          {/* Security Architecture Card */}
          <div className="backdrop-blur-xl bg-white/[0.03] p-6 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-emerald-500/15 border border-emerald-400/30 text-emerald-400 rounded-xl">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">System Security Policy</h3>
                <p className="text-xs text-slate-400">Authentication & server-side enforcement</p>
              </div>
            </div>

            <div className="space-y-3 text-xs bg-slate-900/60 p-4 rounded-2xl border border-white/10">
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-slate-400">Sign-In Providers:</span>
                <span className="font-semibold text-white">Google OAuth 2.0 & Email/Password</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/10">
                <span className="text-slate-400">Firestore Security:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Server-side Rules Enforced
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Owner Access Shield:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Protected
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Configuration */}
      {activeTab === 'config' && (
        <div className="max-w-2xl relative backdrop-blur-xl bg-white/[0.03] p-6 sm:p-8 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-red-500/15 border border-red-400/30 text-red-400 rounded-2xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Customizable Grade Pricing Matrix</h3>
              <p className="text-xs text-slate-400">Configure prices per kilogram based on tomato quality grade. Higher grades yield premium rates; lower grades decrease accordingly.</p>
            </div>
          </div>

          <form onSubmit={handleUpdatePrice} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Grade A+ */}
              <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    Grade A+ (Supreme / Export)
                  </span>
                  <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded-full">
                    Premium Tier
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-2.5">Flawless, highest firmness, uniform size.</p>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={gradePrices.gradeAPlus}
                    onChange={(e) =>
                      setGradePrices((prev) => ({ ...prev, gradeAPlus: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 bg-slate-900/80 border border-purple-500/40 rounded-xl text-sm font-black text-purple-200 focus:outline-none focus:border-purple-400"
                  />
                  <span className="text-xs text-slate-400 font-medium">/kg</span>
                </div>
              </div>

              {/* Grade A */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Grade A (Wholesale Premium)
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                    Benchmark
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-2.5">Standard market choice, brilliant red, firm.</p>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={gradePrices.gradeA}
                    onChange={(e) =>
                      setGradePrices((prev) => ({ ...prev, gradeA: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 bg-slate-900/80 border border-emerald-500/40 rounded-xl text-sm font-black text-emerald-200 focus:outline-none focus:border-emerald-400"
                  />
                  <span className="text-xs text-slate-400 font-medium">/kg</span>
                </div>
              </div>

              {/* Grade B */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Grade B (Standard Market)
                  </span>
                  <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                    Regular
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-2.5">Medium size, minor color variations, local sales.</p>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={gradePrices.gradeB}
                    onChange={(e) =>
                      setGradePrices((prev) => ({ ...prev, gradeB: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 bg-slate-900/80 border border-amber-500/40 rounded-xl text-sm font-black text-amber-200 focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-xs text-slate-400 font-medium">/kg</span>
                </div>
              </div>

              {/* Grade C */}
              <div className="p-4 rounded-2xl bg-slate-500/10 border border-slate-500/30">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Grade C (Economy / Puree)
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-500/20 px-2 py-0.5 rounded-full">
                    Discounted
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-2.5">Ripened, variable size, sauce & juice processing.</p>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={gradePrices.gradeC}
                    onChange={(e) =>
                      setGradePrices((prev) => ({ ...prev, gradeC: Number(e.target.value) }))
                    }
                    className="w-full px-3 py-2 bg-slate-900/80 border border-slate-500/40 rounded-xl text-sm font-black text-slate-200 focus:outline-none focus:border-slate-400"
                  />
                  <span className="text-xs text-slate-400 font-medium">/kg</span>
                </div>
              </div>
            </div>

            {/* Live Calculation Preview */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/10 text-xs">
              <span className="font-bold text-slate-300 block mb-2">Live Standard 25 kg Crate Pricing Preview:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30">
                  <span className="text-[10px] text-purple-300 block font-bold">Grade A+ (25kg)</span>
                  <span className="text-sm font-black text-white">{formatRupees(25 * gradePrices.gradeAPlus)}</span>
                </div>
                <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30">
                  <span className="text-[10px] text-emerald-300 block font-bold">Grade A (25kg)</span>
                  <span className="text-sm font-black text-white">{formatRupees(25 * gradePrices.gradeA)}</span>
                </div>
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
                  <span className="text-[10px] text-amber-300 block font-bold">Grade B (25kg)</span>
                  <span className="text-sm font-black text-white">{formatRupees(25 * gradePrices.gradeB)}</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-700/30 border border-slate-600/30">
                  <span className="text-[10px] text-slate-300 block font-bold">Grade C (25kg)</span>
                  <span className="text-sm font-black text-white">{formatRupees(25 * gradePrices.gradeC)}</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white rounded-xl text-sm font-bold transition-all shadow-[0_4px_20px_rgba(225,29,72,0.4)] touch-target"
            >
              Save Grade Pricing Matrix
            </button>
          </form>
        </div>
      )}

      {/* User Settings Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onProfileUpdated={loadData}
        portalRole="control"
      />
    </div>
  );
};

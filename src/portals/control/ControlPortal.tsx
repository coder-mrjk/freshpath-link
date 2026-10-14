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
  Smartphone,
  Lock,
} from 'lucide-react';

export const ControlPortal: React.FC = () => {
  const {
    isOwner,
    currentUser,
    loading: authLoading,
    logout,
    enrolledMfaFactors,
    setupRecaptcha,
    sendPhoneVerificationForMfa,
    enrollPhoneMfa,
    unenrollMfa,
  } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'approvals' | 'users' | 'hardware' | 'security' | 'config'>('approvals');
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; driverUid: string; regNumber: string; gpsUnitId?: string }>>([]);
  const [storageUnits, setStorageUnits] = useState<Array<{ id: string; mandiId: string; name: string; nodeUnitId?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Hardware Link Form State
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [gpsUnitIdInput, setGpsUnitIdInput] = useState('GPS-01');
  const [selectedStorageId, setSelectedStorageId] = useState('');
  const [sensorNodeIdInput, setSensorNodeIdInput] = useState('STORE-01');

  // Config State
  const [ratePerKg, setRatePerKg] = useState(60);

  // MFA Enrollment State
  const [mfaPhone, setMfaPhone] = useState('+91');
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);
  const [mfaOtp, setMfaOtp] = useState('');
  const [mfaActionLoading, setMfaActionLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !isOwner) {
      // If not owner, redirect to owner login
      navigate('/auth/control');
    }
  }, [isOwner, authLoading, navigate]);

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
        const isThisOwner =
          data.role === 'owner' ||
          d.id === currentUser?.uid ||
          (data as any).email === OWNER_EMAIL;
        if (isThisOwner) {
          data.role = 'owner';
          data.status = 'approved';
          data.passId = data.passId || 'FP-OWNER-0001';
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

      // 4. Storage Units
      const sSnap = await getDocs(collection(db, 'storageUnits'));
      const sList: Array<{ id: string; mandiId: string; name: string; nodeUnitId?: string }> = [];
      sSnap.forEach((d) => sList.push({ id: d.id, ...d.data() } as any));
      setStorageUnits(sList);
      if (sList.length > 0 && !selectedStorageId) {
        setSelectedStorageId(sList[0].id);
      }

      // 5. Product rate
      const prodDoc = await getDoc(doc(db, 'products', 'tomato'));
      if (prodDoc.exists()) {
        setRatePerKg(prodDoc.data().ratePerKg || 60);
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
    if (targetUser?.role === 'owner' || uid === currentUser?.uid) {
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
  const handleDeleteUser = async (uid: string, role: string) => {
    if (role === 'owner' || uid === currentUser?.uid) {
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

      setMessage({
        text: `Vehicle ${selectedVehicleId} linked to ${gpsUnitIdInput.trim().toUpperCase()}!`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: `GPS linking failed: ${(err as Error)?.message}`, type: 'error' });
    }
  };

  // Bind Sensor Node to Storage Unit
  const handleLinkSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStorageId || !sensorNodeIdInput.trim()) return;

    try {
      const sRef = doc(db, 'storageUnits', selectedStorageId);
      await updateDoc(sRef, {
        nodeUnitId: sensorNodeIdInput.trim().toUpperCase(),
      });

      setMessage({
        text: `Storage unit linked to sensor node ${sensorNodeIdInput.trim().toUpperCase()}!`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: `Sensor node linking failed: ${(err as Error)?.message}`, type: 'error' });
    }
  };

  // Update base rate
  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(
        doc(db, 'products', 'tomato'),
        {
          name: 'Fresh Tomatoes',
          ratePerKg: Number(ratePerKg),
          active: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setMessage({ text: `Base tomato rate updated to ₹${ratePerKg}/kg!`, type: 'success' });
    } catch (err: unknown) {
      setMessage({ text: `Failed to update rate: ${(err as Error)?.message}`, type: 'error' });
    }
  };

  // Send SMS MFA Enrollment Code
  const handleSendMfaEnrollCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setMfaActionLoading(true);

    try {
      if (currentUser) {
        await currentUser.reload();
      }
      const rv = setupRecaptcha('mfa-recaptcha-container');
      const vId = await sendPhoneVerificationForMfa(mfaPhone.trim(), rv);
      setMfaVerificationId(vId);
      setMessage({
        text: `Verification code sent to ${mfaPhone.trim()}! Please enter the 6-digit SMS code below.`,
        type: 'success',
      });
    } catch (err: unknown) {
      setMessage({
        text: `Failed to send SMS code: ${(err as Error)?.message || 'Recaptcha/SMS error'}`,
        type: 'error',
      });
    } finally {
      setMfaActionLoading(false);
    }
  };

  // Confirm SMS MFA Enrollment
  const handleConfirmMfaEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaVerificationId || !mfaOtp.trim()) return;
    setMessage(null);
    setMfaActionLoading(true);

    try {
      await enrollPhoneMfa(mfaVerificationId, mfaOtp.trim());
      setMessage({
        text: 'SMS Multi-Factor Authentication successfully enrolled on your Owner account!',
        type: 'success',
      });
      setMfaVerificationId(null);
      setMfaOtp('');
    } catch (err: unknown) {
      setMessage({
        text: `Enrollment failed: ${(err as Error)?.message || 'Invalid code'}`,
        type: 'error',
      });
    } finally {
      setMfaActionLoading(false);
    }
  };

  // Remove MFA factor
  const handleUnenrollMfa = async (uid: string) => {
    if (!window.confirm('Are you sure you want to disable SMS 2FA on this phone number?')) return;
    setMfaActionLoading(true);
    try {
      await unenrollMfa(uid);
      setMessage({ text: 'SMS 2FA factor removed.', type: 'success' });
    } catch (err: unknown) {
      setMessage({ text: `Unenroll failed: ${(err as Error)?.message}`, type: 'error' });
    } finally {
      setMfaActionLoading(false);
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
      <div id="mfa-recaptcha-container" />
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
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Administered by: <strong>{currentUser?.email || OWNER_EMAIL}</strong> • Hardware Binding & Verification
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          className={`mb-6 p-4 rounded-2xl text-xs font-semibold flex items-center justify-between backdrop-blur-md shadow-lg ${
            message.type === 'success'
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
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'approvals'
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
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'users'
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
              : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory ({allUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('hardware')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'hardware'
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
              : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>IoT Hardware Binding</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'security'
              ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border border-red-500/30 shadow-[0_0_20px_0_rgba(193,18,31,0.3)]'
              : 'backdrop-blur-md bg-white/[0.03] text-slate-300 border border-white/10 hover:bg-white/[0.08] hover:text-white'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Security & SMS MFA</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeTab === 'config'
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

                    <h3 className="font-extrabold text-base text-white">{u.firstName}</h3>
                    <p className="text-xs text-slate-300 mt-0.5">{u.fullName}</p>
                    <p className="text-xs text-slate-400 mt-2">
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
                    const isRootOwner =
                      u.role === 'owner' ||
                      u.uid === currentUser?.uid ||
                      (u as any).email === OWNER_EMAIL;
                    return (
                      <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-red-400">
                          {u.passId || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {u.firstName}
                            {isRootOwner && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/20 text-red-300 border border-red-500/30 uppercase tracking-wider font-bold">
                                Root Owner
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">{u.fullName}</div>
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-300">{u.role}</td>
                        <td className="px-4 py-3 text-slate-400">{u.addressText || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              isRootOwner || u.status === 'approved'
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

      {/* Tab 3: Hardware Linking */}
      {activeTab === 'hardware' && (
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
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  GPS Hardware Unit ID
                </label>
                <input
                  type="text"
                  value={gpsUnitIdInput}
                  onChange={(e) => setGpsUnitIdInput(e.target.value)}
                  placeholder="e.g. GPS-01"
                  className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50"
                />
              </div>

              <button
                type="submit"
                disabled={vehicles.length === 0}
                className="w-full py-2.5 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all touch-target shadow-[0_4px_16px_rgba(2,132,199,0.3)]"
              >
                Pair Vehicle GPS Unit
              </button>
            </form>
          </div>

          {/* Link Cold Storage to DHT22 Node */}
          <div className="backdrop-blur-xl bg-white/[0.03] p-6 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-500/15 border border-amber-400/30 text-amber-400 rounded-xl">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Storage Sensor Pairing</h3>
                <p className="text-xs text-slate-400">Bind DHT22 telemetry node to Mandi bay</p>
              </div>
            </div>

            <form onSubmit={handleLinkSensor} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Select Cold Storage Unit
                </label>
                <select
                  value={selectedStorageId}
                  onChange={(e) => setSelectedStorageId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500/50"
                >
                  {storageUnits.length === 0 && <option value="" className="bg-slate-900 text-white">No storage units registered</option>}
                  {storageUnits.map((s) => (
                    <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                      {s.name} ({s.nodeUnitId ? `Node: ${s.nodeUnitId}` : 'Unlinked'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Sensor Node Unit ID
                </label>
                <input
                  type="text"
                  value={sensorNodeIdInput}
                  onChange={(e) => setSensorNodeIdInput(e.target.value)}
                  placeholder="e.g. STORE-01"
                  className="w-full px-3 py-2 bg-slate-800/80 border border-white/10 rounded-xl text-xs font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <button
                type="submit"
                disabled={storageUnits.length === 0}
                className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all touch-target shadow-[0_4px_16px_rgba(217,119,6,0.3)]"
              >
                Bind Environmental Sensor
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab 4: Security & SMS MFA */}
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
                <span className="text-slate-400">SMS MFA Status:</span>
                <span className={`font-bold flex items-center gap-1 ${enrolledMfaFactors.length > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {enrolledMfaFactors.length > 0 ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" /> Active ({enrolledMfaFactors.length} Factor)
                    </>
                  ) : (
                    'Not Enrolled (Configure below)'
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* SMS Multi-Factor Enrollment */}
          <div className="backdrop-blur-xl bg-white/[0.03] p-6 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-amber-500/15 border border-amber-400/30 text-amber-400 rounded-xl">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">SMS MFA Phone Enrollment</h3>
                <p className="text-xs text-slate-400">Two-factor authentication with SMS OTP</p>
              </div>
            </div>

            {enrolledMfaFactors.length > 0 ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs">
                  <p className="font-bold text-emerald-300 mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    SMS 2FA is currently active on this account
                  </p>
                  {enrolledMfaFactors.map((factor) => (
                    <div key={factor.uid} className="flex items-center justify-between py-2 border-t border-emerald-500/20 text-slate-300">
                      <div>
                        <span className="font-semibold">{factor.displayName || 'SMS Factor'}</span>
                        <div className="text-[11px] text-slate-400 font-mono">{(factor as any).phoneNumber || 'Registered mobile'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnenrollMfa(factor.uid)}
                        disabled={mfaActionLoading}
                        className="text-xs text-red-400 hover:text-red-300 underline font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : !mfaVerificationId ? (
              <form onSubmit={handleSendMfaEnrollCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mobile Phone Number (with Country Code)
                  </label>
                  <input
                    type="tel"
                    required
                    value={mfaPhone}
                    onChange={(e) => setMfaPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Example: +91 98765 43210. A 6-digit SMS verification code will be sent.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={mfaActionLoading || mfaPhone.length < 10}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-[0_4px_16px_rgba(217,119,6,0.3)] touch-target flex items-center justify-center gap-2"
                >
                  {mfaActionLoading ? (
                    <span>Sending SMS Code...</span>
                  ) : (
                    <>
                      <Smartphone className="w-4 h-4" />
                      <span>Send SMS Verification Code</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleConfirmMfaEnroll} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Enter 6-Digit SMS Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={mfaOtp}
                    onChange={(e) => setMfaOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full px-4 py-2.5 bg-slate-800/80 border border-amber-500/40 text-center font-mono text-lg tracking-[0.4em] text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={mfaActionLoading || mfaOtp.length < 6}
                    className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md touch-target flex items-center justify-center gap-2"
                  >
                    {mfaActionLoading ? 'Verifying...' : 'Complete SMS MFA Enrollment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaVerificationId(null);
                      setMfaOtp('');
                    }}
                    className="py-2.5 px-4 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Configuration */}
      {activeTab === 'config' && (
        <div className="max-w-md relative backdrop-blur-xl bg-white/[0.03] p-6 rounded-3xl border border-white/[0.08] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-red-500/15 border border-red-400/30 text-red-400 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Tomato Base Pricing</h3>
              <p className="text-xs text-slate-400">Configure base price per kilogram for fresh harvest</p>
            </div>
          </div>

          <form onSubmit={handleUpdatePrice} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Rate (₹ per kg)
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={ratePerKg}
                onChange={(e) => setRatePerKg(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-800/80 border border-white/10 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-red-500/50"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Standard FreshPath benchmark: ₹60/kg.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl text-xs font-bold transition-all shadow-[0_4px_16px_rgba(193,18,31,0.3)] touch-target"
            >
              Update Pricing
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

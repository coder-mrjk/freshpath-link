import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, UserProfile, UserRole } from '../../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  runTransaction,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatIST } from '../../lib/time';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  Radio,
  Cpu,
  Users,
  Search,
  DollarSign,
  RefreshCw,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { seedFreshPathDemoData } from '../../lib/seed';

export const ControlPortal: React.FC = () => {
  const { isOwner, currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'approvals' | 'users' | 'hardware' | 'config'>('approvals');
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
  const [seeding, setSeeding] = useState(false);

  const handleSeedData = async () => {
    if (!window.confirm('Seed complete FreshPath demo dataset with 7 produce stages, demo accounts, and 24h IoT telemetry?')) return;
    setSeeding(true);
    const res = await seedFreshPathDemoData();
    setSeeding(false);
    if (res.success) {
      setMessage({ text: 'Master demo dataset seeded successfully!', type: 'success' });
      await loadData();
    } else {
      setMessage({ text: res.message, type: 'error' });
    }
  };

  useEffect(() => {
    if (!loading && !isOwner) {
      // If not owner, redirect
      navigate('/auth/control');
    }
  }, [isOwner, loading, navigate]);

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
      allSnap.forEach((d) => allList.push({ ...d.data(), uid: d.id } as UserProfile));
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
          nextNum = (counterDoc.data().next || 1);
        }

        const prefix = getRolePrefix(role);
        const passId = `${prefix}${String(nextNum).padStart(4, '0')}`;

        // Increment counter
        transaction.set(counterRef, { next: nextNum + 1 }, { merge: true });

        // Update user
        transaction.update(userRef, {
          status: 'approved',
          passId,
          approvedAt: serverTimestamp(),
          approvedBy: currentUser?.uid || 'owner',
        });
      });

      setMessage({
        text: `Approved ${userToApprove.firstName} successfully! Pass ID assigned.`,
        type: 'success',
      });
      await loadData();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Failed to approve user.';
      setMessage({ text: msg, type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (uid: string) => {
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
      setMessage({ text: 'User application rejected.', type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Error rejecting user.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (uid: string) => {
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'suspended',
        updatedAt: serverTimestamp(),
      });
      setMessage({ text: 'User access suspended.', type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Error suspending user.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivate = async (uid: string) => {
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });
      setMessage({ text: 'User access reinstated.', type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Error reinstating user.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  // Hardware linking
  const handleLinkGps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleId || !gpsUnitIdInput.trim()) return;
    try {
      await updateDoc(doc(db, 'vehicles', selectedVehicleId), {
        gpsUnitId: gpsUnitIdInput.trim().toUpperCase(),
        status: 'ACTIVE',
        updatedAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, 'gpsUnits', gpsUnitIdInput.trim().toUpperCase()),
        {
          vehicleId: selectedVehicleId,
          linkedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setMessage({ text: `Linked ${gpsUnitIdInput} to vehicle ${selectedVehicleId}!`, type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Failed to link GPS.', type: 'error' });
    }
  };

  const handleLinkSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStorageId || !sensorNodeIdInput.trim()) return;
    try {
      await updateDoc(doc(db, 'storageUnits', selectedStorageId), {
        nodeUnitId: sensorNodeIdInput.trim().toUpperCase(),
        updatedAt: serverTimestamp(),
      });
      setMessage({ text: `Linked ${sensorNodeIdInput} to storage unit!`, type: 'success' });
      await loadData();
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Failed to link sensor.', type: 'error' });
    }
  };

  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(
        doc(db, 'products', 'tomato'),
        {
          name: 'Tomato',
          ratePerKg: Number(ratePerKg),
          active: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setMessage({ text: `Tomato rate updated to ₹${ratePerKg}/kg!`, type: 'success' });
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Failed to update rate.', type: 'error' });
    }
  };

  const filteredUsers = allUsers.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.firstName?.toLowerCase().includes(q) ||
      u.fullName?.toLowerCase().includes(q) ||
      u.passId?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.phone?.includes(q)
    );
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Top Banner */}
      <div className="bg-charcoal text-white rounded-2xl p-6 shadow-xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-600 rounded-xl text-white">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Control Portal</h1>
            <p className="text-xs text-gray-300">
              Master administration, user verification, pass issuance & IoT hardware binding
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedData}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 text-xs font-bold transition-colors shadow-sm"
            title="Seed full demo dataset across all 7 stages"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            <span>{seeding ? 'Seeding...' : 'Seed Demo Data'}</span>
          </button>
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="underline text-[11px] ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 mb-6">
        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
            activeTab === 'approvals'
              ? 'bg-tomato-500 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <span>Pending Approvals</span>
          {pendingUsers.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-white text-tomato-600 text-[10px]">
              {pendingUsers.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
            activeTab === 'users'
              ? 'bg-tomato-500 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory ({allUsers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('hardware')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
            activeTab === 'hardware'
              ? 'bg-tomato-500 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>IoT Hardware Binding</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
            activeTab === 'config'
              ? 'bg-tomato-500 text-white shadow-sm'
              : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Rates & Configuration</span>
        </button>
      </div>

      {/* Tab 1: Approvals Queue */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-charcoal">
              Pending Verification Requests
            </h2>
            <span className="text-xs text-gray-500">
              {pendingUsers.length} pending review
            </span>
          </div>

          {pendingUsers.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="font-bold text-sm text-charcoal">All caught up!</p>
              <p className="text-xs text-gray-400 mt-1">
                There are currently no new registration requests awaiting approval.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingUsers.map((u) => (
                <div
                  key={u.uid}
                  className="bg-white p-5 rounded-2xl border-2 border-amber-200 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {u.role}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {formatIST(u.createdAt as any)}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-charcoal">{u.firstName}</h3>
                    <p className="text-xs text-gray-500">Full Name: {u.fullName}</p>
                    <p className="text-xs text-gray-500">Phone: {u.phone}</p>
                    <p className="text-xs text-gray-500">Location: {u.addressText}</p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-gray-100 flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(u)}
                      disabled={actionLoading === u.uid}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm touch-target transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Approve & Issue Pass</span>
                    </button>
                    <button
                      onClick={() => handleReject(u.uid)}
                      disabled={actionLoading === u.uid}
                      className="px-3 py-2.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 rounded-xl text-xs font-bold transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: User Directory */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, pass ID, phone..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-tomato-500 focus:outline-none"
              />
            </div>
            <span className="text-xs text-gray-500">
              Showing {filteredUsers.length} of {allUsers.length} users
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-sandBg text-gray-600 border-b border-gray-200">
                  <tr>
                    <th className="p-3">Pass ID</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.uid} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-charcoal">
                        {u.passId || '–'}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-charcoal">{u.firstName}</div>
                        <div className="text-[11px] text-gray-400">{u.addressText}</div>
                      </td>
                      <td className="p-3 capitalize font-semibold">{u.role}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            u.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : u.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono">{u.phone}</td>
                      <td className="p-3 text-right">
                        {u.status === 'approved' ? (
                          <button
                            onClick={() => handleSuspend(u.uid)}
                            disabled={actionLoading === u.uid}
                            className="px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Suspend
                          </button>
                        ) : u.status === 'suspended' ? (
                          <button
                            onClick={() => handleReactivate(u.uid)}
                            disabled={actionLoading === u.uid}
                            className="px-2.5 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            Reinstate
                          </button>
                        ) : u.status === 'pending' ? (
                          <button
                            onClick={() => handleApprove(u)}
                            disabled={actionLoading === u.uid}
                            className="px-2.5 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            Approve
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Hardware Binding */}
      {activeTab === 'hardware' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Link GPS to Vehicle */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-charcoal">Bind GPS Node to Vehicle</h3>
                <p className="text-xs text-gray-500">Link ESP32 NEO-M8N hardware unit to a driver truck</p>
              </div>
            </div>

            <form onSubmit={handleLinkGps} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Registered Driver Vehicle
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                >
                  {vehicles.length === 0 && <option value="">No registered vehicles found</option>}
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.regNumber} ({v.gpsUnitId ? `Linked: ${v.gpsUnitId}` : 'Unlinked'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Hardware Unit ID
                </label>
                <input
                  type="text"
                  value={gpsUnitIdInput}
                  onChange={(e) => setGpsUnitIdInput(e.target.value)}
                  placeholder="e.g. GPS-01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={vehicles.length === 0}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold transition-colors touch-target shadow-sm"
              >
                Bind GPS Unit
              </button>
            </form>
          </div>

          {/* Link Sensor Node to Storage Unit */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-charcoal">Bind Environmental Node</h3>
                <p className="text-xs text-gray-500">Link Arduino/ESP32 DHT22 sensor to mandi storage</p>
              </div>
            </div>

            <form onSubmit={handleLinkSensor} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Mandi Storage Unit
                </label>
                <select
                  value={selectedStorageId}
                  onChange={(e) => setSelectedStorageId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white"
                >
                  {storageUnits.length === 0 && <option value="">No storage units registered</option>}
                  {storageUnits.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.nodeUnitId ? `Node: ${s.nodeUnitId}` : 'Unlinked'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Sensor Node Unit ID
                </label>
                <input
                  type="text"
                  value={sensorNodeIdInput}
                  onChange={(e) => setSensorNodeIdInput(e.target.value)}
                  placeholder="e.g. STORE-01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs font-mono uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={storageUnits.length === 0}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white rounded-xl text-xs font-bold transition-colors touch-target shadow-sm"
              >
                Bind Environmental Sensor
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Tab 4: Configuration */}
      {activeTab === 'config' && (
        <div className="max-w-md bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-tomato-50 text-tomato-500 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-charcoal">Tomato Base Pricing</h3>
              <p className="text-xs text-gray-500">Configure base price per kilogram for fresh harvest</p>
            </div>
          </div>

          <form onSubmit={handleUpdatePrice} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Rate (₹ per kg)
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={ratePerKg}
                onChange={(e) => setRatePerKg(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-tomato-500 focus:outline-none"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Standard FreshPath benchmark: ₹60/kg.
              </p>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-tomato-500 hover:bg-tomato-600 text-white rounded-xl text-xs font-bold transition-colors shadow-sm touch-target"
            >
              Update Pricing
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

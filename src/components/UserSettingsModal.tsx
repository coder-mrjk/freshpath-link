import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  X,
  Lock,
  CheckCircle,
  AlertCircle,
  Truck,
  Sprout,
  Warehouse,
  Plus,
  Save,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
  portalRole?: 'farmer' | 'driver' | 'mandi' | 'shop' | 'consumer' | 'control';
}

interface FieldItem {
  id: string;
  name: string;
  village: string;
  district?: string;
}

interface VehicleItem {
  id: string;
  regNumber: string;
  vehicleType: string;
  capacityKg: number;
  status: string;
  gpsUnitId?: string;
}

interface StorageUnitItem {
  id: string;
  name: string;
  nodeUnitId: string;
  capacityCrates?: number;
}

export const UserSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onProfileUpdated,
  portalRole,
}) => {
  const { userProfile, currentUser, isOwner, updateUserProfile } = useAuth();

  // Active role determines which role-specific section to show (if any).
  // Root Owner / Admin ('control' or 'owner') never shows farmer/driver/mandi entity sections!
  const activeRole = portalRole || (isOwner ? 'owner' : userProfile?.role);

  // Basic Profile State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressText, setAddressText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Role entities
  const [fields, setFields] = useState<FieldItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [storageUnits, setStorageUnits] = useState<StorageUnitItem[]>([]);
  const [mandiName, setMandiName] = useState('');
  const [mandiArea, setMandiArea] = useState('');
  const [mandiId, setMandiId] = useState('');

  // Add Field Form State
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldVillage, setNewFieldVillage] = useState('');
  const [newFieldDistrict, setNewFieldDistrict] = useState('');

  // Add Vehicle Form State
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newRegNumber, setNewRegNumber] = useState('');
  const [newVehicleType, setNewVehicleType] = useState('Pickup Truck');
  const [newCapacityKg, setNewCapacityKg] = useState('1000');

  // Add Storage Unit Form State
  const [showAddStorage, setShowAddStorage] = useState(false);
  const [newStorageName, setNewStorageName] = useState('');
  const [newNodeId, setNewNodeId] = useState('STORE-02');

  useEffect(() => {
    if (userProfile) {
      setFullName(userProfile.fullName || userProfile.firstName || '');
      setPhone(userProfile.phone || '');
      setAddressText(userProfile.addressText || '');
    }
  }, [userProfile]);

  const loadRoleEntities = async () => {
    if (!currentUser) return;
    try {
      // Only load entities for the matching activeRole
      if (activeRole === 'farmer') {
        const fQ = query(collection(db, 'fields'), where('farmerUid', '==', currentUser.uid));
        const fSnap = await getDocs(fQ);
        const fList: FieldItem[] = [];
        fSnap.forEach((d) => fList.push({ id: d.id, ...d.data() } as FieldItem));
        setFields(fList);
      } else if (activeRole === 'driver') {
        const vQ = query(collection(db, 'vehicles'), where('driverUid', '==', currentUser.uid));
        const vSnap = await getDocs(vQ);
        const vList: VehicleItem[] = [];
        vSnap.forEach((d) => vList.push({ id: d.id, ...d.data() } as VehicleItem));
        setVehicles(vList);
      } else if (activeRole === 'mandi') {
        const mQ = query(collection(db, 'mandis'), where('mandiPersonUid', '==', currentUser.uid));
        const mSnap = await getDocs(mQ);
        if (!mSnap.empty) {
          const mDoc = mSnap.docs[0];
          setMandiId(mDoc.id);
          setMandiName(mDoc.data().name || '');
          setMandiArea(mDoc.data().area || '');

          const uQ = query(collection(db, 'storageUnits'), where('mandiId', '==', mDoc.id));
          const uSnap = await getDocs(uQ);
          const uList: StorageUnitItem[] = [];
          uSnap.forEach((d) => uList.push({ id: d.id, ...d.data() } as StorageUnitItem));
          setStorageUnits(uList);
        }
      }
    } catch (err) {
      console.warn('Error loading role entities in settings:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      loadRoleEntities();
    }
  }, [isOpen, currentUser, userProfile, isOwner]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const cleanFullName = fullName.trim();
    if (!cleanFullName) {
      setMessage({ text: 'Full Name is required.', type: 'error' });
      return;
    }

    const cleanPhone = phone.trim();
    if (cleanPhone && !/^\d{10}$/.test(cleanPhone)) {
      setMessage({
        text: 'Phone number must be exactly 10 digits (e.g. 9876543210).',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile({
        fullName: cleanFullName,
        phone: cleanPhone,
        addressText: addressText.trim(),
      });
      setMessage({ text: 'Profile updated successfully!', type: 'success' });
      if (onProfileUpdated) onProfileUpdated();
    } catch (err: unknown) {
      setMessage({
        text: (err as Error)?.message || 'Failed to update profile.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // Farmer Add Field
  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newFieldName.trim()) return;

    try {
      const docRef = await addDoc(collection(db, 'fields'), {
        farmerUid: currentUser.uid,
        name: newFieldName.trim(),
        village: newFieldVillage.trim() || addressText || 'Tamil Nadu',
        district: newFieldDistrict.trim(),
        createdAt: serverTimestamp(),
      });

      setFields((prev) => [
        ...prev,
        {
          id: docRef.id,
          name: newFieldName.trim(),
          village: newFieldVillage.trim() || addressText || 'Tamil Nadu',
          district: newFieldDistrict.trim(),
        },
      ]);
      setNewFieldName('');
      setNewFieldVillage('');
      setNewFieldDistrict('');
      setShowAddField(false);
      setMessage({ text: 'New farm field added successfully!', type: 'success' });
      if (onProfileUpdated) onProfileUpdated();
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Failed to add field.', type: 'error' });
    }
  };

  // Driver Add Vehicle
  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newRegNumber.trim()) return;

    try {
      const vehicleId = newRegNumber.replace(/\s+/g, '').toUpperCase();
      const newVeh: VehicleItem = {
        id: vehicleId,
        regNumber: newRegNumber.trim().toUpperCase(),
        vehicleType: newVehicleType,
        capacityKg: Number(newCapacityKg) || 1000,
        status: 'PENDING_GPS',
      };

      await setDoc(doc(db, 'vehicles', vehicleId), {
        driverUid: currentUser.uid,
        regNumber: newVeh.regNumber,
        vehicleType: newVeh.vehicleType,
        capacityKg: newVeh.capacityKg,
        status: newVeh.status,
        createdAt: serverTimestamp(),
      });

      setVehicles((prev) => [...prev, newVeh]);
      setNewRegNumber('');
      setShowAddVehicle(false);
      setMessage({ text: `Vehicle "${newVeh.regNumber}" registered successfully!`, type: 'success' });
      if (onProfileUpdated) onProfileUpdated();
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Failed to register vehicle.', type: 'error' });
    }
  };

  // Mandi Add Storage Unit
  const handleAddStorage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !mandiId || !newStorageName.trim() || !newNodeId.trim()) return;

    try {
      const unitId = newNodeId.trim().toUpperCase();
      const newUnit: StorageUnitItem = {
        id: unitId,
        name: newStorageName.trim(),
        nodeUnitId: unitId,
        capacityCrates: 200,
      };

      await setDoc(doc(db, 'storageUnits', unitId), {
        mandiId,
        name: newUnit.name,
        nodeUnitId: newUnit.nodeUnitId,
        capacityCrates: newUnit.capacityCrates,
        currentTemp: 13.5,
        currentHumidity: 88.0,
        latest: {
          tempC: 13.5,
          humidityPct: 88.0,
          at: new Date().toISOString(),
        },
        createdAt: serverTimestamp(),
      });

      setStorageUnits((prev) => [...prev, newUnit]);
      setNewStorageName('');
      setShowAddStorage(false);
      setMessage({ text: `Cold storage unit "${unitId}" added successfully!`, type: 'success' });
      if (onProfileUpdated) onProfileUpdated();
    } catch (err: unknown) {
      setMessage({ text: (err as Error)?.message || 'Failed to add storage unit.', type: 'error' });
    }
  };

  const role = isOwner ? 'owner' : userProfile?.role || 'user';

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md transition-opacity"
      onClick={onClose}
    >
      <div className="flex min-h-full items-start sm:items-center justify-center p-4 sm:p-6 text-center">
        <div
          className="relative w-full max-w-2xl my-8 transform overflow-hidden rounded-3xl bg-slate-900/95 border border-white/10 p-6 sm:p-8 text-left shadow-2xl backdrop-blur-xl transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Modal Header */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                User Profile & Settings
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {role}
              </span>
            </div>

            {/* Unique Pass ID Notice */}
            <div className="mt-2 p-3.5 bg-slate-800/60 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 font-mono text-xs font-bold">
                  ID
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Supply Chain Pass ID
                  </div>
                  <div className="text-sm font-mono font-black text-emerald-400 tracking-tight">
                    {userProfile?.passId || (isOwner ? 'FP-OWNER-0001' : 'Pending Issuance')}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 italic text-right max-w-[220px]">
                Unique supply chain identifier
              </span>
            </div>
          </div>

          {/* Notification Banner */}
          {message && (
            <div
              className={`mb-5 p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${message.type === 'success'
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/15 border border-red-500/30 text-red-300'
                }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Profile Edit Form */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Arul Murugan"
                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone Number (Strict 10 Digits) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Phone Number (10 Digits) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/50 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Location / Village */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Village / Town / Area
                </label>
                <input
                  type="text"
                  value={addressText}
                  onChange={(e) => setAddressText(e.target.value)}
                  placeholder="e.g. Panruti, Cuddalore"
                  className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
                />
              </div>

              {/* Gmail / Email (Disabled Read-Only) */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Account Email</span>
                  <span className="text-[10px] text-slate-500 font-normal flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Read-only
                  </span>
                </label>
                <input
                  type="email"
                  disabled
                  value={currentUser?.email || ''}
                  className="w-full px-3.5 py-2.5 bg-slate-800/40 border border-white/5 text-slate-400 rounded-xl text-sm cursor-not-allowed select-none font-mono"
                />
              </div>
            </div>

            {/* Save Profile Button */}
            <div className="pt-3 flex items-center justify-end gap-3 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>

          {/* ROLE-SPECIFIC ENTITY SECTIONS (Only shown for matching non-owner roles) */}
          {(activeRole === 'farmer' || activeRole === 'driver' || activeRole === 'mandi') && (
            <hr className="my-6 border-white/10" />
          )}

          {/* 1. FARMER: Manage Multiple Farms / Fields */}
          {activeRole === 'farmer' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Sprout className="w-4 h-4 text-emerald-400" />
                    Registered Farms & Fields
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Manage your cultivation fields and origin clusters
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddField(!showAddField)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddField ? 'Cancel' : 'Add Field'}</span>
                </button>
              </div>

              {/* Add Field Form */}
              {showAddField && (
                <form onSubmit={handleAddField} className="p-4 bg-emerald-950/30 border border-emerald-500/25 rounded-2xl space-y-3">
                  <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    New Field Details
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="Field Name (e.g. Vadakku Thottam)"
                      className="px-3 py-2 bg-slate-900 border border-emerald-500/30 text-white rounded-xl text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newFieldVillage}
                      onChange={(e) => setNewFieldVillage(e.target.value)}
                      placeholder="Village (e.g. Panruti)"
                      className="px-3 py-2 bg-slate-900 border border-emerald-500/30 text-white rounded-xl text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={newFieldDistrict}
                      onChange={(e) => setNewFieldDistrict(e.target.value)}
                      placeholder="District (e.g. Cuddalore)"
                      className="px-3 py-2 bg-slate-900 border border-emerald-500/30 text-white rounded-xl text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow"
                    >
                      Save Field
                    </button>
                  </div>
                </form>
              )}

              {/* Fields List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {fields.length === 0 ? (
                  <div className="col-span-2 text-xs text-slate-500 italic p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                    No farm fields registered yet. Click &quot;Add Field&quot; above to create one.
                  </div>
                ) : (
                  fields.map((f) => (
                    <div key={f.id} className="p-3 bg-white/[0.03] border border-white/10 rounded-xl flex flex-col justify-between">
                      <div className="font-bold text-white text-xs">{f.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {f.village}{f.district ? `, ${f.district}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 2. DRIVER: Hold More Than 1 Vehicle */}
          {activeRole === 'driver' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Truck className="w-4 h-4 text-sky-400" />
                    Registered Transport Vehicles
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Drivers can register and hold multiple transport vehicles
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddVehicle(!showAddVehicle)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 rounded-xl text-xs font-bold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddVehicle ? 'Cancel' : 'Add Vehicle'}</span>
                </button>
              </div>

              {/* Add Vehicle Form */}
              {showAddVehicle && (
                <form onSubmit={handleAddVehicle} className="p-4 bg-sky-950/30 border border-sky-500/25 rounded-2xl space-y-3">
                  <div className="text-xs font-bold text-sky-300 uppercase tracking-wider">
                    Register New Vehicle
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      value={newRegNumber}
                      onChange={(e) => setNewRegNumber(e.target.value.toUpperCase())}
                      placeholder="Reg No (e.g. TN 31 AB 1234)"
                      className="px-3 py-2 bg-slate-900 border border-sky-500/30 text-white rounded-xl text-xs font-mono uppercase focus:ring-1 focus:ring-sky-400 focus:outline-none"
                    />
                    <select
                      value={newVehicleType}
                      onChange={(e) => setNewVehicleType(e.target.value)}
                      className="px-3 py-2 bg-slate-900 border border-sky-500/30 text-white rounded-xl text-xs focus:ring-1 focus:ring-sky-400 focus:outline-none"
                    >
                      <option value="Pickup Truck">Pickup Truck</option>
                      <option value="LCV Mini Truck">LCV Mini Truck</option>
                      <option value="Heavy Truck">Heavy Truck</option>
                      <option value="Three Wheeler">Three Wheeler</option>
                    </select>
                    <input
                      type="number"
                      value={newCapacityKg}
                      onChange={(e) => setNewCapacityKg(e.target.value)}
                      placeholder="Capacity (kg)"
                      className="px-3 py-2 bg-slate-900 border border-sky-500/30 text-white rounded-xl text-xs focus:ring-1 focus:ring-sky-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow"
                    >
                      Save Vehicle
                    </button>
                  </div>
                </form>
              )}

              {/* Vehicles List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {vehicles.length === 0 ? (
                  <div className="col-span-2 text-xs text-slate-500 italic p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                    No transport vehicles registered yet. Click &quot;Add Vehicle&quot; to register your first vehicle.
                  </div>
                ) : (
                  vehicles.map((v) => (
                    <div key={v.id} className="p-3 bg-white/[0.03] border border-white/10 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="font-mono font-bold text-white text-xs tracking-wider">
                          {v.regNumber}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {v.vehicleType} • {v.capacityKg} kg capacity
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        {v.gpsUnitId || 'GPS-01'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 3. MANDI: Cold Storage Units */}
          {activeRole === 'mandi' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-amber-400" />
                    Mandi Cold Storage Units
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {mandiName ? `${mandiName} (${mandiArea})` : 'Cold room chambers & IoT sensor links'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddStorage(!showAddStorage)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-bold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showAddStorage ? 'Cancel' : 'Add Unit'}</span>
                </button>
              </div>

              {/* Add Storage Form */}
              {showAddStorage && (
                <form onSubmit={handleAddStorage} className="p-4 bg-amber-950/30 border border-amber-500/25 rounded-2xl space-y-3">
                  <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                    New Cold Storage Room
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      value={newStorageName}
                      onChange={(e) => setNewStorageName(e.target.value)}
                      placeholder="Unit Name (e.g. Cold Room B)"
                      className="px-3 py-2 bg-slate-900 border border-amber-500/30 text-white rounded-xl text-xs focus:ring-1 focus:ring-amber-400 focus:outline-none"
                    />
                    <input
                      type="text"
                      required
                      value={newNodeId}
                      onChange={(e) => setNewNodeId(e.target.value.toUpperCase())}
                      placeholder="Sensor Node ID (e.g. STORE-02)"
                      className="px-3 py-2 bg-slate-900 border border-amber-500/30 text-white rounded-xl text-xs font-mono uppercase focus:ring-1 focus:ring-amber-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow"
                    >
                      Save Unit
                    </button>
                  </div>
                </form>
              )}

              {/* Storage Units List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {storageUnits.length === 0 ? (
                  <div className="col-span-2 text-xs text-slate-500 italic p-3 bg-white/[0.02] border border-white/5 rounded-xl">
                    No cold storage units configured yet.
                  </div>
                ) : (
                  storageUnits.map((u) => (
                    <div key={u.id} className="p-3 bg-white/[0.03] border border-white/10 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white text-xs">{u.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Node: {u.nodeUnitId}
                        </div>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        12°C–15°C Target
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Bottom Close Action */}
          <div className="mt-8 pt-4 border-t border-white/10 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors"
            >
              Close Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

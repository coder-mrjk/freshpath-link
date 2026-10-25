import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  collection,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';
import { generateRandomCode } from '../lib/bagId';

export type UserRole = 'farmer' | 'driver' | 'mandi' | 'shop' | 'consumer' | 'owner';
export type UserStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

export const OWNER_EMAIL = 'tonightgamermrjk@gmail.com';

export interface DeviceRecord {
  token: string;
  name: string;
  os?: string;
  browser?: string;
  type?: 'mobile' | 'tablet' | 'desktop';
  lastSeen?: string;
}

export interface UserProfile {
  uid: string;
  role: UserRole;
  status: UserStatus;
  passId?: string;
  firstName: string;
  fullName: string;
  phone: string;
  addressText: string;
  preferredLang: 'en' | 'ta';
  fcmTokens?: string[];
  devices?: DeviceRecord[];
  notificationsEnabled?: boolean;
  createdAt?: unknown;
  approvedAt?: unknown;
  approvedBy?: string;
}

export interface RegisterExtraData {
  // Farmer
  fieldName?: string;
  fieldVillage?: string;
  fieldDistrict?: string;
  // Driver
  regNumber?: string;
  vehicleType?: string;
  capacityKg?: number;
  // Mandi
  mandiName?: string;
  mandiArea?: string;
  storageUnitName?: string;
  // Shop
  shopName?: string;
  shopArea?: string;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isOwner: boolean;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: (targetRole?: UserRole | 'control') => Promise<{ isNewUser?: boolean; user: User }>;
  register: (
    email: string,
    pass: string,
    role: UserRole,
    firstName: string,
    fullName: string,
    phone: string,
    addressText: string,
    extras?: RegisterExtraData
  ) => Promise<void>;
  updateUserProfile: (updates: {
    fullName?: string;
    phone?: string;
    addressText?: string;
    preferredLang?: 'en' | 'ta';
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  // Helper to ensure owner records are synchronized in Firestore
  const syncOwnerStatus = async (user: User): Promise<boolean> => {
    const isOwnerEmail = user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
    const isOwnerUid = user.uid === 'oMl0ziVO7aWj9MH26ocPGH41fG12';

    if (!isOwnerEmail && !isOwnerUid) {
      setIsOwner(false);
      return false;
    }

    try {
      const ownerDocRef = doc(db, 'owners', user.uid);
      const ownerDoc = await getDoc(ownerDocRef);

      setIsOwner(true);
      // Ensure owner doc is saved in Firestore
      if (!ownerDoc.exists() && isOwnerEmail) {
        await setDoc(ownerDocRef, {
          uid: user.uid,
          email: user.email,
          role: 'owner',
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
      return true;
    } catch (err) {
      console.warn('Error checking owner status in owners collection:', err);
      if (isOwnerEmail || isOwnerUid) {
        setIsOwner(true);
        return true;
      }
    }

    setIsOwner(false);
    return false;
  };

  useEffect(() => {
    let unsubSnapshot: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = null;
      }

      setCurrentUser(user);

      if (!user) {
        setUserProfile(null);
        setIsOwner(false);
        setLoading(false);
        return;
      }

      // Verify owner status
      const userIsOwner = await syncOwnerStatus(user);

      // Listen to user profile doc in users collection
      const userDocRef = doc(db, 'users', user.uid);
      unsubSnapshot = onSnapshot(
        userDocRef,
        async (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            if (userIsOwner) {
              data.role = 'owner';
              data.status = 'approved';
              data.passId = 'FP-OWNER-0001';
            }
            setUserProfile({ ...data, uid: user.uid });
          } else if (userIsOwner) {
            // Auto-heal owner profile if missing
            const synthesizedOwner: UserProfile = {
              uid: user.uid,
              role: 'owner',
              status: 'approved',
              passId: 'FP-OWNER-0001',
              firstName: user.displayName?.split(' ')[0] || 'Owner',
              fullName: user.displayName || user.email || 'System Owner',
              phone: user.phoneNumber || '9790416096',
              addressText: 'FreshPath Central Operations',
              preferredLang: (localStorage.getItem('freshpath_lang') as 'en' | 'ta') || 'en',
            };
            try {
              await setDoc(userDocRef, {
                ...synthesizedOwner,
                email: user.email,
                createdAt: serverTimestamp(),
              }, { merge: true });
              setUserProfile(synthesizedOwner);
            } catch (e) {
              console.warn('Failed to auto-heal owner profile in users collection:', e);
              setUserProfile(synthesizedOwner);
            }
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        },
        (err) => {
          console.warn('Profile listener error:', err);
          if (userIsOwner) {
            setUserProfile({
              uid: user.uid,
              role: 'owner',
              status: 'approved',
              passId: 'FP-OWNER-0001',
              firstName: 'Owner',
              fullName: 'System Owner',
              phone: '',
              addressText: 'FreshPath Central Operations',
              preferredLang: 'en',
            });
          }
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribe();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const loginWithGoogle = async (targetRole?: UserRole | 'control') => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Check if user is owner
    const isOwnerUser = await syncOwnerStatus(user);

    if (targetRole === 'control' && !isOwnerUser) {
      await signOut(auth);
      throw new Error(
        `Unauthorized: ${user.email} is not registered as the FreshPath system owner. Please sign in with the authorized owner account.`
      );
    }

    // Check if user profile already exists
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists() && targetRole && targetRole !== 'control') {
      // Auto-provision consumer or return for role registration
      const isConsumer = targetRole === 'consumer';
      const passId = isConsumer ? `FP-C-${generateRandomCode(6)}` : undefined;
      const status: UserStatus = isConsumer ? 'approved' : 'pending';

      const profile: UserProfile = {
        uid: user.uid,
        role: targetRole,
        status,
        firstName: user.displayName?.split(' ')[0] || 'User',
        fullName: user.displayName || user.email || 'User',
        phone: user.phoneNumber || '',
        addressText: '',
        preferredLang: (localStorage.getItem('freshpath_lang') as 'en' | 'ta') || 'en',
        createdAt: serverTimestamp(),
        ...(passId ? { passId } : {}),
      };

      await setDoc(doc(db, 'users', user.uid), profile);
    }

    return { user, isNewUser: !userDoc.exists() };
  };

  const register = async (
    email: string,
    pass: string,
    role: UserRole,
    firstName: string,
    fullName: string,
    phone: string,
    addressText: string,
    extras?: RegisterExtraData
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;

    const isConsumer = role === 'consumer';
    const passId = isConsumer ? `FP-C-${generateRandomCode(6)}` : undefined;
    const status: UserStatus = isConsumer ? 'approved' : 'pending';

    const profile: UserProfile = {
      uid,
      role,
      status,
      firstName: firstName.trim(),
      fullName: fullName.trim(),
      phone: phone.trim(),
      addressText: addressText.trim(),
      preferredLang: (localStorage.getItem('freshpath_lang') as 'en' | 'ta') || 'en',
      createdAt: serverTimestamp(),
      ...(passId ? { passId } : {}),
    };

    // Save user profile
    await setDoc(doc(db, 'users', uid), profile);

    // Create role-specific initial records (guarantee registration of farm/vehicle/mandi)
    const effectiveVillage = addressText.trim() || 'Tamil Nadu';
    const effectiveName = fullName.trim() || firstName.trim() || 'User';

    if (role === 'farmer') {
      const fName = extras?.fieldName?.trim() || `${effectiveName}'s Farm Field`;
      await addDoc(collection(db, 'fields'), {
        farmerUid: uid,
        name: fName,
        village: extras?.fieldVillage?.trim() || effectiveVillage,
        district: extras?.fieldDistrict?.trim() || '',
        createdAt: serverTimestamp(),
      });
    } else if (role === 'driver') {
      const vReg = extras?.regNumber?.trim() || `TN 31 DRV ${uid.slice(0, 4).toUpperCase()}`;
      const vehicleId = vReg.replace(/\s+/g, '').toUpperCase();
      await setDoc(doc(db, 'vehicles', vehicleId), {
        driverUid: uid,
        regNumber: vReg.toUpperCase(),
        vehicleType: extras?.vehicleType || 'Pickup Truck',
        capacityKg: Number(extras?.capacityKg) || 1500,
        gpsUnitId: 'GPS-01',
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
      });
    } else if (role === 'mandi') {
      const mName = extras?.mandiName?.trim() || `${effectiveName} Agro Mandi`;
      const mArea = extras?.mandiArea?.trim() || effectiveVillage;
      await addDoc(collection(db, 'mandis'), {
        mandiPersonUid: uid,
        name: mName,
        area: mArea,
        createdAt: serverTimestamp(),
      });
    } else if (role === 'shop') {
      const sName = extras?.shopName?.trim() || `${effectiveName} Fresh Basket`;
      await addDoc(collection(db, 'shops'), {
        shopPersonUid: uid,
        name: sName,
        area: extras?.shopArea?.trim() || effectiveVillage,
        createdAt: serverTimestamp(),
      });
    }
  };

  const updateUserProfile = async (updates: {
    fullName?: string;
    phone?: string;
    addressText?: string;
    preferredLang?: 'en' | 'ta';
  }) => {
    if (!currentUser) throw new Error('Not signed in');
    const userRef = doc(db, 'users', currentUser.uid);
    const payload: Record<string, any> = {};

    if (updates.fullName !== undefined) {
      const full = updates.fullName.trim();
      payload.fullName = full;
      payload.firstName = full.split(' ')[0] || full;
    }
    if (updates.phone !== undefined) {
      payload.phone = updates.phone.trim();
    }
    if (updates.addressText !== undefined) {
      payload.addressText = updates.addressText.trim();
    }
    if (updates.preferredLang !== undefined) {
      payload.preferredLang = updates.preferredLang;
      localStorage.setItem('freshpath_lang', updates.preferredLang);
    }

    await updateDoc(userRef, payload);
    setUserProfile((prev) => (prev ? { ...prev, ...payload } : null));
  };

  const logout = async () => {
    await signOut(auth);
    setUserProfile(null);
    setIsOwner(false);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isOwner,
        loading,
        login,
        loginWithGoogle,
        register,
        updateUserProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

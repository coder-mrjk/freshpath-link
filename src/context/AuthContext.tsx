import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { generateRandomCode } from '../lib/bagId';

export type UserRole = 'farmer' | 'driver' | 'mandi' | 'shop' | 'consumer' | 'owner';
export type UserStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

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
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setUserProfile(null);
        setIsOwner(false);
        setLoading(false);
        return;
      }

      // Check owner collection
      try {
        const ownerDoc = await getDoc(doc(db, 'owners', user.uid));
        if (ownerDoc.exists()) {
          setIsOwner(true);
        } else {
          setIsOwner(false);
        }
      } catch (err) {
        console.warn('Error checking owner status:', err);
      }

      // Listen to user profile doc
      const userDocRef = doc(db, 'users', user.uid);
      const unsubUser = onSnapshot(
        userDocRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            setUserProfile({ ...data, uid: user.uid });
          } else {
            // Check if user is owner without profile
            setUserProfile(null);
          }
          setLoading(false);
        },
        (err) => {
          console.warn('Profile listener error:', err);
          setLoading(false);
        }
      );

      return () => unsubUser();
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
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

    // Create role-specific initial records
    if (extras) {
      if (role === 'farmer' && extras.fieldName) {
        await addDoc(collection(db, 'fields'), {
          farmerUid: uid,
          name: extras.fieldName,
          village: extras.fieldVillage || addressText,
          district: extras.fieldDistrict || '',
          createdAt: serverTimestamp(),
        });
      } else if (role === 'driver' && extras.regNumber) {
        const vehicleId = extras.regNumber.replace(/\s+/g, '').toUpperCase();
        await setDoc(doc(db, 'vehicles', vehicleId), {
          driverUid: uid,
          regNumber: extras.regNumber.toUpperCase(),
          vehicleType: extras.vehicleType || 'Pickup Truck',
          capacityKg: Number(extras.capacityKg) || 1000,
          status: 'PENDING_GPS',
          createdAt: serverTimestamp(),
        });
      } else if (role === 'mandi' && extras.mandiName) {
        const mandiRef = await addDoc(collection(db, 'mandis'), {
          mandiPersonUid: uid,
          name: extras.mandiName,
          area: extras.mandiArea || addressText,
          createdAt: serverTimestamp(),
        });
        if (extras.storageUnitName) {
          await addDoc(collection(db, 'storageUnits'), {
            mandiId: mandiRef.id,
            name: extras.storageUnitName,
            nodeUnitId: 'STORE-01',
            latest: { tempC: 26.5, humidityPct: 70.0, at: serverTimestamp() },
            createdAt: serverTimestamp(),
          });
        }
      } else if (role === 'shop' && extras.shopName) {
        await addDoc(collection(db, 'shops'), {
          shopPersonUid: uid,
          name: extras.shopName,
          area: extras.shopArea || addressText,
          createdAt: serverTimestamp(),
        });
      }
    }
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
        register,
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

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  getMultiFactorResolver,
  MultiFactorResolver,
  MultiFactorInfo,
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
import { auth, db, googleProvider } from '../lib/firebase';
import { generateRandomCode } from '../lib/bagId';

export type UserRole = 'farmer' | 'driver' | 'mandi' | 'shop' | 'consumer' | 'owner';
export type UserStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

export const OWNER_EMAIL = 'tonightgamermrjk@gmail.com';

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

export interface MfaRequiredError extends Error {
  code: string;
  resolver: MultiFactorResolver;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isOwner: boolean;
  loading: boolean;
  enrolledMfaFactors: MultiFactorInfo[];
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
  logout: () => Promise<void>;
  // MFA methods
  setupRecaptcha: (containerId: string) => RecaptchaVerifier;
  sendPhoneVerificationForMfa: (phoneNumber: string, recaptchaVerifier: RecaptchaVerifier) => Promise<string>;
  enrollPhoneMfa: (verificationId: string, verificationCode: string) => Promise<void>;
  unenrollMfa: (factorUid: string) => Promise<void>;
  sendMfaSignInCode: (
    resolver: MultiFactorResolver,
    selectedHintIndex: number,
    recaptchaVerifier: RecaptchaVerifier
  ) => Promise<string>;
  resolveMfaSignIn: (
    resolver: MultiFactorResolver,
    verificationId: string,
    verificationCode: string
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enrolledMfaFactors, setEnrolledMfaFactors] = useState<MultiFactorInfo[]>([]);

  // Helper to ensure owner records are synchronized in Firestore
  const syncOwnerStatus = async (user: User): Promise<boolean> => {
    const isOwnerEmail = user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();

    try {
      const ownerDocRef = doc(db, 'owners', user.uid);
      const ownerDoc = await getDoc(ownerDocRef);

      if (ownerDoc.exists() || isOwnerEmail) {
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
      }
    } catch (err) {
      console.warn('Error checking owner status in owners collection:', err);
      if (isOwnerEmail) {
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
        setEnrolledMfaFactors([]);
        setLoading(false);
        return;
      }

      // Refresh MFA enrolled factors
      try {
        const factors = multiFactor(user).enrolledFactors || [];
        setEnrolledMfaFactors(factors);
      } catch (e) {
        console.warn('Error fetching enrolled MFA factors:', e);
        setEnrolledMfaFactors([]);
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
              phone: user.phoneNumber || '+919876543210',
              addressText: 'FreshPath Central Operations',
              preferredLang: (localStorage.getItem('freshpath_lang') as 'en' | 'ta') || 'en',
            };
            try {
              await setDoc(userDocRef, {
                ...synthesizedOwner,
                email: user.email,
                createdAt: serverTimestamp(),
              });
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
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      if (fbErr.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, err as any);
        const mfaError = new Error('Multi-factor authentication required') as MfaRequiredError;
        mfaError.code = 'auth/multi-factor-auth-required';
        mfaError.resolver = resolver;
        throw mfaError;
      }
      throw err;
    }
  };

  const loginWithGoogle = async (targetRole?: UserRole | 'control') => {
    try {
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
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      if (fbErr.code === 'auth/multi-factor-auth-required') {
        const resolver = getMultiFactorResolver(auth, err as any);
        const mfaError = new Error('Multi-factor authentication required') as MfaRequiredError;
        mfaError.code = 'auth/multi-factor-auth-required';
        mfaError.resolver = resolver;
        throw mfaError;
      }
      throw err;
    }
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
    setEnrolledMfaFactors([]);
  };

  // Recaptcha setup for Phone/SMS auth
  const setupRecaptcha = (containerId: string): RecaptchaVerifier => {
    return new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
    });
  };

  // Enroll Phone/SMS MFA on currentUser
  const sendPhoneVerificationForMfa = async (
    phoneNumber: string,
    recaptchaVerifier: RecaptchaVerifier
  ): Promise<string> => {
    if (!currentUser) throw new Error('No user is currently signed in');
    const multiFactorSession = await multiFactor(currentUser).getSession();
    const phoneAuthProvider = new PhoneAuthProvider(auth);
    const verificationId = await phoneAuthProvider.verifyPhoneNumber(
      {
        phoneNumber,
        session: multiFactorSession,
      },
      recaptchaVerifier
    );
    return verificationId;
  };

  const enrollPhoneMfa = async (
    verificationId: string,
    verificationCode: string
  ): Promise<void> => {
    if (!currentUser) throw new Error('No user is currently signed in');
    const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
    const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
    await multiFactor(currentUser).enroll(multiFactorAssertion, 'Primary Phone SMS');
    const updatedFactors = multiFactor(currentUser).enrolledFactors || [];
    setEnrolledMfaFactors(updatedFactors);
  };

  const unenrollMfa = async (factorUid: string): Promise<void> => {
    if (!currentUser) throw new Error('No user is currently signed in');
    const factorToUnenroll = multiFactor(currentUser).enrolledFactors.find(
      (f) => f.uid === factorUid
    );
    if (!factorToUnenroll) throw new Error('Factor not found');
    await multiFactor(currentUser).unenroll(factorToUnenroll);
    const updatedFactors = multiFactor(currentUser).enrolledFactors || [];
    setEnrolledMfaFactors(updatedFactors);
  };

  const sendMfaSignInCode = async (
    resolver: MultiFactorResolver,
    selectedHintIndex: number,
    recaptchaVerifier: RecaptchaVerifier
  ): Promise<string> => {
    const phoneInfoOptions = {
      multiFactorHint: resolver.hints[selectedHintIndex],
      session: resolver.session,
    };
    const phoneAuthProvider = new PhoneAuthProvider(auth);
    const verificationId = await phoneAuthProvider.verifyPhoneNumber(
      phoneInfoOptions,
      recaptchaVerifier
    );
    return verificationId;
  };

  const resolveMfaSignIn = async (
    resolver: MultiFactorResolver,
    verificationId: string,
    verificationCode: string
  ): Promise<void> => {
    const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
    const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
    await resolver.resolveSignIn(multiFactorAssertion);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isOwner,
        loading,
        enrolledMfaFactors,
        login,
        loginWithGoogle,
        register,
        logout,
        setupRecaptcha,
        sendPhoneVerificationForMfa,
        enrollPhoneMfa,
        unenrollMfa,
        sendMfaSignInCode,
        resolveMfaSignIn,
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

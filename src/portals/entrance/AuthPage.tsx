import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, UserRole, MfaRequiredError } from '../../context/AuthContext';
import { MultiFactorResolver, RecaptchaVerifier } from 'firebase/auth';
import {
  Sprout,
  Truck,
  Warehouse,
  Store,
  ShoppingBasket,
  ShieldCheck,
  Clock,
  Ban,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Smartphone,
  KeyRound,
  RotateCw,
} from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { role = 'consumer' } = useParams<{ role: string }>();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect');
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    currentUser,
    userProfile,
    isOwner,
    login,
    loginWithGoogle,
    register,
    logout,
    setupRecaptcha,
    sendMfaSignInCode,
    resolveMfaSignIn,
  } = useAuth();

  const [isRegister, setIsRegister] = useState(role !== 'control');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressText, setAddressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // MFA State
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);
  const [mfaPhoneHint, setMfaPhoneHint] = useState<string>('');
  const [smsOtp, setSmsOtp] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState<RecaptchaVerifier | null>(null);

  // Extras
  const [fieldName, setFieldName] = useState('');
  const [fieldVillage, setFieldVillage] = useState('');
  const [fieldDistrict, setFieldDistrict] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('Pickup Truck');
  const [capacityKg, setCapacityKg] = useState('1500');
  const [mandiName, setMandiName] = useState('');
  const [mandiArea, setMandiArea] = useState('');
  const [storageUnitName, setStorageUnitName] = useState('Cold Bay 1');
  const [shopName, setShopName] = useState('');
  const [shopArea, setShopArea] = useState('');

  const currentRole = role as UserRole;
  const isOwnerMode = role === 'control';

  // Role info
  const getRoleIcon = () => {
    if (role === 'control' || role === 'owner') return ShieldCheck;
    switch (currentRole) {
      case 'farmer':
        return Sprout;
      case 'driver':
        return Truck;
      case 'mandi':
        return Warehouse;
      case 'shop':
        return Store;
      default:
        return ShoppingBasket;
    }
  };
  const Icon = getRoleIcon();

  // Role Theme definitions for glassmorphic elements
  const getRoleTheme = () => {
    if (isOwnerMode) {
      return {
        iconContainer: 'bg-[#C1121F]/20 border border-red-400/30 text-red-400 shadow-[0_0_20px_0_rgba(193,18,31,0.35)]',
        buttonGradient: 'bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 shadow-[0_4px_24px_rgba(193,18,31,0.4)]',
        focusRing: 'focus:ring-red-500/50 focus:border-red-500/50',
      };
    }
    switch (currentRole) {
      case 'farmer':
        return {
          iconContainer: 'bg-[#2E7D32]/20 border border-[#4ADE80]/30 text-[#4ADE80] shadow-[0_0_20px_0_rgba(74,222,128,0.30)]',
          buttonGradient: 'bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 shadow-[0_4px_24px_rgba(74,222,128,0.35)]',
          focusRing: 'focus:ring-emerald-500/50 focus:border-emerald-500/50',
        };
      case 'driver':
        return {
          iconContainer: 'bg-[#0284C7]/20 border border-sky-400/30 text-sky-400 shadow-[0_0_20px_0_rgba(2,132,199,0.30)]',
          buttonGradient: 'bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 shadow-[0_4px_24px_rgba(2,132,199,0.35)]',
          focusRing: 'focus:ring-sky-500/50 focus:border-sky-500/50',
        };
      case 'mandi':
        return {
          iconContainer: 'bg-[#D97706]/20 border border-amber-400/30 text-amber-400 shadow-[0_0_20px_0_rgba(217,119,6,0.30)]',
          buttonGradient: 'bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 shadow-[0_4px_24px_rgba(217,119,6,0.35)]',
          focusRing: 'focus:ring-amber-500/50 focus:border-amber-500/50',
        };
      case 'shop':
        return {
          iconContainer: 'bg-[#9333EA]/20 border border-purple-400/30 text-purple-400 shadow-[0_0_20px_0_rgba(147,51,234,0.30)]',
          buttonGradient: 'bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 shadow-[0_4px_24px_rgba(147,51,234,0.35)]',
          focusRing: 'focus:ring-purple-500/50 focus:border-purple-500/50',
        };
      case 'consumer':
      default:
        return {
          iconContainer: 'bg-[#C1121F]/20 border border-red-400/30 text-red-400 shadow-[0_0_20px_0_rgba(193,18,31,0.35)]',
          buttonGradient: 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 shadow-[0_4px_24px_rgba(193,18,31,0.35)]',
          focusRing: 'focus:ring-red-500/50 focus:border-red-500/50',
        };
    }
  };

  const roleTheme = getRoleTheme();

  // Redirect if authorized
  useEffect(() => {
    if (isOwner) {
      navigate(redirectUrl || '/control');
      return;
    }
    if (userProfile && userProfile.status === 'approved') {
      if (redirectUrl) {
        navigate(redirectUrl);
        return;
      }
      switch (userProfile.role) {
        case 'farmer':
          navigate('/grow');
          break;
        case 'driver':
          navigate('/move');
          break;
        case 'mandi':
          navigate('/hub');
          break;
        case 'shop':
          navigate('/shelf');
          break;
        case 'consumer':
          navigate('/table');
          break;
      }
    }
  }, [userProfile, isOwner, navigate, redirectUrl]);

  // Handle MFA Challenge
  const handleMfaChallenge = async (resolver: MultiFactorResolver) => {
    setMfaResolver(resolver);
    setError(null);
    try {
      const hint = resolver.hints[0];
      setMfaPhoneHint((hint as any)?.phoneNumber || 'registered phone');

      let rv = recaptchaVerifier;
      if (!rv) {
        rv = setupRecaptcha('recaptcha-container');
        setRecaptchaVerifier(rv);
      }

      const vId = await sendMfaSignInCode(resolver, 0, rv);
      setMfaVerificationId(vId);
    } catch (err: unknown) {
      console.error('Failed to trigger SMS MFA:', err);
      setError((err as Error)?.message || 'Failed to trigger SMS verification code.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister && !isOwnerMode) {
        if (!firstName.trim() || !email.trim() || !password.trim()) {
          throw new Error('Please fill in all required fields.');
        }

        await register(
          email,
          password,
          currentRole,
          firstName,
          fullName || firstName,
          phone,
          addressText,
          {
            fieldName,
            fieldVillage,
            fieldDistrict,
            regNumber,
            vehicleType,
            capacityKg: Number(capacityKg),
            mandiName,
            mandiArea,
            storageUnitName,
            shopName,
            shopArea,
          }
        );
      } else {
        await login(email, password);
      }
    } catch (err: unknown) {
      const mfaErr = err as MfaRequiredError;
      if (mfaErr.code === 'auth/multi-factor-auth-required' && mfaErr.resolver) {
        await handleMfaChallenge(mfaErr.resolver);
      } else {
        const msg = (err as Error)?.message || 'An error occurred during authentication.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      await loginWithGoogle(isOwnerMode ? 'control' : currentRole);
    } catch (err: unknown) {
      const mfaErr = err as MfaRequiredError;
      if (mfaErr.code === 'auth/multi-factor-auth-required' && mfaErr.resolver) {
        await handleMfaChallenge(mfaErr.resolver);
      } else {
        const msg = (err as Error)?.message || 'Google Sign-In failed.';
        setError(msg);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleVerifySmsOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver || !mfaVerificationId) return;
    setError(null);
    setMfaLoading(true);

    try {
      await resolveMfaSignIn(mfaResolver, mfaVerificationId, smsOtp.trim());
      setMfaResolver(null);
      setMfaVerificationId(null);
      setSmsOtp('');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Invalid SMS verification code. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleResendMfaCode = async () => {
    if (!mfaResolver) return;
    setError(null);
    setMfaLoading(true);
    try {
      let rv = recaptchaVerifier;
      if (!rv) {
        rv = setupRecaptcha('recaptcha-container');
        setRecaptchaVerifier(rv);
      }
      const vId = await sendMfaSignInCode(mfaResolver, 0, rv);
      setMfaVerificationId(vId);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to resend SMS code.');
    } finally {
      setMfaLoading(false);
    }
  };

  // If user is logged in but pending approval
  if (currentUser && userProfile && userProfile.status === 'pending') {
    return (
      <div className="relative min-h-[calc(100vh-4rem)] bg-[#0F172A] text-slate-100 overflow-hidden flex items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute top-1/4 -right-20 w-96 h-96 rounded-full blur-[100px] opacity-20 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(217,119,6,0.5) 0%, transparent 70%)',
            }}
          />
        </div>

        <div className="relative max-w-md w-full backdrop-blur-2xl bg-slate-900/80 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] text-center">
          <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-[0_0_24px_rgba(217,119,6,0.3)]">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            {t('auth.waitingApprovalTitle')}
          </h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {t('auth.waitingApprovalDesc')}
          </p>

          <div className="mt-6 p-4 bg-slate-950/60 rounded-2xl text-left text-xs space-y-2.5 border border-amber-500/20 backdrop-blur-md">
            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.06]">
              <span className="text-slate-400 font-medium">Name:</span>
              <span className="text-white font-bold">{userProfile.firstName}</span>
            </div>
            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.06]">
              <span className="text-slate-400 font-medium">Role:</span>
              <span className="capitalize font-bold text-red-400">{userProfile.role}</span>
            </div>
            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.06]">
              <span className="text-slate-400 font-medium">Status:</span>
              <span className="font-extrabold text-amber-400 uppercase tracking-wider text-[11px] px-2 py-0.5 bg-amber-500/10 rounded-full border border-amber-500/30">
                PENDING OWNER APPROVAL
              </span>
            </div>
            <p className="text-slate-400 text-[11px] italic pt-1 leading-normal">
              Once the FreshPath owner approves your account, your official Pass ID will be assigned.
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs transition-all touch-target"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    );
  }

  if (currentUser && userProfile && userProfile.status === 'suspended') {
    return (
      <div className="relative min-h-[calc(100vh-4rem)] bg-[#0F172A] text-slate-100 overflow-hidden flex items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute top-1/4 -right-20 w-96 h-96 rounded-full blur-[100px] opacity-20 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(239,68,68,0.5) 0%, transparent 70%)',
            }}
          />
        </div>

        <div className="relative max-w-md w-full backdrop-blur-2xl bg-slate-900/80 border border-red-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] text-center">
          <div className="w-16 h-16 bg-red-500/15 border border-red-500/30 rounded-2xl flex items-center justify-center text-red-400 mx-auto mb-4 shadow-[0_0_24px_rgba(239,68,68,0.3)]">
            <Ban className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            {t('auth.suspendedTitle')}
          </h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {t('auth.suspendedDesc')}
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl text-xs transition-all touch-target"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    );
  }

  // MFA Challenge Modal / View
  if (mfaResolver) {
    return (
      <div className="relative min-h-[calc(100vh-4rem)] bg-[#0F172A] text-slate-100 overflow-hidden flex items-center justify-center px-4 py-12">
        <div id="recaptcha-container" />
        <div className="relative max-w-md w-full backdrop-blur-2xl bg-slate-900/90 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-400 mx-auto mb-4">
            <Smartphone className="w-8 h-8" />
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Two-Step Verification
          </h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            A 6-digit SMS verification code has been sent to your registered phone number{' '}
            <strong className="text-amber-400">{mfaPhoneHint}</strong>.
          </p>

          {error && (
            <div className="mt-4 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-200 flex items-start gap-2 text-left">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleVerifySmsOtp} className="mt-6 space-y-4 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                SMS Verification Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  value={smsOtp}
                  onChange={(e) => setSmsOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full px-4 py-3 bg-slate-800 border border-white/10 text-white text-center font-mono text-xl tracking-[0.5em] rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <button
              type="submit"
              disabled={mfaLoading || smsOtp.length < 6}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-500 hover:to-orange-600 disabled:opacity-50 text-white font-extrabold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {mfaLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm & Complete Sign In</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={handleResendMfaCode}
              disabled={mfaLoading}
              className="hover:text-white inline-flex items-center gap-1 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Resend Code</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMfaResolver(null);
                setMfaVerificationId(null);
                setError(null);
              }}
              className="hover:text-red-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#0F172A] text-slate-100 overflow-hidden py-8 sm:py-12 px-4 flex flex-col justify-center">
      <div id="recaptcha-container" />
      {/* Mesh gradients in background */}
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
            background: 'radial-gradient(circle, rgba(46,125,50,0.5) 0%, transparent 70%)',
          }}
        />
      </div>

      <div className="relative max-w-md w-full mx-auto z-10">
        {/* Back Link */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white mb-6 px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 hover:border-white/20 transition-all backdrop-blur-md group"
        >
          <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to role selector</span>
        </Link>

        {/* Glass Form Card */}
        <div className="relative backdrop-blur-2xl bg-slate-900/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)]">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className={`p-3.5 rounded-2xl shrink-0 flex items-center justify-center ${roleTheme.iconContainer}`}
            >
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white capitalize tracking-tight">
                {isOwnerMode
                  ? 'Owner Administration'
                  : isRegister
                  ? `${currentRole} Registration`
                  : `${currentRole} Sign In`}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {isOwnerMode
                  ? 'Control portal access'
                  : isRegister
                  ? 'Create a verified FreshPath account'
                  : 'Sign in with Google, email, or SMS verification'}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-500/15 border border-red-500/30 rounded-2xl text-xs text-red-200 flex items-start gap-2.5 shadow-md">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Google Sign-in Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full mb-5 py-3 px-4 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-3 touch-target border border-slate-200 disabled:opacity-60"
          >
            {googleLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                <span>Connecting with Google...</span>
              </div>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>
                  {isOwnerMode
                    ? 'Sign In with Owner Google Account'
                    : `Continue with Google for ${currentRole}`}
                </span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="relative flex py-2 items-center mb-5">
            <div className="flex-grow border-t border-white/10" />
            <span className="flex-shrink mx-4 text-[11px] text-slate-500 uppercase tracking-widest font-semibold">
              Or with email
            </span>
            <div className="flex-grow border-t border-white/10" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && !isOwnerMode && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    First Name <span className="text-red-400">*</span>
                    <span className="text-[10px] text-slate-400 font-normal lowercase ml-1.5">
                      (public to shoppers / farmers)
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Arul"
                    className={`w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white placeholder:text-slate-500 rounded-xl text-sm transition-all focus:outline-none ${roleTheme.focusRing}`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Full Name (Private)
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Arul Murugan"
                    className={`w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white placeholder:text-slate-500 rounded-xl text-sm transition-all focus:outline-none ${roleTheme.focusRing}`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Phone (Private)
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      className={`w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white placeholder:text-slate-500 rounded-xl text-sm transition-all focus:outline-none ${roleTheme.focusRing}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                      Village / Town
                    </label>
                    <input
                      type="text"
                      value={addressText}
                      onChange={(e) => setAddressText(e.target.value)}
                      placeholder="e.g. Panruti"
                      className={`w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white placeholder:text-slate-500 rounded-xl text-sm transition-all focus:outline-none ${roleTheme.focusRing}`}
                    />
                  </div>
                </div>

                {/* Role-specific extras */}
                {currentRole === 'farmer' && (
                  <div className="p-4 bg-emerald-950/30 rounded-2xl border border-emerald-500/25 space-y-3">
                    <span className="text-xs font-extrabold text-emerald-400 block tracking-wider uppercase">
                      🌱 Farm Details
                    </span>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        First Field / Farm Name
                      </label>
                      <input
                        type="text"
                        value={fieldName}
                        onChange={(e) => setFieldName(e.target.value)}
                        placeholder="e.g. Sivan Kovil Thottam"
                        className="w-full px-3 py-2 bg-slate-900/80 border border-emerald-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={fieldVillage}
                        onChange={(e) => setFieldVillage(e.target.value)}
                        placeholder="Village"
                        className="w-full px-3 py-2 bg-slate-900/80 border border-emerald-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={fieldDistrict}
                        onChange={(e) => setFieldDistrict(e.target.value)}
                        placeholder="District"
                        className="w-full px-3 py-2 bg-slate-900/80 border border-emerald-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {currentRole === 'driver' && (
                  <div className="p-4 bg-sky-950/30 rounded-2xl border border-sky-500/25 space-y-3">
                    <span className="text-xs font-extrabold text-sky-400 block tracking-wider uppercase">
                      🚚 Vehicle Registration
                    </span>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Vehicle Reg No. (e.g. TN 01 AB 1234)
                      </label>
                      <input
                        type="text"
                        value={regNumber}
                        onChange={(e) => setRegNumber(e.target.value)}
                        placeholder="TN 01 AB 1234"
                        className="w-full px-3 py-2 bg-slate-900/80 border border-sky-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        placeholder="Type (Pickup)"
                        className="w-full px-3 py-2 bg-slate-900/80 border border-sky-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
                      />
                      <input
                        type="number"
                        value={capacityKg}
                        onChange={(e) => setCapacityKg(e.target.value)}
                        placeholder="Capacity (kg)"
                        className="w-full px-3 py-2 bg-slate-900/80 border border-sky-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {currentRole === 'mandi' && (
                  <div className="p-4 bg-amber-950/30 rounded-2xl border border-amber-500/25 space-y-3">
                    <span className="text-xs font-extrabold text-amber-400 block tracking-wider uppercase">
                      🏢 Mandi Storage Details
                    </span>
                    <input
                      type="text"
                      value={mandiName}
                      onChange={(e) => setMandiName(e.target.value)}
                      placeholder="Mandi Name (e.g. Panruti Agri Market)"
                      className="w-full px-3 py-2 bg-slate-900/80 border border-amber-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={mandiArea}
                        onChange={(e) => setMandiArea(e.target.value)}
                        placeholder="Area / Market Yard"
                        className="w-full px-3 py-2 bg-slate-900/80 border border-amber-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={storageUnitName}
                        onChange={(e) => setStorageUnitName(e.target.value)}
                        placeholder="Unit Name (Bay 1)"
                        className="w-full px-3 py-2 bg-slate-900/80 border border-amber-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-amber-500/50 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {currentRole === 'shop' && (
                  <div className="p-4 bg-purple-950/30 rounded-2xl border border-purple-500/25 space-y-3">
                    <span className="text-xs font-extrabold text-purple-400 block tracking-wider uppercase">
                      🏪 Retail Shop Details
                    </span>
                    <input
                      type="text"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="Shop Name (e.g. Kovai Fresh Veggies)"
                      className="w-full px-3 py-2 bg-slate-900/80 border border-purple-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/50 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={shopArea}
                      onChange={(e) => setShopArea(e.target.value)}
                      placeholder="Shop Area / Street"
                      className="w-full px-3 py-2 bg-slate-900/80 border border-purple-500/30 text-white placeholder:text-slate-500 rounded-xl text-xs focus:ring-2 focus:ring-purple-500/50 focus:outline-none"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Email Address <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@freshpath.org"
                className={`w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white placeholder:text-slate-500 rounded-xl text-sm transition-all focus:outline-none ${roleTheme.focusRing}`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full px-3.5 py-2.5 bg-slate-800/80 border border-white/10 text-white placeholder:text-slate-500 rounded-xl text-sm transition-all focus:outline-none ${roleTheme.focusRing}`}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 px-6 text-white font-extrabold rounded-xl text-sm transition-all transform active:scale-[0.99] touch-target flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${roleTheme.buttonGradient}`}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </div>
              ) : isOwnerMode ? (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Control Portal Login</span>
                </>
              ) : isRegister ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Create {currentRole} Account</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {!isOwnerMode && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                }}
                className="text-xs text-slate-400 hover:text-white transition-colors font-medium hover:underline touch-target"
              >
                {isRegister
                  ? t('auth.alreadyHaveAccount')
                  : t('auth.dontHaveAccount')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

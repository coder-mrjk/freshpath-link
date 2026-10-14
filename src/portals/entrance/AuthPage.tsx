import React, { useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, UserRole } from '../../context/AuthContext';
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
} from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { role = 'consumer' } = useParams<{ role: string }>();
  const [searchParams] = useSearchParams();
  const redirectUrl = searchParams.get('redirect');
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser, userProfile, isOwner, login, register, logout } = useAuth();

  const [isRegister, setIsRegister] = useState(role !== 'control');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressText, setAddressText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  // Redirect if approved
  React.useEffect(() => {
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
      const msg = (err as Error)?.message || 'An error occurred during authentication.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // If user is logged in but pending or suspended
  if (currentUser && userProfile && userProfile.status === 'pending') {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-amber-200 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mx-auto mb-4">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-charcoal">
            {t('auth.waitingApprovalTitle')}
          </h2>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">
            {t('auth.waitingApprovalDesc')}
          </p>

          <div className="mt-6 p-4 bg-amber-50 rounded-xl text-left text-xs space-y-2 border border-amber-200">
            <p>
              <strong className="text-charcoal">Name:</strong> {userProfile.firstName}
            </p>
            <p>
              <strong className="text-charcoal">Role:</strong>{' '}
              <span className="capitalize font-bold text-tomato-600">{userProfile.role}</span>
            </p>
            <p>
              <strong className="text-charcoal">Status:</strong>{' '}
              <span className="font-bold text-amber-700 uppercase">PENDING OWNER APPROVAL</span>
            </p>
            <p className="text-gray-500 italic">
              Once the FreshPath owner approves your account, your official Pass ID will be assigned.
            </p>
          </div>

          <button
            onClick={logout}
            className="mt-6 w-full py-3 bg-gray-100 hover:bg-gray-200 text-charcoal font-bold rounded-xl text-xs transition-colors touch-target"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    );
  }

  if (currentUser && userProfile && userProfile.status === 'suspended') {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-red-200 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mx-auto mb-4">
            <Ban className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-charcoal">
            {t('auth.suspendedTitle')}
          </h2>
          <p className="text-xs text-gray-600 mt-2">
            {t('auth.suspendedDesc')}
          </p>
          <button
            onClick={logout}
            className="mt-6 w-full py-3 bg-gray-100 hover:bg-gray-200 text-charcoal font-bold rounded-xl text-xs transition-colors"
          >
            {t('logout')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 sm:py-12">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-tomato-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to role selector</span>
      </Link>

      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-tomato-50 rounded-xl text-tomato-500">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-charcoal capitalize">
              {isOwnerMode
                ? 'Owner Administration'
                : isRegister
                ? `${currentRole} Registration`
                : `${currentRole} Sign In`}
            </h1>
            <p className="text-xs text-gray-500">
              {isOwnerMode
                ? 'Control portal access'
                : isRegister
                ? 'Create a verified FreshPath account'
                : 'Sign in with your email & password'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && !isOwnerMode && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                  <span className="text-[10px] text-gray-400 font-normal ml-1">
                    (Public to shoppers / farmers)
                  </span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Arul"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-tomato-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Full Name (Private)
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Arul Murugan"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-tomato-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Phone (Private)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-tomato-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Village / Town
                  </label>
                  <input
                    type="text"
                    value={addressText}
                    onChange={(e) => setAddressText(e.target.value)}
                    placeholder="e.g. Panruti"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-tomato-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Role-specific extras */}
              {currentRole === 'farmer' && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                  <span className="text-xs font-bold text-emerald-800 block">
                    🌱 Farm Details
                  </span>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                      First Field / Farm Name
                    </label>
                    <input
                      type="text"
                      value={fieldName}
                      onChange={(e) => setFieldName(e.target.value)}
                      placeholder="e.g. Sivan Kovil Thottam"
                      className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={fieldVillage}
                      onChange={(e) => setFieldVillage(e.target.value)}
                      placeholder="Village"
                      className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      value={fieldDistrict}
                      onChange={(e) => setFieldDistrict(e.target.value)}
                      placeholder="District"
                      className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              {currentRole === 'driver' && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-2">
                  <span className="text-xs font-bold text-blue-800 block">
                    🚚 Vehicle Registration
                  </span>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                      Vehicle Reg No. (e.g. TN 01 AB 1234)
                    </label>
                    <input
                      type="text"
                      value={regNumber}
                      onChange={(e) => setRegNumber(e.target.value)}
                      placeholder="TN 01 AB 1234"
                      className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono uppercase"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      placeholder="Type (Pickup)"
                      className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                    />
                    <input
                      type="number"
                      value={capacityKg}
                      onChange={(e) => setCapacityKg(e.target.value)}
                      placeholder="Capacity (kg)"
                      className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              {currentRole === 'mandi' && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                  <span className="text-xs font-bold text-amber-800 block">
                    🏢 Mandi Storage Details
                  </span>
                  <input
                    type="text"
                    value={mandiName}
                    onChange={(e) => setMandiName(e.target.value)}
                    placeholder="Mandi Name (e.g. Panruti Agri Market)"
                    className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={mandiArea}
                      onChange={(e) => setMandiArea(e.target.value)}
                      placeholder="Area / Market Yard"
                      className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                    />
                    <input
                      type="text"
                      value={storageUnitName}
                      onChange={(e) => setStorageUnitName(e.target.value)}
                      placeholder="Unit Name (Bay 1)"
                      className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                    />
                  </div>
                </div>
              )}

              {currentRole === 'shop' && (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 space-y-2">
                  <span className="text-xs font-bold text-purple-800 block">
                    🏪 Retail Shop Details
                  </span>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="Shop Name (e.g. Kovai Fresh Veggies)"
                    className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    value={shopArea}
                    onChange={(e) => setShopArea(e.target.value)}
                    placeholder="Shop Area / Street"
                    className="w-full px-2.5 py-2 bg-white border border-gray-300 rounded-lg text-xs"
                  />
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@freshpath.org"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-tomato-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-tomato-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-tomato-500 hover:bg-tomato-600 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm shadow-md transition-colors touch-target flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Authenticating...</span>
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
              className="text-xs text-tomato-600 hover:underline font-semibold"
            >
              {isRegister
                ? t('auth.alreadyHaveAccount')
                : t('auth.dontHaveAccount')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

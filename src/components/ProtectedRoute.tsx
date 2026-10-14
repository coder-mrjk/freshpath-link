import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from '../context/AuthContext';
import { ShieldAlert, Clock, LogIn, ArrowRight, UserCheck, RefreshCw } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  allowOwner?: boolean;
  portalName: string;
  portalDescription: string;
  portalIcon: React.ComponentType<{ className?: string }>;
  targetRole: UserRole | 'control';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  allowOwner = true,
  portalName,
  portalDescription,
  portalIcon: Icon,
  targetRole,
}) => {
  const { currentUser, userProfile, isOwner, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-tomato-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-gray-500">Verifying security credentials...</p>
      </div>
    );
  }

  // Case 1: Unauthenticated -> Show prompt to Sign In or Register
  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 text-center">
          <div className="w-16 h-16 bg-tomato-50 text-tomato-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-tomato-100 shadow-inner">
            <Icon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-charcoal">{portalName}</h2>
          <p className="text-xs text-gray-500 mt-2 mb-6 leading-relaxed">
            {portalDescription}
          </p>

          <div className="space-y-3">
            <Link
              to={`/auth/${targetRole}?redirect=${encodeURIComponent(location.pathname + location.search)}`}
              className="w-full py-3 px-4 bg-tomato-600 hover:bg-tomato-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 touch-target"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In / Register as {targetRole === 'control' ? 'Owner' : targetRole.toUpperCase()}</span>
            </Link>

            <Link
              to="/"
              className="w-full py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold transition-colors block"
            >
              Back to Home Portals
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Owner bypass
  if (allowOwner && isOwner) {
    return <>{children}</>;
  }

  // Case 2: Control portal requires owner
  if (targetRole === 'control' && !isOwner) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-red-100 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-charcoal">Owner Access Only</h2>
          <p className="text-xs text-gray-500 mt-2 mb-6">
            The Control Portal requires administrative owner authorization. Your current account ({userProfile?.role || 'user'}) does not have owner rights.
          </p>
          <div className="flex gap-2">
            <button
              onClick={logout}
              className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
            >
              Sign Out
            </button>
            <Link
              to="/"
              className="flex-1 py-2.5 px-4 bg-tomato-600 hover:bg-tomato-700 text-white rounded-xl text-xs font-bold text-center"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Case 3: Status is pending approval
  if (userProfile?.status === 'pending') {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-amber-200 text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-100">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-xl font-black text-charcoal">Approval Pending</h2>
          <p className="text-xs text-gray-600 mt-2 mb-2">
            Your registration as <strong>{userProfile.role}</strong> ({userProfile.passId || 'Pending ID'}) is awaiting verification by the Mandi / Admin supervisor.
          </p>
          <p className="text-[11px] text-gray-400 mb-6">
            Once approved, you will have immediate real-time access to the {portalName}.
          </p>
          <button
            onClick={logout}
            className="py-2.5 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Case 4: Suspended
  if (userProfile?.status === 'suspended') {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-red-200 text-center">
          <ShieldAlert className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h2 className="text-xl font-black text-charcoal">Account Suspended</h2>
          <p className="text-xs text-gray-500 mt-2 mb-6">
            Your account has been deactivated. Please contact the administrator.
          </p>
          <button
            onClick={logout}
            className="py-2.5 px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Case 5: Role mismatch (e.g. driver trying to access farmer portal)
  if (userProfile && !allowedRoles.includes(userProfile.role)) {
    const roleMap: Record<string, string> = {
      farmer: '/grow',
      driver: '/move',
      mandi: '/hub',
      shop: '/shelf',
      consumer: '/table',
    };
    const myPortalPath = roleMap[userProfile.role] || '/';

    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 text-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
            <UserCheck className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-charcoal">Role Mismatch</h2>
          <p className="text-xs text-gray-600 mt-2 mb-6">
            You are currently signed in as a verified <strong>{userProfile.role.toUpperCase()}</strong> ({userProfile.passId}). The {portalName} is reserved for {allowedRoles.join(', ')} users.
          </p>
          <div className="space-y-2">
            <Link
              to={myPortalPath}
              className="w-full py-2.5 px-4 bg-tomato-600 hover:bg-tomato-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow"
            >
              <span>Go to Your {userProfile.role.toUpperCase()} Portal</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={logout}
              className="w-full py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold"
            >
              Sign In with a Different Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authorized!
  return <>{children}</>;
};

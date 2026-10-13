import React from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { EntrancePage } from './portals/entrance/EntrancePage';
import { AuthPage } from './portals/entrance/AuthPage';
import { ControlPortal } from './portals/control/ControlPortal';

const AppContent: React.FC = () => {
  const { userProfile, isOwner, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-sandBg">
      <Navbar
        userRole={isOwner ? 'owner' : userProfile?.role}
        passId={userProfile?.passId}
        onLogout={userProfile || isOwner ? logout : undefined}
      />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<EntrancePage />} />
          <Route path="/auth/:role" element={<AuthPage />} />
          <Route path="/control" element={<ControlPortal />} />

          {/* Placeholder routes for portals to be fleshed out in subsequent milestones */}
          <Route
            path="/grow"
            element={
              <div className="max-w-md mx-auto p-8 text-center bg-white rounded-2xl shadow mt-8">
                <h2 className="text-xl font-bold text-emerald-700">🌱 Grow Portal</h2>
                <p className="text-xs text-gray-500 mt-2">
                  Welcome, Farmer {userProfile?.firstName}! Milestone M2 (Bag creation, fields & printable QR labels).
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                >
                  Back Home
                </button>
              </div>
            }
          />
          <Route
            path="/move"
            element={
              <div className="max-w-md mx-auto p-8 text-center bg-white rounded-2xl shadow mt-8">
                <h2 className="text-xl font-bold text-blue-700">🚚 Move Portal</h2>
                <p className="text-xs text-gray-500 mt-2">
                  Welcome, Driver {userProfile?.firstName}! Milestone M3 (Trips, loading scanner, GPS fix & Leaflet maps).
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                >
                  Back Home
                </button>
              </div>
            }
          />
          <Route
            path="/hub"
            element={
              <div className="max-w-md mx-auto p-8 text-center bg-white rounded-2xl shadow mt-8">
                <h2 className="text-xl font-bold text-amber-700">🏢 Hub Portal</h2>
                <p className="text-xs text-gray-500 mt-2">
                  Welcome, Mandi Manager {userProfile?.firstName}! Milestone M4 (Crate reception, storage DHT22 telemetry & dispatch).
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold"
                >
                  Back Home
                </button>
              </div>
            }
          />
          <Route
            path="/shelf"
            element={
              <div className="max-w-md mx-auto p-8 text-center bg-white rounded-2xl shadow mt-8">
                <h2 className="text-xl font-bold text-purple-700">🏪 Shelf Portal</h2>
                <p className="text-xs text-gray-500 mt-2">
                  Welcome, Retailer {userProfile?.firstName}! Milestone M5 (Receiving from mandi & shelf list).
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold"
                >
                  Back Home
                </button>
              </div>
            }
          />
          <Route
            path="/table"
            element={
              <div className="max-w-md mx-auto p-8 text-center bg-white rounded-2xl shadow mt-8">
                <h2 className="text-xl font-bold text-tomato-600">🥗 Table Portal</h2>
                <p className="text-xs text-gray-500 mt-2">
                  Welcome, Shopper {userProfile?.firstName}! Milestone M6 (Provenance journey, confirm purchase & ratings).
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-4 py-2 bg-tomato-500 text-white rounded-xl text-xs font-bold"
                >
                  Back Home
                </button>
              </div>
            }
          />

          <Route
            path="*"
            element={
              <div className="text-center py-20 px-4">
                <h2 className="text-2xl font-bold text-charcoal">Page Not Found</h2>
                <p className="text-sm text-gray-500 mt-2">
                  The requested page could not be located.
                </p>
                <a
                  href="/"
                  className="mt-4 inline-block px-4 py-2 bg-tomato-500 text-white rounded-xl text-sm font-bold"
                >
                  Return Home
                </a>
              </div>
            }
          />
        </Routes>
      </main>
      <footer className="py-6 border-t border-gray-200 text-center text-xs text-gray-400 no-print">
        FreshPath Link © 2026 • Transparent Farm-to-Table Provenance
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;

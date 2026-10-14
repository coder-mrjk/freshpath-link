import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { EntrancePage } from './portals/entrance/EntrancePage';
import { AuthPage } from './portals/entrance/AuthPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import {
  ShieldCheck,
  Sprout,
  Printer,
  Truck,
  Warehouse,
  Store,
} from 'lucide-react';
import { ControlPortal } from './portals/control/ControlPortal';
import { GrowPortal } from './portals/grow/GrowPortal';
import { PrintLabelPage } from './portals/grow/PrintLabelPage';
import { MovePortal } from './portals/move/MovePortal';
import { HubPortal } from './portals/hub/HubPortal';
import { ShelfPortal } from './portals/shelf/ShelfPortal';
import { TablePortal } from './portals/table/TablePortal';
import { PublicBagPage } from './portals/table/PublicBagPage';

const AppContent: React.FC = () => {
  const { userProfile, isOwner, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-[#0F172A] text-[#dae2fd] relative selection:bg-red-600/30 selection:text-white">
      {/* Ambient Radial Mesh Gradient Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-red-600/10 blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 w-96 h-96 rounded-full bg-sky-600/08 blur-3xl" />
      </div>

      {/* Glassmorphism Navbar Area */}
      <div className="relative z-40 backdrop-blur-xl bg-slate-900/65 border-b border-white/[0.08] shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)]">
        <Navbar
          userRole={isOwner ? 'owner' : userProfile?.role}
          passId={userProfile?.passId}
          onLogout={userProfile || isOwner ? logout : undefined}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 relative z-10">
        <Routes>
          <Route path="/" element={<EntrancePage />} />
          <Route path="/auth/:role" element={<AuthPage />} />

          <Route
            path="/control"
            element={
              <ProtectedRoute
                allowedRoles={[]}
                allowOwner={true}
                portalName="Control Portal"
                portalDescription="Central administrative control plane to review role approval requests, monitor registered supply chain entities, and manage system datasets."
                portalIcon={ShieldCheck}
                targetRole="control"
              >
                <ControlPortal />
              </ProtectedRoute>
            }
          />

          <Route
            path="/grow"
            element={
              <ProtectedRoute
                allowedRoles={['farmer']}
                allowOwner={true}
                portalName="Farmer Grow Portal"
                portalDescription="Log daily tomato harvests, generate traceable tamper-evident crate IDs, print physical QR labels, and view cold storage status and buyer reviews."
                portalIcon={Sprout}
                targetRole="farmer"
              >
                <GrowPortal />
              </ProtectedRoute>
            }
          />

          <Route
            path="/print/:bagId"
            element={
              <ProtectedRoute
                allowedRoles={['farmer']}
                allowOwner={true}
                portalName="Crate Label Printer"
                portalDescription="Generate and print physical high-contrast QR labels for agricultural produce crates."
                portalIcon={Printer}
                targetRole="farmer"
              >
                <PrintLabelPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/move"
            element={
              <ProtectedRoute
                allowedRoles={['driver']}
                allowOwner={true}
                portalName="Driver Move Portal"
                portalDescription="Scan farm crates into your transport vehicle, manage live GPS waypoint tracking between farms and Mandi yards, and log transit milestones."
                portalIcon={Truck}
                targetRole="driver"
              >
                <MovePortal />
              </ProtectedRoute>
            }
          />

          <Route
            path="/hub"
            element={
              <ProtectedRoute
                allowedRoles={['mandi']}
                allowOwner={true}
                portalName="Mandi Hub Portal"
                portalDescription="Check in incoming crates, manage cold room bays, monitor live DHT22 temperature and humidity telemetry charts, and dispatch to retail stores."
                portalIcon={Warehouse}
                targetRole="mandi"
              >
                <HubPortal />
              </ProtectedRoute>
            }
          />

          <Route
            path="/shelf"
            element={
              <ProtectedRoute
                allowedRoles={['shop']}
                allowOwner={true}
                portalName="Retail Shelf Portal"
                portalDescription="Scan delivered crates into store inventory, monitor freshness decay and temperature penalties, and manage on-shelf stock."
                portalIcon={Store}
                targetRole="shop"
              >
                <ShelfPortal />
              </ProtectedRoute>
            }
          />

          <Route path="/table" element={<TablePortal />} />
          <Route path="/b/:bagId" element={<PublicBagPage />} />

          <Route
            path="*"
            element={
              <div className="min-h-[60vh] flex items-center justify-center px-4 py-20">
                <div className="relative backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl p-8 max-w-md w-full text-center shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]">
                  <h2 className="text-2xl font-extrabold text-[#dae2fd] tracking-tight">
                    Page Not Found
                  </h2>
                  <p className="text-sm text-slate-400 mt-2">
                    The requested page could not be located in the FreshPath network.
                  </p>
                  <a
                    href="/"
                    className="mt-6 inline-flex items-center justify-center px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-800 text-white rounded-full text-sm font-semibold shadow-[0_4px_24px_rgba(193,18,31,0.4)] hover:brightness-110 transition-all duration-300"
                  >
                    Return Home
                  </a>
                </div>
              </div>
            }
          />
        </Routes>
      </main>

      {/* Glassmorphism Footer */}
      <footer className="relative z-10 py-6 border-t border-white/[0.08] backdrop-blur-xl bg-slate-900/60 text-center text-xs text-slate-400 no-print">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src="/logo192.png" alt="FreshPath Link" className="w-4 h-4 object-contain opacity-80" />
            <span className="font-semibold text-slate-300">FreshPath Link © 2026</span>
          </div>
          <span className="text-slate-500 font-medium">
            Transparent Farm-to-Table Provenance
          </span>
        </div>
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

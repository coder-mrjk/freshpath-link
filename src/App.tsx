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

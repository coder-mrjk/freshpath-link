import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { EntrancePage } from './portals/entrance/EntrancePage';
import { AuthPage } from './portals/entrance/AuthPage';
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
          <Route path="/control" element={<ControlPortal />} />
          <Route path="/grow" element={<GrowPortal />} />
          <Route path="/print/:bagId" element={<PrintLabelPage />} />
          <Route path="/move" element={<MovePortal />} />
          <Route path="/hub" element={<HubPortal />} />
          <Route path="/shelf" element={<ShelfPortal />} />
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

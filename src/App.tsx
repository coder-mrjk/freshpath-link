import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { EntrancePage } from './portals/entrance/EntrancePage';
import { AuthPage } from './portals/entrance/AuthPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-sandBg">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<EntrancePage />} />
            <Route path="/auth/:role" element={<AuthPage />} />
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
    </BrowserRouter>
  );
};

export default App;

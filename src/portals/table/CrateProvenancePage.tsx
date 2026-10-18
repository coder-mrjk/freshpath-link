import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BagProvenanceView } from './BagProvenanceView';
import { AlertCircle } from 'lucide-react';

export const CrateProvenancePage: React.FC = () => {
  const { bagId } = useParams<{ bagId: string }>();
  const navigate = useNavigate();

  if (!bagId) {
    return (
      <div className="max-w-md mx-auto p-8 text-center backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] rounded-3xl shadow-2xl mt-8 text-white">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white">Invalid Crate URL</h2>
        <p className="text-xs text-slate-400 mt-2">No crate identifier specified in request.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-full text-xs font-bold shadow-[0_4px_16px_rgba(193,18,31,0.3)] transition-all"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className="py-4">
      <BagProvenanceView bagId={bagId} onBack={() => navigate('/table')} />
    </div>
  );
};

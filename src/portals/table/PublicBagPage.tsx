import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BagProvenanceView } from './BagProvenanceView';

export const PublicBagPage: React.FC = () => {
  const { bagId } = useParams<{ bagId: string }>();
  const navigate = useNavigate();

  if (!bagId) {
    return (
      <div className="max-w-md mx-auto p-8 text-center bg-white rounded-2xl shadow mt-8">
        <h2 className="text-xl font-bold text-charcoal">Invalid Crate URL</h2>
        <p className="text-xs text-gray-500 mt-2">No crate identifier specified.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-tomato-500 text-white rounded-xl text-xs font-bold"
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

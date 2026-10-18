import React, { useEffect, useState } from 'react';
import {
  initRemoteConfig,
  getRemoteBoolean,
  getRemoteString,
} from '../lib/remoteConfig';
import { Megaphone, X } from 'lucide-react';

export const BroadcastBanner: React.FC = () => {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkBroadcast = async () => {
      await initRemoteConfig();
      if (!isMounted) return;

      const isActive = getRemoteBoolean('emergency_broadcast_active');
      const broadcastMsg = getRemoteString('emergency_broadcast_message');

      const dismissedMsg = sessionStorage.getItem('freshpath_dismissed_broadcast');
      if (dismissedMsg === broadcastMsg && broadcastMsg !== '') {
        setDismissed(true);
      }

      setActive(isActive && Boolean(broadcastMsg.trim()));
      setMessage(broadcastMsg.trim());
    };

    checkBroadcast();

    // Check periodically every 2 minutes
    const interval = setInterval(checkBroadcast, 120000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!active || dismissed || !message) {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem('freshpath_dismissed_broadcast', message);
    setDismissed(true);
  };

  return (
    <div className="relative z-50 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2.5 shadow-lg border-b border-white/20">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="p-1 bg-white/20 rounded-lg shrink-0">
            <Megaphone className="w-4 h-4 text-white animate-bounce" />
          </span>
          <span className="truncate">
            <strong className="uppercase tracking-wider mr-1.5 text-amber-100">Live Advisory:</strong>
            {message}
          </span>
        </div>

        <button
          onClick={handleDismiss}
          className="p-1 hover:bg-white/20 rounded-md transition-colors shrink-0 text-white/90 hover:text-white"
          title="Dismiss advisory"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

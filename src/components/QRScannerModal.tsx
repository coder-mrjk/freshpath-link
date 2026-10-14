import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, Keyboard, AlertCircle } from 'lucide-react';
import { parseScannedBagId } from '../lib/bagId';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (bagId: string) => void;
  title?: string;
}

export const QRScannerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'Scan Crate QR Code',
}) => {
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = 'freshpath-qr-reader';

  useEffect(() => {
    if (!isOpen || mode !== 'camera') {
      stopScanner();
      return;
    }

    let isMounted = true;
    const startScanner = async () => {
      try {
        setCameraError(null);
        // Clean up any old instance
        if (scannerRef.current) {
          await stopScanner();
        }

        const html5QrCode = new Html5Qrcode(scannerDivId);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            const parsed = parseScannedBagId(decodedText);
            if (parsed) {
              stopScanner().then(() => {
                onScanSuccess(parsed);
              });
            } else {
              setManualError(`Unrecognized QR code: ${decodedText}`);
            }
          },
          () => {
            // scanning loop ignore
          }
        );
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = (err as Error)?.message || 'Camera permission denied or camera not found.';
        console.warn('QR camera error:', err);
        setCameraError(msg);
        setMode('manual');
      }
    };

    // Small delay to allow DOM element to render
    const timer = setTimeout(startScanner, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, mode]);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');
    const parsed = parseScannedBagId(manualInput);
    if (!parsed) {
      setManualError('Invalid Bag ID. Example: FP-TOM-261013-ABC123');
      return;
    }
    stopScanner().then(() => {
      onScanSuccess(parsed);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 w-full max-w-md rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
          <h2 className="font-extrabold text-lg text-white tracking-tight">{title}</h2>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors touch-target flex items-center justify-center"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex p-1.5 m-4 mb-2 bg-slate-950/60 rounded-2xl border border-white/10 gap-1.5">
          <button
            type="button"
            onClick={() => setMode('camera')}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-xl transition-all duration-200 touch-target ${
              mode === 'camera'
                ? 'bg-gradient-to-r from-red-600 to-red-800 text-white shadow-[0_0_16px_rgba(193,18,31,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Camera className="w-4 h-4" />
            Camera Scanner
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-xl transition-all duration-200 touch-target ${
              mode === 'manual'
                ? 'bg-gradient-to-r from-red-600 to-red-800 text-white shadow-[0_0_16px_rgba(193,18,31,0.35)]'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            Type Bag ID
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 pt-2 flex flex-col items-center">
          {mode === 'camera' ? (
            <div className="w-full flex flex-col items-center">
              <div
                id={scannerDivId}
                className="w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-black border border-white/10 shadow-inner"
              />
              <p className="text-xs text-slate-400 mt-3 text-center">
                Point your camera at the printed QR label on the tomato crate.
              </p>
              {cameraError && (
                <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-xs text-amber-200 flex items-start gap-2.5 backdrop-blur-md w-full">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-300">Camera Access Note:</p>
                    <p className="mt-0.5 text-slate-300">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => setMode('manual')}
                      className="mt-1.5 text-red-400 font-bold hover:underline block"
                    >
                      Use manual entry instead &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="w-full space-y-4 py-2">
              <div>
                <label
                  htmlFor="manualBagId"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5"
                >
                  Enter Crate / Bag ID
                </label>
                <input
                  id="manualBagId"
                  type="text"
                  placeholder="e.g. FP-TOM-261013-ABC123"
                  value={manualInput}
                  onChange={(e) => {
                    setManualInput(e.target.value);
                    setManualError('');
                  }}
                  className="w-full px-4 py-3 bg-slate-800/80 border border-white/15 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500/50 focus:outline-none uppercase font-mono text-sm text-white placeholder-slate-500 shadow-inner transition-colors"
                  autoFocus
                />
              </div>

              {manualError && (
                <p className="text-xs text-red-400 font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {manualError}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-bold rounded-xl shadow-[0_4px_24px_rgba(193,18,31,0.4)] transition-all touch-target"
              >
                Lookup Crate
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between bg-sandBg">
          <h2 className="font-bold text-lg text-charcoal">{title}</h2>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-2 rounded-full hover:bg-gray-200 touch-target"
            aria-label="Close scanner"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b bg-gray-50">
          <button
            type="button"
            onClick={() => setMode('camera')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mode === 'camera'
                ? 'border-tomato-500 text-tomato-500 bg-white'
                : 'border-transparent text-gray-500 hover:text-charcoal'
            }`}
          >
            <Camera className="w-4 h-4" />
            Camera Scanner
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              mode === 'manual'
                ? 'border-tomato-500 text-tomato-500 bg-white'
                : 'border-transparent text-gray-500 hover:text-charcoal'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            Type Bag ID
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col items-center">
          {mode === 'camera' ? (
            <div className="w-full flex flex-col items-center">
              <div
                id={scannerDivId}
                className="w-full max-w-[320px] aspect-square rounded-xl overflow-hidden bg-black shadow-inner"
              />
              <p className="text-xs text-gray-500 mt-3 text-center">
                Point your camera at the printed QR label on the tomato crate.
              </p>
              {cameraError && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Camera Access Note:</p>
                    <p>{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => setMode('manual')}
                      className="mt-1 text-tomato-600 font-bold underline"
                    >
                      Use manual entry instead
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
                  className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-tomato-500 focus:outline-none uppercase font-mono text-sm"
                  autoFocus
                />
              </div>

              {manualError && (
                <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {manualError}
                </p>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-tomato-500 hover:bg-tomato-600 text-white font-bold rounded-xl shadow-md transition-colors touch-target"
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

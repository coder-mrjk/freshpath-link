import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { formatIST } from '../../lib/time';
import { formatRupees } from '../../lib/price';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Download, ArrowLeft, AlertCircle, Sprout } from 'lucide-react';

interface BagData {
  id: string;
  farmerFirstName: string;
  village: string;
  fieldName: string;
  weightKg: number;
  pieces: number;
  sizeGrade?: string;
  totalPrice: number;
  pricePerKg: number;
  harvestAt: any;
  createdAt: any;
  status: string;
}

export const PrintLabelPage: React.FC = () => {
  const { bagId } = useParams<{ bagId: string }>();
  const [bag, setBag] = useState<BagData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  const printContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bagId) return;

    const fetchBag = async () => {
      setLoading(false);
      try {
        const snap = await getDoc(doc(db, 'bags', bagId));
        if (snap.exists()) {
          setBag({ id: snap.id, ...snap.data() } as BagData);
        } else {
          setError(`Crate ID "${bagId}" could not be found.`);
        }
      } catch (err: unknown) {
        setError((err as Error)?.message || 'Failed to fetch crate details.');
      } finally {
        setLoading(false);
      }
    };

    fetchBag();
  }, [bagId]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPng = () => {
    if (!bagId) return;
    const svgElement = document.getElementById('bag-qr-code') as SVGSVGElement | null;
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = 400;
      canvas.height = 400;
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(img, 50, 50, 300, 300);
        ctx.fillStyle = '#1B1B1B';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(bagId, 200, 380);

        const link = document.createElement('a');
        link.download = `${bagId}-label.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const qrUrl = typeof window !== 'undefined' && bagId
    ? `${window.location.origin}/b/${bagId}`
    : `https://freshpath-link.web.app/b/${bagId}`;

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-4 border-tomato-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-gray-500">Loading crate label...</p>
      </div>
    );
  }

  if (error || !bag) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <h2 className="text-sm font-bold text-red-800">Label Not Found</h2>
          <p className="text-xs text-red-600 mt-1">{error}</p>
          <Link
            to="/grow"
            className="mt-4 inline-block px-4 py-2 bg-tomato-500 text-white rounded-xl text-xs font-bold"
          >
            Back to Grow Portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Controls (hidden during print) */}
      <div className="no-print mb-6 space-y-4">
        <Link
          to="/grow"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-tomato-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Bags</span>
        </Link>

        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-700">Copies:</label>
            <select
              value={copies}
              onChange={(e) => setCopies(Number(e.target.value))}
              className="px-2 py-1 bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold"
            >
              <option value={1}>1 copy</option>
              <option value={2}>2 copies</option>
              <option value={3}>3 copies</option>
              <option value={4}>4 copies</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-charcoal rounded-xl text-xs font-bold transition-colors touch-target"
            >
              <Download className="w-4 h-4" />
              <span>Download PNG</span>
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-tomato-500 hover:bg-tomato-600 text-white rounded-xl text-xs font-bold shadow-md transition-colors touch-target"
            >
              <Printer className="w-4 h-4" />
              <span>Print Label</span>
            </button>
          </div>
        </div>
      </div>

      {/* Printable Label Section */}
      <div ref={printContainerRef} className="space-y-6">
        {Array.from({ length: copies }).map((_, index) => (
          <div
            key={index}
            className="label-container bg-white p-6 rounded-2xl border-4 border-charcoal shadow-lg max-w-sm mx-auto text-charcoal font-sans"
          >
            {/* Header */}
            <div className="border-b-2 border-charcoal pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-tomato-500 text-white rounded-lg flex items-center justify-center font-black">
                  <Sprout className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-lg font-black tracking-tight leading-none">
                    FreshPath Link
                  </h1>
                  <span className="text-[10px] uppercase font-bold text-gray-600 tracking-wider">
                    Traceable Tomato Crate
                  </span>
                </div>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 bg-gray-100 border border-gray-400 rounded-md">
                TAMIL NADU
              </span>
            </div>

            {/* QR Code Centerpiece */}
            <div className="py-4 flex flex-col items-center justify-center bg-gray-50 rounded-xl my-3 border border-gray-200">
              <div className="p-3 bg-white rounded-lg shadow-xs border border-gray-300">
                <QRCodeSVG
                  id="bag-qr-code"
                  value={qrUrl}
                  size={160}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="font-mono text-xs font-black tracking-wider mt-2 select-all">
                {bag.id}
              </p>
              <span className="text-[9px] text-gray-500 uppercase tracking-widest mt-0.5">
                Scan with any camera or FreshPath
              </span>
            </div>

            {/* Produce Information Table */}
            <div className="grid grid-cols-2 gap-2 text-xs border-t-2 border-charcoal pt-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-500 block">
                  Farmer
                </span>
                <span className="font-bold text-sm text-charcoal">
                  {bag.farmerFirstName}
                </span>
                <span className="text-[11px] text-gray-600 block">
                  {bag.village}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-gray-500 block">
                  Total Weight & Pieces
                </span>
                <span className="font-bold text-sm text-charcoal">
                  {bag.weightKg} kg
                </span>
                <span className="text-[11px] text-gray-600 block">
                  ~{bag.pieces} pcs {bag.sizeGrade ? `(${bag.sizeGrade})` : ''}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-200 pt-2 mt-2">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-500 block">
                  Harvest Time (IST)
                </span>
                <span className="font-semibold text-[11px]">
                  {formatIST(bag.harvestAt || bag.createdAt)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-gray-500 block">
                  Retail Value
                </span>
                <span className="font-black text-sm text-tomato-600">
                  {formatRupees(bag.totalPrice)}
                </span>
                <span className="text-[10px] text-gray-500 block">
                  ₹{bag.pricePerKg}/kg
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t-2 border-charcoal mt-3 pt-2 text-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              Farm to Table • Freshness Guaranteed
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

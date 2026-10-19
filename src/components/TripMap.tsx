import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { formatStraightLineDistance } from '../lib/haversine';
import { formatIST } from '../lib/time';

interface GPSPoint {
  lat: number;
  lng: number;
  sats?: number;
  hdop?: number;
  fixAt?: any;
  simulated?: boolean;
}

interface Props {
  start?: GPSPoint | null;
  end?: GPSPoint | null;
  distanceKm?: number;
  className?: string;
}

export const TripMap: React.FC<Props> = ({
  start,
  end,
  distanceKm,
  className = 'h-64 w-full rounded-xl overflow-hidden',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center on Tamil Nadu coordinates by default
    const defaultCenter: [number, number] = [11.748, 79.7714];
    const initialLat = start?.lat || defaultCenter[0];
    const initialLng = start?.lng || defaultCenter[1];

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      }).setView([initialLat, initialLng], 10);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear previous layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const latLngs: L.LatLngExpression[] = [];

    // Green Start Marker
    if (start && start.lat && start.lng) {
      const startLatLng: [number, number] = [start.lat, start.lng];
      latLngs.push(startLatLng);

      L.circle(startLatLng, {
        color: '#2E7D32',
        fillColor: '#2E7D32',
        fillOpacity: 0.15,
        radius: (start.hdop || 1.5) * 20, // Accuracy radius
      }).addTo(map);

      const startMarker = L.circleMarker(startLatLng, {
        radius: 8,
        fillColor: '#2E7D32',
        color: '#FFFFFF',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map);

      startMarker.bindPopup(
        `<div style="font-size: 11px;">
          <strong style="color: #2E7D32;">🟢 Trip Start</strong><br/>
          <strong>Coords:</strong> ${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}<br/>
          <strong>Time:</strong> ${formatIST(start.fixAt)}<br/>
          <strong>Satellites:</strong> ${start.sats || 'N/A'} (HDOP: ${start.hdop || 'N/A'})
          ${start.simulated ? '<br/><span style="color: #D97706; font-weight: bold;">⚠ Simulated GPS (no live fix)</span>' : ''}
        </div>`
      );
    }

    // Red End Marker
    if (end && end.lat && end.lng) {
      const endLatLng: [number, number] = [end.lat, end.lng];
      latLngs.push(endLatLng);

      L.circle(endLatLng, {
        color: '#D62828',
        fillColor: '#D62828',
        fillOpacity: 0.15,
        radius: (end.hdop || 1.5) * 20,
      }).addTo(map);

      const endMarker = L.circleMarker(endLatLng, {
        radius: 8,
        fillColor: '#D62828',
        color: '#FFFFFF',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map);

      endMarker.bindPopup(
        `<div style="font-size: 11px;">
          <strong style="color: #D62828;">🔴 Trip End (Mandi)</strong><br/>
          <strong>Coords:</strong> ${end.lat.toFixed(6)}, ${end.lng.toFixed(6)}<br/>
          <strong>Time:</strong> ${formatIST(end.fixAt)}<br/>
          <strong>Satellites:</strong> ${end.sats || 'N/A'} (HDOP: ${end.hdop || 'N/A'})
          ${end.simulated ? '<br/><span style="color: #D97706; font-weight: bold;">⚠ Simulated GPS (no live fix)</span>' : ''}
        </div>`
      );
    }

    // Connect with straight line
    if (latLngs.length === 2) {
      const polyline = L.polyline(latLngs, {
        color: '#1B1B1B',
        weight: 3,
        dashArray: '6, 8',
        opacity: 0.8,
      }).addTo(map);

      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], 12);
    }

    return () => {
      // Keep map alive or clean up on unmount
    };
  }, [start, end]);

  return (
    <div className="relative">
      <div ref={mapContainerRef} className={className} />
      {distanceKm !== undefined && distanceKm > 0 && (
        <div className="absolute bottom-2 left-2 z-[400] bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-gray-300 text-[11px] font-bold text-charcoal shadow-xs">
          📏 {formatStraightLineDistance(distanceKm)}
        </div>
      )}
      <div className="absolute top-2 right-2 z-[400] bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded text-[9px] text-gray-500 border border-gray-200">
        GPS accuracy depends on satellites
      </div>
    </div>
  );
};

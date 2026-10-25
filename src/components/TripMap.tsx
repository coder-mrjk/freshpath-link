import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { formatStraightLineDistance } from '../lib/haversine';
import { formatIST } from '../lib/time';

export interface GPSPoint {
  lat: number;
  lng: number;
  speedKmph?: number;
  sats?: number;
  hdop?: number;
  fixAt?: any;
  simulated?: boolean;
}

interface PlacePoint {
  lat?: number;
  lng?: number;
  name?: string;
}

interface Props {
  start?: GPSPoint | null;
  end?: GPSPoint | null;
  current?: GPSPoint | null;
  destination?: PlacePoint | null;
  distanceKm?: number;
  className?: string;
}

export const TripMap: React.FC<Props> = ({
  start,
  end,
  current,
  destination,
  distanceKm,
  className = 'h-64 w-full rounded-xl overflow-hidden',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Pick best center: Live current position -> Trip start -> Destination -> Regional center
    const defaultCenter: [number, number] = [11.370, 77.745]; // Regional center fallback
    const initialLat = current?.lat || start?.lat || destination?.lat || defaultCenter[0];
    const initialLng = current?.lng || start?.lng || destination?.lng || defaultCenter[1];

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
      }).setView([initialLat, initialLng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Clear previous dynamic layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const latLngs: L.LatLngExpression[] = [];

    // 1. Green Start Marker (Origin Farm / Trip Start)
    if (start && start.lat && start.lng) {
      const startLatLng: [number, number] = [start.lat, start.lng];
      latLngs.push(startLatLng);

      L.circle(startLatLng, {
        color: '#2E7D32',
        fillColor: '#2E7D32',
        fillOpacity: 0.15,
        radius: Math.max((start.hdop || 1.5) * 15, 10),
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
          <strong style="color: #2E7D32;">🟢 Trip Origin (Start)</strong><br/>
          <strong>Coords:</strong> ${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}<br/>
          <strong>Time:</strong> ${formatIST(start.fixAt)}<br/>
          <strong>Satellites:</strong> ${start.sats || 'N/A'} (HDOP: ${start.hdop || 'N/A'})
          ${start.simulated ? '<br/><span style="color: #D97706; font-weight: bold;">⚠ Simulated GPS</span>' : ''}
        </div>`
      );
    }

    // 2. Blue Live Vehicle Tracker Marker (Current Real-time GPS Position)
    if (current && current.lat && current.lng) {
      const curLatLng: [number, number] = [current.lat, current.lng];
      latLngs.push(curLatLng);

      // Accuracy radius circle
      L.circle(curLatLng, {
        color: '#2563EB',
        fillColor: '#3B82F6',
        fillOpacity: 0.18,
        radius: Math.max((current.hdop || 1.0) * 15, 12),
      }).addTo(map);

      // Pulse outer ring
      L.circleMarker(curLatLng, {
        radius: 12,
        fillColor: '#60A5FA',
        color: '#2563EB',
        weight: 1.5,
        opacity: 0.6,
        fillOpacity: 0.25,
      }).addTo(map);

      // Solid core vehicle marker
      const curMarker = L.circleMarker(curLatLng, {
        radius: 7,
        fillColor: '#1D4ED8',
        color: '#FFFFFF',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map);

      curMarker.bindPopup(
        `<div style="font-size: 11px;">
          <strong style="color: #1D4ED8;">🚚 Live Vehicle Position</strong><br/>
          <strong>Coords:</strong> ${current.lat.toFixed(6)}, ${current.lng.toFixed(6)}<br/>
          <strong>Satellites:</strong> ${current.sats || 'N/A'} (HDOP: ${current.hdop || 'N/A'})<br/>
          <strong>Speed:</strong> ${current.speedKmph !== undefined ? current.speedKmph.toFixed(1) : '0.0'} km/h<br/>
          <strong>Fix Time:</strong> ${formatIST(current.fixAt)}
          ${current.simulated ? '<br/><span style="color: #D97706; font-weight: bold;">⚠ Simulated GPS</span>' : ''}
        </div>`
      );
    }

    // 3. Red End Marker (Trip End / Completed)
    if (end && end.lat && end.lng) {
      const endLatLng: [number, number] = [end.lat, end.lng];
      latLngs.push(endLatLng);

      L.circle(endLatLng, {
        color: '#D62828',
        fillColor: '#D62828',
        fillOpacity: 0.15,
        radius: Math.max((end.hdop || 1.5) * 15, 10),
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
          <strong style="color: #D62828;">🔴 Trip Destination (Arrival)</strong><br/>
          <strong>Coords:</strong> ${end.lat.toFixed(6)}, ${end.lng.toFixed(6)}<br/>
          <strong>Time:</strong> ${formatIST(end.fixAt)}<br/>
          <strong>Satellites:</strong> ${end.sats || 'N/A'} (HDOP: ${end.hdop || 'N/A'})
          ${end.simulated ? '<br/><span style="color: #D97706; font-weight: bold;">⚠ Simulated GPS</span>' : ''}
        </div>`
      );
    }

    // 4. Destination Mandi marker (if known and trip has not ended yet)
    if (!end && destination && destination.lat && destination.lng) {
      const destLatLng: [number, number] = [destination.lat, destination.lng];
      latLngs.push(destLatLng);

      const destMarker = L.circleMarker(destLatLng, {
        radius: 6,
        fillColor: '#9333EA',
        color: '#FFFFFF',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      }).addTo(map);

      destMarker.bindPopup(
        `<div style="font-size: 11px;">
          <strong style="color: #9333EA;">🏢 Destination Mandi</strong><br/>
          <strong>${destination.name || 'Mandi Facility'}</strong><br/>
          <strong>Coords:</strong> ${destination.lat.toFixed(6)}, ${destination.lng.toFixed(6)}
        </div>`
      );
    }

    // Connect points or fit view
    if (latLngs.length >= 2) {
      const polyline = L.polyline(latLngs, {
        color: '#2563EB',
        weight: 3,
        dashArray: '6, 8',
        opacity: 0.7,
      }).addTo(map);

      map.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 15 });
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], 14);
    }
  }, [start, end, current, destination]);

  return (
    <div className="relative">
      <div ref={mapContainerRef} className={className} />
      {distanceKm !== undefined && distanceKm > 0 && (
        <div className="absolute bottom-2 left-2 z-[400] bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] font-bold text-white shadow-md">
          📏 {formatStraightLineDistance(distanceKm)}
        </div>
      )}
      <div className="absolute top-2 right-2 z-[400] bg-slate-900/90 backdrop-blur-md px-2 py-0.5 rounded text-[9px] text-slate-300 border border-white/10">
        Live u-blox NEO GPS Tracking
      </div>
    </div>
  );
};

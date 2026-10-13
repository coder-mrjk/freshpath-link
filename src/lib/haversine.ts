/**
 * Haversine Great-Circle Distance
 * Calculates the straight-line distance between two GPS coordinates in kilometers.
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Calculates straight-line distance in km between two GPS coordinates.
 */
export function calculateHaversineDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);

  const lat1 = toRadians(coord1.lat);
  const lat2 = toRadians(coord2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100;
}

/**
 * Formats distance with label: e.g. "42.5 km (straight-line)"
 */
export function formatStraightLineDistance(km: number): string {
  return `${km.toFixed(1)} km (straight-line)`;
}

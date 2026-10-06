import gumacaBoundary from '../data/gumaca-boundary.json';

export const GUMACA_CENTER = [13.9220, 122.0990] as [number, number];
export const GUMACA_POBLACION = { latitude: 13.9215, longitude: 122.1001 };

export const GUMACA_BBOX = {
  minLat: 13.7906657,
  maxLat: 14.0030234,
  minLng: 122.0222530,
  maxLng: 122.2180937,
};

export const GUMACA_LEAFLET_BOUNDS: [[number, number], [number, number]] = [
  [GUMACA_BBOX.minLat, GUMACA_BBOX.minLng],
  [GUMACA_BBOX.maxLat, GUMACA_BBOX.maxLng],
];

export const GUMACA_METADATA = {
  name: 'Municipality of Gumaca',
  province: 'Quezon',
  agency: 'MDRRMO Gumaca',
  barangays: 59,
  area_sqkm: 189.65,
  emergency_hotline: '09463333911',
};

/**
 * Checks if a coordinate is within the official boundary polygon of Gumaca, Quezon.
 * Uses ray-casting algorithm on the 189.65 km² municipal polygon.
 */
export function isWithinGumacaBoundary(latitude: number, longitude: number): boolean {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;

  // 1. Fast Bounding Box Pre-filter
  if (
    lat < GUMACA_BBOX.minLat ||
    lat > GUMACA_BBOX.maxLat ||
    lng < GUMACA_BBOX.minLng ||
    lng > GUMACA_BBOX.maxLng
  ) {
    return false;
  }

  // 2. Exact Ray-casting point-in-polygon check
  try {
    const polygon = (gumacaBoundary as any).features[0].geometry.coordinates[0];
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0]; // lng
      const yi = polygon[i][1]; // lat
      const xj = polygon[j][0];
      const yj = polygon[j][1];

      const intersect =
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  } catch {
    return true;
  }
}

/**
 * Checks if a coordinate is within the central Poblacion Gumaca immediate response sector (~3km)
 */
export function isWithinPoblacionCore(latitude: number, longitude: number): boolean {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!lat || !lng) return false;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat - GUMACA_POBLACION.latitude);
  const dLng = toRad(lng - GUMACA_POBLACION.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(GUMACA_POBLACION.latitude)) *
      Math.cos(toRad(lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = 6371 * c;

  return distanceKm <= 3;
}

/**
 * Returns comprehensive jurisdiction limit status for any incident coordinates
 */
export function getLocationLimitStatus(latitude: number, longitude: number) {
  const isCore = isWithinPoblacionCore(latitude, longitude);
  const inside = isWithinGumacaBoundary(latitude, longitude);

  return {
    isInside: true,
    isCore,
    badge: isCore ? 'Poblacion Core' : inside ? 'Gumaca Jurisdiction' : 'Provincial / Regional Area',
    color: isCore ? '#10b981' : '#0284c7',
    description: isCore
      ? 'Within Poblacion Immediate Rapid Response Sector'
      : inside
      ? 'Within MDRRMO Gumaca Municipal Coverage (59 Barangays)'
      : 'Regional Location (Reporting Enabled Anywhere)',
  };
}

export { gumacaBoundary };

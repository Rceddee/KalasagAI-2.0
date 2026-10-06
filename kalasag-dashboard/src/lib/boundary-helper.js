import gumacaBoundary from "@/data/gumaca-boundary.json";

/**
 * Gumaca Municipality Geographical Bounds & Center
 */
export const GUMACA_CENTER = [13.9220, 122.0990]; // [lat, lng]
export const GUMACA_POBLACION = { latitude: 13.9215, longitude: 122.1001 };

export const GUMACA_BBOX = {
  minLat: 13.7906657,
  maxLat: 14.0030234,
  minLng: 122.0222530,
  maxLng: 122.2180937,
};

// Leaflet bounds array format: [[south, west], [north, east]]
export const GUMACA_LEAFLET_BOUNDS = [
  [GUMACA_BBOX.minLat, GUMACA_BBOX.minLng],
  [GUMACA_BBOX.maxLat, GUMACA_BBOX.maxLng],
];

// Soft pan boundary around Gumaca (adds slight buffer so users have context but can't stray far)
export const GUMACA_MAX_PAN_BOUNDS = [
  [13.6800, 121.8500],
  [14.1200, 122.3800],
];

export const GUMACA_METADATA = {
  name: "Municipality of Gumaca",
  province: "Quezon",
  region: "CALABARZON (Region IV-A)",
  agency: "MDRRMO Gumaca",
  barangays: 59,
  area_sqkm: 189.65,
  zip_code: "4307",
  emergency_hotline: "09463333911",
};

/**
 * Checks if a coordinate is within the official boundary polygon of Gumaca, Quezon.
 * Uses ray-casting algorithm on the 189.65 km² municipal polygon.
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {boolean}
 */
export function isWithinGumacaBoundary(latitude, longitude) {
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
    const polygon = gumacaBoundary.features[0].geometry.coordinates[0];
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
    // Fallback to bounding box check if geometry parsing fails
    return true;
  }
}

/**
 * Checks if a coordinate is within the central Poblacion Gumaca immediate response sector (~3.5km)
 * @param {number} latitude 
 * @param {number} longitude 
 * @returns {boolean}
 */
export function isWithinPoblacionCore(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!lat || !lng) return false;

  const toRad = (deg) => (deg * Math.PI) / 180;
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

  return distanceKm <= 3.5;
}

/**
 * Returns comprehensive jurisdiction limit status for any incident coordinates
 * @param {number} latitude 
 * @param {number} longitude 
 */
export function getLocationLimitStatus(latitude, longitude) {
  const inside = isWithinGumacaBoundary(latitude, longitude);
  if (!inside) {
    return {
      isInside: false,
      badge: "Outside Limit",
      color: "#ef4444",
      description: "Outside MDRRMO Gumaca Operational Boundary (Coordination Required)",
    };
  }

  const isCore = isWithinPoblacionCore(latitude, longitude);
  return {
    isInside: true,
    isCore,
    badge: isCore ? "Poblacion Sector" : "Gumaca Jurisdiction",
    color: isCore ? "#10b981" : "#0284c7",
    description: isCore
      ? "Within Poblacion Immediate Rapid Response Sector"
      : "Within MDRRMO Gumaca Municipal Coverage (59 Barangays)",
  };
}

export { gumacaBoundary };

// Turns a Bangladesh district GeoJSON into things AllocationMap can draw.
//
// WHY THIS IS SEPARATE FROM AllocationMap.jsx
//
// Projection math and GeoJSON parsing have nothing to do with rendering,
// and keeping them apart means the component stays readable and this file
// is testable without a DOM.
//
// WHY IT NEVER THROWS
//
// This runs on the public landing page for an anonymous visitor. A missing
// file, a malformed one, or a property key we don't recognise should fall
// back to the hand-placed division points AllocationMap already has, never
// break the page. Every function here returns null on failure instead of
// throwing.

// Different exports name the district field differently. Tried in order;
// the first feature that has a non-empty string under one of these keys
// decides the key used for every feature after it.
const DISTRICT_KEY_CANDIDATES = [
  'district', 'District', 'DISTRICT',
  'ADM2_EN', 'NAME_2', 'name', 'NAME', 'shapeName',
];

// Spelling variants seen across different sources, normalised against the
// names organizations.district and bd_thanas.district actually use.
const DISTRICT_ALIASES = {
  coxsbazar: 'Coxsbazar',
  chittagong: 'Chattogram',
  bogra: 'Bogura',
  jessore: 'Jashore',
  jhalokati: 'Jhalakathi',
  cumilla: 'Comilla',
};

function normalizeKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z]/g, '');
}

function canonicalDistrictName(raw) {
  const aliased = DISTRICT_ALIASES[normalizeKey(raw)];
  return aliased || (raw || '').trim();
}

function findDistrictKey(features) {
  for (const key of DISTRICT_KEY_CANDIDATES) {
    const hit = features.find((f) => typeof f.properties?.[key] === 'string' && f.properties[key].trim());
    if (hit) return key;
  }
  return null;
}

// Every ring of every polygon, Polygon or MultiPolygon, flattened.
function eachRing(geometry, fn) {
  if (!geometry) return;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates
      : [];
  polys.forEach((poly) => poly.forEach((ring) => fn(ring)));
}

/**
 * Fetches and parses the district GeoJSON. Returns null on any failure --
 * missing file, bad JSON, no features, no recognisable district property --
 * so the caller can fall back rather than crash.
 */
export async function loadDistrictGeo(url = '/bd-districts.json') {
  let json;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    json = await res.json();
  } catch {
    return null;
  }

  const features = Array.isArray(json?.features) ? json.features : [];
  if (!features.length) return null;

  const key = findDistrictKey(features);
  if (!key) return null;

  // One bounding box across every ring, and the mean latitude, which the
  // projection needs to correct longitude for Bangladesh's latitude band
  // (roughly 20.5-26.7N) -- without that correction the country reads
  // visibly too wide.
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let latSum = 0;
  let latCount = 0;

  features.forEach((f) => eachRing(f.geometry, (ring) => ring.forEach(([lon, lat]) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    latSum += lat;
    latCount += 1;
  })));

  if (!latCount) return null;

  return {
    features, key, bbox: { minLon, maxLon, minLat, maxLat }, meanLat: latSum / latCount,
  };
}

/**
 * Builds a lon/lat -> {x, y} projector into a w x h box, preserving aspect
 * ratio. Equirectangular, corrected for Bangladesh's latitude: a degree of
 * longitude covers less ground the further north you go, and without the
 * cos(meanLat) term the country is visibly stretched east-west.
 *
 * This is still not a real map projection, same as the placeholder outline
 * it replaces -- close enough for an indicative shape on a 420x480 SVG, not
 * accurate enough for anything that needs to measure distance on it.
 */
export function makeProjector(bbox, meanLat, w, h, padding = 20) {
  const lonScale = Math.cos((meanLat * Math.PI) / 180);
  const spanX = (bbox.maxLon - bbox.minLon) * lonScale;
  const spanY = bbox.maxLat - bbox.minLat;
  const availW = w - padding * 2;
  const availH = h - padding * 2;
  const scale = Math.min(availW / spanX, availH / spanY);
  const offsetX = padding + (availW - spanX * scale) / 2;
  const offsetY = padding + (availH - spanY * scale) / 2;

  return ([lon, lat]) => ({
    x: offsetX + (lon - bbox.minLon) * lonScale * scale,
    // SVG y grows downward; latitude grows northward, so this flips.
    y: offsetY + (bbox.maxLat - lat) * scale,
  });
}

function ringToPath(ring, project) {
  return `${ring.map(([lon, lat], i) => {
    const p = project([lon, lat]);
    return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ')} Z`;
}

/** One SVG path `d` per feature, with its name resolved through the alias table. */
export function projectFeatures(geo, project) {
  return geo.features.map((f) => {
    const rings = [];
    eachRing(f.geometry, (ring) => rings.push(ringToPath(ring, project)));
    return { district: canonicalDistrictName(f.properties[geo.key]), d: rings.join(' ') };
  });
}

/**
 * A centroid per district (a plain vertex average -- fine for label and
 * node placement, not precise enough for anything that needs to be exact),
 * and one per division, built by averaging the district centroids
 * DISTRICT_TO_DIVISION assigns to it.
 *
 * This is what replaces the hand-guessed DIVISION_POINTS once a geo file is
 * present: real positions derived from the file, rather than eyeballed.
 */
export function buildCentroids(geo, project, districtToDivision) {
  const districtCentroids = {};

  geo.features.forEach((f) => {
    const name = canonicalDistrictName(f.properties[geo.key]);
    let sx = 0;
    let sy = 0;
    let n = 0;
    eachRing(f.geometry, (ring) => ring.forEach(([lon, lat]) => {
      const p = project([lon, lat]);
      sx += p.x; sy += p.y; n += 1;
    }));
    if (n) districtCentroids[name] = { x: sx / n, y: sy / n };
  });

  const divisionSums = {};
  Object.entries(districtCentroids).forEach(([district, p]) => {
    const division = districtToDivision[district] || district;
    const bucket = divisionSums[division] || { x: 0, y: 0, n: 0 };
    bucket.x += p.x; bucket.y += p.y; bucket.n += 1;
    divisionSums[division] = bucket;
  });

  const divisionCentroids = {};
  Object.entries(divisionSums).forEach(([division, s]) => {
    divisionCentroids[division] = { x: s.x / s.n, y: s.y / s.n };
  });

  return { districtCentroids, divisionCentroids };
}

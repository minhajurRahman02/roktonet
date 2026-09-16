// Bangladesh's 64 districts -> 8 divisions. District spellings match
// database/seed_bd_thanas.sql EXACTLY (e.g. 'Chattogram' not 'Chittagong',
// 'Coxsbazar' not "Cox's Bazar", 'Bogura' not 'Bogra') -- this map is
// joined against organizations.district, which was populated from that
// seed, so any spelling drift here silently drops orgs off the map.
//
// Powers the Admin Overview's division map (spec 2.11): a stylized
// schematic of 8 division nodes, NOT geographic polygons -- accurate
// geometry is deferred to 7.7a's own iteration room, as planned.

const DISTRICT_TO_DIVISION = {
  // Barisal
  Barguna: 'Barisal', Barisal: 'Barisal', Bhola: 'Barisal',
  Jhalakathi: 'Barisal', Patuakhali: 'Barisal', Pirojpur: 'Barisal',
  // Chattogram
  Bandarban: 'Chattogram', Brahmanbaria: 'Chattogram', Chandpur: 'Chattogram',
  Chattogram: 'Chattogram', Comilla: 'Chattogram', Coxsbazar: 'Chattogram',
  Feni: 'Chattogram', Khagrachhari: 'Chattogram', Lakshmipur: 'Chattogram',
  Noakhali: 'Chattogram', Rangamati: 'Chattogram',
  // Dhaka
  Dhaka: 'Dhaka', Faridpur: 'Dhaka', Gazipur: 'Dhaka', Gopalganj: 'Dhaka',
  Kishoreganj: 'Dhaka', Madaripur: 'Dhaka', Manikganj: 'Dhaka',
  Munshiganj: 'Dhaka', Narayanganj: 'Dhaka', Narsingdi: 'Dhaka',
  Rajbari: 'Dhaka', Shariatpur: 'Dhaka', Tangail: 'Dhaka',
  // Khulna
  Bagerhat: 'Khulna', Chuadanga: 'Khulna', Jashore: 'Khulna', Jhenaidah: 'Khulna',
  Khulna: 'Khulna', Kushtia: 'Khulna', Magura: 'Khulna', Meherpur: 'Khulna',
  Narail: 'Khulna', Satkhira: 'Khulna',
  // Mymensingh
  Jamalpur: 'Mymensingh', Mymensingh: 'Mymensingh', Netrokona: 'Mymensingh',
  Sherpur: 'Mymensingh',
  // Rajshahi
  Bogura: 'Rajshahi', Chapainawabganj: 'Rajshahi', Joypurhat: 'Rajshahi',
  Naogaon: 'Rajshahi', Natore: 'Rajshahi', Pabna: 'Rajshahi',
  Rajshahi: 'Rajshahi', Sirajganj: 'Rajshahi',
  // Rangpur
  Dinajpur: 'Rangpur', Gaibandha: 'Rangpur', Kurigram: 'Rangpur',
  Lalmonirhat: 'Rangpur', Nilphamari: 'Rangpur', Panchagarh: 'Rangpur',
  Rangpur: 'Rangpur', Thakurgaon: 'Rangpur',
  // Sylhet
  Habiganj: 'Sylhet', Moulvibazar: 'Sylhet', Sunamganj: 'Sylhet', Sylhet: 'Sylhet',
};

// Approximate relative positions on a 0-100 grid, roughly geographic
// (Rangpur top-left, Sylhet top-right, Chattogram bottom-right, etc.).
// The frontend scales these to its own SVG viewBox.
const DIVISION_POSITIONS = {
  Rangpur:    { x: 28, y: 12 },
  Mymensingh: { x: 55, y: 28 },
  Sylhet:     { x: 82, y: 22 },
  Rajshahi:   { x: 22, y: 38 },
  Dhaka:      { x: 52, y: 50 },
  Khulna:     { x: 30, y: 70 },
  Barisal:    { x: 50, y: 78 },
  Chattogram: { x: 80, y: 68 },
};

const DIVISIONS = Object.keys(DIVISION_POSITIONS);

// Legacy / alternate spellings still present in data (seed_data.sql uses
// the pre-2018 'Chittagong'; user-entered orgs may use any of these).
// Keys are normalized: lowercase, letters only.
const ALIASES = {
  chittagong: 'Chattogram',
  cumilla: 'Comilla',
  bogra: 'Bogura',
  jessore: 'Jashore',
  barishal: 'Barisal',
  coxsbazar: 'Coxsbazar',
  brahmanbaria: 'Brahmanbaria',
  chapainawabganj: 'Chapainawabganj',
  nawabganj: 'Chapainawabganj',
  moulvibazar: 'Moulvibazar',
  maulvibazar: 'Moulvibazar',
  netrakona: 'Netrokona',
  khagrachari: 'Khagrachhari',
  jhenaidah: 'Jhenaidah',
  jhenaida: 'Jhenaidah',
  narsingdi: 'Narsingdi',
  narshingdi: 'Narsingdi',
};

const NORMALIZED = Object.fromEntries(
  Object.keys(DISTRICT_TO_DIVISION).map((d) => [d.toLowerCase().replace(/[^a-z]/g, ''), d])
);

function canonicalDistrict(district) {
  if (!district) return null;
  if (DISTRICT_TO_DIVISION[district]) return district;
  const key = String(district).toLowerCase().replace(/[^a-z]/g, '');
  return ALIASES[key] || NORMALIZED[key] || null;
}

function divisionOf(district) {
  const canonical = canonicalDistrict(district);
  return canonical ? DISTRICT_TO_DIVISION[canonical] : null;
}

module.exports = { DISTRICT_TO_DIVISION, DIVISION_POSITIONS, DIVISIONS, divisionOf, canonicalDistrict };

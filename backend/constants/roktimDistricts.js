// The 64 district names AS THE FORECAST MODEL SPELLS THEM.
//
// This is not the same list as constants/divisions.js, and the difference is
// the point. RoktoNet's own district names came from seed_bd_thanas.sql; the
// forecast model's came from the DGHS reports and geoBoundaries. They disagree
// on five:
//
//   RoktoNet          forecast model
//   ----------------  ----------------
//   Barisal           Barishal
//   Chapainawabganj   Chapai Nawabganj
//   Comilla           Cumilla
//   Coxsbazar         Cox's Bazar
//   Jhalakathi        Jhalokati
//
// The frontend translates at the boundary (src/roktim/districts.js) and posts
// the MODEL spelling, because that is what the advisory was actually computed
// for. Storing RoktoNet's spelling would mean the log could not be joined back
// to the artefact that produced it.
//
// Generated from forecast-service/forecast_model.json. If that artefact is
// ever regenerated with different names, this list and districts.js both need
// regenerating with it.
const ROKTIM_DISTRICTS = new Set([
  "Bagerhat", "Bandarban", "Barguna", "Barishal",
  "Bhola", "Bogura", "Brahmanbaria", "Chandpur",
  "Chapai Nawabganj", "Chattogram", "Chuadanga", "Cox's Bazar",
  "Cumilla", "Dhaka", "Dinajpur", "Faridpur",
  "Feni", "Gaibandha", "Gazipur", "Gopalganj",
  "Habiganj", "Jamalpur", "Jashore", "Jhalokati",
  "Jhenaidah", "Joypurhat", "Khagrachhari", "Khulna",
  "Kishoreganj", "Kurigram", "Kushtia", "Lakshmipur",
  "Lalmonirhat", "Madaripur", "Magura", "Manikganj",
  "Meherpur", "Moulvibazar", "Munshiganj", "Mymensingh",
  "Naogaon", "Narail", "Narayanganj", "Narsingdi",
  "Natore", "Netrokona", "Nilphamari", "Noakhali",
  "Pabna", "Panchagarh", "Patuakhali", "Pirojpur",
  "Rajbari", "Rajshahi", "Rangamati", "Rangpur",
  "Satkhira", "Shariatpur", "Sherpur", "Sirajganj",
  "Sunamganj", "Sylhet", "Tangail", "Thakurgaon",
]);

module.exports = { ROKTIM_DISTRICTS };

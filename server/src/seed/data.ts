/** The 20 default amenities seeded into AmenityMaster. */
export const DEFAULT_AMENITIES = [
  { name: 'Lift', icon: 'MoveVertical', category: 'lifestyle', description: 'High-speed passenger lifts in every tower' },
  { name: 'Parking', icon: 'SquareParking', category: 'parking', description: 'Covered basement parking for every home' },
  { name: 'Swimming Pool', icon: 'Waves', category: 'wellness', description: 'Temperature-controlled lap pool' },
  { name: 'Gym', icon: 'Dumbbell', category: 'wellness', description: 'Fully equipped fitness centre' },
  { name: 'Security', icon: 'ShieldCheck', category: 'security', description: '24×7 trained security personnel' },
  { name: 'CCTV', icon: 'Cctv', category: 'security', description: 'CCTV surveillance at all entry and exit points' },
  { name: 'Power Backup', icon: 'Zap', category: 'utility', description: '100% power backup for lifts and common areas' },
  { name: 'Club House', icon: 'Home', category: 'lifestyle', description: 'Multi-purpose club house with banquet hall' },
  { name: "Children's Play Area", icon: 'Baby', category: 'lifestyle', description: 'Landscaped play area with certified equipment' },
  { name: 'Garden', icon: 'Trees', category: 'lifestyle', description: 'Landscaped central garden' },
  { name: 'Jogging Track', icon: 'Footprints', category: 'wellness', description: '400m jogging track around the campus' },
  { name: 'Sports Area', icon: 'Goal', category: 'lifestyle', description: 'Badminton court and open sports arena' },
  { name: 'Indoor Games', icon: 'Gamepad2', category: 'lifestyle', description: 'Table tennis, carrom and chess room' },
  { name: 'Visitor Parking', icon: 'ParkingCircle', category: 'parking', description: 'Dedicated visitor and staff parking bays' },
  { name: 'Fire Safety', icon: 'Flame', category: 'security', description: 'Fire detection and suppression on every floor' },
  { name: 'Intercom', icon: 'PhoneCall', category: 'security', description: 'Video intercom and visitor management system' },
  { name: 'Water Supply', icon: 'Droplets', category: 'utility', description: '24×7 treated piped water supply' },
  { name: 'Rainwater Harvesting', icon: 'CloudRain', category: 'utility', description: 'Rainwater harvesting and STP treatment' },
  { name: 'Community Hall', icon: 'Building2', category: 'lifestyle', description: 'Community hall for events and gatherings' },
  { name: 'EV Charging', icon: 'PlugZap', category: 'utility', description: 'EV charging stations in the basement' },
] as const;

/** City master data. Pune is the primary seed city. */
export const DEFAULT_CITIES = [
  {
    name: 'Pune',
    localities: ['Pimpri', 'Wakad', 'Baner', 'Kothrud', 'Hinjewadi', 'Viman Nagar', 'Hadapsar', 'Koregaon Park'],
  },
  {
    name: 'Mumbai',
    localities: ['Andheri', 'Powai', 'Thane', 'Navi Mumbai', 'Dadar', 'Chembur', 'Borivali'],
  },
] as const;
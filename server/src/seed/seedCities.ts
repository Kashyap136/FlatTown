import { connectDatabase, disconnectDatabase } from '../config/db';
import { PlatformConfig } from '../models/PlatformConfig';
import { DEFAULT_CITIES } from './data';
import { loadPlatformConfig } from '../services/platformConfig.service';
import { seedAmenities } from './seedAmenities';

/**
 * Idempotent city master seed: `npm run seed:cities`.
 * Also normalises PlatformConfig so tier/commission defaults are in place.
 */
export const seedCities = async (): Promise<void> => {
  const config = (await PlatformConfig.findOne({ key: 'default' })) ?? (await PlatformConfig.create({ key: 'default' }));

  config.cities = DEFAULT_CITIES.map((city) => ({
    name: city.name,
    localities: [...city.localities],
    isActive: true,
  }));
  await config.save();

  console.log(`[seed:cities] ${config.cities.length} cities seeded with localities`);
  await loadPlatformConfig();
};

if (require.main === module) {
  (async () => {
    await connectDatabase();
    await seedAmenities();
    await seedCities();
    await disconnectDatabase();
    process.exit(0);
  })().catch((error) => {
    console.error('[seed:cities] failed', error);
    process.exit(1);
  });
}
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Amenity } from '../models/Amenity';
import { DEFAULT_AMENITIES } from './data';
import { slugify } from '../services/project.service';

/** Idempotent amenity seed: `npm run seed:amenities`. */
export const seedAmenities = async (): Promise<void> => {
  let created = 0;
  let updated = 0;

  for (const [index, amenity] of DEFAULT_AMENITIES.entries()) {
    const slug = slugify(amenity.name);
    const existing = await Amenity.findOne({ $or: [{ slug }, { name: amenity.name }] });
    if (existing) {
      existing.name = amenity.name;
      existing.slug = slug;
      existing.icon = amenity.icon;
      existing.category = amenity.category;
      existing.description = amenity.description;
      existing.sortOrder = index + 1;
      existing.isActive = true;
      await existing.save();
      updated += 1;
    } else {
      await Amenity.create({ ...amenity, slug, sortOrder: index + 1, isActive: true, usageCount: 0 });
      created += 1;
    }
  }

  console.log(`[seed:amenities] ${DEFAULT_AMENITIES.length} amenities processed (${created} created, ${updated} updated)`);
};

if (require.main === module) {
  (async () => {
    await connectDatabase();
    await seedAmenities();
    await disconnectDatabase();
    process.exit(0);
  })().catch((error) => {
    console.error('[seed:amenities] failed', error);
    process.exit(1);
  });
}
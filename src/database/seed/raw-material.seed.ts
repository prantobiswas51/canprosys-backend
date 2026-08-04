import { DataSource } from 'typeorm';
import { RawMaterial } from '../../raw-materials/raw-material.entity';

interface DemoRawMaterial {
  name: string;
  unit: string;
  slug: string;
}

// corner_cut_wood is what the Corner Cutting task produces automatically
// (see CORNER_CUTTING_SLUG in daily-entry.service.ts) -- seeded here with
// its real Bengali name and unit up front, instead of relying on that
// task's English fallback name the first time it runs.
const DEMO_RAW_MATERIALS: DemoRawMaterial[] = [
  { name: 'কাচা কাঠ', unit: 'kg', slug: 'raw_wood' },
  { name: 'কাটা কাঠ', unit: 'kg', slug: 'sliced_wood' },
  { name: 'কোনা কাটা কাঠ', unit: 'kg', slug: 'corner_cut_wood' },
];

export async function seedRawMaterials(dataSource: DataSource) {
  const rawMaterialRepository = dataSource.getRepository(RawMaterial);

  for (const demo of DEMO_RAW_MATERIALS) {
    const existing = await rawMaterialRepository.findOneBy({ slug: demo.slug });
    if (existing) {
      console.log(`Raw material "${demo.slug}" already exists, skipping.`);
      continue;
    }
    await rawMaterialRepository.save(rawMaterialRepository.create(demo));
    console.log(`Created raw material "${demo.name}" (${demo.slug}) -- unit: ${demo.unit}`);
  }
}

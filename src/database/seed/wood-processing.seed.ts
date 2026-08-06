import { DataSource } from 'typeorm';
import { WoodType } from '../../wood-processing/wood-type.entity';

interface DemoWoodType {
  name: string;
  unit: string;
}

// Just the starting stock types -- nothing about the processing pipeline
// (which stage consumes what, produces what, at what rate) is seeded here.
// That's set up entirely through the Wood Processing page's "Add Wood Type"
// / "Add Stage" forms, so nothing in this app hardcodes a specific pipeline
// shape or wood-type name.
const DEMO_WOOD_TYPES: DemoWoodType[] = [
  { name: 'কাচা কাঠ', unit: 'kg' },
  { name: 'কাটা কাঠ', unit: 'kg' },
];

export async function seedWoodTypes(dataSource: DataSource) {
  const repo = dataSource.getRepository(WoodType);

  for (const demo of DEMO_WOOD_TYPES) {
    const existing = await repo.findOneBy({ name: demo.name });
    if (existing) {
      console.log(`Wood type "${demo.name}" already exists, skipping.`);
      continue;
    }
    await repo.save(repo.create(demo));
    console.log(`Created wood type "${demo.name}" -- unit: ${demo.unit}`);
  }
}

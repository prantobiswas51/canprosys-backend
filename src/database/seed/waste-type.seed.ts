import { DataSource } from 'typeorm';
import { WasteType } from '../../waste-management/waste-type.entity';

const DEMO_WASTE_TYPES = ['Wood Shavings'];

export async function seedWasteTypes(dataSource: DataSource) {
  const repo = dataSource.getRepository(WasteType);

  for (const name of DEMO_WASTE_TYPES) {
    const existing = await repo.findOneBy({ name });
    if (existing) {
      console.log(`Waste type "${name}" already exists, skipping.`);
      continue;
    }
    await repo.save(repo.create({ name }));
    console.log(`Created waste type "${name}"`);
  }
}

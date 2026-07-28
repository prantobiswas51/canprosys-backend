// src/database/backfill/backfill-material-units.ts
// One-off script: fills in MaterialBatch.rawMaterialUnit /
// MaterialConsumption.rawMaterialUnit for rows created before that column
// existed, by looking up the current unit on their linked RawMaterial. Safe
// to re-run -- only touches rows where the snapshot doesn't already match.
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { RawMaterial } from '../../raw-materials/raw-material.entity';
import { MaterialBatch } from '../../material-batches/material-batch.entity';
import { MaterialConsumption } from '../../material-consumptions/material-consumption.entity';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'nestbackend',
  entities: [RawMaterial, MaterialBatch, MaterialConsumption],
  synchronize: false, // schema already synced by the main app -- this only touches data
  extra: {
    options: '-c timezone=Asia/Dhaka',
  },
});

async function backfill() {
  await dataSource.initialize();
  console.log('Connected.');

  const rawMaterialRepository = dataSource.getRepository(RawMaterial);
  const batchRepository = dataSource.getRepository(MaterialBatch);
  const consumptionRepository = dataSource.getRepository(MaterialConsumption);

  const rawMaterials = await rawMaterialRepository.find();
  const unitById = new Map(rawMaterials.map((rm) => [rm.id, rm.unit]));

  const batches = await batchRepository.find();
  let updatedBatches = 0;
  for (const batch of batches) {
    const unit = unitById.get(batch.rawMaterialId);
    if (unit && batch.rawMaterialUnit !== unit) {
      batch.rawMaterialUnit = unit;
      await batchRepository.save(batch);
      updatedBatches++;
    }
  }

  const consumptions = await consumptionRepository.find();
  let updatedConsumptions = 0;
  for (const consumption of consumptions) {
    const unit = unitById.get(consumption.rawMaterialId);
    if (unit && consumption.rawMaterialUnit !== unit) {
      consumption.rawMaterialUnit = unit;
      await consumptionRepository.save(consumption);
      updatedConsumptions++;
    }
  }

  console.log(`Backfilled ${updatedBatches} batch(es) and ${updatedConsumptions} consumption(s).`);

  await dataSource.destroy();
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

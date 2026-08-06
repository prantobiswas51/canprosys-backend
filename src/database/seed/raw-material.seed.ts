import { DataSource } from 'typeorm';
import { RawMaterial } from '../../raw-materials/raw-material.entity';

interface DemoRawMaterial {
  name: string;
  unit: string;
  slug: string;
}

// Raw wood and sliced wood no longer live here -- they're purely internal
// to the Wood Processing module now (WoodType, not RawMaterial). Only the
// two FINAL wood products stay as RawMaterial rows, since that's the
// boundary Packaging's BOM consumption needs (it only knows how to draw
// from RawMaterial/MaterialBatch). See wood-processing.seed.ts, where each
// final WoodStage is wired to mirror its output into one of these two rows.
const DEMO_RAW_MATERIALS: DemoRawMaterial[] = [
  { name: 'কোনা কাটা কাঠ', unit: 'kg', slug: 'corner_cut_wood' },
  { name: 'কোনা কাটা ও ঢাল কাটা কাঠ', unit: 'kg', slug: 'corner_and_slant_cut_wood' },
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

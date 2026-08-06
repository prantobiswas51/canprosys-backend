import { DataSource, Repository } from 'typeorm';
import { WoodType } from '../../wood-processing/wood-type.entity';
import { WoodStage } from '../../wood-processing/wood-stage.entity';
import { RawMaterial } from '../../raw-materials/raw-material.entity';
import { WasteType } from '../../waste-management/waste-type.entity';

interface DemoWoodType {
  name: string;
  unit: string;
}

// Every stage's output needs a WoodType, including the two final ones --
// that's what keeps the internal wood-processing stock view (FIFO batches,
// "how much Corner-Cut Wood do we have") consistent end to end. The final
// two ALSO get mirrored into RawMaterial (see seedWoodStages below) since
// that's the boundary Packaging's BOM consumption needs.
const DEMO_WOOD_TYPES: DemoWoodType[] = [
  { name: 'Raw Wood', unit: 'kg' },
  { name: 'Sliced Wood', unit: 'kg' },
  { name: 'Normal-Cut Wood', unit: 'kg' },
  { name: 'Slant-Cut Wood', unit: 'kg' },
  { name: 'Corner-Cut Wood (Normal)', unit: 'kg' },
  { name: 'Corner-Cut Wood (Slant)', unit: 'kg' },
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

async function findOrThrow<T extends { id: number }>(
  repo: Repository<T>,
  where: Record<string, unknown>,
  label: string,
) {
  const found = await repo.findOneBy(where as never);
  if (!found) {
    throw new Error(`wood-processing.seed: expected ${label} to exist already -- check seed order`);
  }
  return found;
}

// The branching pipeline from the flowchart:
//   Raw Wood -[Wood Slicing]-> Sliced Wood
//     -[Normal Cut]-> Normal-Cut Wood -[Corner Cut (Normal)]-> Corner-Cut Wood (Normal) -> mirrored to RawMaterial "কোনা কাটা ও ঢাল কাটা কাঠ"
//     -[Slant Cut]->  Slant-Cut Wood  -[Corner Cut (Slant)]->  Corner-Cut Wood (Slant)  -> mirrored to RawMaterial "কোনা কাটা কাঠ"
// Only Wood Slicing's rate is a real, known number (2 tk/kg, from the
// worked example) -- the rest default to 0 and should be set for real on
// the Wood Processing page's stage settings once known. Adding a further
// step (or another branch) later never needs a code change, just a new row
// here or via that same settings UI.
export async function seedWoodStages(dataSource: DataSource) {
  const stageRepo = dataSource.getRepository(WoodStage);
  const woodTypeRepo = dataSource.getRepository(WoodType);
  const rawMaterialRepo = dataSource.getRepository(RawMaterial);
  const wasteTypeRepo = dataSource.getRepository(WasteType);

  const rawWood = await findOrThrow(woodTypeRepo, { name: 'Raw Wood' }, 'wood type "Raw Wood"');
  const slicedWood = await findOrThrow(woodTypeRepo, { name: 'Sliced Wood' }, 'wood type "Sliced Wood"');
  const normalCutWood = await findOrThrow(
    woodTypeRepo,
    { name: 'Normal-Cut Wood' },
    'wood type "Normal-Cut Wood"',
  );
  const slantCutWood = await findOrThrow(
    woodTypeRepo,
    { name: 'Slant-Cut Wood' },
    'wood type "Slant-Cut Wood"',
  );
  const cornerCutNormal = await findOrThrow(
    woodTypeRepo,
    { name: 'Corner-Cut Wood (Normal)' },
    'wood type "Corner-Cut Wood (Normal)"',
  );
  const cornerCutSlant = await findOrThrow(
    woodTypeRepo,
    { name: 'Corner-Cut Wood (Slant)' },
    'wood type "Corner-Cut Wood (Slant)"',
  );

  const cornerCutWoodMaterial = await findOrThrow(
    rawMaterialRepo,
    { slug: 'corner_cut_wood' },
    'raw material "corner_cut_wood"',
  );
  const cornerAndSlantCutWoodMaterial = await findOrThrow(
    rawMaterialRepo,
    { slug: 'corner_and_slant_cut_wood' },
    'raw material "corner_and_slant_cut_wood"',
  );

  const shavings = await wasteTypeRepo.findOneBy({ name: 'Wood Shavings' });

  const demoStages = [
    {
      name: 'Wood Slicing',
      inputTypeId: rawWood.id,
      outputTypeId: slicedWood.id,
      wageRatePerUnit: 2,
      sequence: 1,
      defaultWasteTypeId: shavings?.id,
    },
    {
      name: 'Normal Cut',
      inputTypeId: slicedWood.id,
      outputTypeId: normalCutWood.id,
      wageRatePerUnit: 0,
      sequence: 2,
      defaultWasteTypeId: shavings?.id,
    },
    {
      name: 'Slant Cut',
      inputTypeId: slicedWood.id,
      outputTypeId: slantCutWood.id,
      wageRatePerUnit: 0,
      sequence: 2,
      defaultWasteTypeId: shavings?.id,
    },
    {
      name: 'Corner Cut (Normal)',
      inputTypeId: normalCutWood.id,
      outputTypeId: cornerCutNormal.id,
      wageRatePerUnit: 0,
      sequence: 3,
      defaultWasteTypeId: shavings?.id,
      mirrorToRawMaterialId: cornerAndSlantCutWoodMaterial.id,
    },
    {
      name: 'Corner Cut (Slant)',
      inputTypeId: slantCutWood.id,
      outputTypeId: cornerCutSlant.id,
      wageRatePerUnit: 0,
      sequence: 3,
      defaultWasteTypeId: shavings?.id,
      mirrorToRawMaterialId: cornerCutWoodMaterial.id,
    },
  ];

  for (const demo of demoStages) {
    const existing = await stageRepo.findOneBy({ name: demo.name });
    if (existing) {
      console.log(`Wood stage "${demo.name}" already exists, skipping.`);
      continue;
    }
    await stageRepo.save(stageRepo.create(demo));
    console.log(`Created wood stage "${demo.name}"`);
  }
}

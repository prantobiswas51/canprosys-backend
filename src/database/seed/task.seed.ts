import { DataSource } from 'typeorm';
import { Task } from '../../tasks/task.entity';

interface DemoTask {
  name: string;
  slug: string;
  pricePerUnit?: number;
  requiresProduct: boolean;
}

// Wood Slicing / Corner Cutting are raw-material prep -- they happen before
// a specific product/recipe is chosen, so requiresProduct is false for just
// those two, and they get a flat pricePerUnit here.
//
// কোনা কাটা কাঠ requires a product, so its rate comes from that recipe's
// Artisan Wages pivot (RecipeTaskRate) instead -- no flat pricePerUnit here.

const DEMO_TASKS: DemoTask[] = [
  { name: 'Wood Slicing', slug: 'wood_slicing', pricePerUnit: 20, requiresProduct: false },
  { name: 'Corner Cutting', slug: 'corner_cutting', pricePerUnit: 16, requiresProduct: false },
  { name: 'কোনা কাটা কাঠ', slug: 'corner_cut_wood', requiresProduct: true },
];

export async function seedTasks(dataSource: DataSource) {
  const taskRepository = dataSource.getRepository(Task);

  for (const demo of DEMO_TASKS) {
    const existing = await taskRepository.findOneBy({ slug: demo.slug });
    if (existing) {
      console.log(`Task "${demo.slug}" already exists, skipping.`);
      continue;
    }
    await taskRepository.save(taskRepository.create(demo));
    const rateNote = demo.pricePerUnit != null ? `৳${demo.pricePerUnit}/unit` : 'rate set per-recipe';
    console.log(`Created task "${demo.name}" (${demo.slug}) -- ${rateNote}`);
  }
}

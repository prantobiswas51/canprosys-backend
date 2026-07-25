import { DataSource } from 'typeorm';
import { Task } from '../../tasks/task.entity';

interface DemoTask {
  name: string;
  slug: string;
  pricePerUnit: number;
}

const DEMO_TASKS: DemoTask[] = [
  { name: 'Wood Slicing', slug: 'wood_slicing', pricePerUnit: 20 },
  { name: 'Corner Cutting', slug: 'corner_cutting', pricePerUnit: 16 },
  { name: 'Frame/Easel Assembly', slug: 'frame_easel_make', pricePerUnit: 12 },
  { name: 'Cloth/Sheet Fitting', slug: 'cloth_sheet_fitting', pricePerUnit: 34 },
  { name: 'Gesso Painting', slug: 'gesso_painting', pricePerUnit: 56 },
  { name: 'Packaging', slug: 'packaging', pricePerUnit: 12 },
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
    console.log(`Created task "${demo.name}" (${demo.slug}) -- ৳${demo.pricePerUnit}/unit`);
  }
}

import { DataSource } from 'typeorm';
import { RecipeCategory } from '../../recipes/recipe-category.entity';

const DEMO_RECIPE_CATEGORIES = ['Canvas', 'Easel'];

export async function seedRecipeCategories(dataSource: DataSource) {
  const repo = dataSource.getRepository(RecipeCategory);

  for (const name of DEMO_RECIPE_CATEGORIES) {
    const existing = await repo.findOneBy({ name });
    if (existing) {
      console.log(`Recipe category "${name}" already exists, skipping.`);
      continue;
    }
    await repo.save(repo.create({ name }));
    console.log(`Created recipe category "${name}"`);
  }
}

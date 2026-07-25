// src/database/seed/fresh.ts
// Laravel's `migrate:fresh --seed` equivalent: drop every table, rebuild
// the schema from current entities, then reseed. Destructive -- wipes all
// data every time, dev use only.
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Role } from '../../roles/role.entity';
import { User } from '../../users/user.entity';
import { Permission } from '../../permissions/permission.entity';
import { Task } from '../../tasks/task.entity';
import { Employee } from '../../employees/employee.entity';
import { DailyEntry } from '../../daily-entry/daily-entry.entity';
import { Product } from '../../products/product.entity';
import { Recipe } from '../../recipes/recipe.entity';
import { seedRoles } from './role.seed';
import { seedDemoUsers } from './user.seed';
import { seedTasks } from './task.seed';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'nestbackend',
  // Every entity in the app has to be listed here (unlike seed.ts, which
  // only needs the ones its seed functions actually touch) -- synchronize()
  // rebuilds the WHOLE schema, so anything left out here just won't exist
  // afterward. Add new entities to this list when you create them.
  //
  // NOT included: rawmaterials/rawmaterial.entity.ts -- it's currently a
  // copy-paste of recipe.entity.ts (still named `class Recipe`, same
  // fields), which would collide with the real Recipe entity on the same
  // table name if registered. Needs fixing before it can be wired in.
  entities: [Role, User, Permission, Task, Employee, DailyEntry, Product, Recipe],
  extra: {
    options: '-c timezone=Asia/Dhaka',
  },
});

async function fresh() {
  await dataSource.initialize();
  console.log('Connected. Dropping and rebuilding schema...');

  // synchronize(true) drops every existing table first, then recreates the
  // schema from scratch to match the entities above.
  await dataSource.synchronize(true);
  console.log('Schema rebuilt.');

  await seedRoles(dataSource);
  await seedDemoUsers(dataSource);
  await seedTasks(dataSource);

  await dataSource.destroy();
  console.log('Fresh + seeded.');
}

fresh().catch((err) => {
  console.error('db:fresh failed:', err);
  process.exit(1);
});

// src/database/seed/seed.ts
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Role } from '../../roles/role.entity';
import { User } from '../../users/user.entity';
import { Permission } from '../../permissions/permission.entity';
import { Task } from '../../tasks/task.entity';
import { RawMaterial } from '../../raw-materials/raw-material.entity';
import { WoodType } from '../../wood-processing/wood-type.entity';
import { WoodStage } from '../../wood-processing/wood-stage.entity';
import { WasteType } from '../../waste-management/waste-type.entity';
import { seedRoles } from './role.seed';
import { seedDemoUsers } from './user.seed';
import { seedTasks } from './task.seed';
import { seedRawMaterials } from './raw-material.seed';
import { seedPermissions } from './permission.seed';
import { seedWasteTypes } from './waste-type.seed';
import { seedWoodTypes } from './wood-processing.seed';

// Was hardcoded to host/port/credentials that don't match .env (port 5432
// vs the real 5433) -- now reads the same env vars app.module.ts uses, so
// this always points at whatever database the app itself connects to.
const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'nestbackend',
  // Permission has to be listed too -- Role has a ManyToMany to it, and
  // TypeORM needs every entity in a relation registered on the DataSource
  // or it throws resolving the relation metadata.
  entities: [Role, User, Permission, Task, RawMaterial, WoodType, WoodStage, WasteType],
  extra: {
    options: '-c timezone=Asia/Dhaka',
  },
});

async function seed() {
  await dataSource.initialize();
  console.log('Connected to database, seeding...');

  await seedRoles(dataSource);
  await seedDemoUsers(dataSource);
  await seedTasks(dataSource);
  await seedRawMaterials(dataSource);
  await seedPermissions(dataSource);
  await seedWasteTypes(dataSource);
  // Stages are NOT seeded -- they encode a specific pipeline (which input
  // type feeds which output type, at what rate), and that's exactly the
  // kind of thing this module was built to keep out of code. Set them up
  // on the Wood Processing page's "Add Stage" form instead.
  await seedWoodTypes(dataSource);

  await dataSource.destroy();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

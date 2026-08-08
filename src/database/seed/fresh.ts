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
import { RecipeTaskRate } from '../../recipes/recipe-task-rate.entity';
import { RecipeMaterialUsage } from '../../recipes/recipe-material-usage.entity';
import { RawMaterial } from '../../raw-materials/raw-material.entity';
import { MaterialBatch } from '../../material-batches/material-batch.entity';
import { MaterialConsumption } from '../../material-consumptions/material-consumption.entity';
import { Car } from '../../cars/car.entity';
import { Driver } from '../../drivers/driver.entity';
import { Route } from '../../routes/route.entity';
import { Shipment } from '../../shipments/shipment.entity';
import { ShipmentItem } from '../../shipments/shipment-item.entity';
import { Loan } from '../../loans/loan.entity';
import { Payout } from '../../payouts/payout.entity';
import { WoodType } from '../../wood-processing/wood-type.entity';
import { WoodStage } from '../../wood-processing/wood-stage.entity';
import { WoodStockBatch } from '../../wood-processing/wood-stock-batch.entity';
import { WoodProcessingConsumption } from '../../wood-processing/wood-processing-consumption.entity';
import { WoodProcessingEntry } from '../../wood-processing/wood-processing-entry.entity';
import { WasteType } from '../../waste-management/waste-type.entity';
import { WasteBatch } from '../../waste-management/waste-batch.entity';
import { WasteSale } from '../../waste-management/waste-sale.entity';
import { MaintenanceCategory } from '../../maintenance-costs/maintenance-category.entity';
import { MaintenanceCost } from '../../maintenance-costs/maintenance-cost.entity';
import { seedRoles } from './role.seed';
import { seedDemoUsers } from './user.seed';
import { seedTasks } from './task.seed';
import { seedPermissions } from './permission.seed';
import { seedRawMaterials } from './raw-material.seed';
import { seedWasteTypes } from './waste-type.seed';
import { seedWoodTypes } from './wood-processing.seed';

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
  entities: [
    Role,
    User,
    Permission,
    Task,
    Employee,
    DailyEntry,
    Product,
    Recipe,
    RecipeTaskRate,
    RecipeMaterialUsage,
    RawMaterial,
    MaterialBatch,
    MaterialConsumption,
    Car,
    Driver,
    Route,
    Shipment,
    ShipmentItem,
    Loan,
    Payout,
    WoodType,
    WoodStage,
    WoodStockBatch,
    WoodProcessingConsumption,
    WoodProcessingEntry,
    WasteType,
    WasteBatch,
    WasteSale,
    MaintenanceCategory,
    MaintenanceCost,
  ],
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
  await seedRawMaterials(dataSource);
  await seedPermissions(dataSource);
  await seedWasteTypes(dataSource);
  // Stages are NOT seeded -- they encode a specific pipeline (which input
  // type feeds which output type, at what rate), and that's exactly the
  // kind of thing this module was built to keep out of code. Set them up
  // on the Wood Processing page's "Add Stage" form instead.
  await seedWoodTypes(dataSource);

  await dataSource.destroy();
  console.log('Fresh + seeded.');
}

fresh().catch((err) => {
  console.error('db:fresh failed:', err);
  process.exit(1);
});

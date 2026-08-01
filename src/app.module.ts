import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { EmployeesModule } from './employees/employees.module';
import { TasksModule } from './tasks/tasks.module';
import { AuthModule } from './auth/auth.module';
import { PermissionsModule } from './permissions/permissions.module';
import { DailyEntryModule } from './daily-entry/daily-entry.module';
import { RecipesModule } from './recipes/recipes.module';
import { ProductsModule } from './products/products.module';
import { RawMaterialsModule } from './raw-materials/raw-materials.module';
import { MaterialBatchesModule } from './material-batches/material-batches.module';
import { MaterialConsumptionsModule } from './material-consumptions/material-consumptions.module';
import { PayoutsModule } from './payouts/payouts.module';
import { AiModule } from './ai/ai.module';
import { LoansController } from './loans/loans.controller';
import { LoansModule } from './loans/loans.module';
import { CarsModule } from './cars/cars.module';
import { DriversModule } from './drivers/drivers.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { RoutesModule } from './routes/routes.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      username: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: process.env.DATABASE_NAME || 'nestbackend',
      autoLoadEntities: true,
      synchronize: true, //never use true on production
      // Sets the Postgres session timezone for every connection in the pool,
      // so SQL-side functions (NOW(), CURRENT_TIMESTAMP) and timestamp
      // columns are interpreted/displayed as Asia/Dhaka too -- independent
      // of the Node process's own TZ (set in main.ts).
      extra: {
        options: '-c timezone=Asia/Dhaka',
      },
    }),

    UsersModule,
    RolesModule,
    EmployeesModule,
    TasksModule,
    AuthModule,
    PermissionsModule,
    DailyEntryModule,
    RecipesModule,
    ProductsModule,
    RawMaterialsModule,
    MaterialBatchesModule,
    MaterialConsumptionsModule,
    PayoutsModule,
    AiModule,
    LoansModule,
    CarsModule,
    DriversModule,
    ShipmentsModule,
    RoutesModule,
  ],
  controllers: [LoansController],
})
export class AppModule {}
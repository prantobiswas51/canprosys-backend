import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { Shipment } from './shipment.entity';
import { ShipmentItem } from './shipment-item.entity';
import { Route } from '../routes/route.entity';
import { Car } from '../cars/car.entity';
import { Driver } from '../drivers/driver.entity';
import { Product } from '../products/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shipment, ShipmentItem, Route, Car, Driver, Product])],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}

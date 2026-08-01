import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Route } from '../routes/route.entity';
import { Car } from '../cars/car.entity';
import { Driver } from '../drivers/driver.entity';
import { ShipmentItem } from './shipment-item.entity';

export enum ShipmentStatus {
  IN_TRANSIT = 'in_transit',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

@Entity()
export class Shipment {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Route)
  @JoinColumn({ name: 'routeId' })
  route!: Route;

  @Column()
  routeId!: number;

  @ManyToOne(() => Car)
  @JoinColumn({ name: 'carId' })
  car!: Car;

  @Column()
  carId!: number;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'driverId' })
  driver!: Driver;

  @Column()
  driverId!: number;

  @Column({ nullable: true })
  note?: string;

  @Column('float', { nullable: true })
  totalCost?: number;

  // Set to IN_TRANSIT the moment a shipment is created (that's the only
  // transition this app currently drives -- marking a shipment
  // Delivered/Cancelled isn't wired up to any UI yet).
  @Column({ type: 'enum', enum: ShipmentStatus, default: ShipmentStatus.IN_TRANSIT })
  status!: ShipmentStatus;

  @OneToMany(() => ShipmentItem, (item) => item.shipment)
  items!: ShipmentItem[];

  @CreateDateColumn()
  createdAt!: Date;
}

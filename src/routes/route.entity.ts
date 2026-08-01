import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Route {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  origin!: string;

  @Column()
  destination!: string;

  // Nullable -- not always known when a route is first set up.
  @Column('float', { nullable: true })
  distanceKm?: number;

  @Column('float', { nullable: true })
  estimatedCost?: number;
}

import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { CustomOrderItem } from './custom-order-item.entity';

export type CanvasType = 'circle' | 'square';
export type CustomOrderStatus = 'pending' | 'in_progress' | 'completed';

// Traditional fixed-schema order for canvas products -- replaced the
// earlier admin-defined-product-type + jsonb-fields design once the actual
// requirement turned out to just be these specific fields. Third parties
// place these directly via the API (see JwtOrApiKeyGuard on the controller).
@Entity()
export class CustomOrder {
  @PrimaryGeneratedColumn()
  id!: number;

  // The order's one identifier, end to end -- supplied by whoever places
  // the order (our own frontend or a third party) rather than generated
  // here, and unique so it doubles as a lookup key.
  @Column({ unique: true })
  clientOrderNum!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'date' })
  deadline!: string;

  @Column({ default: 'pending' })
  status!: CustomOrderStatus;

  // One order can carry more than one canvas line item (different sizes,
  // types, quantities). cascade: true lets CustomOrdersService just attach
  // an `items` array of brand-new CustomOrderItem instances and save the
  // order -- TypeORM inserts them together in one go.
  @OneToMany(() => CustomOrderItem, (item) => item.order, { cascade: true })
  items!: CustomOrderItem[];

  @CreateDateColumn()
  createdAt!: Date;
}

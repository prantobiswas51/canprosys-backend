import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CustomOrder } from './custom-order.entity';
import type { CanvasType } from './custom-order.entity';

// One canvas line item within an order -- an order can carry more than one
// (e.g. 3x 12x20 square + 1x 10 circle under a single client order number).
// Deleted automatically when its parent order is deleted (onDelete: CASCADE).
@Entity()
export class CustomOrderItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => CustomOrder, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: CustomOrder;

  @Column()
  orderId!: number;

  @Column('float')
  width!: number;

  @Column('float')
  height!: number;

  @Column()
  canvasType!: CanvasType;

  @Column('float', { default: 1 })
  quantity!: number;
}

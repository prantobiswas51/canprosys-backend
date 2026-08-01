import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Shipment } from './shipment.entity';
import { Product } from '../products/product.entity';

// One row per product on a shipment -- a shipment can carry multiple
// finished products, each in its own quantity.
@Entity()
export class ShipmentItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Shipment, (shipment) => shipment.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipmentId' })
  shipment!: Shipment;

  @Column()
  shipmentId!: number;

  // No onDelete cascade -- a Product that's already on a (past) shipment
  // shouldn't be deletable out from under that history; see
  // products.service.ts if delete protection is added there later.
  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product!: Product;

  @Column()
  productId!: number;

  // Snapshot of Product.name at shipment time -- same pattern as
  // MaterialBatch.rawMaterialName -- so a later product rename doesn't
  // retroactively relabel a shipment that already happened.
  @Column()
  productName!: string;

  @Column('float')
  quantity!: number;
}

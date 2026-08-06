import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// "Waste minus" -- selling waste off. Draws down WasteBatch.quantityRemaining
// FIFO (see WasteSalesService) but doesn't carry a batch FK itself since one
// sale can span several batches; totalAmount is pure revenue (waste has no
// cost basis to net against).
@Entity()
export class WasteSale {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  wasteTypeId!: number;

  @Column()
  wasteTypeName!: string;

  @Column('float')
  quantity!: number;

  @Column('float')
  unitPrice!: number;

  @Column('float')
  totalAmount!: number;

  @Column({ type: 'date' })
  saleDate!: string;

  @Column({ nullable: true })
  buyer?: string;

  @Column({ nullable: true })
  note?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

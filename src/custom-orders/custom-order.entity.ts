import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

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

  @Column('float')
  width!: number;

  @Column('float')
  height!: number;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column()
  canvasType!: CanvasType;

  @Column({ type: 'date' })
  deadline!: string;

  @Column({ default: 'pending' })
  status!: CustomOrderStatus;

  @CreateDateColumn()
  createdAt!: Date;
}

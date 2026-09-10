import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// One field definition inside a product type's field list -- e.g. for a
// "Canvas" product type: { key: 'size', label: 'Size', type: 'text',
// required: true }. Stored as jsonb on CustomOrderProductType, not as its
// own table, since the whole point is these are freeform and admin-defined
// per product type (same anti-hardcoding philosophy as everything else in
// this app -- no fixed enum of "order field types").
export interface CustomOrderFieldDefinition {
  key: string; // stable identifier used as the key in CustomOrder.customFieldValues
  label: string; // shown on the order form
  type: 'text' | 'number' | 'textarea' | 'select' | 'date';
  required: boolean;
  options?: string[]; // only used when type === 'select'
}

// An admin-defined "kind" of custom order -- e.g. "Canvas", "Frame",
// "T-Shirt" -- each with its own arbitrary set of order-intake fields (size,
// type, note, ...). Deliberately independent of the Recipe/Product
// manufacturing catalog: these fields describe an order's specification,
// not a bill of materials.
@Entity()
export class CustomOrderProductType {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  fields!: CustomOrderFieldDefinition[];

  @CreateDateColumn()
  createdAt!: Date;
}

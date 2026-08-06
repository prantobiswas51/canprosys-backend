import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A simple named category of waste (sawdust, offcuts, ...). Admin-managed,
// name-only.
@Entity()
export class WasteType {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;
}

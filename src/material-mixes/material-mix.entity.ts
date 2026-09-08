import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// One row per "mix N of material A with M of material B into an output
// material" action (e.g. Color + Ayca -> Gesso). Doesn't touch RawMaterial
// stock directly -- that's done via MaterialConsumptionsService (draws down
// A and B, FIFO, same machinery every other raw material draw uses) and a
// normal MaterialBatch row (credits the output). This row just logs exactly
// what went in and out, so it can be displayed and reversed as one unit.
@Entity()
export class MaterialMix {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  materialAId!: number;

  @Column()
  materialAName!: string;

  @Column({ nullable: true })
  materialAUnit?: string;

  @Column('float')
  quantityA!: number;

  @Column()
  materialBId!: number;

  @Column()
  materialBName!: string;

  @Column({ nullable: true })
  materialBUnit?: string;

  @Column('float')
  quantityB!: number;

  @Column()
  outputMaterialId!: number;

  @Column()
  outputMaterialName!: string;

  @Column({ nullable: true })
  outputUnit?: string;

  // quantityA + quantityB -- mixing combines volume/weight, it doesn't
  // create or destroy it. See MaterialMixesService.createMix.
  @Column('float')
  outputQuantity!: number;

  // The MaterialBatch this mix created for the output material -- lets
  // deleteMix find and remove exactly that stock (and block the reversal if
  // some of it has already been used elsewhere). Set right after that batch
  // is created; null only in the moment between the two saves.
  @Column({ nullable: true })
  outputBatchId?: number;

  @Column({ type: 'date', nullable: true })
  mixDate?: string;

  @CreateDateColumn()
  createdAt!: Date;
}

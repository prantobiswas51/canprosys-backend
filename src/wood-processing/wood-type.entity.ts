import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// A stage of wood in the pipeline -- raw wood, sliced wood, normal-cut
// wood, slant-cut wood, and so on. Purely internal to this module: unlike
// RawMaterial, nothing outside wood-processing ever references a WoodType
// directly (see WoodStage.mirrorToRawMaterialId for how a *finished* wood
// product re-enters the general RawMaterial system for recipes/Packaging).
@Entity()
export class WoodType {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  name!: string;

  @Column()
  unit!: string;
}

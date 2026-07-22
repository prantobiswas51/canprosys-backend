import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Role } from '../roles/role.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ unique: true, nullable: true })
  username?: string;

  // select: false so plain find()/findOneBy() calls never pull the hash back
  // out over the API by accident. Auth lookups opt in explicitly.
  @Column({ nullable: true, select: false })
  password?: string;

  @ManyToOne(() => Role)
  role!: Role;
}
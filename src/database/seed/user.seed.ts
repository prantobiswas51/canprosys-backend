import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../users/user.entity';
import { Role } from '../../roles/role.entity';

interface DemoUser {
  name: string;
  email: string;
  username: string;
  password: string;
  roleName: string;
}

// Fixed demo accounts -- same credentials every time you run the seed, so
// they're predictable for testing. Change these here if you want different
// defaults; there's no env-var override since these are meant to be fixed.
// Note: no "employee" demo accounts here -- employees/artisans are the
// separate Employee entity (name/phone/status/pin), not User accounts with
// a role, so they don't belong in this list. Seed those via employee.seed.ts
// if you want demo rows there.


const DEMO_USERS: DemoUser[] = [
  { name: 'Super Admin', email: 'admin@canprosys.local', username: 'superadmin', password: 'SuperAdmin123!', roleName: 'super_admin' },
  { name: 'Manager One', email: 'manager1@canprosys.local', username: 'manager1', password: 'Manager123!', roleName: 'manager' },
  { name: 'Manager Two', email: 'manager2@canprosys.local', username: 'manager2', password: 'Manager123!', roleName: 'manager' },
];

export async function seedDemoUsers(dataSource: DataSource) {
  const userRepository = dataSource.getRepository(User);
  const roleRepository = dataSource.getRepository(Role);

  console.log('\nDemo user credentials:');
  for (const demo of DEMO_USERS) {
    const existing = await userRepository.findOneBy({ username: demo.username });
    if (existing) {
      console.log(`  ${demo.username.padEnd(12)} ${demo.password.padEnd(16)} [${demo.roleName}]  (already existed)`);
      continue;
    }

    const role = await roleRepository.findOneBy({ name: demo.roleName });
    if (!role) {
      throw new Error(`Role "${demo.roleName}" not found -- seedRoles() must run first.`);
    }

    const hashedPassword = await bcrypt.hash(demo.password, 10);

    const user = userRepository.create({
      name: demo.name,
      email: demo.email,
      username: demo.username,
      password: hashedPassword,
      role,
    });

    await userRepository.save(user);
    console.log(`  ${demo.username.padEnd(12)} ${demo.password.padEnd(16)} [${demo.roleName}]  (created)`);
  }
}

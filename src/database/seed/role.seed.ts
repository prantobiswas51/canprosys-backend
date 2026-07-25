import { DataSource } from 'typeorm';
import { Role } from '../../roles/role.entity';

const DEFAULT_ROLE_NAMES = ['super_admin', 'manager'];

export async function seedRoles(dataSource: DataSource) {
  const roleRepository = dataSource.getRepository(Role);

  for (const name of DEFAULT_ROLE_NAMES) {
    const existing = await roleRepository.findOneBy({ name });
    if (existing) {
      console.log(`Role "${name}" already exists, skipping.`);
      continue;
    }
    await roleRepository.save(roleRepository.create({ name }));
    console.log(`Created role "${name}".`);
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsernameWithPassword(username);

    // Same generic error whether the username doesn't exist or the password
    // is wrong -- don't give an attacker a way to enumerate valid usernames.
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const { password: _password, ...safeUser } = user;
    return safeUser;
  }

  signToken(user: { id: number; username?: string; name: string }) {
    const payload = { sub: user.id, username: user.username, name: user.name };
    return this.jwtService.sign(payload);
  }

  // Used by GET /me -- looks the user up fresh (with role + permissions)
  // instead of just trusting whatever was baked into the JWT payload at
  // login time. Flattens role.permissions down to plain keys so the
  // frontend can do simple hasPermission('tasks.create') checks.
  async getSafeUserById(id: number) {
    const user = await this.usersService.getUserById(id);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role ? { id: user.role.id, name: user.role.name } : undefined,
      permissions: user.role?.permissions?.map((p) => p.key) ?? [],
    };
  }
}

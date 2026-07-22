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
}

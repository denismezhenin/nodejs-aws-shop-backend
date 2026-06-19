import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../users/services/users.service';
import { User } from '../users/models';
import { UserEntity } from '../users/entities/user.entity';

type TokenResponse = {
  token_type: string;
  access_token: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(payload: User): Promise<{ userId: string }> {
    const existing = await this.usersService.findOne(payload.name);
    if (existing) {
      throw new BadRequestException('User with such name already exists');
    }
    const user = await this.usersService.createOne(payload);
    return { userId: user.id };
  }

  async validateUser(
    name: string,
    password: string,
  ): Promise<UserEntity | null> {
    const existing = await this.usersService.findOne(name);
    if (existing) {
      return existing.password === password ? existing : null;
    }
    return this.usersService.createOne({ name, password });
  }

  login(user: User, type: 'jwt' | 'basic' | 'default'): TokenResponse {
    if (type === 'basic') return this.loginBasic(user);
    return this.loginJWT(user);
  }

  private loginJWT(user: User): TokenResponse {
    const payload = { username: user.name, sub: user.id };
    return {
      token_type: 'Bearer',
      access_token: this.jwtService.sign(payload),
    };
  }

  private loginBasic(user: User): TokenResponse {
    const token = Buffer.from(`${user.name}:${user.password}`, 'utf8').toString(
      'base64',
    );
    return { token_type: 'Basic', access_token: token };
  }
}

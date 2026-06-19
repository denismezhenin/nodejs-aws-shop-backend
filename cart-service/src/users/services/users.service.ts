import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserEntity } from '../entities/user.entity';
import { User } from '../models';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  findOne(name: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { name } });
  }

  async createOne(payload: User): Promise<UserEntity> {
    return this.users.save({
      name: payload.name,
      email: payload.email,
      password: payload.password,
    });
  }
}

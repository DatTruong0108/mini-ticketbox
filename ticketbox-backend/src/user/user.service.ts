import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { User } from '@prisma/client';
import { Result, Ok, Err } from 'oxide.ts';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by their unique username.
   * Returns Ok(User) if found, Ok(null) if not found, Err(Error) on failure.
   */
  async findByUserName(userName: string): Promise<Result<User | null, Error>> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { userName },
      });

      return Ok(user);
    } catch (error) {
      this.logger.error(`Failed to find user by userName "${userName}": ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find a user by their primary key ID.
   * Returns Ok(User) if found, Ok(null) if not found, Err(Error) on failure.
   */
  async findById(id: string): Promise<Result<User | null, Error>> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
      });

      return Ok(user);
    } catch (error) {
      this.logger.error(`Failed to find user by id "${id}": ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Create a new user with the default role of USER.
   * Used during the passwordless onboarding flow.
   */
  async create(userName: string): Promise<Result<User, Error>> {
    try {
      const user = await this.prisma.user.create({
        data: { userName },
      });

      this.logger.log(`New user registered: ${user.userName} (${user.id})`);
      return Ok(user);
    } catch (error) {
      this.logger.error(`Failed to create user "${userName}": ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

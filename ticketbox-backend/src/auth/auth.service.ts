import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Result, Ok, Err } from 'oxide.ts';

import { UserService } from '../user/user.service.js';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';
import { Role } from '../common/enums/role.enum.js';
import { AuthTokens, LoginResult } from './interfaces/auth.interface.js';

// ─── Service ─────────────────────────────────────────────────────

/**
 * Core authentication service.
 *
 * All public methods return `Result<T, Error>` (oxide.ts) — NO exceptions thrown.
 * Every function body is wrapped in try...catch per coding standards.
 *
 * Handles:
 * - Passwordless login / auto-registration
 * - JWT access + refresh token generation
 * - Refresh-token rotation with bcrypt-hashed storage
 * - Logout (token revocation)
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * In-memory store: userId → bcrypt hash of the current refresh token.
   * In production, persist this in Redis or the database.
   */
  private readonly refreshTokenStore = new Map<string, string>();

  private readonly BCRYPT_SALT_ROUNDS = 10;

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Passwordless login / auto-registration.
   *
   * 1. Look up user by `userName`.
   * 2. If not found → create a new user with default `Role.USER`.
   * 3. Generate an access + refresh token pair.
   * 4. Store a bcrypt hash of the refresh token.
   * 5. Return tokens + basic user info.
   */
  async login(userName: string, rememberMe: boolean = false): Promise<Result<LoginResult, Error>> {
    try {
      // Step 1: Find or create user
      const findResult = await this.userService.findByUserName(userName);
      if (findResult.isErr()) {
        return Err(findResult.unwrapErr());
      }

      let user = findResult.unwrap();
      let isNewUser = false;

      if (!user) {
        const createResult = await this.userService.create(userName);
        if (createResult.isErr()) {
          return Err(createResult.unwrapErr());
        }
        user = createResult.unwrap();
        isNewUser = true;
      }

      // Step 2: Generate JWT pair
      const payload: JwtPayload = {
        sub: user.id,
        userName: user.userName,
        role: user.role as Role,
        rememberMe,
      };

      const tokensResult = await this.generateTokens(payload);
      if (tokensResult.isErr()) {
        return Err(tokensResult.unwrapErr());
      }

      const tokens = tokensResult.unwrap();

      // Step 3: Store hashed refresh token
      const storeResult = await this.storeRefreshToken(user.id, tokens.refreshToken);
      if (storeResult.isErr()) {
        return Err(storeResult.unwrapErr());
      }

      this.logger.log(
        `${isNewUser ? 'Registered & logged in' : 'Logged in'}: ${user.userName}`,
      );

      return Ok({
        tokens,
        user: {
          id: user.id,
          userName: user.userName,
          role: user.role as Role,
        },
      });
    } catch (error) {
      this.logger.error(`Login failed for "${userName}": ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Refresh-token rotation.
   *
   * 1. Verify the refresh JWT signature.
   * 2. Look up the stored hash for this user.
   * 3. Compare the incoming token against the hash.
   * 4. Issue a new token pair and replace the stored hash (rotation).
   */
  async refreshTokens(refreshToken: string): Promise<Result<AuthTokens, Error>> {
    try {
      // Step 1: Verify refresh JWT
      let payload: JwtPayload;
      try {
        payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        });
      } catch {
        return Err(new Error('Invalid or expired refresh token'));
      }

      // Step 2: Check stored hash exists
      const storedHash = this.refreshTokenStore.get(payload.sub);
      if (!storedHash) {
        return Err(new Error('Refresh token has been revoked — please log in again'));
      }

      // Step 3: Compare incoming token against stored hash
      const isValid = await bcrypt.compare(refreshToken, storedHash);
      if (!isValid) {
        // Possible token reuse attack — revoke all tokens for this user
        this.refreshTokenStore.delete(payload.sub);
        this.logger.warn(
          `Possible refresh token reuse detected for user ${payload.sub}`,
        );
        return Err(new Error('Refresh token reuse detected — all sessions revoked'));
      }

      // Step 4: Rotation — generate new pair and overwrite stored hash
      const newPayload: JwtPayload = {
        sub: payload.sub,
        userName: payload.userName,
        role: payload.role,
        rememberMe: payload.rememberMe,
      };

      const tokensResult = await this.generateTokens(newPayload);
      if (tokensResult.isErr()) {
        return Err(tokensResult.unwrapErr());
      }

      const tokens = tokensResult.unwrap();

      const storeResult = await this.storeRefreshToken(payload.sub, tokens.refreshToken);
      if (storeResult.isErr()) {
        return Err(storeResult.unwrapErr());
      }

      this.logger.log(`Tokens refreshed for user ${payload.userName}`);

      return Ok(tokens);
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Logout: invalidate the refresh token for a given user.
   */
  async logout(userId: string): Promise<Result<void, Error>> {
    try {
      this.refreshTokenStore.delete(userId);
      this.logger.log(`User ${userId} logged out — refresh token revoked`);
      return Ok(undefined);
    } catch (error) {
      this.logger.error(`Logout failed for user ${userId}: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────

  /**
   * Generate an access + refresh token pair from the given payload.
   */
  private async generateTokens(payload: JwtPayload): Promise<Result<AuthTokens, Error>> {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(
          { ...payload },
          {
            secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
            expiresIn: this.configService.getOrThrow('JWT_ACCESS_EXPIRES_IN'),
          },
        ),
        this.jwtService.signAsync(
          { ...payload },
          {
            secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN'),
          },
        ),
      ]);

      return Ok({ accessToken, refreshToken });
    } catch (error) {
      this.logger.error(`Token generation failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Hash the refresh token and store it keyed by userId.
   */
  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<Result<void, Error>> {
    try {
      const hash = await bcrypt.hash(refreshToken, this.BCRYPT_SALT_ROUNDS);
      this.refreshTokenStore.set(userId, hash);
      return Ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to store refresh token for user ${userId}: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

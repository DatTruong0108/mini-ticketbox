import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthService } from './auth.service.js';
import {
  LoginDto,
  RefreshTokenDto,
  LoginResponseDto,
  RefreshResponseDto,
  LogoutResponseDto,
  ErrorResponseDto,
} from './dto/auth.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/login
   *
   * Passwordless login / auto-registration.
   * - If `userName` does not exist → registers a new user with `Role.USER`.
   * - If `userName` exists → authenticates immediately.
   * - Returns an access + refresh token pair and basic user info.
   */
  @Post('login')
  @ApiOperation({
    summary: 'Passwordless login or auto-register',
    description:
      'Provide a unique userName. If the user does not exist, a new account is created automatically. Returns JWT tokens and user info.',
  })
  @ApiOkResponse({ type: LoginResponseDto, description: 'Login successful — tokens returned' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Validation error or login failed' })
  async login(
    @Body() dto: LoginDto,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.authService.login(dto.userName);

      if (result.isErr()) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: result.unwrapErr().message,
        });
      }

      const data = result.unwrap();

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Login successful',
        accessToken: data.tokens.accessToken,
        refreshToken: data.tokens.refreshToken,
        user: data.user,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * POST /api/auth/refresh
   *
   * Refresh the token pair using a valid refresh token.
   * Implements token rotation: the old refresh token is invalidated and
   * a brand-new pair is returned.
   */
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Provide a valid refresh token to receive a new access + refresh token pair. The old refresh token is invalidated (rotation).',
  })
  @ApiOkResponse({ type: RefreshResponseDto, description: 'New token pair returned' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid, expired, or reused refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.authService.refreshTokens(dto.refreshToken);

      if (result.isErr()) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: result.unwrapErr().message,
        });
      }

      const tokens = result.unwrap();

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Token refreshed successfully',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  /**
   * POST /api/auth/logout
   *
   * Logout: invalidate the current user's refresh token.
   * Requires a valid access token in the Authorization header.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout — revoke refresh token',
    description:
      'Invalidates the stored refresh token for the authenticated user. Requires a valid access token in the Authorization header.',
  })
  @ApiOkResponse({ type: LogoutResponseDto, description: 'Logged out successfully' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Logout failed' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.authService.logout(user.sub);

      if (result.isErr()) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: result.unwrapErr().message,
        });
      }

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Logged out successfully',
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}

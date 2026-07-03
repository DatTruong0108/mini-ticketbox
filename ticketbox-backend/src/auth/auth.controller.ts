import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Req,
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
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from './auth.service.js';
import {
  LoginDto,
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
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * POST /api/auth/login
   *
   * Passwordless login / auto-registration.
   * Sets accessToken and refreshToken HttpOnly cookies.
   */
  @Post('login')
  @ApiOperation({
    summary: 'Passwordless login or auto-register',
    description:
      'Provide a unique userName and rememberMe option. Sets JWT tokens as HttpOnly cookies.',
  })
  @ApiOkResponse({ type: LoginResponseDto, description: 'Login successful — cookies set' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Validation error or login failed' })
  async login(
    @Body() dto: LoginDto,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const rememberMe = dto.rememberMe ?? false;
      const result = await this.authService.login(dto.userName, rememberMe);

      if (result.isErr()) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: result.unwrapErr().message,
        });
      }

      const data = result.unwrap();

      const cookieOptions: any = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      };

      res.cookie('accessToken', data.tokens.accessToken, { ...cookieOptions });
      res.cookie('refreshToken', data.tokens.refreshToken, {
        ...cookieOptions,
        ...(rememberMe ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : { maxAge: 24 * 60 * 60 * 1000 }),
      });

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Login successful',
        data: {
          user: data.user,
        },
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
   * Refresh the token pair using a valid refresh token cookie.
   */
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Reads refresh token from HttpOnly cookies, verifies it, and issues new cookies.',
  })
  @ApiOkResponse({ type: RefreshResponseDto, description: 'New cookies set' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid or expired refresh token' })
  async refresh(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Refresh token is missing',
        });
      }

      const result = await this.authService.refreshTokens(refreshToken);

      if (result.isErr()) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          statusCode: HttpStatus.UNAUTHORIZED,
          message: result.unwrapErr().message,
        });
      }

      const tokens = result.unwrap();

      // Decode the payload to retrieve rememberMe
      const decoded: any = this.jwtService.decode(tokens.refreshToken);
      const rememberMe = decoded?.rememberMe ?? false;

      const cookieOptions: any = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      };

      res.cookie('accessToken', tokens.accessToken, { ...cookieOptions });
      res.cookie('refreshToken', tokens.refreshToken, {
        ...cookieOptions,
        ...(rememberMe ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : { maxAge: 24 * 60 * 60 * 1000 }),
      });

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Token refreshed successfully',
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
   * Logout: invalidate the current user's refresh token and clear cookies.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout — revoke refresh token and clear cookies',
    description:
      'Clears both access and refresh cookies, and invalidates the session.',
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

      const cookieOptions: any = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      };
      res.clearCookie('accessToken', { ...cookieOptions });
      res.clearCookie('refreshToken', { ...cookieOptions });

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

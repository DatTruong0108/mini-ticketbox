import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';

/**
 * Guard that protects routes by verifying the JWT access token
 * from the `Authorization: Bearer <token>` header.
 *
 * On success, attaches the decoded `JwtPayload` to `request.user`.
 *
 * @example
 * ```ts
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile(@CurrentUser() user: JwtPayload) { ... }
 * ```
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const token = this.extractToken(request);

      if (!token) {
        throw new UnauthorizedException('Missing access token');
      }

      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });

        // Attach the decoded payload so downstream handlers can use @CurrentUser()
        request.user = payload;
      } catch (verifyError) {
        this.logger.warn(`Token verification failed: ${(verifyError as Error).message}`);
        throw new UnauthorizedException('Invalid or expired access token');
      }

      return true;
    } catch (error) {
      // Re-throw NestJS HTTP exceptions (UnauthorizedException) as-is
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`JwtAuthGuard unexpected error: ${error}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  private extractToken(request: any): string | null {
    // 1. Try to extract from cookie
    if (request.cookies && request.cookies.accessToken) {
      return request.cookies.accessToken;
    }

    // 2. Fallback to Authorization header
    const authorization = request.headers && request.headers['authorization'];
    if (!authorization) {
      return null;
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}

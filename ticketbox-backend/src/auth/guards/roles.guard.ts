import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../common/enums/role.enum.js';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface.js';

/**
 * Guard that enforces Role-Based Access Control (RBAC).
 *
 * Reads the `@Roles()` metadata from the handler and compares it
 * against `request.user.role` (set by `JwtAuthGuard`).
 *
 * If no `@Roles()` decorator is present, the route is accessible
 * to any authenticated user.
 *
 * @example
 * ```ts
 * @Roles(Role.ADMIN)
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * deleteEvent() { ... }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    try {
      const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
        ROLES_KEY,
        [context.getHandler(), context.getClass()],
      );

      // No @Roles() decorator → allow all authenticated users
      if (!requiredRoles || requiredRoles.length === 0) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      const user = request.user as JwtPayload;

      if (!user) {
        throw new ForbiddenException('No user context found — is JwtAuthGuard applied?');
      }

      const hasRole = requiredRoles.includes(user.role);

      if (!hasRole) {
        throw new ForbiddenException(
          `Access denied. Required roles: [${requiredRoles.join(', ')}], your role: ${user.role}`,
        );
      }

      return true;
    } catch (error) {
      // Re-throw NestJS HTTP exceptions (ForbiddenException) as-is
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`RolesGuard unexpected error: ${error}`);
      throw new ForbiddenException('Authorization check failed');
    }
  }
}

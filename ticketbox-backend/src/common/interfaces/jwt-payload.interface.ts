import { Role } from '../enums/role.enum.js';

/**
 * Shape of the data encoded into both access and refresh JWTs.
 */
export interface JwtPayload {
  /** User ID (subject) */
  sub: string;

  /** Unique username */
  userName: string;

  /** User role for RBAC */
  role: Role;

  /** Whether the user selected Remember Me option */
  rememberMe?: boolean;
}

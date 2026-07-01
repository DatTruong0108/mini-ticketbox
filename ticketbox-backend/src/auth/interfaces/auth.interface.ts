import { Role } from '../../common/enums/role.enum.js';

/**
 * Shape of access and refresh tokens returned upon login or refresh.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Shape of the data returned upon successful user login.
 */
export interface LoginResult {
  tokens: AuthTokens;
  user: {
    id: string;
    userName: string;
    role: Role;
  };
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength, IsBoolean, IsOptional } from 'class-validator';
import { BaseResponse } from '../../common/dto/base-response.dto.js';

// ─── Request DTOs ────────────────────────────────────────────────

export class LoginDto {
  @ApiProperty({
    description: 'Unique username for login or auto-registration',
    example: 'john_doe',
    minLength: 3,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'userName must not be empty' })
  @MinLength(3, { message: 'userName must be at least 3 characters' })
  @MaxLength(50, { message: 'userName must not exceed 50 characters' })
  userName!: string;

  @ApiProperty({
    description: 'Extend token expiration and stay logged in',
    example: true,
    required: false,
  })
  @IsBoolean({ message: 'rememberMe must be a boolean' })
  @IsOptional()
  rememberMe?: boolean;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token received during login',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken must not be empty' })
  refreshToken!: string;
}

// ─── Response DTOs ───────────────────────────────────────────────

export class UserInfoDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: 'john_doe' })
  userName!: string;

  @ApiProperty({ example: 'USER', enum: ['USER', 'ADMIN'] })
  role!: string;
}

export class AuthTokensDto {
  @ApiProperty({
    description: 'Short-lived JWT access token (15 minutes)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Long-lived JWT refresh token (7 days)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;
}

export class LoginResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Short-lived JWT access token (15 minutes)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Long-lived JWT refresh token (7 days)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;

  @ApiProperty({ type: UserInfoDto })
  user!: UserInfoDto;
}

export class RefreshResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Short-lived JWT access token (15 minutes)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Long-lived JWT refresh token (7 days)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;
}

export class LogoutResponseDto extends BaseResponse {}

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Something went wrong' })
  message!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { BaseResponse } from '../../common/dto/base-response.dto.js';

// ─── Enums ───────────────────────────────────────────────────────

/**
 * Mirror of Prisma's TicketType enum for use in DTOs and validation.
 */
export enum TicketTypeEnum {
  STANDARD = 'STANDARD',
  VIP = 'VIP',
}

/**
 * Mirror of Prisma's TicketStatus enum for use in response data classes.
 */
export enum TicketStatusEnum {
  AVAILABLE = 'AVAILABLE',
  HOLD = 'HOLD',
  SOLD = 'SOLD',
}

// ─── Request DTOs ────────────────────────────────────────────────

/**
 * Payload for holding a ticket.
 * The `userId` is NOT accepted from the client — it is extracted
 * from the validated JWT access token by the controller.
 */
export class HoldTicketDto {
  @ApiProperty({
    description: 'Type of ticket to hold',
    enum: TicketTypeEnum,
    example: TicketTypeEnum.STANDARD,
  })
  @IsEnum(TicketTypeEnum, { message: 'ticketType must be STANDARD or VIP' })
  @IsNotEmpty({ message: 'ticketType must not be empty' })
  ticketType!: TicketTypeEnum;
}

/**
 * Payload for cancelling / releasing a held ticket.
 * The `userId` is NOT accepted from the client — it is extracted
 * from the validated JWT access token by the controller.
 */
export class CancelTicketDto {
  @ApiProperty({
    description: 'The ID of the ticket to cancel/release',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  @IsString()
  @IsNotEmpty({ message: 'ticketId must not be empty' })
  @IsUUID('4', { message: 'ticketId must be a valid UUID' })
  ticketId!: string;
}

// ─── Response Data Classes ───────────────────────────────────────

/**
 * Data object returned inside the `data` field when a ticket is successfully held.
 * Fully documented for Swagger via @ApiProperty.
 */
export class HoldTicketDataDto {
  @ApiProperty({
    description: 'Unique ID of the held ticket',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  id!: string;

  @ApiProperty({
    description: 'Type of the ticket',
    enum: TicketTypeEnum,
    example: TicketTypeEnum.STANDARD,
  })
  type!: TicketTypeEnum;

  @ApiProperty({
    description: 'Current status of the ticket',
    enum: TicketStatusEnum,
    example: TicketStatusEnum.HOLD,
  })
  status!: TicketStatusEnum;

  @ApiProperty({
    description: 'Price of the ticket in VND',
    example: 500000,
  })
  price!: number;

  @ApiProperty({
    description: 'ID of the user holding the ticket',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  userId!: string;

  @ApiProperty({
    description: 'Timestamp when the hold expires (5 minutes from creation)',
    example: '2026-07-01T09:05:00.000Z',
  })
  expiresAt!: string;
}

/**
 * Data object returned inside the `data` field when a ticket is successfully cancelled.
 * Fully documented for Swagger via @ApiProperty.
 */
export class CancelTicketDataDto {
  @ApiProperty({
    description: 'Unique ID of the released ticket',
    example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  })
  id!: string;

  @ApiProperty({
    description: 'Type of the ticket',
    enum: TicketTypeEnum,
    example: TicketTypeEnum.STANDARD,
  })
  type!: TicketTypeEnum;

  @ApiProperty({
    description: 'Current status of the ticket (reverted to AVAILABLE)',
    enum: TicketStatusEnum,
    example: TicketStatusEnum.AVAILABLE,
  })
  status!: TicketStatusEnum;
}

// ─── Response DTOs ───────────────────────────────────────────────

export class HoldTicketResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Held ticket details',
    type: HoldTicketDataDto,
  })
  data!: HoldTicketDataDto;
}

export class CancelTicketResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Cancelled ticket details',
    type: CancelTicketDataDto,
  })
  data!: CancelTicketDataDto;
}

export class TicketErrorResponseDto {
  @ApiProperty({ example: 409, description: 'HTTP status code' })
  statusCode!: number;

  @ApiProperty({ example: 'Tickets Sold Out', description: 'Error message' })
  message!: string;
}

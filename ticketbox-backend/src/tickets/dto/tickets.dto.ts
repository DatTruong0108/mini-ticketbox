import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, IsEnum, IsInt, IsNotEmpty, IsString, IsUUID, Max, Min } from 'class-validator';
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

  @ApiProperty({
    description: 'Number of tickets to hold (max 5 per user across all types)',
    minimum: 1,
    maximum: 5,
    default: 1,
    example: 2,
  })
  @IsInt({ message: 'quantity must be an integer' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(5, { message: 'quantity must not exceed 5' })
  quantity!: number;
}

/**
 * Payload for cancelling / releasing a held ticket.
 * The `userId` is NOT accepted from the client — it is extracted
 * from the validated JWT access token by the controller.
 */
export class CancelTicketDto {
  @ApiProperty({
    description: 'The list of ticket IDs to cancel/release',
    example: ['b2c3d4e5-f6a7-8901-bcde-f12345678901'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @IsUUID('4', { each: true, message: 'each ticketId must be a valid UUID' })
  ticketIds!: string[];
}

/**
 * Payload for paying / purchasing a held ticket.
 * The `userId` is NOT accepted from the client — it is extracted
 * from the validated JWT access token by the controller.
 */
export class PayTicketDto {
  @ApiProperty({
    description: 'The list of ticket IDs to pay for (must be in HOLD status)',
    example: ['b2c3d4e5-f6a7-8901-bcde-f12345678901'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @IsUUID('4', { each: true, message: 'each ticketId must be a valid UUID' })
  ticketIds!: string[];
}

// ─── Enums (Order) ───────────────────────────────────────────────

/**
 * Mirror of Prisma's OrderStatus enum for use in response data classes.
 */
export enum OrderStatusEnum {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
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
 * Aggregated result returned when one or more tickets are held in a single request.
 * Contains the list of individual ticket details plus quota metadata.
 */
export class HoldTicketResultDataDto {
  @ApiProperty({
    description: 'List of tickets that were successfully held',
    type: [HoldTicketDataDto],
  })
  tickets!: HoldTicketDataDto[];

  @ApiProperty({
    description: 'Number of tickets held in this request',
    example: 2,
  })
  holdCount!: number;

  @ApiProperty({
    description: 'Remaining quota for this user (out of max 5)',
    example: 3,
  })
  remainingQuota!: number;
}

/**
 * Data object returned inside the `data` field when a ticket is successfully cancelled.
 * Fully documented for Swagger via @ApiProperty.
 */
export class CancelTicketDataDto {
  @ApiProperty({
    description: 'List of cancelled ticket IDs',
    example: ['b2c3d4e5-f6a7-8901-bcde-f12345678901'],
    type: [String],
  })
  ticketIds!: string[];

  @ApiProperty({
    description: 'Total number of cancelled tickets',
    example: 1,
  })
  cancelledCount!: number;
}

export class SoldTicketDataDto {
  @ApiProperty({
    description: 'Unique ID of the purchased ticket',
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
    description: 'Price of the ticket in VND',
    example: 500000,
  })
  price!: number;

  @ApiProperty({
    description: 'Status of the ticket (SOLD)',
    enum: TicketStatusEnum,
    example: TicketStatusEnum.SOLD,
  })
  status!: TicketStatusEnum;
}

/**
 * Data object returned inside the `data` field when a ticket payment succeeds.
 * Fully documented for Swagger via @ApiProperty.
 */
export class PaymentResultDataDto {
  @ApiProperty({
    description: 'ID of the newly created Order',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  orderId!: string;

  @ApiProperty({
    description: 'Total price charged in VND',
    example: 500000,
  })
  totalPrice!: number;

  @ApiProperty({
    description: 'Status of the order',
    enum: OrderStatusEnum,
    example: OrderStatusEnum.PAID,
  })
  orderStatus!: OrderStatusEnum;

  @ApiProperty({
    description: 'List of purchased tickets',
    type: [SoldTicketDataDto],
  })
  tickets!: SoldTicketDataDto[];
}

// ─── Response DTOs ───────────────────────────────────────────────

export class HoldTicketResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Held ticket details',
    type: HoldTicketDataDto,
  })
  data!: HoldTicketDataDto;
}

export class HoldTicketResultResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Hold result with ticket list and quota metadata',
    type: HoldTicketResultDataDto,
  })
  data!: HoldTicketResultDataDto;
}

export class CancelTicketResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Cancelled ticket details',
    type: CancelTicketDataDto,
  })
  data!: CancelTicketDataDto;
}

export class PayTicketResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Payment result details',
    type: PaymentResultDataDto,
  })
  data!: PaymentResultDataDto;
}

export class TicketErrorResponseDto {
  @ApiProperty({ example: 409, description: 'HTTP status code' })
  statusCode!: number;

  @ApiProperty({ example: 'Tickets Sold Out', description: 'Error message' })
  message!: string;
}

export class TicketTypePriceDto {
  @ApiProperty({
    description: 'Type of the ticket',
    enum: TicketTypeEnum,
    example: TicketTypeEnum.STANDARD,
  })
  type!: TicketTypeEnum;

  @ApiProperty({
    description: 'Price of the ticket in VND',
    example: 500000,
  })
  price!: number;
}

export class TicketTypesResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'List of ticket types and their prices',
    type: [TicketTypePriceDto],
  })
  data!: TicketTypePriceDto[];
}

export class AvailableTicketCountDto {
  @ApiProperty({
    description: 'Type of the ticket',
    enum: TicketTypeEnum,
    example: TicketTypeEnum.STANDARD,
  })
  type!: TicketTypeEnum;

  @ApiProperty({
    description: 'Number of available tickets of this type',
    example: 150,
  })
  count!: number;
}

export class AvailableTicketsDataDto {
  @ApiProperty({
    description: 'List of ticket types and their available counts',
    type: [AvailableTicketCountDto],
  })
  tickets!: AvailableTicketCountDto[];

  @ApiProperty({
    description: 'Total number of available tickets of all types',
    example: 200,
  })
  total!: number;
}

export class AvailableTicketsResponseDto extends BaseResponse {
  @ApiProperty({
    description: 'Available tickets data with total count',
    type: AvailableTicketsDataDto,
  })
  data!: AvailableTicketsDataDto;
}





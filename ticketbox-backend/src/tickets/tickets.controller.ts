import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { TicketsService } from './tickets.service.js';
import {
  HoldTicketDto,
  CancelTicketDto,
  PayTicketDto,
  HoldTicketResultResponseDto,
  CancelTicketResponseDto,
  PayTicketResponseDto,
  TicketErrorResponseDto,
  TicketTypesResponseDto,
  AvailableTicketsResponseDto,
} from './dto/tickets.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';

// ─── Controller ──────────────────────────────────────────────────

@ApiTags('Tickets')
@Controller('api/tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // ─── Hold Ticket ────────────────────────────────────────────────

  /**
   * POST /api/tickets/hold
   *
   * Attempt to hold one or more available tickets for the authenticated user.
   * Uses a dual-gate Redis strategy (user quota + global pool) before touching PostgreSQL.
   * The hold expires automatically after 5 minutes via Redis keyspace notifications.
   *
   * The `userId` is extracted from the validated JWT access token —
   * never trusted from the request body (prevents IDOR).
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('hold')
  @ApiOperation({
    summary: 'Hold ticket(s)',
    description:
      'Atomically reserve one or more available tickets for the authenticated user. ' +
      'A user can hold a maximum of 5 tickets in total across all types. ' +
      'Each ticket is held for 5 minutes. If not purchased within that window, ' +
      'it is automatically released back to the pool. ' +
      'Requires a valid JWT access token in the Authorization header.',
  })
  @ApiOkResponse({
    type: HoldTicketResultResponseDto,
    description: 'Ticket(s) held successfully — returns ticket details, hold count, and remaining quota',
  })
  @ApiConflictResponse({
    type: TicketErrorResponseDto,
    description: 'Tickets sold out — no available tickets remain',
  })
  @ApiTooManyRequestsResponse({
    type: TicketErrorResponseDto,
    description: 'User has exceeded the maximum ticket limit (5 per user)',
  })
  @ApiBadRequestResponse({
    type: TicketErrorResponseDto,
    description: 'Validation error or not enough tickets of the requested type available',
  })
  @ApiUnauthorizedResponse({
    type: TicketErrorResponseDto,
    description: 'Missing or invalid access token',
  })
  @ApiInternalServerErrorResponse({
    type: TicketErrorResponseDto,
    description: 'Unexpected server error',
  })
  async holdTicket(
    @CurrentUser() user: JwtPayload,
    @Body() dto: HoldTicketDto,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.ticketsService.holdTicket(
        user.sub,
        dto.ticketType,
        dto.quantity,
      );

      if (result.isErr()) {
        const errorMessage = result.unwrapErr().message;

        // Distinguish error categories for correct HTTP status codes
        if (errorMessage === 'Tickets Sold Out') {
          return res.status(HttpStatus.CONFLICT).json({
            statusCode: HttpStatus.CONFLICT,
            message: errorMessage,
          });
        }

        if (errorMessage.startsWith('Limit exceeded')) {
          return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: errorMessage,
          });
        }

        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: errorMessage,
        });
      }

      const data = result.unwrap();

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: `${data.holdCount} ticket(s) held successfully`,
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  // ─── Cancel Ticket ──────────────────────────────────────────────

  /**
   * POST /api/tickets/cancel
   *
   * Manually release a held ticket back to the available pool.
   * The authenticated user must be the current holder of the ticket.
   *
   * The `userId` is extracted from the validated JWT access token —
   * never trusted from the request body (prevents IDOR).
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('cancel')
  @ApiOperation({
    summary: 'Cancel / release a held ticket',
    description:
      'Release a ticket that is currently in HOLD status back to the available pool. ' +
      'The authenticated user must be the one who originally held the ticket. ' +
      'Requires a valid JWT access token in the Authorization header.',
  })
  @ApiOkResponse({
    type: CancelTicketResponseDto,
    description: 'Ticket released successfully — status reverted to AVAILABLE',
  })
  @ApiBadRequestResponse({
    type: TicketErrorResponseDto,
    description:
      'Ticket not found, not in HOLD status, or user is not the holder',
  })
  @ApiUnauthorizedResponse({
    type: TicketErrorResponseDto,
    description: 'Missing or invalid access token',
  })
  @ApiInternalServerErrorResponse({
    type: TicketErrorResponseDto,
    description: 'Unexpected server error',
  })
  async cancelTicket(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CancelTicketDto,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.ticketsService.cancelTicket(
        dto.ticketId,
        user.sub,
      );

      if (result.isErr()) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: result.unwrapErr().message,
        });
      }

      const data = result.unwrap();

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Ticket cancelled successfully',
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  // ─── Pay Ticket ─────────────────────────────────────────────────

  /**
   * POST /api/tickets/pay
   *
   * Process a mock payment for a held ticket.
   * Creates an Order (PAID) and marks the Ticket as SOLD in a single
   * Prisma interactive transaction. Deletes the Redis hold key to
   * prevent the expiration listener from reverting the sale.
   *
   * The `userId` is extracted from the validated JWT access token —
   * never trusted from the request body (prevents IDOR).
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('pay')
  @ApiOperation({
    summary: 'Pay for a held ticket (mock payment)',
    description:
      'Complete the purchase of a ticket that is currently in HOLD status. ' +
      'Creates a PAID order and marks the ticket as SOLD atomically. ' +
      'Requires a valid JWT access token in the Authorization header.',
  })
  @ApiOkResponse({
    type: PayTicketResponseDto,
    description: 'Payment successful — returns order and ticket details',
  })
  @ApiBadRequestResponse({
    type: TicketErrorResponseDto,
    description:
      'Ticket not found, not in HOLD status, or user is not the holder',
  })
  @ApiUnauthorizedResponse({
    type: TicketErrorResponseDto,
    description: 'Missing or invalid access token',
  })
  @ApiInternalServerErrorResponse({
    type: TicketErrorResponseDto,
    description: 'Unexpected server error',
  })
  async payTicket(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PayTicketDto,
    @Res() res: Response,
  ): Promise<Response> {
    try {
      const result = await this.ticketsService.payTicket(
        dto.ticketId,
        user.sub,
      );

      if (result.isErr()) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: result.unwrapErr().message,
        });
      }

      const data = result.unwrap();

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Payment successful',
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  // ─── Get Ticket Types ───────────────────────────────────────────

  /**
   * GET /api/tickets/types
   *
   * Fetch distinct ticket types and their prices.
   * Public endpoint, no authentication required.
   */
  @Get('types')
  @ApiOperation({
    summary: 'Get distinct ticket types and prices',
    description: 'Retrieve all unique ticket types and their corresponding prices from the database.',
  })
  @ApiOkResponse({
    type: TicketTypesResponseDto,
    description: 'List of ticket types and prices retrieved successfully',
  })
  @ApiInternalServerErrorResponse({
    type: TicketErrorResponseDto,
    description: 'Unexpected server error',
  })
  async getTicketTypes(@Res() res: Response): Promise<Response> {
    try {
      const result = await this.ticketsService.getTicketTypes();

      if (result.isErr()) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: result.unwrapErr().message,
        });
      }

      const data = result.unwrap();

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Ticket types retrieved successfully',
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }

  // ─── Get Available Tickets ───────────────────────────────────────

  /**
   * GET /api/tickets/available
   *
   * Fetch number of tickets of each type whose status is AVAILABLE.
   * Public endpoint, no authentication required.
   */
  @Get('available')
  @ApiOperation({
    summary: 'Get number of available tickets',
    description: 'Retrieve the number of tickets available for purchase grouped by ticket type.',
  })
  @ApiOkResponse({
    type: AvailableTicketsResponseDto,
    description: 'List of ticket types and available counts retrieved successfully',
  })
  @ApiInternalServerErrorResponse({
    type: TicketErrorResponseDto,
    description: 'Unexpected server error',
  })
  async getAvailableTickets(@Res() res: Response): Promise<Response> {
    try {
      const result = await this.ticketsService.getAvailableTickets();

      if (result.isErr()) {
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: result.unwrapErr().message,
        });
      }

      const data = result.unwrap();

      return res.status(HttpStatus.OK).json({
        statusCode: HttpStatus.OK,
        message: 'Available tickets retrieved successfully',
        data,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      });
    }
  }
}

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
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { TicketsService } from './tickets.service.js';
import {
  HoldTicketDto,
  CancelTicketDto,
  HoldTicketResponseDto,
  CancelTicketResponseDto,
  TicketErrorResponseDto,
} from './dto/tickets.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../common/interfaces/jwt-payload.interface.js';

// ─── Controller ──────────────────────────────────────────────────

@ApiTags('Tickets')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('api/tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // ─── Hold Ticket ────────────────────────────────────────────────

  /**
   * POST /api/tickets/hold
   *
   * Attempt to hold one available ticket for the authenticated user.
   * Uses Redis DECR as an atomic concurrency gate before touching PostgreSQL.
   * The hold expires automatically after 5 minutes via Redis keyspace notifications.
   *
   * The `userId` is extracted from the validated JWT access token —
   * never trusted from the request body (prevents IDOR).
   */
  @Post('hold')
  @ApiOperation({
    summary: 'Hold a ticket',
    description:
      'Atomically reserve one available ticket for the authenticated user. ' +
      'The ticket is held for 5 minutes. If not purchased within that window, ' +
      'it is automatically released back to the pool. ' +
      'Requires a valid JWT access token in the Authorization header.',
  })
  @ApiOkResponse({
    type: HoldTicketResponseDto,
    description: 'Ticket held successfully — returns ticket details and expiry',
  })
  @ApiConflictResponse({
    type: TicketErrorResponseDto,
    description: 'Tickets sold out — no available tickets remain',
  })
  @ApiBadRequestResponse({
    type: TicketErrorResponseDto,
    description: 'Validation error or no ticket of the requested type available',
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
      );

      if (result.isErr()) {
        const errorMessage = result.unwrapErr().message;

        // Distinguish "Sold Out" from other business errors
        if (errorMessage === 'Tickets Sold Out') {
          return res.status(HttpStatus.CONFLICT).json({
            statusCode: HttpStatus.CONFLICT,
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
        message: 'Ticket held successfully',
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
}

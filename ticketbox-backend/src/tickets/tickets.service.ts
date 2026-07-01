import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Result, Ok, Err } from 'oxide.ts';

import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import {
  TicketTypeEnum,
  TicketStatusEnum,
  OrderStatusEnum,
} from './dto/tickets.dto.js';

import { HoldTicketData, CancelTicketData, PaymentResultData } from './interfaces/tickets.interface.js';
import { TicketsGateway } from './tickets.gateway.js';

// ─── Constants ───────────────────────────────────────────────────

/** Duration in seconds for which a ticket hold is valid. */
const HOLD_TTL_SECONDS = 300; // 5 minutes

// ─── Service ─────────────────────────────────────────────────────

/**
 * Core ticket booking service implementing concurrency-safe
 * hold / cancel / auto-expiration flows.
 *
 * **Concurrency gate**: Redis `DECR` on `tickets_available` is the
 * atomic operation that prevents overselling across concurrent requests.
 * PostgreSQL handles the actual ticket record state.
 *
 * All public methods return `Result<T, Error>` — NO exceptions thrown.
 * Every function body is wrapped in try…catch per coding standards.
 */
@Injectable()
export class TicketsService implements OnModuleInit {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly ticketsGateway: TicketsGateway,
  ) { }

  // ─── Lifecycle ──────────────────────────────────────────────────

  /**
   * On application startup:
   * 1. Count available tickets in PostgreSQL.
   * 2. Seed the Redis `tickets_available` pool counter.
   * 3. Register the keyspace expiration handler.
   */
  async onModuleInit(): Promise<void> {
    try {
      // 1. Count available tickets from the database
      const availableCount = await this.prisma.ticket.count({
        where: { status: 'AVAILABLE' },
      });

      // 2. Initialise the Redis pool
      const initResult = await this.redisService.initPool(availableCount);
      if (initResult.isErr()) {
        this.logger.error(
          `Failed to initialise Redis pool: ${initResult.unwrapErr().message}`,
        );
        return;
      }

      this.logger.log(
        `Ticket pool initialised from DB: ${availableCount} tickets available`,
      );

      // Seed the initial count into the websocket gateway
      this.ticketsGateway.queueCountUpdate(availableCount);

      // 3. Register the expiration handler (fires when ticket_hold:{id} key expires)
      this.redisService.registerExpirationHandler((ticketId: string) => {
        // Fire-and-forget — errors are logged inside handleTicketExpiration
        void this.handleTicketExpiration(ticketId);
      });

      this.logger.log('Keyspace expiration handler registered');
    } catch (error) {
      this.logger.error(`TicketsService.onModuleInit failed: ${error}`);
    }
  }

  // ─── Hold Ticket ────────────────────────────────────────────────

  /**
   * Attempt to hold one available ticket for a user.
   *
   * Flow:
   * 1. Atomic `DECR tickets_available` in Redis (the concurrency gate).
   * 2. If result < 0 → restore pool, return "Tickets Sold Out".
   * 3. Find one AVAILABLE ticket of the requested type in PostgreSQL.
   * 4. Update its status to HOLD, assign userId, set expiresAt.
   * 5. Create a Redis hold key with 5-minute TTL.
   */
  async holdTicket(
    userId: string,
    ticketType: TicketTypeEnum,
  ): Promise<Result<HoldTicketData, Error>> {
    try {
      // Step 1: Atomic decrement — the concurrency gate
      const decrResult = await this.redisService.decrementPool();
      if (decrResult.isErr()) {
        return Err(decrResult.unwrapErr());
      }

      const remaining = decrResult.unwrap();

      // Step 2: Check if tickets are still available
      if (remaining < 0) {
        // Restore the pool immediately — this request didn't get a slot
        const restoreResult = await this.redisService.incrementPool();
        if (restoreResult.isOk()) {
          this.ticketsGateway.queueCountUpdate(restoreResult.unwrap());
        }
        return Err(new Error('Tickets Sold Out'));
      }

      // Step 3: Find one available ticket of the requested type in the database
      const ticket = await this.prisma.ticket.findFirst({
        where: { status: 'AVAILABLE', type: ticketType },
      });

      if (!ticket) {
        // Edge case: pool said yes, but no matching DB row (type mismatch / data drift)
        const restoreResult = await this.redisService.incrementPool();
        if (restoreResult.isOk()) {
          this.ticketsGateway.queueCountUpdate(restoreResult.unwrap());
        }
        return Err(
          new Error(
            `No available ${ticketType} ticket found. Please try a different type.`,
          ),
        );
      }

      // Step 4: Update the ticket to HOLD status in PostgreSQL
      const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);

      const updatedTicket = await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'HOLD',
          userId,
          expiresAt,
        },
      });

      // Step 5: Create the Redis hold key with TTL
      const holdResult = await this.redisService.setHoldKey(
        updatedTicket.id,
        HOLD_TTL_SECONDS,
      );
      if (holdResult.isErr()) {
        this.logger.error(
          `Failed to set Redis hold key for ticket ${updatedTicket.id}: ${holdResult.unwrapErr().message}`,
        );
        // Non-fatal: the DB state is correct; the auto-release will be handled
        // by a fallback cron or manual cancel if Redis fails
      }

      const formattedExpiresAt = expiresAt.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      this.logger.log(
        `Ticket ${updatedTicket.id} (${ticketType}) held by user ${userId} — expires at ${formattedExpiresAt}`,
      );

      // Queue the new count (remaining) to be broadcast
      this.ticketsGateway.queueCountUpdate(remaining);

      return Ok({
        id: updatedTicket.id,
        type: updatedTicket.type as TicketTypeEnum,
        status: updatedTicket.status as TicketStatusEnum,
        price: updatedTicket.price,
        userId,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      this.logger.error(`holdTicket failed: ${error}`);
      // Attempt to restore the pool on any unexpected failure
      try {
        const restoreResult = await this.redisService.incrementPool();
        if (restoreResult.isOk()) {
          this.ticketsGateway.queueCountUpdate(restoreResult.unwrap());
        }
      } catch (restoreErr) {
        this.logger.error(`Failed to restore pool after error: ${restoreErr}`);
      }
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Cancel / Release Ticket ────────────────────────────────────

  /**
   * Manually cancel a ticket hold (user-initiated release).
   *
   * Flow:
   * 1. Find the ticket in PostgreSQL by ID.
   * 2. Validate: must be in HOLD status and owned by the requesting user.
   * 3. Revert to AVAILABLE, clear userId and expiresAt.
   * 4. Delete the Redis hold key early.
   * 5. Increment the Redis pool.
   */
  async cancelTicket(
    ticketId: string,
    userId: string,
  ): Promise<Result<CancelTicketData, Error>> {
    try {
      // Step 1: Look up the ticket
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket) {
        return Err(new Error('Ticket not found'));
      }

      // Step 2: Validate ownership and status
      if (ticket.status !== 'HOLD') {
        return Err(
          new Error(
            `Ticket is not in HOLD status (current: ${ticket.status})`,
          ),
        );
      }

      if (ticket.userId !== userId) {
        return Err(new Error('You are not the holder of this ticket'));
      }

      // Step 3: Revert the ticket to AVAILABLE in PostgreSQL
      const updatedTicket = await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'AVAILABLE',
          userId: null,
          expiresAt: null,
        },
      });

      // Step 4: Delete the Redis hold key early
      const deleteResult = await this.redisService.deleteHoldKey(ticketId);
      if (deleteResult.isErr()) {
        this.logger.error(
          `Failed to delete Redis hold key for ticket ${ticketId}: ${deleteResult.unwrapErr().message}`,
        );
      }

      // Step 5: Increment the Redis pool
      const incrResult = await this.redisService.incrementPool();
      if (incrResult.isErr()) {
        this.logger.error(
          `Failed to increment Redis pool after cancel: ${incrResult.unwrapErr().message}`,
        );
      } else {
        this.ticketsGateway.queueCountUpdate(incrResult.unwrap());
      }

      this.logger.log(
        `Ticket ${ticketId} cancelled by user ${userId} — status reverted to AVAILABLE`,
      );

      return Ok({
        id: updatedTicket.id,
        type: updatedTicket.type as TicketTypeEnum,
        status: updatedTicket.status as TicketStatusEnum,
      });
    } catch (error) {
      this.logger.error(`cancelTicket failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Pay Ticket (Mock Payment) ──────────────────────────────────

  /**
   * Process a mock payment for a held ticket.
   *
   * Flow:
   * 1. Find the ticket by ID.
   * 2. Validate: must be in HOLD status and owned by the authenticated user.
   * 3. Prisma `$transaction`: create an Order (PAID) + update Ticket (SOLD).
   * 4. Delete the Redis hold key early to prevent the expiration listener
   *    from accidentally reverting the sold ticket.
   */
  async payTicket(
    ticketId: string,
    userId: string,
  ): Promise<Result<PaymentResultData, Error>> {
    try {
      // Step 1: Look up the ticket
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket) {
        return Err(new Error('Ticket not found'));
      }

      // Step 2: Validate ownership and status
      if (ticket.status !== 'HOLD') {
        return Err(
          new Error(
            `Ticket is not in HOLD status (current: ${ticket.status})`,
          ),
        );
      }

      if (ticket.userId !== userId) {
        return Err(new Error('You are not the holder of this ticket'));
      }

      // Step 3: Atomic Prisma interactive transaction — create Order + update Ticket
      const { order, updatedTicket } = await this.prisma.$transaction(
        async (tx) => {
          // Create a PAID order
          const createdOrder = await tx.order.create({
            data: {
              userId,
              totalPrice: ticket.price,
              status: 'PAID',
            },
          });

          // Mark the ticket as SOLD, link to the order, clear expiry
          const soldTicket = await tx.ticket.update({
            where: { id: ticketId },
            data: {
              status: 'SOLD',
              orderId: createdOrder.id,
              expiresAt: null,
            },
          });

          return { order: createdOrder, updatedTicket: soldTicket };
        },
      );

      // Step 4: Delete the Redis hold key early
      const deleteResult = await this.redisService.deleteHoldKey(ticketId);
      if (deleteResult.isErr()) {
        this.logger.error(
          `Failed to delete Redis hold key after payment for ticket ${ticketId}: ${deleteResult.unwrapErr().message}`,
        );
      }

      this.logger.log(
        `Ticket ${ticketId} purchased by user ${userId} — Order ${order.id} created (${ticket.price} VND)`,
      );

      return Ok({
        orderId: order.id,
        ticketId,
        ticketStatus: TicketStatusEnum.SOLD,
        orderStatus: OrderStatusEnum.PAID,
        totalPrice: ticket.price,
      });
    } catch (error) {
      this.logger.error(`payTicket failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Automated Expiration Handler ───────────────────────────────

  /**
   * Called automatically when a `ticket_hold:{ticketId}` key expires in Redis.
   *
   * If the ticket is still in HOLD status (i.e., payment was NOT completed),
   * revert it to AVAILABLE and restore the Redis pool slot.
   *
   * If the ticket has already been SOLD, do nothing.
   */
  async handleTicketExpiration(
    ticketId: string,
  ): Promise<Result<void, Error>> {
    try {
      // Look up the ticket
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket) {
        this.logger.warn(
          `Expiration handler: ticket ${ticketId} not found in DB — skipping`,
        );
        return Ok(undefined);
      }

      // Only revert if still on HOLD (not yet SOLD)
      if (ticket.status !== 'HOLD') {
        this.logger.log(
          `Expiration handler: ticket ${ticketId} is ${ticket.status} — no action needed`,
        );
        return Ok(undefined);
      }

      // Revert to AVAILABLE
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'AVAILABLE',
          userId: null,
          expiresAt: null,
        },
      });

      // Restore the Redis pool slot
      const incrResult = await this.redisService.incrementPool();
      if (incrResult.isErr()) {
        this.logger.error(
          `Expiration handler: failed to increment pool for ticket ${ticketId}: ${incrResult.unwrapErr().message}`,
        );
      } else {
        this.ticketsGateway.queueCountUpdate(incrResult.unwrap());
      }

      this.logger.log(
        `Ticket ${ticketId} hold expired — status reverted to AVAILABLE`,
      );

      return Ok(undefined);
    } catch (error) {
      this.logger.error(
        `handleTicketExpiration failed for ticket ${ticketId}: ${error}`,
      );
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

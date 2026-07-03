import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Result, Ok, Err } from 'oxide.ts';

import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import {
  TicketTypeEnum,
  TicketStatusEnum,
  OrderStatusEnum,
} from './dto/tickets.dto.js';

import {
  HoldTicketData,
  HoldTicketResultData,
  CancelTicketData,
  PaymentResultData,
  TicketTypes,
  AvailableTicketCount,
  AvailableTicketsResult,
} from './interfaces/tickets.interface.js';
import { TicketsGateway } from './tickets.gateway.js';

// ─── Constants ───────────────────────────────────────────────────

/** Duration in seconds for which a ticket hold is valid. */
const HOLD_TTL_SECONDS = 300; // 5 minutes

/** Maximum number of tickets a single user can hold/buy in total. */
const MAX_TICKETS_PER_USER = 5;

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
      const ticketsResult = await this.getAvailableTickets();
      if (ticketsResult.isOk()) {
        this.ticketsGateway.queueCountUpdate(ticketsResult.unwrap());
      }

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
   * Attempt to hold `quantity` available tickets of a given type for a user.
   *
   * **Dual-Gate Concurrency Control:**
   * 1. **User Quota Gate** — `INCRBY user_quota:{userId} quantity`. If > MAX → rollback + error.
   * 2. **Global Pool Gate** — `DECRBY tickets_available quantity`. If < 0 → rollback both + error.
   * 3. **DB Transaction** — Find exactly `quantity` AVAILABLE tickets, update to HOLD.
   * 4. **Hold Keys Pipeline** — Create `ticket_hold:{id}` keys with TTL in one round trip.
   *
   * Full rollback on any step failure.
   */
  async holdTicket(
    userId: string,
    ticketType: TicketTypeEnum,
    quantity: number,
  ): Promise<Result<HoldTicketResultData, Error>> {
    // Track which gates have been passed for rollback
    let userQuotaReserved = false;
    let globalPoolReserved = false;

    try {
      // ── Step 1: User Quota Gate (Redis) ──────────────────────────
      const quotaResult = await this.redisService.incrementUserQuota(
        userId,
        quantity,
      );
      if (quotaResult.isErr()) {
        return Err(quotaResult.unwrapErr());
      }

      const newQuotaTotal = quotaResult.unwrap();
      userQuotaReserved = true;

      if (newQuotaTotal > MAX_TICKETS_PER_USER) {
        // Immediate rollback — user is over the limit
        await this.redisService.decrementUserQuota(userId, quantity);
        userQuotaReserved = false;

        const currentlyHeld = newQuotaTotal - quantity;
        return Err(
          new Error(
            `Limit exceeded. Max ${MAX_TICKETS_PER_USER} tickets per user. ` +
            `You currently have ${currentlyHeld}, requested ${quantity}.`,
          ),
        );
      }

      // ── Step 2: Global Pool Gate (Redis) ─────────────────────────
      const decrResult = await this.redisService.decrementPool(quantity);
      if (decrResult.isErr()) {
        // Rollback user quota
        await this.redisService.decrementUserQuota(userId, quantity);
        userQuotaReserved = false;
        return Err(decrResult.unwrapErr());
      }

      const remaining = decrResult.unwrap();
      globalPoolReserved = true;

      if (remaining < 0) {
        // Not enough global tickets — rollback both
        const restoreResult = await this.redisService.incrementPool(quantity);
        globalPoolReserved = false;
        if (restoreResult.isOk()) {
          const ticketsResult = await this.getAvailableTickets();
          if (ticketsResult.isOk()) {
            this.ticketsGateway.queueCountUpdate(ticketsResult.unwrap());
          }
        }

        await this.redisService.decrementUserQuota(userId, quantity);
        userQuotaReserved = false;

        return Err(new Error('Tickets Sold Out'));
      }

      // ── Step 3: Database Transaction (Prisma) ────────────────────
      const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);

      const heldTickets = await this.prisma.$transaction(async (tx) => {
        // Find exactly `quantity` available tickets of the requested type
        const availableTickets = await tx.ticket.findMany({
          where: { status: 'AVAILABLE', type: ticketType },
          take: quantity,
        });

        if (availableTickets.length < quantity) {
          // Not enough tickets of this type in DB — throw to abort the transaction
          throw new Error(
            `NOT_ENOUGH_TYPE:${availableTickets.length}`,
          );
        }

        const ticketIds = availableTickets.map((t) => t.id);

        // Bulk update all found tickets to HOLD
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: {
            status: 'HOLD',
            userId,
            expiresAt,
          },
        });

        // Re-fetch the updated tickets to return full data
        return tx.ticket.findMany({
          where: { id: { in: ticketIds } },
        });
      });

      // ── Step 4: Hold Keys Pipeline (Redis) ───────────────────────
      const ticketIds = heldTickets.map((t) => t.id);
      const holdResult = await this.redisService.setHoldKeysPipeline(
        ticketIds,
        HOLD_TTL_SECONDS,
      );
      if (holdResult.isErr()) {
        this.logger.error(
          `Failed to set Redis hold keys for ${ticketIds.length} tickets: ${holdResult.unwrapErr().message}`,
        );
        // Non-fatal: DB state is correct; fallback cron or manual cancel handles expiry
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
        `${quantity} ticket(s) (${ticketType}) held by user ${userId} — expires at ${formattedExpiresAt}`,
      );

      // Queue the new count to be broadcast
      const ticketsResult = await this.getAvailableTickets();
      if (ticketsResult.isOk()) {
        this.ticketsGateway.queueCountUpdate(ticketsResult.unwrap());
      }

      this.ticketsGateway.emitAdminDashboardRefresh();

      // Build response
      const tickets: HoldTicketData[] = heldTickets.map((t) => ({
        id: t.id,
        type: t.type as TicketTypeEnum,
        status: t.status as TicketStatusEnum,
        price: t.price,
        userId,
        expiresAt: expiresAt.toISOString(),
      }));

      return Ok({
        tickets,
        holdCount: tickets.length,
        remainingQuota: MAX_TICKETS_PER_USER - newQuotaTotal,
      });
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : String(error);

      // Handle the specific DB "not enough of this type" case
      if (errMsg.startsWith('NOT_ENOUGH_TYPE:')) {
        const found = parseInt(errMsg.split(':')[1], 10);
        this.logger.warn(
          `holdTicket: only ${found} ${ticketType} tickets in DB, needed ${quantity}`,
        );

        // Rollback both Redis counters
        if (globalPoolReserved) {
          const restoreResult =
            await this.redisService.incrementPool(quantity);
          if (restoreResult.isOk()) {
            const ticketsResult = await this.getAvailableTickets();
            if (ticketsResult.isOk()) {
              this.ticketsGateway.queueCountUpdate(ticketsResult.unwrap());
            }
          }
        }
        if (userQuotaReserved) {
          await this.redisService.decrementUserQuota(userId, quantity);
        }

        return Err(
          new Error(
            `Not enough ${ticketType} tickets available. Only ${found} remaining of this type.`,
          ),
        );
      }

      // Unexpected error — attempt full rollback
      this.logger.error(`holdTicket failed: ${errMsg}`);
      try {
        if (globalPoolReserved) {
          const restoreResult =
            await this.redisService.incrementPool(quantity);
          if (restoreResult.isOk()) {
            const ticketsResult = await this.getAvailableTickets();
            if (ticketsResult.isOk()) {
              this.ticketsGateway.queueCountUpdate(ticketsResult.unwrap());
            }
          }
        }
        if (userQuotaReserved) {
          await this.redisService.decrementUserQuota(userId, quantity);
        }
      } catch (rollbackErr) {
        this.logger.error(
          `Failed to rollback after error: ${rollbackErr}`,
        );
      }

      return Err(error instanceof Error ? error : new Error(errMsg));
    }
  }

  // ─── Cancel / Release Ticket ────────────────────────────────────

  /**
   * Manually cancel multiple ticket holds (user-initiated bulk release).
   *
   * Flow:
   * 1. Find the tickets in PostgreSQL by IDs.
   * 2. Validate: all must exist, be in HOLD status, and owned by the requesting user.
   * 3. Revert them to AVAILABLE, clear userId and expiresAt.
   * 4. Delete the Redis hold keys in a pipeline early.
   * 5. Increment the Redis pool count by the number of tickets.
   * 6. Decrement the user's quota counter by the number of tickets.
   */
  async cancelTicket(
    ticketIds: string[],
    userId: string,
  ): Promise<Result<CancelTicketData, Error>> {
    try {
      // Step 1: Look up all requested tickets in the database
      const fetchedTickets = await this.prisma.ticket.findMany({
        where: { id: { in: ticketIds } },
      });

      if (fetchedTickets.length !== ticketIds.length) {
        return Err(new Error('Some tickets were not found'));
      }

      // Step 2: Validate ownership and status of each ticket
      for (const ticket of fetchedTickets) {
        if (ticket.status !== 'HOLD') {
          return Err(
            new Error(
              `Ticket ${ticket.id} is not in HOLD status (current: ${ticket.status})`,
            ),
          );
        }

        if (ticket.userId !== userId) {
          return Err(
            new Error(`You are not the holder of ticket ${ticket.id}`),
          );
        }
      }

      // Step 3: Revert the tickets to AVAILABLE in PostgreSQL
      await this.prisma.ticket.updateMany({
        where: { id: { in: ticketIds } },
        data: {
          status: 'AVAILABLE',
          userId: null,
          expiresAt: null,
        },
      });

      // Step 4: Delete the Redis hold keys in a pipeline
      const deleteResult = await this.redisService.deleteHoldKeysPipeline(ticketIds);
      if (deleteResult.isErr()) {
        this.logger.error(
          `Failed to delete Redis hold keys pipeline for ${ticketIds.length} tickets: ${deleteResult.unwrapErr().message}`,
        );
      }

      // Step 5: Increment the Redis pool by the number of cancelled tickets
      const count = ticketIds.length;
      const incrResult = await this.redisService.incrementPool(count);
      if (incrResult.isErr()) {
        this.logger.error(
          `Failed to increment Redis pool after cancel: ${incrResult.unwrapErr().message}`,
        );
      } else {
        const ticketsResult = await this.getAvailableTickets();
        if (ticketsResult.isOk()) {
          this.ticketsGateway.queueCountUpdate(ticketsResult.unwrap());
        }
      }

      // Step 6: Decrement the user's quota counter by the number of cancelled tickets
      const quotaResult = await this.redisService.decrementUserQuota(
        userId,
        count,
      );
      if (quotaResult.isErr()) {
        this.logger.error(
          `Failed to decrement user quota after cancel for ${userId}: ${quotaResult.unwrapErr().message}`,
        );
      }

      this.logger.log(
        `${count} ticket(s) cancelled by user ${userId} — status reverted to AVAILABLE`,
      );

      this.ticketsGateway.emitAdminDashboardRefresh();

      return Ok({
        ticketIds,
        cancelledCount: count,
      });
    } catch (error) {
      this.logger.error(`cancelTicket failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Pay Ticket (Mock Payment) ──────────────────────────────────

  /**
   * Process a mock payment for multiple held tickets.
   * Creates a single Order (PAID) and marks the Tickets as SOLD atomically.
   *
   * Flow:
   * 1. Fetch tickets by IDs.
   * 2. Validate: all must exist, be in HOLD status, and owned by the authenticated user.
   * 3. Calculate: sum prices.
   * 4. Interactive Transaction: create Order + update Tickets status.
   * 5. Redis Cleanup: pipeline delete hold keys.
   * 6. Return response.
   */
  async payTicket(
    ticketIds: string[],
    userId: string,
  ): Promise<Result<PaymentResultData, Error>> {
    try {
      // Step 1: Look up all requested tickets
      const fetchedTickets = await this.prisma.ticket.findMany({
        where: { id: { in: ticketIds } },
      });

      if (fetchedTickets.length !== ticketIds.length) {
        return Err(new Error('Some tickets were not found or are invalid'));
      }

      // Step 2: Validate status and ownership of each ticket
      for (const ticket of fetchedTickets) {
        if (ticket.status !== 'HOLD') {
          return Err(
            new Error(
              `Ticket ${ticket.id} is not in HOLD status (current: ${ticket.status})`,
            ),
          );
        }

        if (ticket.userId !== userId) {
          return Err(
            new Error(`You are not the holder of ticket ${ticket.id}`),
          );
        }
      }

      // Step 3: Calculate the total price
      const totalPrice = fetchedTickets.reduce((sum, t) => sum + t.price, 0);

      // Step 4: Atomic Prisma Interactive Transaction
      const order = await this.prisma.$transaction(async (tx) => {
        // Create a single PAID order
        const createdOrder = await tx.order.create({
          data: {
            userId,
            totalPrice,
            status: 'PAID',
          },
        });

        // Mark all selected tickets as SOLD, link to the order, clear expiry
        await tx.ticket.updateMany({
          where: { id: { in: ticketIds } },
          data: {
            status: 'SOLD',
            orderId: createdOrder.id,
            expiresAt: null,
          },
        });

        return createdOrder;
      });

      // Step 5: Delete the Redis hold keys in a pipeline early
      const deleteResult = await this.redisService.deleteHoldKeysPipeline(ticketIds);
      if (deleteResult.isErr()) {
        this.logger.error(
          `Failed to delete Redis hold keys pipeline after payment for ${ticketIds.length} tickets: ${deleteResult.unwrapErr().message}`,
        );
      }

      this.logger.log(
        `${ticketIds.length} ticket(s) purchased by user ${userId} — Order ${order.id} created (${totalPrice} VND)`,
      );

      // Format ticket list for return
      const tickets = fetchedTickets.map((t) => ({
        id: t.id,
        type: t.type as TicketTypeEnum,
        price: t.price,
        status: TicketStatusEnum.SOLD,
      }));

      this.ticketsGateway.emitAdminDashboardRefresh();

      return Ok({
        orderId: order.id,
        totalPrice,
        orderStatus: OrderStatusEnum.PAID,
        tickets,
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
   * revert it to AVAILABLE, restore the Redis pool slot, and decrement
   * the user's quota counter.
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

      // Capture userId before clearing it from the ticket
      const holdUserId = ticket.userId;

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
        const ticketsResult = await this.getAvailableTickets();
        if (ticketsResult.isOk()) {
          this.ticketsGateway.queueCountUpdate(ticketsResult.unwrap());
        }
      }

      // Decrement the user's quota counter
      if (holdUserId) {
        const quotaResult = await this.redisService.decrementUserQuota(
          holdUserId,
          1,
        );
        if (quotaResult.isErr()) {
          this.logger.error(
            `Expiration handler: failed to decrement user quota for ${holdUserId}: ${quotaResult.unwrapErr().message}`,
          );
        }
      }

      this.logger.log(
        `Ticket ${ticketId} hold expired — status reverted to AVAILABLE`,
      );

      this.ticketsGateway.emitAdminDashboardRefresh();

      return Ok(undefined);
    } catch (error) {
      this.logger.error(
        `handleTicketExpiration failed for ticket ${ticketId}: ${error}`,
      );
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Fetch distinct ticket types and their prices.
   * Optimized database query using distinct and select.
   *
   * @returns List of distinct ticket types and their prices
   */
  async getTicketTypes(): Promise<Result<TicketTypes[], Error>> {
    try {
      const ticketTypes = await this.prisma.ticket.findMany({
        distinct: ['type'],
        select: {
          type: true,
          price: true,
        },
      });

      const formatted = ticketTypes.map((t) => ({
        type: t.type as TicketTypeEnum,
        price: t.price,
      }));

      return Ok(formatted);
    } catch (error) {
      this.logger.error(`getTicketTypes failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Fetch distinct ticket types and their available counts, along with the total available tickets.
   * Public endpoint, no authentication required.
   *
   * @returns List of ticket types, available counts, and total available count
   */
  async getAvailableTickets(): Promise<Result<AvailableTicketsResult, Error>> {
    try {
      const distinctTypes = await this.prisma.ticket.findMany({
        distinct: ['type'],
        select: { type: true },
      });

      const availableCounts = await this.prisma.ticket.groupBy({
        by: ['type'],
        where: { status: 'AVAILABLE' },
        _count: {
          id: true,
        },
      });

      const countMap = new Map<string, number>();
      let total = 0;
      for (const item of availableCounts) {
        countMap.set(item.type, item._count.id);
        total += item._count.id;
      }

      const tickets = distinctTypes.map((t) => ({
        type: t.type as TicketTypeEnum,
        count: countMap.get(t.type) || 0,
      }));

      return Ok({
        tickets,
        total,
      });
    } catch (error) {
      this.logger.error(`getAvailableTickets failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}


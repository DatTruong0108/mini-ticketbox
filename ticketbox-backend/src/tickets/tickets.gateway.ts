import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Subject, Subscription } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailableTicketsResult } from './interfaces/tickets.interface.js';
import { TicketTypeEnum } from './dto/tickets.dto.js';

/**
 * WebSocket Gateway for broadcasting real-time ticket availability updates.
 *
 * Implements a throttling mechanism using RxJS Subject & throttleTime to prevent
 * broadcast storms during high concurrency booking events.
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TicketsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(TicketsGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Subject to buffer and throttle available ticket count updates. */
  private readonly countUpdateSubject = new Subject<AvailableTicketsResult>();
  private subscription!: Subscription;

  /** Cache to ensure we only broadcast when the value has actually changed. */
  private lastBroadcastData: AvailableTicketsResult | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Lifecycle Hook ─────────────────────────────────────────────

  onModuleInit(): void {
    // Subscribe to count updates with a throttle of 500ms.
    // leading: true, trailing: true ensures updates are immediate but captures the final state.
    this.subscription = this.countUpdateSubject
      .pipe(throttleTime(500, undefined, { leading: true, trailing: true }))
      .subscribe((data) => {
        this.broadcast(data);
      });
  }

  onModuleDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  // ─── Gateway Interface Implementations ──────────────────────────

  afterInit(server: Server): void {
    this.logger.log('Websocket Gateway initialized');
  }

  /**
   * Handle client connection.
   * Send the current available ticket count from PostgreSQL immediately to the new client.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      this.logger.log(`Client connected: ${client.id}`);
      
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

      client.emit('ticket_count_updated', {
        statusCode: 200,
        message: 'Initial ticket count',
        data: {
          tickets,
          total,
        },
      });
    } catch (error) {
      this.logger.error(`Error sending initial ticket count: ${error}`);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Broadcast Management ───────────────────────────────────────

  /**
   * Queue a ticket count update.
   * Pushes the new count into the RxJS subject for throttling.
   */
  queueCountUpdate(data: AvailableTicketsResult): void {
    this.countUpdateSubject.next(data);
  }

  /**
   * Compare two payloads to determine if they contain identical counts.
   */
  private isSamePayload(a: AvailableTicketsResult, b: AvailableTicketsResult): boolean {
    if (a.total !== b.total) return false;
    if (a.tickets.length !== b.tickets.length) return false;
    for (let i = 0; i < a.tickets.length; i++) {
      if (a.tickets[i].type !== b.tickets[i].type || a.tickets[i].count !== b.tickets[i].count) {
        return false;
      }
    }
    return true;
  }

  /**
   * Broadcast the available ticket count details to all connected clients.
   * Only emits if the count is different from the last broadcast count.
   */
  private broadcast(data: AvailableTicketsResult): void {
    try {
      if (this.lastBroadcastData && this.isSamePayload(this.lastBroadcastData, data)) {
        return;
      }
      this.lastBroadcastData = data;

      this.logger.log(`Broadcasting updated ticket count: ${JSON.stringify(data)}`);
      this.server.emit('ticket_count_updated', {
        statusCode: 200,
        message: 'Ticket count updated',
        data: {
          tickets: data.tickets,
          total: data.total,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to broadcast count update: ${error}`);
    }
  }

  /**
   * Broadcast a refresh event to all admin clients.
   */
  emitAdminDashboardRefresh(): void {
    try {
      this.logger.log('Broadcasting admin_dashboard_refresh to all clients');
      this.server.emit('admin_dashboard_refresh', {
        statusCode: 200,
        message: 'Admin dashboard needs refresh',
      });
    } catch (error) {
      this.logger.error(`Failed to emit admin_dashboard_refresh: ${error}`);
    }
  }
}

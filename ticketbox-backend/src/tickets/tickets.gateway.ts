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
  private readonly countUpdateSubject = new Subject<number>();
  private subscription!: Subscription;

  /** Cache to ensure we only broadcast when the value has actually changed. */
  private lastBroadcastCount: number | null = null;

  constructor(private readonly redisService: RedisService) {}

  // ─── Lifecycle Hook ─────────────────────────────────────────────

  onModuleInit(): void {
    // Subscribe to count updates with a throttle of 500ms.
    // leading: true, trailing: true ensures updates are immediate but captures the final state.
    this.subscription = this.countUpdateSubject
      .pipe(throttleTime(500, undefined, { leading: true, trailing: true }))
      .subscribe((count) => {
        this.broadcast(count);
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
   * Send the current available ticket count from Redis immediately to the new client.
   */
  async handleConnection(client: Socket): Promise<void> {
    try {
      this.logger.log(`Client connected: ${client.id}`);
      
      const countResult = await this.redisService.getPoolCount();
      if (countResult.isOk()) {
        const count = countResult.unwrap();
        client.emit('ticket_count_updated', {
          statusCode: 200,
          message: 'Initial ticket count',
          data: {
            availableTickets: count,
          },
        });
      }
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
  queueCountUpdate(count: number): void {
    this.countUpdateSubject.next(count);
  }

  /**
   * Broadcast the available ticket count to all connected clients.
   * Only emits if the count is different from the last broadcast count.
   */
  private broadcast(count: number): void {
    try {
      if (this.lastBroadcastCount === count) {
        return;
      }
      this.lastBroadcastCount = count;

      this.logger.log(`Broadcasting updated ticket count: ${count}`);
      this.server.emit('ticket_count_updated', {
        statusCode: 200,
        message: 'Ticket count updated',
        data: {
          availableTickets: count,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to broadcast count update: ${error}`);
    }
  }
}

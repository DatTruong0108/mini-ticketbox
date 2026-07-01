import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Result, Ok, Err } from 'oxide.ts';
import { TicketExpirationHandler } from './interfaces/redis.interface.js';

// ─── Constants ───────────────────────────────────────────────────

const POOL_KEY = 'tickets_available';
const HOLD_KEY_PREFIX = 'ticket_hold:';
const EXPIRED_CHANNEL = '__keyevent@0__:expired';

// ─── Service ─────────────────────────────────────────────────────

/**
 * Redis service managing two ioredis connections:
 *
 * 1. **commandClient** — executes regular commands (SET, GET, INCR, DECR, DEL).
 * 2. **subscriberClient** — dedicated subscriber for Redis Keyspace Notifications.
 *
 * All public methods return `Result<T, Error>` — NO exceptions thrown.
 * Every function body is wrapped in try…catch per coding standards.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private commandClient!: Redis;
  private subscriberClient!: Redis;

  /** Registered callback for ticket hold expiration events. */
  private expirationHandler: TicketExpirationHandler | null = null;

  constructor(private readonly configService: ConfigService) {}

  // ─── Lifecycle ──────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);

      // 1. Command client — for regular Redis operations
      this.commandClient = new Redis({ host, port, maxRetriesPerRequest: 3 });
      this.commandClient.on('error', (err) =>
        this.logger.error(`Redis command client error: ${err.message}`),
      );

      // 2. Subscriber client — dedicated to Pub/Sub (cannot execute normal commands once subscribed)
      this.subscriberClient = new Redis({ host, port, maxRetriesPerRequest: 3 });
      this.subscriberClient.on('error', (err) =>
        this.logger.error(`Redis subscriber client error: ${err.message}`),
      );

      // 3. Ensure Keyspace Notifications are enabled (belt-and-suspenders alongside docker-compose flag)
      await this.commandClient.config('SET', 'notify-keyspace-events', 'Ex');

      // 4. Subscribe to expired key events
      await this.subscriberClient.subscribe(EXPIRED_CHANNEL);
      this.subscriberClient.on('message', (channel: string, key: string) => {
        try {
          if (channel === EXPIRED_CHANNEL && key.startsWith(HOLD_KEY_PREFIX)) {
            const ticketId = key.slice(HOLD_KEY_PREFIX.length);
            this.logger.warn(
              `Keyspace notification: hold expired for ticket ${ticketId}`,
            );
            if (this.expirationHandler) {
              this.expirationHandler(ticketId);
            }
          }
        } catch (err) {
          this.logger.error(`Error handling keyspace notification: ${err}`);
        }
      });

      this.logger.log(
        `Redis connected (command + subscriber) at ${host}:${port}`,
      );
    } catch (error) {
      this.logger.error(`Failed to initialise Redis: ${error}`);
      throw error; // Bubble up — app cannot start without Redis
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.subscriberClient?.quit();
      await this.commandClient?.quit();
      this.logger.log('Redis connections closed');
    } catch (error) {
      this.logger.error(`Error closing Redis connections: ${error}`);
    }
  }

  // ─── Expiration Handler Registration ────────────────────────────

  /**
   * Register a callback that fires whenever a `ticket_hold:{ticketId}` key expires.
   * Called once by `TicketsService.onModuleInit()`.
   */
  registerExpirationHandler(handler: TicketExpirationHandler): void {
    this.expirationHandler = handler;
  }

  // ─── Atomic Pool Commands ───────────────────────────────────────

  /**
   * Initialise (or reset) the ticket pool counter in Redis.
   */
  async initPool(count: number): Promise<Result<void, Error>> {
    try {
      await this.commandClient.set(POOL_KEY, count.toString());
      this.logger.log(`Ticket pool initialised: ${count}`);
      return Ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to initialise pool: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Atomically decrement the ticket pool.
   * Returns the **new** value after decrement.
   */
  async decrementPool(): Promise<Result<number, Error>> {
    try {
      const newValue = await this.commandClient.decr(POOL_KEY);
      return Ok(newValue);
    } catch (error) {
      this.logger.error(`Failed to decrement pool: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Atomically increment the ticket pool (used to restore a slot).
   * Returns the **new** value after increment.
   */
  async incrementPool(): Promise<Result<number, Error>> {
    try {
      const newValue = await this.commandClient.incr(POOL_KEY);
      return Ok(newValue);
    } catch (error) {
      this.logger.error(`Failed to increment pool: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Read the current pool count (diagnostic / startup use).
   */
  async getPoolCount(): Promise<Result<number, Error>> {
    try {
      const value = await this.commandClient.get(POOL_KEY);
      return Ok(value ? parseInt(value, 10) : 0);
    } catch (error) {
      this.logger.error(`Failed to get pool count: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Hold Key Commands ──────────────────────────────────────────

  /**
   * Create a temporary hold key with TTL.
   * When this key expires, Redis fires a keyspace notification
   * that triggers the expiration handler → auto-release the ticket.
   */
  async setHoldKey(
    ticketId: string,
    ttlSeconds: number,
  ): Promise<Result<void, Error>> {
    try {
      await this.commandClient.set(
        `${HOLD_KEY_PREFIX}${ticketId}`,
        '1',
        'EX',
        ttlSeconds,
      );
      return Ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to set hold key for ticket ${ticketId}: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Delete a hold key early (manual cancel flow).
   */
  async deleteHoldKey(ticketId: string): Promise<Result<void, Error>> {
    try {
      await this.commandClient.del(`${HOLD_KEY_PREFIX}${ticketId}`);
      return Ok(undefined);
    } catch (error) {
      this.logger.error(`Failed to delete hold key for ticket ${ticketId}: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

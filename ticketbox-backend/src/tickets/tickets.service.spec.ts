import { Test, TestingModule } from '@nestjs/testing';
import { Result, Ok, Err } from 'oxide.ts';
import { TicketsService } from './tickets.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { TicketsGateway } from './tickets.gateway.js';
import { TicketTypeEnum, TicketStatusEnum, OrderStatusEnum } from './dto/tickets.dto.js';

describe('TicketsService', () => {
  let service: TicketsService;
  let prismaService: PrismaService;
  let redisService: RedisService;
  let ticketsGateway: TicketsGateway;

  // Mock implementation for PrismaService
  const mockPrismaService = {
    $transaction: jest.fn(),
    ticket: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    order: {
      create: jest.fn(),
    },
  };

  // Mock implementation for RedisService
  const mockRedisService = {
    incrementUserQuota: jest.fn(),
    decrementUserQuota: jest.fn(),
    decrementPool: jest.fn(),
    incrementPool: jest.fn(),
    setHoldKeysPipeline: jest.fn(),
    deleteHoldKeysPipeline: jest.fn(),
  };

  // Mock implementation for TicketsGateway
  const mockTicketsGateway = {
    queueCountUpdate: jest.fn(),
    emitAdminDashboardRefresh: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: TicketsGateway, useValue: mockTicketsGateway },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    prismaService = module.get<PrismaService>(PrismaService);
    redisService = module.get<RedisService>(RedisService);
    ticketsGateway = module.get<TicketsGateway>(TicketsGateway);

    jest.clearAllMocks();
  });

  describe('holdTicket', () => {
    const userId = 'user-123';
    const ticketType = TicketTypeEnum.STANDARD;
    const quantity = 2;

    it('1. Should successfully hold a ticket when available and quota is not reached', async () => {
      // Step 1: Mock quota check passes (2 tickets total, max is 5)
      mockRedisService.incrementUserQuota.mockResolvedValue(Ok(2));

      // Step 2: Mock global pool check passes (8 remaining)
      mockRedisService.decrementPool.mockResolvedValue(Ok(8));

      // Step 3: Mock database transaction successfully locking & updating tickets
      const mockTickets = [
        { id: 't-1', type: ticketType, status: 'AVAILABLE', price: 500000, userId: null, expiresAt: null, orderId: null },
        { id: 't-2', type: ticketType, status: 'AVAILABLE', price: 500000, userId: null, expiresAt: null, orderId: null },
      ];
      const mockHeldTickets = mockTickets.map((t) => ({
        ...t,
        status: 'HOLD',
        userId,
        expiresAt: new Date(),
      }));

      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        const tx = {
          ticket: {
            findMany: jest.fn()
              .mockResolvedValueOnce(mockTickets) // fetch available
              .mockResolvedValueOnce(mockHeldTickets), // refetch updated
            updateMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        };
        return cb(tx);
      });

      // Step 4: Mock setting hold keys pipeline in Redis succeeds
      mockRedisService.setHoldKeysPipeline.mockResolvedValue(Ok(null));

      // Mock getAvailableTickets responses
      mockPrismaService.ticket.findMany.mockResolvedValue([
        { type: TicketTypeEnum.STANDARD },
        { type: TicketTypeEnum.VIP },
      ]);
      mockPrismaService.ticket.groupBy.mockResolvedValue([
        { type: TicketTypeEnum.STANDARD, _count: { id: 10 } },
        { type: TicketTypeEnum.VIP, _count: { id: 5 } },
      ]);

      const result = await service.holdTicket(userId, ticketType, quantity);

      expect(result.isOk()).toBe(true);
      const data = result.unwrap();
      expect(data.holdCount).toBe(2);
      expect(data.remainingQuota).toBe(3); // 5 - 2 = 3
      expect(mockRedisService.incrementUserQuota).toHaveBeenCalledWith(userId, quantity);
      expect(mockRedisService.decrementPool).toHaveBeenCalledWith(quantity);
      expect(mockRedisService.setHoldKeysPipeline).toHaveBeenCalled();
    });

    it('2. Should return an error when the requested ticket type is out of stock', async () => {
      mockRedisService.incrementUserQuota.mockResolvedValue(Ok(1));
      mockRedisService.decrementPool.mockResolvedValue(Ok(9));

      // Mock db transaction throwing not enough tickets of standard type
      mockPrismaService.$transaction.mockRejectedValue(new Error('NOT_ENOUGH_TYPE:0'));

      // Rollback mocks
      mockRedisService.incrementPool.mockResolvedValue(Ok(10));
      mockRedisService.decrementUserQuota.mockResolvedValue(Ok(0));

      const result = await service.holdTicket(userId, ticketType, quantity);

      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr().message).toContain('Not enough STANDARD tickets available. Only 0 remaining of this type.');
      expect(mockRedisService.incrementPool).toHaveBeenCalledWith(quantity);
      expect(mockRedisService.decrementUserQuota).toHaveBeenCalledWith(userId, quantity);
    });

    it('3. Should return an error when the user exceeds the maximum hold limit', async () => {
      // Mock user quota increment returning 6 (limit is 5)
      mockRedisService.incrementUserQuota.mockResolvedValue(Ok(6));
      mockRedisService.decrementUserQuota.mockResolvedValue(Ok(4));

      const result = await service.holdTicket(userId, ticketType, quantity);

      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr().message).toContain('Limit exceeded. Max 5 tickets per user.');
      expect(mockRedisService.decrementUserQuota).toHaveBeenCalledWith(userId, quantity);
      expect(mockRedisService.decrementPool).not.toHaveBeenCalled();
    });

    it('4. Should return an error and rollback if Redis pipeline/decrement fails', async () => {
      mockRedisService.incrementUserQuota.mockResolvedValue(Ok(2));

      // Mock pool decrement failing in Redis
      const redisError = new Error('Redis pool error');
      mockRedisService.decrementPool.mockResolvedValue(Err(redisError));
      mockRedisService.decrementUserQuota.mockResolvedValue(Ok(0));

      const result = await service.holdTicket(userId, ticketType, quantity);

      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr()).toBe(redisError);
      expect(mockRedisService.decrementUserQuota).toHaveBeenCalledWith(userId, quantity);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('5. Should return an error if Prisma transaction fails', async () => {
      mockRedisService.incrementUserQuota.mockResolvedValue(Ok(2));
      mockRedisService.decrementPool.mockResolvedValue(Ok(8));

      // Mock database transaction failing unexpectedly
      const dbError = new Error('Database connection failed');
      mockPrismaService.$transaction.mockRejectedValue(dbError);

      // Rollback mocks
      mockRedisService.incrementPool.mockResolvedValue(Ok(10));
      mockRedisService.decrementUserQuota.mockResolvedValue(Ok(0));

      const result = await service.holdTicket(userId, ticketType, quantity);

      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr().message).toContain('Database connection failed');
      expect(mockRedisService.incrementPool).toHaveBeenCalledWith(quantity);
      expect(mockRedisService.decrementUserQuota).toHaveBeenCalledWith(userId, quantity);
    });
  });

  describe('payTicket', () => {
    const userId = 'user-123';
    const ticketIds = ['t-1', 't-2'];

    it('1. Should successfully process bulk payment and create an order for valid held tickets', async () => {
      const mockTickets = [
        { id: 't-1', type: TicketTypeEnum.STANDARD, status: 'HOLD', price: 500000, userId, expiresAt: new Date(), orderId: null },
        { id: 't-2', type: TicketTypeEnum.STANDARD, status: 'HOLD', price: 500000, userId, expiresAt: new Date(), orderId: null },
      ];
      mockPrismaService.ticket.findMany.mockResolvedValue(mockTickets);

      // Mock database transaction creating order and marking tickets as SOLD
      const mockOrder = { id: 'order-888', userId, totalPrice: 1000000, status: 'PAID', createdAt: new Date(), updatedAt: new Date() };
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        const tx = {
          order: {
            create: jest.fn().mockResolvedValue(mockOrder),
          },
          ticket: {
            updateMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        };
        return cb(tx);
      });

      mockRedisService.deleteHoldKeysPipeline.mockResolvedValue(Ok(null));

      const result = await service.payTicket(ticketIds, userId);

      expect(result.isOk()).toBe(true);
      const data = result.unwrap();
      expect(data.orderId).toBe('order-888');
      expect(data.totalPrice).toBe(1000000);
      expect(data.orderStatus).toBe(OrderStatusEnum.PAID);
      expect(data.tickets).toHaveLength(2);
      expect(mockRedisService.deleteHoldKeysPipeline).toHaveBeenCalledWith(ticketIds);
    });

    it('2. Should return an error if the array of ticketIds is empty or invalid', async () => {
      // Case A: Empty array
      const resultEmpty = await service.payTicket([], userId);
      expect(resultEmpty.isErr()).toBe(true);
      expect(resultEmpty.unwrapErr().message).toContain('Some tickets were not found or are invalid');

      // Case B: Database finds fewer tickets than expected
      mockPrismaService.ticket.findMany.mockResolvedValue([
        { id: 't-1', type: TicketTypeEnum.STANDARD, status: 'HOLD', price: 500000, userId },
      ]);

      const resultInvalid = await service.payTicket(ticketIds, userId);
      expect(resultInvalid.isErr()).toBe(true);
      expect(resultInvalid.unwrapErr().message).toContain('Some tickets were not found or are invalid');
    });

    it('3. Should return an error if any of the tickets do not belong to the user', async () => {
      const mockTickets = [
        { id: 't-1', type: TicketTypeEnum.STANDARD, status: 'HOLD', price: 500000, userId },
        { id: 't-2', type: TicketTypeEnum.STANDARD, status: 'HOLD', price: 500000, userId: 'other-user' },
      ];
      mockPrismaService.ticket.findMany.mockResolvedValue(mockTickets);

      const result = await service.payTicket(ticketIds, userId);

      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr().message).toContain('You are not the holder of ticket t-2');
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('4. Should return an error if any of the tickets are NOT in HOLD status', async () => {
      const mockTickets = [
        { id: 't-1', type: TicketTypeEnum.STANDARD, status: 'HOLD', price: 500000, userId },
        { id: 't-2', type: TicketTypeEnum.STANDARD, status: 'AVAILABLE', price: 500000, userId },
      ];
      mockPrismaService.ticket.findMany.mockResolvedValue(mockTickets);

      const result = await service.payTicket(ticketIds, userId);

      expect(result.isErr()).toBe(true);
      expect(result.unwrapErr().message).toContain('Ticket t-2 is not in HOLD status');
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('5. Should clear Redis hold keys properly upon successful payment', async () => {
      const mockTickets = [
        { id: 't-1', type: TicketTypeEnum.STANDARD, status: 'HOLD', price: 500000, userId },
      ];
      mockPrismaService.ticket.findMany.mockResolvedValue(mockTickets);

      const mockOrder = { id: 'order-111', userId, totalPrice: 500000, status: 'PAID' };
      mockPrismaService.$transaction.mockImplementation(async (cb) => {
        const tx = {
          order: {
            create: jest.fn().mockResolvedValue(mockOrder),
          },
          ticket: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return cb(tx);
      });

      mockRedisService.deleteHoldKeysPipeline.mockResolvedValue(Ok(null));

      const result = await service.payTicket(['t-1'], userId);

      expect(result.isOk()).toBe(true);
      expect(mockRedisService.deleteHoldKeysPipeline).toHaveBeenCalledWith(['t-1']);
    });
  });
});

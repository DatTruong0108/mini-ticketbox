import { Injectable, Logger } from '@nestjs/common';
import { Result, Ok, Err } from 'oxide.ts';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AdminStats {
  totalAvailable: number;
  totalSold: number;
  totalHold: number;
  totalRevenue: number;
  soldByType: { type: string; count: number }[];
}

export interface HoldTicketItem {
  id: string;
  userName: string | null;
  expiresAt: string | null;
}

export interface PaginatedHoldTickets {
  tickets: HoldTicketItem[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<Result<AdminStats, Error>> {
    try {
      const [availableCount, soldCount, holdCount, revenueSum, soldByTypeRaw] = await Promise.all([
        this.prisma.ticket.count({ where: { status: 'AVAILABLE' } }),
        this.prisma.ticket.count({ where: { status: 'SOLD' } }),
        this.prisma.ticket.count({ where: { status: 'HOLD' } }),
        this.prisma.ticket.aggregate({
          where: { status: 'SOLD' },
          _sum: { price: true },
        }),
        this.prisma.ticket.groupBy({
          by: ['type'],
          where: { status: 'SOLD' },
          _count: { id: true },
        }),
      ]);

      const totalRevenue = revenueSum._sum.price || 0;

      const soldByType = soldByTypeRaw.map((item) => ({
        type: String(item.type),
        count: item._count.id,
      }));

      return Ok({
        totalAvailable: availableCount,
        totalSold: soldCount,
        totalHold: holdCount,
        totalRevenue,
        soldByType,
      });
    } catch (error) {
      this.logger.error(`getStats failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getHoldTickets(page: number, limit: number): Promise<Result<PaginatedHoldTickets, Error>> {
    try {
      const parsedLimit = Math.min(100, Math.max(1, limit));
      const parsedPage = Math.max(1, page);
      const skip = (parsedPage - 1) * parsedLimit;

      const [holdTickets, total] = await Promise.all([
        this.prisma.ticket.findMany({
          where: { status: 'HOLD' },
          skip,
          take: parsedLimit,
          include: {
            user: {
              select: { userName: true },
            },
          },
          orderBy: { expiresAt: 'asc' },
        }),
        this.prisma.ticket.count({ where: { status: 'HOLD' } }),
      ]);

      const tickets: HoldTicketItem[] = holdTickets.map((t) => ({
        id: t.id,
        userName: t.user?.userName || null,
        expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
      }));

      return Ok({
        tickets,
        total,
        page: parsedPage,
        limit: parsedLimit,
      });
    } catch (error) {
      this.logger.error(`getHoldTickets failed: ${error}`);
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

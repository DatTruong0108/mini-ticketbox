import { TicketTypeEnum, TicketStatusEnum, OrderStatusEnum } from '../dto/tickets.dto.js';

/**
 * Shape of the response data when a ticket is held.
 */
export interface HoldTicketData {
  id: string;
  type: TicketTypeEnum;
  status: TicketStatusEnum;
  price: number;
  userId: string;
  expiresAt: string;
}

/**
 * Aggregated result for a multi-ticket hold request.
 */
export interface HoldTicketResultData {
  tickets: HoldTicketData[];
  holdCount: number;
  remainingQuota: number;
}

/**
 * Shape of the response data when a ticket is cancelled.
 */
export interface CancelTicketData {
  id: string;
  type: TicketTypeEnum;
  status: TicketStatusEnum;
}

/**
 * Shape of the response data when a ticket payment succeeds.
 */
export interface PaymentResultData {
  orderId: string;
  ticketId: string;
  ticketStatus: TicketStatusEnum;
  orderStatus: OrderStatusEnum;
  totalPrice: number;
}

export interface TicketTypes {
  type: TicketTypeEnum;
  price: number
}
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
  ticketIds: string[];
  cancelledCount: number;
}

export interface PaymentResultTicket {
  id: string;
  type: TicketTypeEnum;
  price: number;
  status: TicketStatusEnum;
}

export interface PaymentResultData {
  orderId: string;
  totalPrice: number;
  orderStatus: OrderStatusEnum;
  tickets: PaymentResultTicket[];
}


export interface TicketTypes {
  type: TicketTypeEnum;
  price: number
}

export interface AvailableTicketCount {
  type: TicketTypeEnum;
  count: number;
}

export interface AvailableTicketsResult {
  tickets: AvailableTicketCount[];
  total: number;
}
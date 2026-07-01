import { TicketTypeEnum, TicketStatusEnum } from '../dto/tickets.dto.js';

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
 * Shape of the response data when a ticket is cancelled.
 */
export interface CancelTicketData {
  id: string;
  type: TicketTypeEnum;
  status: TicketStatusEnum;
}

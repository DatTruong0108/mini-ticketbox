/**
 * Callback invoked when a `ticket_hold:{ticketId}` key expires in Redis.
 */
export type TicketExpirationHandler = (ticketId: string) => void;

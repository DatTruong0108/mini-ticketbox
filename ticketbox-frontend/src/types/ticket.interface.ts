export interface TicketType {
    type: string;
    price: number;
}

export interface TicketSelectionProps {
    ticketTypes: TicketType[];
    onRetry?: () => void;
    loading?: boolean;
}
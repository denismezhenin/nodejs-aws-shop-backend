export enum OrderStatus {
  Open = 'OPEN',
  Approved = 'APPROVED',
  Confirmed = 'CONFIRMED',
  Sent = 'SENT',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

export type Address = {
  address: string;
  firstName: string;
  lastName: string;
  comment: string;
};

export type CreateOrderDto = {
  payment?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  comments?: string;
  address?: Address;
};

export type PutCartPayload = {
  product: { id: string; title?: string; description?: string; price?: number };
  count: number;
};

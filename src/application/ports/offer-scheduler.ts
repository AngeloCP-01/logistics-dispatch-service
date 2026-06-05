import type { OrderId } from "../../domain/shared/ids.js";

export interface OfferScheduler {
  /** Schedule a `dispatch.offer.expired` for this attempt to be delivered after `ttlSeconds`. */
  scheduleExpiry(orderId: OrderId, attemptNo: number, ttlSeconds: number): Promise<void>;
}

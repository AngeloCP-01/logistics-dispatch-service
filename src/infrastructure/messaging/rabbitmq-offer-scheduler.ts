import type { Channel } from "amqplib";
import type { OfferScheduler } from "../../application/ports/offer-scheduler.js";
import type { OrderId } from "../../domain/shared/ids.js";
import { OFFER_EXPIRY_QUEUE } from "./rabbitmq-connection.js";

export class RabbitMqOfferScheduler implements OfferScheduler {
  constructor(private readonly channel: Channel) {}
  async scheduleExpiry(orderId: OrderId, attemptNo: number, ttlSeconds: number): Promise<void> {
    const body = Buffer.from(JSON.stringify({ orderId, attemptNo }));
    // expiration is the per-message TTL; on expiry the message dead-letters to
    // logistics.events with key dispatch.offer.expired (set on the holding queue).
    this.channel.sendToQueue(OFFER_EXPIRY_QUEUE, body, {
      contentType: "application/json", persistent: true, expiration: String(ttlSeconds * 1000),
    });
  }
}

import amqp, { type ChannelModel, type Channel } from "amqplib";

export const LOGISTICS_EXCHANGE = "logistics.events";
export const DISPATCH_EVENTS_QUEUE = "dispatch-service.events";
export const OFFER_EXPIRY_QUEUE = "dispatch.offer-expiry";
export const OFFER_EXPIRED_KEY = "dispatch.offer.expired";

const CONSUMED_KEYS = [
  "order.created",
  "driver.availability.changed",
  "delivery.completed",
  "order.cancelled",
  OFFER_EXPIRED_KEY,
];

export async function connect(url: string): Promise<{ connection: ChannelModel; channel: Channel }> {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();
  await channel.assertExchange(LOGISTICS_EXCHANGE, "topic", { durable: true });
  return { connection, channel };
}

/**
 * Assert dispatch's queues + bindings.
 * - The work queue with a DLQ.
 * - The offer-expiry HOLDING queue: NO consumer; it dead-letters to logistics.events with
 *   routing key dispatch.offer.expired. The TTL is applied PER MESSAGE (message.expiration) by
 *   the scheduler — NOT as a queue x-message-ttl — so a test can use a 1s TTL without
 *   re-declaring the queue (avoids PRECONDITION-FAILED on a TTL mismatch). This is the
 *   plugin-free delayed-message technique; the platform broker has no x-delayed-message plugin.
 */
export async function assertDispatchTopology(channel: Channel): Promise<void> {
  await channel.assertQueue(DISPATCH_EVENTS_QUEUE, {
    durable: true,
    deadLetterExchange: "",
    deadLetterRoutingKey: `${DISPATCH_EVENTS_QUEUE}.dlq`,
  });
  await channel.assertQueue(`${DISPATCH_EVENTS_QUEUE}.dlq`, { durable: true });
  await channel.assertQueue(OFFER_EXPIRY_QUEUE, {
    durable: true,
    deadLetterExchange: LOGISTICS_EXCHANGE,
    deadLetterRoutingKey: OFFER_EXPIRED_KEY,
  });
  for (const k of CONSUMED_KEYS) await channel.bindQueue(DISPATCH_EVENTS_QUEUE, LOGISTICS_EXCHANGE, k);
  await channel.prefetch(8);
}

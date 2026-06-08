import amqp from "amqplib";
import { v7 as uuidV7 } from "uuid";
import { LOGISTICS_EXCHANGE } from "../../../src/infrastructure/messaging/rabbitmq-connection.js";

export interface EventCollector {
  messages: Array<{ routingKey: string; data: Record<string, unknown>; eventType?: string }>;
  stop: () => Promise<void>;
}

/**
 * Opens an independent connection to the broker and binds an exclusive queue to
 * `routingKeys` on the logistics exchange, collecting every message it receives
 * so a test can assert what dispatch published.
 */
export async function collectEvents(amqpUrl: string, routingKeys: string[]): Promise<EventCollector> {
  const connection = await amqp.connect(amqpUrl);
  const channel = await connection.createChannel();
  await channel.assertExchange(LOGISTICS_EXCHANGE, "topic", { durable: true });
  const { queue } = await channel.assertQueue("", { exclusive: true, autoDelete: true });
  for (const k of routingKeys) await channel.bindQueue(queue, LOGISTICS_EXCHANGE, k);
  const messages: EventCollector["messages"] = [];
  await channel.consume(queue, (msg) => {
    if (!msg) return;
    const parsed = JSON.parse(msg.content.toString());
    messages.push({ routingKey: msg.fields.routingKey, data: parsed.data ?? parsed, eventType: parsed.eventType });
    channel.ack(msg);
  });
  return {
    messages,
    stop: async () => {
      try { await channel.close(); } catch { /* ignore */ }
      try { await connection.close(); } catch { /* ignore */ }
    },
  };
}

const ADDR = (label: string) => ({
  label, street: "1 Main", city: "Manila", country: "PH", lat: 14.6, lng: 121.0,
});

/** Wraps a `data` payload in the shared event envelope. */
export function envelope(eventType: string, data: unknown): unknown {
  return {
    eventId: uuidV7(),
    eventType,
    eventVersion: "1.0.0",
    occurredAt: new Date().toISOString(),
    correlationId: uuidV7(),
    producer: "test",
    data,
  };
}

export function availabilityChanged(userId: string, isAvailable: boolean): unknown {
  return envelope("driver.availability.changed", {
    userId, isAvailable, changedAt: new Date().toISOString(),
  });
}

export function orderCreated(orderId: string, customerId: string): unknown {
  return envelope("order.created", {
    orderId,
    customerId,
    pickup: ADDR("pickup"),
    dropoff: ADDR("dropoff"),
    items: [{ description: "box", quantity: 1 }],
    scheduledFor: null,
  });
}

export function deliveryCompleted(orderId: string): unknown {
  return envelope("delivery.completed", { orderId });
}

export function orderCancelled(orderId: string, customerId: string): unknown {
  return envelope("order.cancelled", {
    orderId, customerId, previousStatus: "assigned", reason: "customer changed mind",
  });
}

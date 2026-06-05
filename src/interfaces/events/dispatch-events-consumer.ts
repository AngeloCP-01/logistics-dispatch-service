import type { Channel } from "amqplib";
import type { Logger } from "pino";
import {
  assertDispatchTopology,
  DISPATCH_EVENTS_QUEUE,
  LOGISTICS_EXCHANGE,
  OFFER_EXPIRED_KEY,
} from "../../infrastructure/messaging/rabbitmq-connection.js";
import type { HandleOrderCreatedUseCase } from "../../application/dispatch/handle-order-created.use-case.js";
import type { UpdateAvailabilityUseCase } from "../../application/dispatch/update-availability.use-case.js";
import type { CompleteDeliveryUseCase } from "../../application/dispatch/complete-delivery.use-case.js";
import type { CancelOrderUseCase } from "../../application/dispatch/cancel-order.use-case.js";
import type { ExpireOfferUseCase } from "../../application/dispatch/expire-offer.use-case.js";

export interface ConsumerDeps {
  channel: Channel;
  logger: Logger;
  handleOrderCreated: HandleOrderCreatedUseCase;
  updateAvailability: UpdateAvailabilityUseCase;
  completeDelivery: CompleteDeliveryUseCase;
  cancelOrder: CancelOrderUseCase;
  expireOffer: ExpireOfferUseCase;
}

export async function startDispatchEventsConsumer(deps: ConsumerDeps): Promise<{ stop: () => Promise<void> }> {
  const { channel, logger } = deps;
  await assertDispatchTopology(channel);

  const { consumerTag } = await channel.consume(DISPATCH_EVENTS_QUEUE, async (msg) => {
    if (!msg) return;
    let envelope: { eventId: string; eventType: string; correlationId?: string; data: Record<string, unknown> };
    const routingKey = msg.fields.routingKey;
    try {
      envelope = JSON.parse(msg.content.toString());
    } catch {
      logger.warn({ event: "consumer_bad_json", routingKey }, "discarding");
      channel.nack(msg, false, false);
      return;
    }
    const corr = envelope.correlationId ?? envelope.eventId;
    try {
      if (routingKey === OFFER_EXPIRED_KEY) {
        // The offer-expired DLX message is the RAW { orderId, attemptNo } the scheduler sent —
        // it is NOT enveloped, so it has no eventType/eventId.
        const d = envelope as unknown as { orderId: string; attemptNo: number };
        await deps.expireOffer.execute({ orderId: d.orderId, attemptNo: d.attemptNo }, corr);
      } else if (envelope.eventType === "order.created") {
        await deps.handleOrderCreated.execute(envelope.data as never, corr);
      } else if (envelope.eventType === "driver.availability.changed") {
        const d = envelope.data as { userId: string; isAvailable: boolean; changedAt: string };
        await deps.updateAvailability.execute(
          { eventId: envelope.eventId, driverId: String(d.userId), isAvailable: Boolean(d.isAvailable), changedAt: String(d.changedAt) },
          corr,
        );
      } else if (envelope.eventType === "delivery.completed") {
        await deps.completeDelivery.execute({ eventId: envelope.eventId, orderId: String(envelope.data.orderId) }, corr);
      } else if (envelope.eventType === "order.cancelled") {
        await deps.cancelOrder.execute({ eventId: envelope.eventId, orderId: String(envelope.data.orderId) }, corr);
      } else {
        channel.ack(msg);
        return;
      }
      channel.ack(msg);
    } catch (err) {
      const attempts = (msg.properties.headers?.["x-attempt"] as number | undefined) ?? 0;
      if (attempts < 3) {
        logger.warn({ event: "consumer_retry", attempts: attempts + 1, routingKey }, "republish");
        channel.publish(LOGISTICS_EXCHANGE, routingKey, msg.content, {
          contentType: "application/json",
          headers: { ...(msg.properties.headers ?? {}), "x-attempt": attempts + 1 },
        });
        channel.ack(msg);
      } else {
        logger.error({ event: "consumer_dlq", err, routingKey, attempts }, "to DLQ");
        channel.nack(msg, false, false);
      }
    }
  });

  return {
    stop: async () => {
      await channel.cancel(consumerTag);
    },
  };
}

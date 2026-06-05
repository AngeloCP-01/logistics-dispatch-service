import type { Channel } from "amqplib";
import { v7 as uuidV7 } from "uuid";
import type { EventPublisher } from "../../application/ports/event-publisher.js";
import type { DomainEvent } from "../../domain/events/index.js";
import { LOGISTICS_EXCHANGE } from "./rabbitmq-connection.js";

export class RabbitMqEventPublisher implements EventPublisher {
  constructor(private readonly channel: Channel) {}
  async publishAll(events: DomainEvent[], correlationId: string): Promise<void> {
    for (const event of events) await this.publishOne(event, correlationId);
  }
  private async publishOne(event: DomainEvent, correlationId: string): Promise<void> {
    const data =
      event.eventType === "dispatch.driver.assigned"
        ? { orderId: event.orderId, driverId: event.driverId }
        : { orderId: event.orderId, reason: event.reason };
    const envelope = {
      eventId: uuidV7(), eventType: event.eventType, eventVersion: "1.0.0",
      occurredAt: event.occurredAt.toISOString(), correlationId, producer: "dispatch-service", data,
    };
    const ok = this.channel.publish(
      LOGISTICS_EXCHANGE, event.eventType, Buffer.from(JSON.stringify(envelope)),
      { contentType: "application/json", persistent: true, messageId: envelope.eventId },
    );
    if (!ok) await new Promise((resolve) => this.channel.once("drain", resolve));
  }
}

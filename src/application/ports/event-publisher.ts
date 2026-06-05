import type { DomainEvent } from "../../domain/events/index.js";
export interface EventPublisher {
  publishAll(events: DomainEvent[], correlationId: string): Promise<void>;
}

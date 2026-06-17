import { Assignment } from "../../domain/assignment/assignment.js";
import { OrderId } from "../../domain/shared/ids.js";
import { AddressSnapshot } from "../../domain/shared/address-snapshot.js";
import { OrderItemLine } from "../../domain/shared/order-item-line.js";
import type { UnitOfWork } from "../ports/unit-of-work.js";
import type { Clock } from "../ports/clock.js";
import type { DispatchOrderUseCase } from "./dispatch-order.use-case.js";

export interface OrderCreatedMessage {
  eventId: string;
  orderId: string;
  customerId: string;
  pickup: { label?: string; street: string; city: string; country: string; lat: number; lng: number };
  dropoff: { label?: string; street: string; city: string; country: string; lat: number; lng: number };
  items: { description: string; quantity: number; weightKg?: number | null }[];
  scheduledFor: string | null;
}

export class HandleOrderCreatedUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly dispatch: DispatchOrderUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(msg: OrderCreatedMessage, correlationId: string): Promise<void> {
    const now = this.clock.now();
    const created = await this.uow.run(async (repos) => {
      const isNew = await repos.processedEvents.recordIfNew(msg.eventId, "order.created");
      if (!isNew) return false;
      const a = Assignment.fromOrderCreated(
        {
          orderId: OrderId.of(msg.orderId),
          customerId: msg.customerId,
          pickup: AddressSnapshot.of(msg.pickup),
          dropoff: AddressSnapshot.of(msg.dropoff),
          items: (msg.items ?? []).map((i) =>
            OrderItemLine.of({ description: i.description, quantity: i.quantity, weightKg: i.weightKg ?? null }),
          ),
          scheduledFor: msg.scheduledFor ? new Date(msg.scheduledFor) : null,
        },
        now,
      );
      await repos.assignments.save(a);
      return true;
    });
    if (created) await this.dispatch.attempt(OrderId.of(msg.orderId), correlationId);
  }
}

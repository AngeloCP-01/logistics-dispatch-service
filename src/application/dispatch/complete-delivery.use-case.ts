import { OrderId } from "../../domain/shared/ids.js";
import type { UnitOfWork } from "../ports/unit-of-work.js";
import type { DriverPool } from "../ports/driver-pool.js";
import type { Clock } from "../ports/clock.js";
import type { DispatchOrderUseCase } from "./dispatch-order.use-case.js";

export interface CompleteInput { eventId: string; orderId: string; }

export class CompleteDeliveryUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly pool: DriverPool,
    private readonly dispatch: DispatchOrderUseCase,
    private readonly clock: Clock,
  ) {}
  async execute(input: CompleteInput, correlationId: string): Promise<void> {
    const orderId = OrderId.of(input.orderId);
    const now = this.clock.now();
    const freed = await this.uow.run(async (repos) => {
      const isNew = await repos.processedEvents.recordIfNew(input.eventId, "delivery.completed");
      if (!isNew) return null;
      const a = await repos.assignments.byId(orderId);
      if (!a) return null;
      const driver = a.assignedDriverId;
      if (!a.markCompleted(now)) return null;
      await repos.assignments.save(a);
      return driver;
    });
    if (freed) {
      await this.pool.freeDriver(freed);
      await this.dispatch.retryParked(correlationId);
    }
  }
}

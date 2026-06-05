import { OrderId } from "../../domain/shared/ids.js";
import type { UnitOfWork } from "../ports/unit-of-work.js";
import type { DriverPool } from "../ports/driver-pool.js";
import type { Clock } from "../ports/clock.js";
import type { DispatchOrderUseCase } from "./dispatch-order.use-case.js";

export interface CancelInput { eventId: string; orderId: string; }

export class CancelOrderUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly pool: DriverPool,
    private readonly dispatch: DispatchOrderUseCase,
    private readonly clock: Clock,
  ) {}
  async execute(input: CancelInput, correlationId: string): Promise<void> {
    const orderId = OrderId.of(input.orderId);
    const now = this.clock.now();
    const freed = await this.uow.run(async (repos) => {
      const isNew = await repos.processedEvents.recordIfNew(input.eventId, "order.cancelled");
      if (!isNew) return null;
      const a = await repos.assignments.byId(orderId);
      if (!a) return null;
      const { freedDriverId } = a.cancel(now);
      await repos.assignments.save(a);
      return freedDriverId;
    });
    if (freed) await this.pool.freeDriver(freed);
    await this.dispatch.retryParked(correlationId);
  }
}

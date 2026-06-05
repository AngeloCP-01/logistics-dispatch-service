import { DriverId } from "../../domain/shared/ids.js";
import type { UnitOfWork } from "../ports/unit-of-work.js";
import type { DriverPool } from "../ports/driver-pool.js";
import type { DispatchOrderUseCase } from "./dispatch-order.use-case.js";

export interface AvailabilityInput { eventId: string; driverId: string; isAvailable: boolean; changedAt: string; }

export class UpdateAvailabilityUseCase {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly pool: DriverPool,
    private readonly dispatch: DispatchOrderUseCase,
  ) {}
  async execute(input: AvailabilityInput, correlationId: string): Promise<void> {
    const driverId = DriverId.of(input.driverId);
    const isNew = await this.uow.run((repos) => repos.processedEvents.recordIfNew(input.eventId, "driver.availability.changed"));
    if (!isNew) return;
    if (input.isAvailable) {
      await this.pool.onWilling(driverId, new Date(input.changedAt).getTime());
      await this.dispatch.retryParked(correlationId);
    } else {
      await this.pool.onUnwilling(driverId);
    }
  }
}

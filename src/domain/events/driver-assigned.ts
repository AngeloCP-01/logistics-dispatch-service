import type { OrderId, DriverId } from "../shared/ids.js";

export class DriverAssigned {
  readonly eventType = "dispatch.driver.assigned" as const;
  constructor(
    readonly orderId: OrderId,
    readonly driverId: DriverId,
    readonly occurredAt: Date,
  ) {}
}

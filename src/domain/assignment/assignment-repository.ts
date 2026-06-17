import type { Assignment } from "./assignment.js";
import type { OrderId, DriverId } from "../shared/ids.js";

export interface AssignmentRepository {
  byId(orderId: OrderId): Promise<Assignment | null>;
  offeredForDriver(driverId: DriverId): Promise<Assignment | null>;
  save(assignment: Assignment): Promise<void>;
  awaitingDriverOldestFirst(limit: number): Promise<Assignment[]>;
}

import type { Assignment } from "./assignment.js";
import type { OrderId } from "../shared/ids.js";

export interface AssignmentRepository {
  byId(orderId: OrderId): Promise<Assignment | null>;
  save(assignment: Assignment): Promise<void>;
  awaitingDriverOldestFirst(limit: number): Promise<Assignment[]>;
}

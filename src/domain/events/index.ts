import type { DriverAssigned } from "./driver-assigned.js";
import type { AssignmentFailed } from "./assignment-failed.js";

export { DriverAssigned } from "./driver-assigned.js";
export { AssignmentFailed } from "./assignment-failed.js";
export type DomainEvent = DriverAssigned | AssignmentFailed;

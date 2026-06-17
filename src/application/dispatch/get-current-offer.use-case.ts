import { DriverId } from "../../domain/shared/ids.js";
import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import type { Assignment } from "../../domain/assignment/assignment.js";

export class GetCurrentOfferUseCase {
  constructor(private readonly assignments: AssignmentRepository) {}

  async execute(driverId: string): Promise<Assignment | null> {
    return this.assignments.offeredForDriver(DriverId.of(driverId));
  }
}

import { OrderId } from "../../domain/shared/ids.js";
import { AssignmentNotFoundError } from "../../domain/shared/errors.js";
import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import type { Assignment } from "../../domain/assignment/assignment.js";

export class GetAssignmentUseCase {
  constructor(private readonly assignments: AssignmentRepository) {}
  async execute(orderId: string): Promise<Assignment> {
    const a = await this.assignments.byId(OrderId.of(orderId));
    if (!a) throw new AssignmentNotFoundError(orderId);
    return a;
  }
}

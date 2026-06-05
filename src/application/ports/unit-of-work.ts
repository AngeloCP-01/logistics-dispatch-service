import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import type { ProcessedEventRepository } from "./processed-event-repository.js";

export interface TransactionalRepos {
  assignments: AssignmentRepository;
  processedEvents: ProcessedEventRepository;
}
export interface UnitOfWork {
  run<T>(work: (repos: TransactionalRepos) => Promise<T>): Promise<T>;
}

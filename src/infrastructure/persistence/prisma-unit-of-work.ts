import type { PrismaClient } from "@prisma/client";
import type { UnitOfWork, TransactionalRepos } from "../../application/ports/unit-of-work.js";
import { PrismaAssignmentRepository } from "./prisma-assignment-repository.js";
import { PrismaProcessedEventRepository } from "./prisma-processed-event-repository.js";

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}
  async run<T>(work: (repos: TransactionalRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => work({
      assignments: new PrismaAssignmentRepository(tx),
      processedEvents: new PrismaProcessedEventRepository(tx),
    }));
  }
}

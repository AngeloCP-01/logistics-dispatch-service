import type { PrismaClient, Prisma } from "@prisma/client";
import { AssignmentMapper } from "./assignment-mapper.js";
import type { Assignment } from "../../domain/assignment/assignment.js";
import { AssignmentStatus } from "../../domain/assignment/assignment-status.js";
import type { AssignmentRepository } from "../../domain/assignment/assignment-repository.js";
import type { OrderId } from "../../domain/shared/ids.js";

type Tx = PrismaClient | Prisma.TransactionClient;

export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(private readonly db: Tx) {}

  async byId(orderId: OrderId): Promise<Assignment | null> {
    const row = await this.db.assignment.findUnique({ where: { orderId }, include: { attempts: true } });
    return row ? AssignmentMapper.toDomain(row) : null;
  }

  async save(a: Assignment): Promise<void> {
    const data = AssignmentMapper.toPersistence(a);
    await this.db.assignment.upsert({ where: { orderId: a.orderId }, create: data, update: data });
    // Upsert each attempt (append-on-offer, update outcome/respondedAt on resolve).
    for (const at of a.attempts) {
      await this.db.assignmentAttempt.upsert({
        where: { id: at.id },
        create: {
          id: at.id, orderId: a.orderId, driverId: at.driverId, attemptNo: at.attemptNo,
          outcome: at.outcome, offeredAt: at.offeredAt, respondedAt: at.respondedAt, expiresAt: at.expiresAt,
        },
        update: { outcome: at.outcome, respondedAt: at.respondedAt },
      });
    }
  }

  async awaitingDriverOldestFirst(limit: number): Promise<Assignment[]> {
    const rows = await this.db.assignment.findMany({
      where: { status: AssignmentStatus.AWAITING_DRIVER },
      include: { attempts: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map(AssignmentMapper.toDomain);
  }
}

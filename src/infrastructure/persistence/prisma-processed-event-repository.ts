import type { PrismaClient, Prisma } from "@prisma/client";
import type { ProcessedEventRepository } from "../../application/ports/processed-event-repository.js";

type Tx = PrismaClient | Prisma.TransactionClient;

export class PrismaProcessedEventRepository implements ProcessedEventRepository {
  constructor(private readonly db: Tx) {}

  async recordIfNew(eventId: string, eventType: string): Promise<boolean> {
    try {
      await this.db.processedEvent.create({ data: { eventId, eventType } });
      return true;
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") return false; // unique violation
      throw e;
    }
  }
}

import type { Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { Channel } from "amqplib";
import type { RedisClient } from "../../../infrastructure/redis/redis-client.js";

export class HealthController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly channel: () => Channel | null,
    private readonly shuttingDown: () => boolean,
    private readonly redis: RedisClient,
  ) {}

  healthz = (_req: Request, res: Response): void => {
    res.status(200).json({ status: "ok" });
  };

  readyz = async (req: Request, res: Response): Promise<void> => {
    if (this.shuttingDown()) return this.notReady(req, res, "shutting_down");
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      return this.notReady(req, res, "db_unavailable");
    }
    if (!this.channel()) return this.notReady(req, res, "broker_unavailable");
    try {
      await this.redis.ping();
    } catch {
      return this.notReady(req, res, "redis_unavailable");
    }
    res.status(200).json({ status: "ready" });
  };

  private notReady(req: Request, res: Response, detail: string): void {
    res.status(503).type("application/problem+json").json({
      type: "urn:logistics:dispatch:not_ready",
      title: "Service Unavailable",
      status: 503,
      detail,
      instance: req.requestId ?? "unknown",
    });
  }
}

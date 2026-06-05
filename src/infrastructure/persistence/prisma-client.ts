import { PrismaClient } from "@prisma/client";
import type { Env } from "../../config/env.js";

export function createPrismaClient(env: Env): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: env.DISPATCH_DB_URL } } });
}

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

export interface PgFixture {
  container: StartedPostgreSqlContainer;
  prisma: PrismaClient;
  url: string;
}

export async function startPgWithMigrations(): Promise<PgFixture> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const url = container.getConnectionUri();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DISPATCH_DB_URL: url }, stdio: "inherit" });
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  return { container, prisma, url };
}

export async function stopPg(fx: PgFixture): Promise<void> {
  await fx.prisma.$disconnect();
  await fx.container.stop();
}

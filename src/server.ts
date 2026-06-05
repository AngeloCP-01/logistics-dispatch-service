import http from "node:http";
import { v7 as uuidV7 } from "uuid";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./infrastructure/logger.js";
import { createPrismaClient } from "./infrastructure/persistence/prisma-client.js";
import { PrismaUnitOfWork } from "./infrastructure/persistence/prisma-unit-of-work.js";
import { PrismaAssignmentRepository } from "./infrastructure/persistence/prisma-assignment-repository.js";
import { SystemClock } from "./infrastructure/clock/system-clock.js";
import { createRedisClient } from "./infrastructure/redis/redis-client.js";
import { RedisDriverPool } from "./infrastructure/redis/redis-driver-pool.js";
import { connect, assertDispatchTopology } from "./infrastructure/messaging/rabbitmq-connection.js";
import { RabbitMqEventPublisher } from "./infrastructure/messaging/rabbitmq-event-publisher.js";
import { RabbitMqOfferScheduler } from "./infrastructure/messaging/rabbitmq-offer-scheduler.js";
import { UserJwtVerifier } from "./infrastructure/auth/user-jwt-verifier.js";
import { ServiceJwtSigner } from "./infrastructure/auth/service-jwt-signer.js";
import { UserServiceDriverClient } from "./infrastructure/http/user-service-driver-client.js";
import { DispatchOrderUseCase } from "./application/dispatch/dispatch-order.use-case.js";
import { HandleOrderCreatedUseCase } from "./application/dispatch/handle-order-created.use-case.js";
import { AcceptOfferUseCase } from "./application/dispatch/accept-offer.use-case.js";
import { RejectOfferUseCase } from "./application/dispatch/reject-offer.use-case.js";
import { ExpireOfferUseCase } from "./application/dispatch/expire-offer.use-case.js";
import { CompleteDeliveryUseCase } from "./application/dispatch/complete-delivery.use-case.js";
import { CancelOrderUseCase } from "./application/dispatch/cancel-order.use-case.js";
import { UpdateAvailabilityUseCase } from "./application/dispatch/update-availability.use-case.js";
import { ForceAssignUseCase } from "./application/dispatch/force-assign.use-case.js";
import { GetAssignmentUseCase } from "./application/dispatch/get-assignment.use-case.js";
import { ListAvailableDriversUseCase } from "./application/dispatch/list-available-drivers.use-case.js";
import { AssignmentController } from "./interfaces/http/controllers/assignment-controller.js";
import { HealthController } from "./interfaces/http/controllers/health-controller.js";
import { startDispatchEventsConsumer } from "./interfaces/events/dispatch-events-consumer.js";
import { createApp } from "./app.js";

/**
 * A boot-time failure attributed to a specific dependency/config, so the log
 * names WHAT failed (Postgres? Redis? RabbitMQ? the port?) and how to fix it —
 * instead of surfacing a raw driver message like "403 ACCESS-REFUSED" with no
 * context.
 */
class BootError extends Error {
  constructor(
    readonly dependency: string,
    readonly envVar: string | null,
    readonly hint: string | null,
    cause: unknown,
  ) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(
      `Failed to ${dependency}${envVar ? ` (check ${envVar})` : ""}: ${causeMsg}` +
        (hint ? ` — ${hint}` : ""),
    );
    this.name = "BootError";
  }
}

async function bootStep<T>(
  meta: { what: string; envVar?: string; hint?: string },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (cause) {
    throw new BootError(meta.what, meta.envVar ?? null, meta.hint ?? null, cause);
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === "--healthcheck") {
    process.stdout.write(JSON.stringify({ ok: true, service: "dispatch-service" }) + "\n");
    process.exit(0);
  }
  const env = loadEnv();
  const logger = createLogger(env);
  const prisma = createPrismaClient(env);
  await bootStep(
    { what: "connect to Postgres", envVar: "DISPATCH_DB_URL", hint: "is the database reachable and the URL/credentials correct?" },
    () => prisma.$connect(),
  );

  const redis = createRedisClient(env.REDIS_URL);
  await bootStep(
    { what: "connect to Redis", envVar: "REDIS_URL", hint: "is Redis reachable?" },
    () => redis.connect().then(() => redis.ping()),
  );

  const { connection, channel } = await bootStep(
    {
      what: "connect to RabbitMQ",
      envVar: "RABBITMQ_URL",
      hint: "is the broker running and are the credentials right? (the platform `logistics-rabbitmq` uses dev/dev, not guest/guest)",
    },
    () => connect(env.RABBITMQ_URL),
  );
  await bootStep(
    { what: "assert RabbitMQ topology", envVar: "RABBITMQ_URL" },
    () => assertDispatchTopology(channel),
  );

  const clock = new SystemClock();
  const uow = new PrismaUnitOfWork(prisma);
  const assignmentsRepo = new PrismaAssignmentRepository(prisma);
  const pool = new RedisDriverPool(redis);
  const scheduler = new RabbitMqOfferScheduler(channel);
  const publisher = new RabbitMqEventPublisher(channel);
  const signer = new ServiceJwtSigner(env.SERVICE_JWT_SECRET, "dispatch-service");
  const directory = new UserServiceDriverClient(env.DISPATCH_USER_SERVICE_URL, signer);

  const dispatchOrder = new DispatchOrderUseCase(
    assignmentsRepo,
    pool,
    scheduler,
    publisher,
    clock,
    () => uuidV7(),
    env.DISPATCH_MAX_OFFER_ATTEMPTS,
    env.DISPATCH_OFFER_TTL_SECONDS,
  );
  const handleOrderCreated = new HandleOrderCreatedUseCase(uow, dispatchOrder, clock);
  const acceptOffer = new AcceptOfferUseCase(assignmentsRepo, publisher, clock);
  const rejectOffer = new RejectOfferUseCase(assignmentsRepo, pool, dispatchOrder, clock);
  const expireOffer = new ExpireOfferUseCase(assignmentsRepo, pool, dispatchOrder, clock);
  const completeDelivery = new CompleteDeliveryUseCase(uow, pool, dispatchOrder, clock);
  const cancelOrder = new CancelOrderUseCase(uow, pool, dispatchOrder, clock);
  const updateAvailability = new UpdateAvailabilityUseCase(uow, pool, dispatchOrder);
  const forceAssign = new ForceAssignUseCase(assignmentsRepo, pool, directory, publisher, clock);
  const getAssignment = new GetAssignmentUseCase(assignmentsRepo);
  const listAvailable = new ListAvailableDriversUseCase(pool, directory);

  let activeChannel: typeof channel | null = channel;
  channel.on("close", () => {
    activeChannel = null;
  });
  let shuttingDown = false;

  const controller = new AssignmentController(acceptOffer, rejectOffer, forceAssign, getAssignment, listAvailable);
  const health = new HealthController(prisma, () => activeChannel, () => shuttingDown, redis);
  const userJwt = new UserJwtVerifier(env.JWT_SECRET);

  const app = createApp({ logger, health, userJwt, controller });

  const consumer = await bootStep(
    { what: "start the dispatch events consumer", envVar: "RABBITMQ_URL" },
    () =>
      startDispatchEventsConsumer({
        channel,
        logger,
        handleOrderCreated,
        updateAvailability,
        completeDelivery,
        cancelOrder,
        expireOffer,
      }),
  );

  const server = http.createServer(app);
  await bootStep(
    { what: "bind the HTTP server", envVar: "PORT", hint: "is the port already in use?" },
    () =>
      new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(env.PORT, () => {
          server.off("error", reject);
          resolve();
        });
      }),
  );
  logger.info({ event: "listening", port: env.PORT });

  const shutdown = async (signal: string): Promise<void> => {
    shuttingDown = true;
    logger.info({ event: "shutdown_started", signal });
    try {
      await consumer.stop();
      activeChannel = null;
      await channel.close().catch(() => undefined);
      await connection.close().catch(() => undefined);
    } catch (e) {
      logger.warn({ event: "shutdown_amqp_close_failed", err: e });
    }
    await redis.quit().catch(() => undefined);
    server.close(async () => {
      await prisma.$disconnect().catch(() => undefined);
      logger.info({ event: "shutdown_complete" });
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  const isBoot = err instanceof BootError;
  process.stderr.write(
    JSON.stringify({
      level: "error",
      event: "boot_failed",
      dependency: isBoot ? err.dependency : undefined,
      configHint: isBoot ? err.envVar ?? undefined : undefined,
      message: err instanceof Error ? err.message : String(err),
    }) + "\n",
  );
  process.exit(1);
});

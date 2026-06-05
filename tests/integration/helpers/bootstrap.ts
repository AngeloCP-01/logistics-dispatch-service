import http, { type Server } from "node:http";
import jwt from "jsonwebtoken";
const { sign } = jwt;
import { v7 as uuidV7 } from "uuid";
import pino from "pino";
import { PrismaClient } from "@prisma/client";
import { startPgWithMigrations, stopPg, type PgFixture } from "./postgres-container.js";
import { startRabbit, stopRabbit, type RabbitFixture } from "./rabbitmq-container.js";
import { startRedis } from "./redis-container.js";
import { startUserServiceDriverStub, type StubDriver } from "./user-service-driver-stub.js";
import type { StartedRedisContainer } from "@testcontainers/redis";
import { connect, assertDispatchTopology, LOGISTICS_EXCHANGE } from "../../../src/infrastructure/messaging/rabbitmq-connection.js";
import { PrismaUnitOfWork } from "../../../src/infrastructure/persistence/prisma-unit-of-work.js";
import { PrismaAssignmentRepository } from "../../../src/infrastructure/persistence/prisma-assignment-repository.js";
import { createRedisClient, type RedisClient } from "../../../src/infrastructure/redis/redis-client.js";
import { RedisDriverPool } from "../../../src/infrastructure/redis/redis-driver-pool.js";
import { RabbitMqEventPublisher } from "../../../src/infrastructure/messaging/rabbitmq-event-publisher.js";
import { RabbitMqOfferScheduler } from "../../../src/infrastructure/messaging/rabbitmq-offer-scheduler.js";
import { SystemClock } from "../../../src/infrastructure/clock/system-clock.js";
import { UserJwtVerifier } from "../../../src/infrastructure/auth/user-jwt-verifier.js";
import { ServiceJwtSigner } from "../../../src/infrastructure/auth/service-jwt-signer.js";
import { UserServiceDriverClient } from "../../../src/infrastructure/http/user-service-driver-client.js";
import { DispatchOrderUseCase } from "../../../src/application/dispatch/dispatch-order.use-case.js";
import { HandleOrderCreatedUseCase } from "../../../src/application/dispatch/handle-order-created.use-case.js";
import { AcceptOfferUseCase } from "../../../src/application/dispatch/accept-offer.use-case.js";
import { RejectOfferUseCase } from "../../../src/application/dispatch/reject-offer.use-case.js";
import { ExpireOfferUseCase } from "../../../src/application/dispatch/expire-offer.use-case.js";
import { CompleteDeliveryUseCase } from "../../../src/application/dispatch/complete-delivery.use-case.js";
import { CancelOrderUseCase } from "../../../src/application/dispatch/cancel-order.use-case.js";
import { UpdateAvailabilityUseCase } from "../../../src/application/dispatch/update-availability.use-case.js";
import { ForceAssignUseCase } from "../../../src/application/dispatch/force-assign.use-case.js";
import { GetAssignmentUseCase } from "../../../src/application/dispatch/get-assignment.use-case.js";
import { ListAvailableDriversUseCase } from "../../../src/application/dispatch/list-available-drivers.use-case.js";
import { AssignmentController } from "../../../src/interfaces/http/controllers/assignment-controller.js";
import { HealthController } from "../../../src/interfaces/http/controllers/health-controller.js";
import { startDispatchEventsConsumer } from "../../../src/interfaces/events/dispatch-events-consumer.js";
import { createApp } from "../../../src/app.js";

const USER_SECRET = "u".repeat(40);
const SERVICE_SECRET = "s".repeat(40);

export interface DispatchFixture {
  pg: PgFixture;
  rabbit: RabbitFixture;
  redisContainer: StartedRedisContainer;
  server: Server;
  port: number;
  baseUrl: string;
  redis: RedisClient;
  pool: RedisDriverPool;
  offerTtlSeconds: number;
  driverStub: Map<string, StubDriver>;
  stop: () => Promise<void>;
  setShuttingDown: () => void;
  signUserJwt: (userId: string, role: "customer" | "driver" | "admin") => string;
  publishEvent: (routingKey: string, envelope: unknown) => Promise<void>;
  publishRaw: (routingKey: string, body: unknown) => Promise<void>;
  resetAll: () => Promise<void>;
}

export async function bootstrap(opts?: { offerTtlSeconds?: number; startConsumer?: boolean }): Promise<DispatchFixture> {
  const offerTtlSeconds = opts?.offerTtlSeconds ?? 30;

  const pg = await startPgWithMigrations();
  const rabbit = await startRabbit();
  const redisFx = await startRedis();

  const logger = pino({ level: "silent" });
  const prisma = new PrismaClient({ datasources: { db: { url: pg.url } } });
  await prisma.$connect();

  const redis = createRedisClient(redisFx.url);
  await redis.connect();
  await redis.ping();

  // Live, mutable driver map the stub reads on every request so force-assign
  // tests can register / clear drivers per case.
  const driverStub = new Map<string, StubDriver>();
  const stub = await startUserServiceDriverStub(driverStub);

  const { connection: amqpConn, channel: amqpCh } = await connect(rabbit.url);
  await assertDispatchTopology(amqpCh);
  let activeChannel: typeof amqpCh | null = amqpCh;
  amqpCh.on("close", () => { activeChannel = null; });
  // Tolerate heartbeat/connection errors that fire after the broker container is
  // killed mid-test (readyz-down probes etc.).
  amqpCh.on("error", () => { /* tolerated in tests */ });
  amqpConn.on("error", () => { /* tolerated in tests */ });

  const clock = new SystemClock();
  const uow = new PrismaUnitOfWork(prisma);
  const assignmentsRepo = new PrismaAssignmentRepository(prisma);
  const pool = new RedisDriverPool(redis);
  const scheduler = new RabbitMqOfferScheduler(amqpCh);
  const publisher = new RabbitMqEventPublisher(amqpCh);
  const signer = new ServiceJwtSigner(SERVICE_SECRET, "dispatch-service");
  const directory = new UserServiceDriverClient(stub.url, signer);

  const dispatchOrder = new DispatchOrderUseCase(
    assignmentsRepo, pool, scheduler, publisher, clock, () => uuidV7(), 3, offerTtlSeconds,
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

  let shuttingDown = false;
  const controller = new AssignmentController(acceptOffer, rejectOffer, forceAssign, getAssignment, listAvailable);
  const health = new HealthController(prisma, () => activeChannel, () => shuttingDown, redis);
  const userJwt = new UserJwtVerifier(USER_SECRET);

  let consumer: { stop: () => Promise<void> } | null = null;
  if (opts?.startConsumer ?? true) {
    consumer = await startDispatchEventsConsumer({
      channel: amqpCh, logger, handleOrderCreated, updateAvailability, completeDelivery, cancelOrder, expireOffer,
    });
  }

  const app = createApp({ logger, health, userJwt, controller });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    pg, rabbit, redisContainer: redisFx.container, server, port,
    baseUrl: `http://127.0.0.1:${port}`,
    redis, pool, offerTtlSeconds, driverStub,
    stop: async () => {
      shuttingDown = true;
      try { if (consumer) await consumer.stop(); } catch { /* ignore */ }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try { await amqpCh.close(); } catch { /* ignore */ }
      try { await amqpConn.close(); } catch { /* ignore */ }
      try { await redis.quit(); } catch { /* ignore */ }
      try { await prisma.$disconnect(); } catch { /* ignore */ }
      try { await stub.stop(); } catch { /* ignore */ }
      try { await redisFx.stop(); } catch { /* ignore */ }
      try { await stopRabbit(rabbit); } catch { /* ignore */ }
      try { await stopPg(pg); } catch { /* ignore */ }
    },
    setShuttingDown: () => { shuttingDown = true; },
    signUserJwt: (userId, role) => sign({ role }, USER_SECRET, { algorithm: "HS256", subject: userId, expiresIn: "5m" }),
    publishEvent: async (routingKey, envelope) => {
      amqpCh.publish(LOGISTICS_EXCHANGE, routingKey, Buffer.from(JSON.stringify(envelope)), { contentType: "application/json", persistent: true });
    },
    publishRaw: async (routingKey, body) => {
      amqpCh.publish(LOGISTICS_EXCHANGE, routingKey, Buffer.from(JSON.stringify(body)), { contentType: "application/json", persistent: true });
    },
    resetAll: async () => {
      await prisma.assignmentAttempt.deleteMany();
      await prisma.assignment.deleteMany();
      await prisma.processedEvent.deleteMany();
      await redis.flushdb();
      driverStub.clear();
    },
  };
}

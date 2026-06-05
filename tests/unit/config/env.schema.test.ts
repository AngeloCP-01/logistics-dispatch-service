import { envSchema } from "@/config/env.schema.js";

const base = {
  NODE_ENV: "test", PORT: "3004", LOG_LEVEL: "info", LOG_SERVICE_NAME: "dispatch-service",
  DISPATCH_DB_URL: "postgresql://u:p@localhost:5437/dispatch",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a".repeat(32), SERVICE_JWT_SECRET: "b".repeat(32),
  DISPATCH_USER_SERVICE_URL: "http://localhost:3001",
  RABBITMQ_URL: "amqp://dev:dev@localhost:5672",
  DISPATCH_OFFER_TTL_SECONDS: "30", DISPATCH_MAX_OFFER_ATTEMPTS: "3",
};

describe("envSchema", () => {
  it("parses a valid env and coerces numbers", () => {
    const env = envSchema.parse(base);
    expect(env.PORT).toBe(3004);
    expect(env.DISPATCH_OFFER_TTL_SECONDS).toBe(30);
    expect(env.DISPATCH_MAX_OFFER_ATTEMPTS).toBe(3);
  });

  it("rejects when JWT_SECRET equals SERVICE_JWT_SECRET", () => {
    const same = "x".repeat(32);
    expect(() => envSchema.parse({ ...base, JWT_SECRET: same, SERVICE_JWT_SECRET: same })).toThrow();
  });

  it("rejects a short JWT_SECRET", () => {
    expect(() => envSchema.parse({ ...base, JWT_SECRET: "short" })).toThrow();
  });
});

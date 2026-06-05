import { z } from "zod";

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    PORT: z.coerce.number().int().min(1).max(65535),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]),
    LOG_SERVICE_NAME: z.string().min(1),
    DISPATCH_DB_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_SECRET: z.string().min(32),
    SERVICE_JWT_SECRET: z.string().min(32),
    DISPATCH_USER_SERVICE_URL: z.string().url(),
    RABBITMQ_URL: z.string().url(),
    DISPATCH_OFFER_TTL_SECONDS: z.coerce.number().int().min(1).default(30),
    DISPATCH_MAX_OFFER_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  })
  .refine((env) => env.JWT_SECRET !== env.SERVICE_JWT_SECRET, {
    message: "JWT_SECRET and SERVICE_JWT_SECRET must be distinct values",
    path: ["SERVICE_JWT_SECRET"],
  });

export type Env = z.infer<typeof envSchema>;

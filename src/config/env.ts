import { envSchema, type Env } from "./env.schema.js";

export type { Env } from "./env.schema.js";

export function loadEnv(source: NodeJS.ProcessEnv | Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Env validation failed: ${issues}`);
  }
  return result.data;
}

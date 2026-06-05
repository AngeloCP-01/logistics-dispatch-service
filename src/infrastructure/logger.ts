import pino, { type Logger } from "pino";
import type { Env } from "../config/env.js";

export function createLogger(env: Env): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: env.LOG_SERVICE_NAME },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers['x-service-authorization']",
        "req.headers.cookie",
        "res.headers['set-cookie']",
      ],
      remove: true,
    },
  });
}

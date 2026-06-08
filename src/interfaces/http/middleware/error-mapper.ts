import type { ErrorRequestHandler } from "express";
import "pino-http";
import { ZodError } from "zod";
import { DomainError, ValidationError } from "../../../domain/shared/errors.js";

export function errorMapper(): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (res.headersSent) return;
    const requestId = req.requestId ?? "unknown";

    if (err instanceof ZodError) {
      const ve = new ValidationError(
        err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      );
      return res.status(400).type("application/problem+json").json({
        type: "urn:logistics:dispatch:validation_failed",
        title: ve.message,
        status: 400,
        detail: ve.message,
        instance: requestId,
        errors: ve.errors,
      });
    }

    if (err instanceof DomainError) {
      const body: Record<string, unknown> = {
        type: `urn:logistics:dispatch:${err.code}`,
        title: err.message,
        status: err.status,
        detail: err.message,
        instance: requestId,
      };
      if (err instanceof ValidationError) body.errors = err.errors;
      return res.status(err.status).type("application/problem+json").json(body);
    }

    req.log?.error({ err }, "unhandled_error");
    const body: Record<string, unknown> = {
      type: "urn:logistics:dispatch:internal",
      title: "Internal Server Error",
      status: 500,
      instance: requestId,
    };
    // In non-production, surface the underlying cause in the RESPONSE so a 500 is
    // debuggable without tailing logs. NEVER do this in production — it leaks
    // internals/stack traces to clients.
    if (process.env.NODE_ENV !== "production" && err instanceof Error) {
      body.detail = err.message;
      body.errorName = err.name;
      body.stack = err.stack?.split("\n").slice(1, 6).map((l) => l.trim());
    }
    return res.status(500).type("application/problem+json").json(body);
  };
}

import type { RequestHandler } from "express";
import { RoleRequiredError } from "../../../domain/shared/errors.js";

export function requireRole(allowed: ("customer" | "driver" | "admin")[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.role || !allowed.includes(req.role)) {
      return next(new RoleRequiredError(allowed.join("|"), req.role ?? "<none>"));
    }
    next();
  };
}

export function rejectRole(forbidden: ("customer" | "driver" | "admin")[]): RequestHandler {
  return (req, _res, next) => {
    if (req.role && forbidden.includes(req.role)) {
      return next(new RoleRequiredError(`not ${forbidden.join("|")}`, req.role));
    }
    next();
  };
}

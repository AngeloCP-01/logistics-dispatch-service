import type { RequestHandler } from "express";
import { UnauthorizedError } from "../../../domain/shared/errors.js";
import type { UserJwtVerifier } from "../../../infrastructure/auth/user-jwt-verifier.js";
import { InvalidUserJwtError } from "../../../infrastructure/auth/user-jwt-verifier.js";

export function userAuth(verifier: UserJwtVerifier): RequestHandler {
  return (req, _res, next) => {
    const header = req.header("authorization");
    if (!header || !header.startsWith("Bearer ")) return next(new UnauthorizedError("missing bearer token"));
    const token = header.slice("Bearer ".length).trim();
    try {
      const claims = verifier.verify(token);
      req.userId = claims.userId;
      req.role = claims.role;
      next();
    } catch (e) {
      if (e instanceof InvalidUserJwtError) return next(new UnauthorizedError(e.message));
      next(e);
    }
  };
}

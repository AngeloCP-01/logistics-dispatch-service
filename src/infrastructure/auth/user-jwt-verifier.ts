import jwt from "jsonwebtoken";

const { verify, JsonWebTokenError, TokenExpiredError } = jwt;

export class InvalidUserJwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUserJwtError";
  }
}

export interface UserClaims {
  userId: string;
  role: "customer" | "driver" | "admin";
}

export class UserJwtVerifier {
  constructor(private readonly secret: string) {}

  verify(token: string): UserClaims {
    let payload: unknown;
    try {
      payload = verify(token, this.secret, { algorithms: ["HS256"] });
    } catch (e) {
      if (e instanceof TokenExpiredError) throw new InvalidUserJwtError("token expired");
      if (e instanceof JsonWebTokenError) throw new InvalidUserJwtError(`invalid token: ${e.message}`);
      throw new InvalidUserJwtError("invalid token");
    }
    if (typeof payload !== "object" || payload === null) throw new InvalidUserJwtError("payload not object");
    const p = payload as Record<string, unknown>;
    const sub = p.sub;
    const role = p.role;
    if (typeof sub !== "string" || sub.length === 0) throw new InvalidUserJwtError("missing sub");
    if (role !== "customer" && role !== "driver" && role !== "admin") throw new InvalidUserJwtError("invalid role");
    return { userId: sub, role };
  }
}

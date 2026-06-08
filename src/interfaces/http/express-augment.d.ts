import "express";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
    userId?: string;
    role?: "customer" | "driver" | "admin";
    serviceCaller?: string;
  }
}

import { Router } from "express";
import type { AssignmentController } from "./controllers/assignment-controller.js";
import { requireRole } from "./middleware/role-guard.js";

export function dispatchRoutes(c: AssignmentController): Router {
  const r = Router();
  r.post("/dispatch/assignments/:orderId/accept", requireRole(["driver"]), c.acceptHandler);
  r.post("/dispatch/assignments/:orderId/reject", requireRole(["driver"]), c.rejectHandler);
  r.post("/dispatch/assignments/:orderId/force-assign", requireRole(["admin"]), c.forceAssignHandler);
  r.get("/dispatch/drivers/available", requireRole(["admin"]), c.listAvailableHandler);
  r.get("/dispatch/offers/current", requireRole(["driver"]), c.currentOfferHandler);
  r.get("/dispatch/assignments/:orderId", c.getHandler); // authz inside (admin or involved driver)
  return r;
}

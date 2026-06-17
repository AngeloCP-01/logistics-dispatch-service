import type { Request, Response, NextFunction } from "express";
import type { AcceptOfferUseCase } from "../../../application/dispatch/accept-offer.use-case.js";
import type { RejectOfferUseCase } from "../../../application/dispatch/reject-offer.use-case.js";
import type { ForceAssignUseCase } from "../../../application/dispatch/force-assign.use-case.js";
import type { GetAssignmentUseCase } from "../../../application/dispatch/get-assignment.use-case.js";
import type { ListAvailableDriversUseCase } from "../../../application/dispatch/list-available-drivers.use-case.js";
import type { GetCurrentOfferUseCase } from "../../../application/dispatch/get-current-offer.use-case.js";
import { ForbiddenError } from "../../../domain/shared/errors.js";
import { forceAssignBody, rejectBody, orderIdParam } from "../schemas.js";
import { toAssignmentResponse, toCurrentOfferResponse } from "../response-mappers.js";

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

export class AssignmentController {
  constructor(
    private readonly accept: AcceptOfferUseCase,
    private readonly reject: RejectOfferUseCase,
    private readonly force: ForceAssignUseCase,
    private readonly get: GetAssignmentUseCase,
    private readonly listAvailable: ListAvailableDriversUseCase,
    private readonly getCurrentOffer: GetCurrentOfferUseCase,
  ) {}

  acceptHandler = wrap(async (req, res) => {
    const { orderId } = orderIdParam.parse(req.params);
    await this.accept.execute({ orderId, driverId: req.userId! }, req.requestId!);
    res.status(204).end();
  });

  rejectHandler = wrap(async (req, res) => {
    const { orderId } = orderIdParam.parse(req.params);
    const body = rejectBody.parse(req.body);
    await this.reject.execute(
      { orderId, driverId: req.userId!, ...(body?.reason !== undefined ? { reason: body.reason } : {}) },
      req.requestId!,
    );
    res.status(204).end();
  });

  forceAssignHandler = wrap(async (req, res) => {
    const { orderId } = orderIdParam.parse(req.params);
    const { driverId } = forceAssignBody.parse(req.body);
    await this.force.execute({ orderId, driverId }, req.requestId!);
    res.status(204).end();
  });

  getHandler = wrap(async (req, res) => {
    const { orderId } = orderIdParam.parse(req.params);
    const a = await this.get.execute(orderId);
    // authz: admin sees all; a driver sees only an assignment where they are/were involved.
    if (
      req.role !== "admin" &&
      a.assignedDriverId !== req.userId &&
      a.currentAttempt()?.driverId !== req.userId
    ) {
      throw new ForbiddenError();
    }
    res.status(200).json(toAssignmentResponse(a));
  });

  currentOfferHandler = wrap(async (req, res) => {
    const offer = await this.getCurrentOffer.execute(req.userId!);
    if (!offer) {
      res.status(204).end();
      return;
    }
    res.status(200).json(toCurrentOfferResponse(offer));
  });

  listAvailableHandler = wrap(async (_req, res) => {
    res.status(200).json({ items: await this.listAvailable.execute() });
  });
}

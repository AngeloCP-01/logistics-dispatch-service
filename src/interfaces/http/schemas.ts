import { z } from "zod";

export const forceAssignBody = z.object({ driverId: z.string().uuid() });
export const rejectBody = z.object({ reason: z.string().max(500).optional() }).optional();
export const orderIdParam = z.object({ orderId: z.string().uuid() });

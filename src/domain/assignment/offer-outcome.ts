export const OfferOutcome = {
  OFFERED: "offered",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  EXPIRED: "expired",
} as const;
export type OfferOutcome = (typeof OfferOutcome)[keyof typeof OfferOutcome];

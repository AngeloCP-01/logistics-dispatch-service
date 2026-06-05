export const AssignmentStatus = {
  AWAITING_DRIVER: "awaiting_driver",
  OFFERED: "offered",
  ASSIGNED: "assigned",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

export function isTerminal(s: AssignmentStatus): boolean {
  return s === AssignmentStatus.COMPLETED || s === AssignmentStatus.CANCELLED || s === AssignmentStatus.FAILED;
}

import { AssignmentStatus, isTerminal } from "@/domain/assignment/assignment-status.js";

describe("AssignmentStatus", () => {
  it("marks completed/cancelled/failed terminal", () => {
    expect(isTerminal(AssignmentStatus.COMPLETED)).toBe(true);
    expect(isTerminal(AssignmentStatus.CANCELLED)).toBe(true);
    expect(isTerminal(AssignmentStatus.FAILED)).toBe(true);
  });
  it("marks awaiting_driver/offered/assigned non-terminal", () => {
    expect(isTerminal(AssignmentStatus.AWAITING_DRIVER)).toBe(false);
    expect(isTerminal(AssignmentStatus.OFFERED)).toBe(false);
    expect(isTerminal(AssignmentStatus.ASSIGNED)).toBe(false);
  });
});

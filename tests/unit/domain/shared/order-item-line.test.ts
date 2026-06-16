import { OrderItemLine } from "@/domain/shared/order-item-line.js";
import { InvariantViolationError } from "@/domain/shared/errors.js";

describe("OrderItemLine", () => {
  it("builds a valid line and exposes readonly fields", () => {
    const line = OrderItemLine.of({ description: "  box ", quantity: 2, weightKg: 1.5 });

    expect(line.description).toBe("box");
    expect(line.quantity).toBe(2);
    expect(line.weightKg).toBe(1.5);
  });

  it("accepts an explicit null weightKg and round-trips it via toJSON", () => {
    const line = OrderItemLine.of({ description: "box", quantity: 1, weightKg: null });

    expect(line.toJSON()).toEqual({ description: "box", quantity: 1, weightKg: null });
  });

  it("rejects a non-finite weightKg", () => {
    expect(() => OrderItemLine.of({ description: "box", quantity: 1, weightKg: Infinity })).toThrow(
      InvariantViolationError,
    );
  });

  it("rejects an empty description", () => {
    expect(() => OrderItemLine.of({ description: "   ", quantity: 1, weightKg: null })).toThrow(
      InvariantViolationError,
    );
  });

  it("rejects a non-positive or non-integer quantity", () => {
    expect(() => OrderItemLine.of({ description: "box", quantity: 0, weightKg: null })).toThrow(
      InvariantViolationError,
    );
    expect(() => OrderItemLine.of({ description: "box", quantity: 1.5, weightKg: null })).toThrow(
      InvariantViolationError,
    );
  });

  it("rejects a non-positive weightKg", () => {
    expect(() => OrderItemLine.of({ description: "box", quantity: 1, weightKg: 0 })).toThrow(
      InvariantViolationError,
    );
  });
});

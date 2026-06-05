import { OrderId, DriverId } from "@/domain/shared/ids.js";

describe("ids", () => {
  it("accepts a valid uuid for OrderId/DriverId", () => {
    const u = "018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f";
    expect(OrderId.of(u)).toBe(u);
    expect(DriverId.of(u)).toBe(u);
  });
  it("rejects a non-uuid", () => {
    expect(() => OrderId.of("nope")).toThrow();
    expect(() => DriverId.of("nope")).toThrow();
  });
});

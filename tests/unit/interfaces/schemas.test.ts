import { forceAssignBody, orderIdParam } from "@/interfaces/http/schemas.js";

const UUID = "018f4e1a-1c2b-7c3d-8e4f-5a6b7c8d9e0f";

describe("http schemas", () => {
  describe("forceAssignBody", () => {
    it("accepts a body with a valid driverId uuid", () => {
      expect(forceAssignBody.parse({ driverId: UUID })).toEqual({ driverId: UUID });
    });

    it("rejects a body with a non-uuid driverId", () => {
      expect(() => forceAssignBody.parse({ driverId: "not-a-uuid" })).toThrow();
    });

    it("rejects a body missing driverId", () => {
      expect(() => forceAssignBody.parse({})).toThrow();
    });
  });

  describe("orderIdParam", () => {
    it("accepts a valid orderId uuid param", () => {
      expect(orderIdParam.parse({ orderId: UUID })).toEqual({ orderId: UUID });
    });

    it("rejects a non-uuid orderId param", () => {
      expect(() => orderIdParam.parse({ orderId: "nope" })).toThrow();
    });
  });
});

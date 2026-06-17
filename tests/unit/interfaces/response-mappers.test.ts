import { toAssignmentResponse, toCurrentOfferResponse } from "@/interfaces/http/response-mappers.js";
import { Assignment } from "@/domain/assignment/assignment.js";
import { OrderId, DriverId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { OrderItemLine } from "@/domain/shared/order-item-line.js";

const now = new Date("2026-06-16T12:00:00.000Z");

function offered(): Assignment {
  const a = Assignment.fromOrderCreated(
    {
      orderId: OrderId.of("018f4e1a-0aaa-7c3d-8e4f-5a6b7c8d9e0f"),
      customerId: "018f4e1a-00cc-7c3d-8e4f-5a6b7c8d9e0f",
      pickup: AddressSnapshot.of({ street: "1 Main", city: "Manila", country: "PH", lat: 14.6, lng: 121.0 }),
      dropoff: AddressSnapshot.of({ street: "2 Main", city: "Manila", country: "PH", lat: 14.7, lng: 121.1 }),
      items: [OrderItemLine.of({ description: "box", quantity: 1, weightKg: null })],
      scheduledFor: null,
    },
    now,
  );
  a.offerTo("018f4e1a-0a11-7c3d-8e4f-5a6b7c8d9e0f", DriverId.of("018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f"), now, new Date(now.getTime() + 30_000));
  return a;
}

describe("response mappers", () => {
  it("toCurrentOfferResponse carries orderId, expiresAt, and the order summary", () => {
    const res = toCurrentOfferResponse(offered());

    expect(res.orderId).toBe("018f4e1a-0aaa-7c3d-8e4f-5a6b7c8d9e0f");
    expect(res.offerAttempts).toBe(1);
    expect(res.expiresAt).toBe(new Date(now.getTime() + 30_000).toISOString());
    expect(res.order.items).toEqual([{ description: "box", quantity: 1, weightKg: null }]);
    expect(res.order.pickup.street).toBe("1 Main");
  });

  it("toAssignmentResponse includes the order summary", () => {
    const res = toAssignmentResponse(offered());

    expect(res.order.dropoff.street).toBe("2 Main");
    expect(res.order.items).toHaveLength(1);
  });
});

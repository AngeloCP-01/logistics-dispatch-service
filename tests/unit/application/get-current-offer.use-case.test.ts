import { GetCurrentOfferUseCase } from "@/application/dispatch/get-current-offer.use-case.js";
import { Assignment } from "@/domain/assignment/assignment.js";
import { OrderId, DriverId } from "@/domain/shared/ids.js";
import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { OrderItemLine } from "@/domain/shared/order-item-line.js";
import { FakeAssignmentRepository } from "./_fakes.js";

const DRIVER = "018f4e1a-0001-7c3d-8e4f-5a6b7c8d9e0f";

function offeredAssignment(orderId: string, driverId: string): Assignment {
  const now = new Date("2026-06-16T12:00:00.000Z");
  const a = Assignment.fromOrderCreated(
    {
      orderId: OrderId.of(orderId),
      customerId: "018f4e1a-00cc-7c3d-8e4f-5a6b7c8d9e0f",
      pickup: AddressSnapshot.of({ street: "1 Main", city: "Manila", country: "PH", lat: 14.6, lng: 121.0 }),
      dropoff: AddressSnapshot.of({ street: "2 Main", city: "Manila", country: "PH", lat: 14.7, lng: 121.1 }),
      items: [OrderItemLine.of({ description: "box", quantity: 1, weightKg: null })],
      scheduledFor: null,
    },
    now,
  );
  a.offerTo("018f4e1a-0a11-7c3d-8e4f-5a6b7c8d9e0f", DriverId.of(driverId), now, new Date(now.getTime() + 30_000));
  return a;
}

describe("GetCurrentOfferUseCase", () => {
  it("returns the assignment currently offered to the driver", async () => {
    const repo = new FakeAssignmentRepository();
    await repo.save(offeredAssignment("018f4e1a-0aaa-7c3d-8e4f-5a6b7c8d9e0f", DRIVER));
    const useCase = new GetCurrentOfferUseCase(repo);

    const result = await useCase.execute(DRIVER);

    expect(result?.orderId).toBe("018f4e1a-0aaa-7c3d-8e4f-5a6b7c8d9e0f");
  });

  it("returns null when the driver has no outstanding offer", async () => {
    const repo = new FakeAssignmentRepository();
    const useCase = new GetCurrentOfferUseCase(repo);

    expect(await useCase.execute(DRIVER)).toBeNull();
  });
});

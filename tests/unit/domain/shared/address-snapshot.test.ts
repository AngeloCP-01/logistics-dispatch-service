import { AddressSnapshot } from "@/domain/shared/address-snapshot.js";
import { InvariantViolationError } from "@/domain/shared/errors.js";

const valid = { label: "Home", street: "12 Dock Rd", city: "Manila", country: "PH", lat: 14.5, lng: 121.0 };

describe("AddressSnapshot", () => {
  it("constructs from valid parts", () => {
    const a = AddressSnapshot.of(valid);
    expect(a.street).toBe("12 Dock Rd");
    expect(a.country).toBe("PH");
    expect(a.lat).toBe(14.5);
    expect(a.lng).toBe(121.0);
  });
  it("uppercases the country code", () => {
    expect(AddressSnapshot.of({ ...valid, country: "ph" }).country).toBe("PH");
  });
  it("rejects empty street", () => {
    expect(() => AddressSnapshot.of({ ...valid, street: "  " })).toThrow(InvariantViolationError);
  });
  it("rejects a non-2-letter country", () => {
    expect(() => AddressSnapshot.of({ ...valid, country: "PHL" })).toThrow(InvariantViolationError);
  });
  it("rejects out-of-range latitude", () => {
    expect(() => AddressSnapshot.of({ ...valid, lat: 91 })).toThrow(InvariantViolationError);
  });
  it("rejects out-of-range longitude", () => {
    expect(() => AddressSnapshot.of({ ...valid, lng: -181 })).toThrow(InvariantViolationError);
  });
  it("treats label as optional", () => {
    const a = AddressSnapshot.of({ ...valid, label: undefined });
    expect(a.label).toBeUndefined();
  });
  it("toJSON returns the plain object", () => {
    expect(AddressSnapshot.of(valid).toJSON()).toEqual({
      label: "Home", street: "12 Dock Rd", city: "Manila", country: "PH", lat: 14.5, lng: 121.0,
    });
  });
});

import { InvariantViolationError } from "./errors.js";

export interface AddressSnapshotProps {
  label?: string | undefined;
  street: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

export class AddressSnapshot {
  private constructor(
    readonly label: string | undefined,
    readonly street: string,
    readonly city: string,
    readonly country: string,
    readonly lat: number,
    readonly lng: number,
  ) {}

  static of(props: AddressSnapshotProps): AddressSnapshot {
    const street = props.street.trim();
    const city = props.city.trim();
    if (street.length === 0) throw new InvariantViolationError("address street must be non-empty");
    if (city.length === 0) throw new InvariantViolationError("address city must be non-empty");
    if (!/^[A-Za-z]{2}$/.test(props.country)) throw new InvariantViolationError("country must be a 2-letter code");
    if (Number.isNaN(props.lat) || props.lat < -90 || props.lat > 90) {
      throw new InvariantViolationError(`invalid latitude: ${props.lat}`);
    }
    if (Number.isNaN(props.lng) || props.lng < -180 || props.lng > 180) {
      throw new InvariantViolationError(`invalid longitude: ${props.lng}`);
    }
    const label = props.label?.trim();
    return new AddressSnapshot(
      label && label.length > 0 ? label : undefined,
      street,
      city,
      props.country.toUpperCase(),
      props.lat,
      props.lng,
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      label: this.label,
      street: this.street,
      city: this.city,
      country: this.country,
      lat: this.lat,
      lng: this.lng,
    };
  }
}

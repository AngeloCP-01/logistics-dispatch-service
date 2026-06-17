import { InvariantViolationError } from "./errors.js";

export interface OrderItemLineProps {
  description: string;
  quantity: number;
  weightKg: number | null;
}

export class OrderItemLine {
  private constructor(
    readonly description: string,
    readonly quantity: number,
    readonly weightKg: number | null,
  ) {}

  static of(props: OrderItemLineProps): OrderItemLine {
    const description = props.description.trim();
    if (description.length === 0) throw new InvariantViolationError("item description must be non-empty");
    if (!Number.isInteger(props.quantity) || props.quantity < 1) {
      throw new InvariantViolationError(`item quantity must be a positive integer: ${props.quantity}`);
    }
    if (props.weightKg !== null && (!Number.isFinite(props.weightKg) || props.weightKg <= 0)) {
      throw new InvariantViolationError(`item weightKg must be positive or null: ${props.weightKg}`);
    }
    return new OrderItemLine(description, props.quantity, props.weightKg);
  }

  toJSON(): { description: string; quantity: number; weightKg: number | null } {
    return { description: this.description, quantity: this.quantity, weightKg: this.weightKg };
  }
}

export interface CreateProductInput {
  title: string;
  description?: string;
  price: number;
  count: number;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function validateCreateProductInput(
  body: unknown
): ValidationResult<CreateProductInput> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }

  const { title, description, price, count } = body as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length === 0) {
    return { ok: false, error: "Field 'title' must be a non-empty string" };
  }
  if (description !== undefined && typeof description !== "string") {
    return { ok: false, error: "Field 'description' must be a string" };
  }
  if (!isNonNegativeInteger(price)) {
    return { ok: false, error: "Field 'price' must be a non-negative integer" };
  }
  if (!isNonNegativeInteger(count)) {
    return { ok: false, error: "Field 'count' must be a non-negative integer" };
  }

  return {
    ok: true,
    value: { title: title.trim(), description, price, count },
  };
}

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

function coerceInteger(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
   
    return Number.isFinite(n) ? n : undefined;
  }
  
  return undefined;
}

export function validateCsvRow(
  row: unknown
): ValidationResult<CreateProductInput> {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return { ok: false, error: "CSV row must be an object" };
  }

  const { title, description, price, count } = row as Record<string, unknown>;
  const coercedPrice = coerceInteger(price);
  const coercedCount = coerceInteger(count);

  return validateCreateProductInput({
    title,
    description,
    price: coercedPrice,
    count: coercedCount,
  });
}
